import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { productionConfig } from '../scripts/production-config.mjs';
import { spaceFixture } from './spaces-fixture.mjs';

test('production configuration rejects a missing, malformed, or staging database ID', () => {
  const staging = JSON.parse(readFileSync(new URL('../wrangler.staging.jsonc', import.meta.url), 'utf8'));
  for (const id of [undefined, '', 'uchiwake', staging.d1_databases[0].database_id.toUpperCase()]) {
    assert.throws(() => productionConfig(id));
  }
  const id = '00000000-0000-4000-8000-000000000001';
  const config = productionConfig(id);
  assert.equal(config.name, 'uchiwake');
  assert.equal(config.vars.APP_ENV, 'production');
  assert.equal(config.d1_databases[0].database_name, 'uchiwake');
  assert.equal(config.d1_databases[0].database_id, id);
  assert.equal(config.ai.binding, 'AI');
  assert.equal(config.preview_urls, false);
});

test('a fresh production database supports spaces and hides staging-only tools', async () => {
  const f = spaceFixture();
  f.env.APP_ENV = 'production';
  try {
    const response = await f.call('owner', '/spaces');
    assert.equal(response.status, 200);
    const { spaces } = await response.json();
    assert.equal(spaces.length, 2);
    const state = await f.call('owner', '/state?month=2026-09', 'GET', undefined, 'legacy');
    assert.equal(state.status, 200);
    const data = await state.json();
    assert.equal(data.demo_enabled, false);
    assert.equal(data.entries.length, 0);
    assert.equal(data.statements.length, 0);
    for (const path of ['/state?month=2026-09&demo=1', '/settlement-history?month=2026-09&demo=1']) {
      assert.equal((await f.call('owner', path, 'GET', undefined, 'legacy')).status, 404);
    }
    assert.equal((await f.call('outsider', '/state?month=2026-09', 'GET', undefined, 'legacy')).status, 404);
  } finally {
    f.db.close();
  }
});
