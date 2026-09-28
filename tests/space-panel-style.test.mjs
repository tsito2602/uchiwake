import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read=name=>readFileSync(new URL(`../src/${name}`,import.meta.url),'utf8');

// Guard the shared rendering boundary; actual iOS paint still needs device QA.
test('各パネルは固定の背景と単一のスクロール領域を兄弟として配置する',()=>{
 const css=read('kondo-style.css');
 const frame=css.match(/^\.card-panel-frame\s*\{([^}]+)\}/m)?.[1];
 const panel=css.match(/^\.card-panel\s*\{([^}]+)\}/m)?.[1];
 const body=css.match(/^\.card-panel-scroll\s*\{([^}]+)\}/m)?.[1];
 const glass=css.match(/^\.card-panel-glass\s*\{([^}]+)\}/m)?.[1];
 assert.ok(frame&&panel&&body&&glass);
 assert.match(panel,/overflow-y:\s*auto/);
 for(const content of [frame,body])assert.doesNotMatch(content,/(?:overflow|clip-path|filter|transform)\s*:/);
 assert.doesNotMatch(panel,/(?:backdrop-filter|clip-path|filter|transform)\s*:/);
 assert.match(glass,/background:\s*var\(--panel-tint\)/);
 assert.match(glass,/backdrop-filter:\s*blur\(32px\) saturate\(1\.05\)/);
 assert.match(glass,/pointer-events:\s*none/);
 assert.match(css,/\.card-panel > \.card-panel-header\s*\{[^}]*position:\s*sticky;\s*top:\s*0/);
 for(const file of ['space-panel.tsx','card-statement-panel.tsx','card-settings-panel.tsx','category-settings-panel.tsx','bill-panel.tsx','category-entries-panel.tsx','statement-import-panel.tsx']){
  const source=read(file);
  const frame=source.indexOf('className="card-panel-frame');
  const glass=source.indexOf('<div className="card-panel-glass" aria-hidden="true"/>');
  const dialog=source.indexOf('role="dialog"');
  assert.ok(frame>=0&&frame<glass&&glass<dialog,file);
  assert.match(source,/usePanelMorph\(panel,origin,closing,onExited,/,file);
 }
 assert.doesNotMatch(read('spaces.css'),/\.space-panel-glass|\.card-panel\.space-floating-panel/);
});
