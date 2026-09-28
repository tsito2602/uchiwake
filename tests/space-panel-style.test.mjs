import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');

// Guard the shared rendering boundary; actual iOS paint still needs device QA.
test('全パネルのブラーは空の背景要素に限定し、スクロール内容を前面に保持する',()=>{
 const css=read('kondo-style.css');
 const panel=css.match(/^\.card-panel\s*\{([^}]+)\}/m)?.[1];
 const glass=css.match(/^\.card-panel-glass\s*\{([^}]+)\}/m)?.[1];
 assert.match(panel,/background:\s*transparent/);
 assert.doesNotMatch(panel,/(?:backdrop-filter|clip-path|filter)\s*:/);
 assert.match(glass,/background:\s*var\(--panel-tint\)/);
 assert.match(glass,/backdrop-filter:\s*blur\(32px\) saturate\(1\.05\)/);
 assert.match(glass,/pointer-events:\s*none/);
 assert.match(css,/\.card-panel > :is\(\.card-panel-header, \.card-panel-scroll, \.card-panel-footer\)\s*\{[^}]*z-index:\s*1/);
 assert.match(css,/\.card-panel-scroll\s*\{[^}]*transform:\s*translateZ\(0\)/);
 for(const file of ['space-panel.tsx','card-statement-panel.tsx','card-settings-panel.tsx','category-settings-panel.tsx','bill-panel.tsx','category-entries-panel.tsx','statement-import-panel.tsx']){
  const source=read(file);
  assert.match(source,/role="dialog"[^>]*>\s*<div className="card-panel-glass" aria-hidden="true"\/>/,file);
  assert.match(source,/usePanelMorph\(panel,origin,closing,onExited,/,file);
 }
 assert.doesNotMatch(read('spaces.css'),/\.space-panel-glass|\.card-panel\.space-floating-panel/);
});
