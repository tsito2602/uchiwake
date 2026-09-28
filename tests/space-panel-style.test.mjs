import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../src/spaces.css',import.meta.url),'utf8');

// These are rendering-structure guards, not a substitute for iOS visual QA.
// Background depth/blur, nested return, and entrance/exit are covered separately
// by panel-motion.test.mjs. The active SpacePanel must not filter its scroll tiles.
test('スペースパネルはテーマの半透明色だけを重ね、背面ブラーを二重に適用しない',()=>{
  const material=css.match(/\.card-panel\.space-floating-panel\s*\{([^}]+)\}/)?.[1];
  assert.ok(material);
  assert.match(material,/background:\s*var\(--panel-tint\)/);
  // More specific than the shared .card-panel rule, regardless of CSS load order.
  assert.match(material,/(?:^|;)\s*-webkit-backdrop-filter:\s*none/);
  assert.match(material,/(?:^|;)\s*backdrop-filter:\s*none/);
  assert.doesNotMatch(material,/(?:^|;)\s*(?:filter|clip-path|mask|transform|isolation)\s*:/);
});

test('スクロール内容と重なるブラー用の擬似レイヤーを作らない',()=>{
  assert.doesNotMatch(css,/\.space-floating-panel\s*::(?:before|after)/);
  assert.doesNotMatch(css,/\.space-floating-panel\s*>\s*\.card-panel-scroll\s*\{[^}]*(?:filter|clip-path|mask|isolation)\s*:/);
});
