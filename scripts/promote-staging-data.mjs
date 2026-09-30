import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
export const SOURCE_ID = '8a984378-6b7e-412f-ac28-3c327d004a2a';
export const TARGET_ID = '268a3dcd-71e8-4de4-935e-2c77aec9e2e5';
export const MARKER = 'uchiwake_data_transfers';
const TRANSFER = 'staging-to-production-v1';
const GUARD = 'uchiwake_transfer_guard';
// Parents must be inserted before children: application triggers check these links immediately.
export const TABLES = ['spaces', 'user_profiles', 'space_members', 'shared_cards', 'bills',
  'card_statements', 'card_entries', 'rent_rules', 'category_settings', 'space_invites',
  'invite_attempts', 'settlement_rules', 'space_preferences', 'classification_history', 'classification_rules'];
const BOOTSTRAP = new Set(['spaces', 'user_profiles', 'space_members', 'settlement_rules']);
const q = name => `"${name.replaceAll('"', '""')}"`;
const fail = message => { throw new Error(message); };
const canonical = value => JSON.stringify(value);
const same = (a, b) => canonical(a) === canonical(b);
const migrations = () => readdirSync(join(root, 'migrations')).filter(name => name.endsWith('.sql')).sort();
const columns = (db, table) => db.prepare(`PRAGMA table_info(${q(table)})`).all().map(row => row.name);
const rows = (db, table) => db.prepare(`SELECT * FROM ${q(table)} ORDER BY rowid`).all();
const exists = (db, table) => Boolean(db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table));

