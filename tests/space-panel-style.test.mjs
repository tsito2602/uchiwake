import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css=readFileSync(new URL('../src/spaces.css',import.meta.url),'utf8');
const source=readFileSync(new URL('../src/space-panel.tsx',import.meta.url),'utf8');

// These are rendering-structure guards, not a substitute for iOS visual QA.
// Background depth/blur, nested return, and entrance/exit are covered separately
// by panel-motion.test.mjs. Glass must not be an ancestor of the scroll content.
test('スペースパネルの半透明と背景ブラーは専用レイヤーに保持する',()=>{
  const panel=css.match(/\.card-panel\.space-floating-panel\s*\{([^}]+)\}/)?.[1];
  const glass=css.match(/\.space-panel-glass\s*\{([^}]+)\}/)?.[1];
  assert.ok(panel);assert.ok(glass);
  assert.match(panel,/background:\s*transparent/);
  // More specific than the shared .card-panel rule, regardless of CSS load order.
  assert.match(panel,/(?:^|;)\s*-webkit-backdrop-filter:\s*none/);
  assert.match(panel,/(?:^|;)\s*backdrop-filter:\s*none/);
  assert.match(glass,/background:\s*var\(--panel-tint\)/);
  assert.match(glass,/(?:^|;)\s*-webkit-backdrop-filter:\s*blur\(32px\) saturate\(1\.05\)/);
  assert.match(glass,/(?:^|;)\s*backdrop-filter:\s*blur\(32px\) saturate\(1\.05\)/);
  assert.match(glass,/position:\s*absolute/);
  assert.match(glass,/inset:\s*0/);
  assert.match(glass,/border-radius:\s*inherit/);
  assert.match(glass,/pointer-events:\s*none/);
});

test('ブラーはスクロール領域の外に置き、内容を明示的に前面へ描く',()=>{
  assert.match(source,/<section\b[^>]*className="card-panel space-floating-panel"[^>]*>\s*<div className="space-panel-glass" aria-hidden="true"\/>\s*<header/);
  assert.match(source,/<div className="card-panel-scroll">\{children\}<\/div>/);
  assert.match(css,/\.space-panel-glass\s*\{[^}]*z-index:\s*0/);
  assert.match(css,/\.space-floating-panel > :is\(\.card-panel-header, \.card-panel-scroll, \.card-panel-footer\)\s*\{[^}]*position:\s*relative;\s*z-index:\s*1/);
  assert.doesNotMatch(css,/\.space-floating-panel\s*::(?:before|after)/);
  assert.doesNotMatch(css,/\.space-floating-panel\s*>\s*\.card-panel-scroll\s*\{[^}]*(?:filter|clip-path|mask|isolation)\s*:/);
});

test('カード明細と同じブラー・共通の開閉処理を使い、設定カード全体から開く',()=>{
  const shared=readFileSync(new URL('../src/kondo-style.css',import.meta.url),'utf8');
  const cards=readFileSync(new URL('../src/card-statement-panel.tsx',import.meta.url),'utf8');
  const app=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');
  const material=selector=>selector.match(/(?:^|;)\s*backdrop-filter:\s*([^;]+)/)?.[1];
  assert.equal(material(css.match(/\.space-panel-glass\s*\{([^}]+)\}/)[1]),material(shared.match(/\.card-panel\s*\{([^}]+)\}/)[1]));
  for(const component of [source,cards])assert.match(component,/usePanelMorph\(panel,origin,closing,onExited,/);
  assert.ok(app.includes("openSpaceSettings(event.currentTarget.closest<HTMLElement>('.settings-section')??event.currentTarget)"));
});
