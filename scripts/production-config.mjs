import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

export function productionConfig(databaseId) {
  const config = JSON.parse(readFileSync(resolve(root, 'wrangler.production.jsonc'), 'utf8'));
  const configuredId = config.d1_databases[0].database_id;
  const id = (databaseId === undefined ? configuredId || '' : databaseId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) {
    throw new Error('D1_DATABASE_ID must be the UUID of the production uchiwake database.');
  }
  const staging = JSON.parse(readFileSync(resolve(root, 'wrangler.staging.jsonc'), 'utf8'));
  if (staging.d1_databases.some(database => database.database_id.toLowerCase() === id)) {
    throw new Error('The staging database cannot be used for production.');
  }
  if (id !== configuredId) {
    throw new Error('D1_DATABASE_ID does not match the configured production uchiwake database.');
  }
  config.d1_databases[0].database_id = id;
  return config;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const config = productionConfig(process.env.D1_DATABASE_ID);
    writeFileSync(resolve(root, '.wrangler.production.generated.jsonc'), JSON.stringify(config, null, 2) + '\n');
    console.log('Production configuration ready: Worker uchiwake / D1 uchiwake.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