function literal(value) {
  if (value === null) return 'NULL';
  if (typeof value === 'string') return `CAST(X'${Buffer.from(value).toString('hex')}' AS TEXT)`;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`;
  return fail('Unsupported database value; no remote data was changed.');
}
export function freshDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for (const name of migrations()) db.exec(readFileSync(join(root, 'migrations', name), 'utf8'));
  return db;
}
export function loadDump(sql) {
  const db = new DatabaseSync(':memory:');
  try { db.exec('PRAGMA foreign_keys=OFF'); db.exec(sql); db.exec('PRAGMA foreign_keys=ON'); return db; }
  catch { db.close(); return fail('Could not validate the database export. No import was started.'); }
}
function schema(db) {
  const normal = sql => sql?.replace(/\bIF NOT EXISTS\b/gi, '').replace(/["`]/g, '').replace(/\s+/g, '').toLowerCase();
  return TABLES.map(table => ({table,
    columns: db.prepare(`PRAGMA table_info(${q(table)})`).all(),
    relations: db.prepare(`PRAGMA foreign_key_list(${q(table)})`).all(),
    objects: db.prepare('SELECT type,name,sql FROM sqlite_schema WHERE tbl_name=? ORDER BY type,name').all(table)
      .map(row => ({...row, sql: normal(row.sql)}))
  }));
}
export function validateDatabase(db) {
  const names = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all()
    .map(row => row.name).filter(name => !name.startsWith('sqlite_') && !name.startsWith('_cf_') && name !== 'd1_migrations' && name !== MARKER);
  if (!same(names, [...TABLES].sort())) fail('Unexpected application tables. Review the schema before transferring data.');
  const expected = freshDatabase();
  try { if (!same(schema(db), schema(expected))) fail('Database schema differs from the main migrations.'); }
  finally { expected.close(); }
  if (!exists(db, 'd1_migrations') || !same(db.prepare('SELECT name FROM d1_migrations ORDER BY name').all().map(row => row.name), migrations())) {
    fail('The database must have exactly the current main migrations applied.');
  }
  if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.prepare('PRAGMA foreign_key_check').all().length) {
    fail('Database integrity validation failed.');
  }
  for (const table of ['bills', 'shared_cards', 'card_statements', 'card_entries']) {
    if (db.prepare(`SELECT 1 FROM ${q(table)} t LEFT JOIN spaces s ON s.id=t.space_id WHERE s.id IS NULL LIMIT 1`).get()) fail('A record has no matching space.');
  }
  if (db.prepare('SELECT 1 FROM card_entries e JOIN card_statements s ON s.id=e.statement_id WHERE e.space_id<>s.space_id LIMIT 1').get()
    || db.prepare('SELECT 1 FROM card_statements s JOIN shared_cards c ON c.id=s.card_id WHERE s.space_id<>c.space_id LIMIT 1').get()) fail('A card or entry belongs to a different space.');
}
export function completedTransfer(db) {
  if (!exists(db, MARKER)) return false;
  const record = db.prepare(`SELECT * FROM ${q(MARKER)} WHERE id=?`).get(TRANSFER);
  if (!record || record.source_id !== SOURCE_ID || record.target_id !== TARGET_ID) fail('Unexpected previous transfer record.');
  return record;
}
export function assertBootstrap(target, source) {
  for (const table of TABLES) {
    if (!BOOTSTRAP.has(table) && rows(target, table).length) fail(`Production ${table} is not empty. Existing data will not be overwritten.`);
  }
  for (const space of rows(target, 'spaces')) {
    const legacy = space.id === 'legacy' && space.kind === 'shared' && space.name === 'うちの家計';
    const personal = space.kind === 'personal' && space.id === `personal:${space.owner_id}` && space.name === '個人';
    if ((!legacy && !personal) || space.deleted_at !== null) fail('Production contains a customized space.');
    const original = source.prepare('SELECT owner_id,kind FROM spaces WHERE id=?').get(space.id);
    if (!original || original.kind !== space.kind || (space.owner_id !== null && original.owner_id !== space.owner_id)) fail('Production and staging space owners differ.');
  }
  for (const member of rows(target, 'space_members')) {
    const space = target.prepare('SELECT owner_id FROM spaces WHERE id=?').get(member.space_id);
    if (member.active !== 1 || member.user_id !== space?.owner_id) fail('Production contains additional memberships.');
  }
  for (const profile of rows(target, 'user_profiles')) {
    if (!source.prepare('SELECT 1 FROM user_profiles WHERE user_id=?').get(profile.user_id)) fail('A production user does not exist in staging.');
  }
  for (const rule of rows(target, 'settlement_rules')) {
    const owner = target.prepare('SELECT owner_id FROM spaces WHERE id=?').get(rule.space_id)?.owner_id;
    const initial = {uniform:true,common:{mode:'equal',shares:[{user_id:owner,weight:1}]},items:{}};
    let config;
    try { config = JSON.parse(rule.config); } catch { fail('Production settlement settings are invalid.'); }
    if (rule.month !== '0000-01' || rule.scope !== 'default' || rule.revision !== 1 || !same(config, initial)) fail('Production settlement settings have been changed.');
  }
}
export function fingerprint(db) {
  return createHash('sha256').update(canonical(TABLES.map(table => [table, rows(db, table).map(canonical).sort()]))).digest('hex');
}
export const counts = db => Object.fromEntries(TABLES.map(table => [table, db.prepare(`SELECT count(*) AS n FROM ${q(table)}`).get().n]));
function assertion(condition) {
  return `INSERT INTO ${q(GUARD)}(ok) SELECT CASE WHEN (${condition}) THEN 1 ELSE 0 END;`;
}
function assertSnapshot(db, tables) {
  return tables.flatMap(table => {
    const data = rows(db, table), cols = columns(db, table);
    return [assertion(`(SELECT count(*) FROM ${q(table)})=${data.length}`), ...data.map(row =>
      assertion(`EXISTS(SELECT 1 FROM ${q(table)} WHERE ${cols.map(col => `${q(col)} IS ${literal(row[col])}`).join(' AND ')})`))];
  });
}
export function makeTransferSql(source, target, bookmark) {
  validateDatabase(source); validateDatabase(target); assertBootstrap(target, source);
  if (completedTransfer(target)) fail('This transfer already completed.');
  const statements = [
    `CREATE TABLE ${q(GUARD)}(ok INTEGER NOT NULL CHECK(ok=1));`,
    // Checked inside the import, so changes after the export abort the entire operation.
    ...assertSnapshot(target, [...TABLES, 'd1_migrations']),
    ...[...TABLES].reverse().map(table => `DELETE FROM ${q(table)};`),
  ];
  for (const table of TABLES) {
    const cols = columns(source, table);
    for (const row of rows(source, table)) statements.push(`INSERT INTO ${q(table)}(${cols.map(q).join(',')}) VALUES(${cols.map(col => literal(row[col])).join(',')});`);
  }
  statements.push(...assertSnapshot(source, TABLES), assertion('NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check)'),
    `CREATE TABLE ${q(MARKER)}(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,target_id TEXT NOT NULL,source_digest TEXT NOT NULL,target_before_digest TEXT NOT NULL,target_before_bookmark TEXT NOT NULL,completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
    `INSERT INTO ${q(MARKER)}(id,source_id,target_id,source_digest,target_before_digest,target_before_bookmark) VALUES(${[TRANSFER,SOURCE_ID,TARGET_ID,fingerprint(source),fingerprint(target),bookmark].map(literal).join(',')});`,
    `DROP TABLE ${q(GUARD)};`);
  if (statements.some(statement => Buffer.byteLength(statement) > 95000)) fail('A statement is too large for D1.');
  return statements.join('\n') + '\n';
}

export function validateTargets(staging, production) {
  const valid = (config, name, id) => config.name === name && config.d1_databases?.length === 1
    && config.d1_databases[0].database_name === name && config.d1_databases[0].database_id === id;
  if (!valid(staging, 'uchiwake-staging', SOURCE_ID) || !valid(production, 'uchiwake', TARGET_ID)) fail('Source/target configuration does not match the approved databases.');
}
export async function runTransfer({apply = false} = {}) {
  const staging = JSON.parse(readFileSync(join(root, 'wrangler.staging.jsonc'), 'utf8'));
  const production = JSON.parse(readFileSync(join(root, 'wrangler.production.jsonc'), 'utf8'));
  validateTargets(staging, production);
  const directory = mkdtempSync(join(tmpdir(), 'uchiwake-transfer-'));
  const databases = [];
  const configFor = (name, config) => {
    const path = join(directory, `${name}.json`);
    writeFileSync(path, JSON.stringify({name:config.name, compatibility_date:config.compatibility_date,
      ...(config.account_id ? {account_id:config.account_id} : {}), d1_databases:config.d1_databases}), {mode:0o600});
    return path;
  };
  const configs = {source:configFor('source', staging), target:configFor('target', production)};
  const run = (label, args) => {
    try { return execFileSync(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args], {
      cwd:root, encoding:'utf8', maxBuffer:16*1024*1024, timeout:180000,
      env:{...process.env, CI:'true', WRANGLER_SEND_METRICS:'false', WRANGLER_LOG_PATH:join(directory, 'wrangler.log')},
      stdio:['ignore','pipe','pipe'],
    }); } catch { return fail(`${label} failed. Check the build token D1 permissions and account scope. Raw output is suppressed to protect exported data.`); }
  };
  const exportDatabase = (side, name, suffix = '') => {
    console.log(`Exporting ${side} database${suffix ? ' for verification' : ''}...`);
    const path = join(directory, `${side}${suffix}.sql`);
    run(`${side} export`, ['d1','export',name,'--remote','--config',configs[side],'--output',path]);
    const db = loadDump(readFileSync(path, 'utf8')); databases.push(db); return db;
  };
  try {
    const target = exportDatabase('target', 'uchiwake');
    const previous = completedTransfer(target);
    if (previous) { console.log(`DATA_TRANSFER_ALREADY_COMPLETED source_digest=${previous.source_digest}`); return; }
    validateDatabase(target);
    const source = exportDatabase('source', 'uchiwake-staging');
    validateDatabase(source); assertBootstrap(target, source);
    console.log(JSON.stringify({event:'DATA_TRANSFER_PLAN',source:SOURCE_ID,target:TARGET_ID,source_counts:counts(source),target_counts:counts(target),source_digest:fingerprint(source)}));
    if (!apply) { console.log('Read-only check completed. Use --apply to import this data.'); return; }
    const bookmark = JSON.parse(run('Production recovery bookmark', ['d1','time-travel','info','uchiwake','--config',configs.target,'--json'])).bookmark;
    if (typeof bookmark !== 'string' || !/^[a-zA-Z0-9-]+$/.test(bookmark)) fail('A valid production recovery bookmark is required.');
    console.log(`PRODUCTION_RECOVERY_BOOKMARK=${bookmark}`);
    const sql = makeTransferSql(source, target, bookmark);
    // Dry-run the exact SQL against the exported production database first.
    target.exec('BEGIN');
    try {
      target.exec(sql);
      if (fingerprint(target) !== fingerprint(source)) fail('Local transfer verification failed.');
    } finally { target.exec('ROLLBACK'); }
    const path = join(directory, 'transfer.sql'); writeFileSync(path, sql, {mode:0o600});
    console.log('Importing staging data into production. D1 blocks queries during the import.');
    run('Production import (check the transfer marker before retrying)', ['d1','execute','uchiwake','--remote','--config',configs.target,'--file',path,'--yes','--json']);
    const after = exportDatabase('target', 'uchiwake', '-after');
    validateDatabase(after);
    if (!completedTransfer(after) || fingerprint(after) !== fingerprint(source)) fail('Post-import verification differs. Do not rerun or restore automatically; inspect production and the recovery bookmark.');
    console.log(JSON.stringify({event:'DATA_TRANSFER_COMPLETE',counts:counts(after),source_digest:fingerprint(source),production_digest:fingerprint(after),recovery_bookmark:bookmark}));
  } finally {
    for (const db of databases) db.close();
    rmSync(directory, {recursive:true,force:true});
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--apply') || args.length > 1) { console.error('Usage: node scripts/promote-staging-data.mjs [--apply]'); process.exitCode = 1; }
  else await runTransfer({apply:args.includes('--apply')}).catch(error => { console.error(error.message); process.exitCode = 1; });
}
