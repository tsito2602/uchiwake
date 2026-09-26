import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { demoImportResult } from '../src/statement-import-flow.ts';

const {outputFiles}=await build({stdin:{contents:`
  import {createElement} from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {ImportReview} from './src/statement-import-review';
  import {ImportProcessing} from './src/statement-import-content';
  import {StatementImportPanel} from './src/statement-import-panel';
  import {FloatingDock} from './src/floating-dock';
  import {BorderBeam} from 'border-beam';
  import {ThinkingOrb} from 'thinking-orbs';
  export const defaultBeam=()=>renderToStaticMarkup(createElement(BorderBeam,{size:'md',theme:'light',borderRadius:28}));
  export const defaultOrb=()=>renderToStaticMarkup(createElement(ThinkingOrb,{state:'breathing',size:20,theme:'dark','aria-hidden':'true'}));
  export const review=props=>renderToStaticMarkup(createElement(ImportReview,props));
  export const processing=props=>renderToStaticMarkup(createElement(ImportProcessing,props));
  const context=appearance=>({onBack:()=>{},onAction:()=>{},actionLabel:appearance==='breathing'?'仕分け中...':'デモで仕分ける',actionAppearance:appearance,disabled:appearance==='breathing',commit:true});
  export const panel=(active,appearance)=>renderToStaticMarkup(createElement(StatementImportPanel,{processing:active,reviewing:false,onExited:()=>{},context:context(appearance)},'明細'));
  export const dock=appearance=>renderToStaticMarkup(createElement(FloatingDock,{tab:'home',onSelect:()=>{},panelActive:true,month:'2026-09',onMonthChange:()=>{},onPrevMonth:()=>{},onNextMonth:()=>{},context:context(appearance)}));
`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
// Resolve external React imports from the project, not from a data URL.
const bundle=outputFiles[0].text.replace(/from "(react(?:-dom(?:\/server)?|\/jsx-runtime)?|lucide-react|border-beam|thinking-orbs|motion\/react)"/g,(_match,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {review,processing,panel,dock,defaultBeam,defaultOrb}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
const sample=demoImportResult('2026-09');
const draft={...sample,card_id:'one',due_month:'2026-09',title:'カード明細',demo:true};
const props={draft,cards:[{id:'one',name:'生活費カード',active:true}],settings:[],busy:false,checked:false,onChange:()=>{},onChecked:()=>{}};

test('仕分け後も同じ明細行で日付・費目・金額を表示し、編集フォームは閉じている',()=>{
  const completed=review(props);
  const running=processing({progress:{phase:'checking',entries:sample.entries,count:3,demo:true},settings:[]});
  for(const markup of [completed,running]){
    for(const entry of sample.entries){assert.ok(markup.includes(entry.title));assert.ok(markup.includes(entry.spent_on));assert.ok(markup.includes(entry.category));}
    assert.ok(markup.includes('import-entry-copy'));
    assert.ok(markup.includes('6,840'));
  }
  assert.ok(completed.includes('スーパーを編集'));
  assert.ok(completed.includes('タップして編集'));
  assert.ok(!completed.includes('type="month"'));
  assert.ok(!completed.includes('type="date"'));
  assert.ok(!completed.includes('<select'));
  assert.ok(completed.includes('type="checkbox"'));
});

test('手入力で始めた空の明細は編集欄を開き、削除・金額・費目を編集できる',()=>{
  const markup=review({...props,draft:{...draft,entries:[{spent_on:'',title:'',amount:0,category:'その他・要確認'}]}});
  for(const expected of ['type="date"','type="number"','<select','1件目を削除'])assert.ok(markup.includes(expected));
});

test('白いパネルはlight Rotateの配色・回転を保ち、縁と内側のコントラストを補正する',()=>{
  const active=panel(true),inactive=panel(false);
  assert.match(active,/<div[^>]*data-beam="[^"]+"[^>]*data-active=""/);
  assert.doesNotMatch(inactive,/<div[^>]*data-beam="[^"]+"[^>]*data-active=""/);
  assert.ok(!active.includes('--pulse-glow'));
  assert.ok(active.includes('--beam-strength:1'));
  // The app panel is always light, independently of the OS color preference.
  const normalizeId=markup=>markup.replaceAll(markup.match(/data-beam="([^"]+)"/)[1],'BEAM_ID');
  const sourceCSS=normalizeId(defaultBeam()).match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.ok(normalizeId(active).includes(sourceCSS),'Beam colors, opacity and motion must match the unmodified light preset');
  assert.ok(sourceCSS.includes('rgba(0, 0, 0, 0.55)'),'The moving highlight must contrast with the white panel');
  assert.ok(!sourceCSS.includes('rgba(255, 255, 255, 0.75)'),'Do not use the dark preset white highlight on a white panel');
  const normalized=normalizeId(active);
  assert.match(normalized,/\[data-beam="BEAM_ID"\] \{\s*--beam-stroke-opacity: 5;\s*--beam-inner-opacity: 3;/);
  assert.match(normalized,/\[data-beam="BEAM_ID"\]\[data-active\]::after,\s*\[data-beam="BEAM_ID"\]\[data-fading\]::after \{\s*padding: 2px;/);
  assert.ok(active.includes('--beam-angle-'));
  assert.ok(active.includes('beam-spin-'));
  assert.ok(active.includes('mask-composite: exclude'));
  assert.ok(!active.includes('{id}'));
  assert.ok(active.includes('prefers-reduced-motion'));
});

test('仕分け開始アクションだけにStudioの色付きボタンとアイコンを表示する',()=>{
  assert.match(panel(false,'studio'),/<button class="studio-action"/);
  assert.ok(panel(false,'studio').includes('data-studio-wand'));
  assert.equal((panel(false,'studio').match(/<i style=/g)||[]).length,10);
  assert.doesNotMatch(panel(false),/<button class="studio-action"/);
});

test('処理中はナビとパネルの両方で標準20px breathingと仕分け中...を表示する',()=>{
  for(const markup of [panel(true,'breathing'),dock('breathing')]){
    assert.match(markup,/<button[^>]*class="[^"]*breathing-action"[^>]*disabled=""/);
    assert.ok(markup.includes(defaultOrb()));
    assert.match(markup,/<span class="import-processing-label" role="status">[\s\S]*<span>仕分け中\.\.\.<\/span>/);
    assert.ok(!markup.includes('studio-action'));
    assert.ok(!markup.includes('data-studio-wand'));
  }
  for(const appearance of ['studio',undefined]){
    assert.ok(!panel(false,appearance).includes('<canvas'));
    assert.ok(!dock(appearance).includes('<canvas'));
  }
});

test('Studioの発光SVG・マスク・透明度・速度を参照ページから変更しない',()=>{
  const css=readFileSync(new URL('../src/studio-action.css',import.meta.url),'utf8');
  const wash=css.slice(css.indexOf('.studio-action::before {'),css.indexOf('/* The label rides')).trim();
  // Hash of the source ::before rule; only its selector was namespaced.
  assert.equal(createHash('sha256').update(wash).digest('hex'),'7e29720172242b6ad65da7e44f82efbc4be710225fb38dcd8ef8ad5d7cf63794');
  for(const [token,value] of Object.entries({strength:'0.5',core:'50%', 'core-blur':'150%',blur:'6px','hue-dur':'4000ms','drift-dur':'5000ms'})){
    assert.equal(css.match(new RegExp('--probtn-'+token+':\\s*([^;]+);'))?.[1],value);
  }
  assert.equal((wash.match(/url\("data:image\/svg\+xml/g)||[]).length,7);
  assert.ok(css.includes('prefers-reduced-motion'));
  const oldCSS=readFileSync(new URL('../src/statement-import.css',import.meta.url),'utf8');
  assert.ok(!oldCSS.includes('.studio-action'));
});
