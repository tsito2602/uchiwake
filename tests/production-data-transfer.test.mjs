import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { freshDatabase, loadDump, validateDatabase, assertBootstrap, makeTransferSql,
  fingerprint, completedTransfer, counts, validateTargets, SOURCE_ID, TARGET_ID, MARKER } from '../scripts/promote-staging-data.mjs';

function db() {
  const value = freshDatabase();
  value.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
  for (const name of readdirSync(new URL('../migrations', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) value.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(name);
  return value;
}
function bootstrap(value) {
  value.exec(`UPDATE spaces SET owner_id='owner' WHERE id='legacy';
    INSERT INTO spaces(id,name,kind,owner_id) VALUES('personal:owner','個人','personal','owner');
    INSERT INTO space_members(space_id,user_id,name) VALUES('legacy','owner','Owner'),('personal:owner','owner','Owner');
    INSERT INTO user_profiles(user_id,display_name) VALUES('owner','Owner');`);
  const config = JSON.stringify({uniform:true,common:{mode:'equal',shares:[{user_id:'owner',weight:1}]},items:{}});
  for (const space of ['legacy','personal:owner']) value.prepare("INSERT INTO settlement_rules(space_id,month,scope,config) VALUES(?,'0000-01','default',?)").run(space,config);
}
function populated() {
  const value = db(); bootstrap(value);
  value.exec(`INSERT INTO spaces(id,name,kind,owner_id) VALUES('shared','共有','shared','owner');
    INSERT INTO space_members(space_id,user_id,name) VALUES('shared','owner','Owner'),('shared','wife','Wife');
    INSERT INTO user_profiles(user_id,display_name) VALUES('wife','Wife');
    INSERT INTO shared_cards(id,name,space_id) VALUES('card','カード','legacy');
    INSERT INTO bills(id,due_month,title,kind,amount) VALUES('bill','2026-09','光熱費','utilities',5000);
    INSERT INTO card_statements(id,due_month,title,confirmed_total,card_id) VALUES('stmt','2026-09','請求',12345,'card');
    INSERT INTO card_entries(id,statement_id,title,category,amount) VALUES('entry','stmt','店','食費',12545),('refund','stmt','返金','食費',-200);
    INSERT INTO category_settings(space_id,category,icon,color) VALUES('legacy','食費','food','#171717');
    INSERT INTO rent_rules(space_id,effective_month,amount) VALUES('legacy','2026-01',100000);
    INSERT INTO space_preferences(space_id,rent_enabled) VALUES('legacy',1);
    INSERT INTO space_invites(code_hash,space_id,created_by,expires_at) VALUES('hash','shared','owner',1900000000000);
    INSERT INTO invite_attempts(user_id,window,attempts) VALUES('owner',123,1);
    INSERT INTO classification_rules(id,space_id,merchant_key,category,created_by) VALUES('rule','legacy','店','食費','owner');
    UPDATE card_entries SET category='外食' WHERE id='entry';`);
  value.prepare('UPDATE bills SET note=? WHERE id=?').run("O'Brien\n'); DROP TABLE spaces;--\u0000日本語",'bill');
  return value;
}
function apply(value, sql) {
  value.exec('BEGIN');
  try { value.exec(sql); value.exec('COMMIT'); }
  catch (error) { value.exec('ROLLBACK'); throw error; }
}

test('copies all related data, preserves source and production migrations, and records recovery bookmark', () => {
  const source = populated(), target = db(); bootstrap(target);
  const before = fingerprint(source);
  target.exec("UPDATE d1_migrations SET applied_at='production-timestamp'");
  const migrationRows = target.prepare('SELECT * FROM d1_migrations').all();
  validateDatabase(source); validateDatabase(target);
  apply(target, makeTransferSql(source,target,'0001-0002-0003'));
  validateDatabase(target);
  assert.equal(fingerprint(target),before);
  assert.equal(fingerprint(source),before);
  assert.deepEqual(counts(target),counts(source));
  assert.deepEqual(target.prepare('SELECT * FROM d1_migrations').all(),migrationRows);
  assert.equal(completedTransfer(target).target_before_bookmark,'0001-0002-0003');
  assert.deepEqual(target.prepare('SELECT * FROM classification_history').all(),source.prepare('SELECT * FROM classification_history').all());
  assert.equal(target.prepare('SELECT sum(amount) AS total FROM card_entries').get().total,12345);
  assert.equal(target.prepare('SELECT note FROM bills').get().note,source.prepare('SELECT note FROM bills').get().note);
  source.close(); target.close();
});
test('rejects existing production finance data or customized settings without modifying anything', () => {
  for (const sql of [
    "INSERT INTO bills(id,due_month,title,kind,amount) VALUES('new','2026-09','本番','other',1)",
    "INSERT INTO shared_cards(id,name) VALUES('new','本番カード')",
    "UPDATE spaces SET name='変更済み' WHERE id='legacy'",
    "UPDATE settlement_rules SET revision=2",
    "INSERT INTO space_members(space_id,user_id,name) VALUES('legacy','other','Other')",
    "INSERT INTO space_preferences(space_id,rent_enabled) VALUES('legacy',1)",
  ]) {
    const source = populated(), target = db(); bootstrap(target); target.exec(sql);
    const before = fingerprint(target);
    assert.throws(() => makeTransferSql(source,target,'bookmark'));
    assert.equal(fingerprint(target),before);
    source.close(); target.close();
  }
});
test('rejects different Google identities and production-only users', () => {
  const source = populated(), target = db(); bootstrap(target);
  target.exec("UPDATE spaces SET owner_id='different' WHERE id='legacy'");
  assert.throws(() => assertBootstrap(target,source),/owners differ/);
  target.exec("UPDATE spaces SET owner_id='owner' WHERE id='legacy'; INSERT INTO user_profiles(user_id) VALUES('other')");
  assert.throws(() => assertBootstrap(target,source),/does not exist/);
  source.close(); target.close();
});
test('concurrent production changes abort the entire import before changing existing data', () => {
  for (const sql of [
    "INSERT INTO bills(id,due_month,title,kind,amount) VALUES('new','2026-09','New','other',1)",
    "UPDATE user_profiles SET display_name='Changed'",
    "UPDATE spaces SET name='Changed' WHERE id='legacy'",
    "UPDATE d1_migrations SET applied_at='Changed'",
  ]) {
    const source = populated(), target = db(); bootstrap(target);
    const transfer = makeTransferSql(source,target,'bookmark'); target.exec(sql);
    const before = fingerprint(target);
    assert.throws(() => apply(target,transfer),/CHECK constraint failed/);
    assert.equal(fingerprint(target),before);
    assert.equal(completedTransfer(target),false);
    source.close(); target.close();
  }
});
test('mid-import and final-verification failures roll back all replacements', () => {
  const source = populated(), target = db(); bootstrap(target);
  const sql = makeTransferSql(source,target,'bookmark'); const before = fingerprint(target);
  const broken = sql.replace('INSERT INTO "card_entries"', 'INSERT INTO "missing_table"');
  assert.throws(() => apply(target,broken)); assert.equal(fingerprint(target),before);
  const tampered = sql.replace(`CREATE TABLE "${MARKER}"`, `DELETE FROM bills; INSERT INTO uchiwake_transfer_guard(ok) VALUES(0); CREATE TABLE "${MARKER}"`);
  assert.throws(() => apply(target,tampered)); assert.equal(fingerprint(target),before);
  source.close(); target.close();
});
test('rejects schema differences, incomplete migrations, and orphaned records', () => {
  for (const change of [
    value => value.exec('CREATE TABLE surprise(id TEXT)'),
    value => value.exec('ALTER TABLE bills ADD COLUMN unexpected TEXT'),
    value => value.exec("DELETE FROM d1_migrations WHERE name='0012_import_classification.sql'"),
    value => value.exec("PRAGMA foreign_keys=OFF; DROP TRIGGER bills_space_insert; INSERT INTO bills(id,due_month,title,kind,amount,space_id) VALUES('bad','2026-09','Bad','other',1,'missing')"),
  ]) {
    const value = db(); change(value); assert.throws(() => validateDatabase(value)); value.close();
  }
});
test('completion marker prevents accidental reimport even after new production activity', () => {
  const source = populated(), target = db(); bootstrap(target);
  const sql = makeTransferSql(source,target,'bookmark'); apply(target,sql);
  target.exec("UPDATE bills SET amount=6000 WHERE id='bill'");
  const record = completedTransfer(target);
  assert.equal(record.source_id,SOURCE_ID); assert.equal(record.target_id,TARGET_ID);
  assert.throws(() => apply(target,sql)); assert.equal(target.prepare('SELECT amount FROM bills').get().amount,6000);
  source.close(); target.close();
});
test('accepts only the exact source and target configurations', () => {
  const source = JSON.parse(readFileSync(new URL('../wrangler.staging.jsonc',import.meta.url),'utf8'));
  const target = JSON.parse(readFileSync(new URL('../wrangler.production.jsonc',import.meta.url),'utf8'));
  validateTargets(source,target);
  assert.throws(() => validateTargets(target,source));
  target.d1_databases[0].database_id=SOURCE_ID;
  assert.throws(() => validateTargets(source,target));
});
test('SQL exports load even when child tables precede their parents', () => {
  const value=loadDump("CREATE TABLE child(parent TEXT REFERENCES parent(id)); INSERT INTO child VALUES('p'); CREATE TABLE parent(id TEXT PRIMARY KEY); INSERT INTO parent VALUES('p');");
  assert.deepEqual(value.prepare('PRAGMA foreign_key_check').all(),[]); value.close();
});
