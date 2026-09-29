import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { demoImportResult } from '../src/statement-import-flow.ts';
import { scrollImportToLatest } from '../src/import-follow-scroll.ts';

const {outputFiles}=await build({stdin:{contents:`
  import {createElement} from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {ImportReview,withDraftEntries} from './src/statement-import-review';
  export {withDraftEntries};
  import {ImportSetup,ImportProcessing,ImportPhaseStatus} from './src/statement-import-content';
  import {StatementImportPanel} from './src/statement-import-panel';
  import {FloatingDock} from './src/floating-dock';
  import {ThinkingOrb} from 'thinking-orbs';
  import {JevConnectionTest} from './src/jev-connection-test';
  export const jevTest=props=>renderToStaticMarkup(createElement(JevConnectionTest,props));
  export const defaultOrb=()=>renderToStaticMarkup(createElement(ThinkingOrb,{state:'breathing',size:20,theme:'dark','aria-hidden':'true'}));
  export const setup=props=>renderToStaticMarkup(createElement(ImportSetup,props));
  export const review=props=>renderToStaticMarkup(createElement(ImportReview,props));
  export const processing=props=>renderToStaticMarkup(createElement(ImportPhaseStatus,{progress:props.progress}))+renderToStaticMarkup(createElement(ImportProcessing,props));
  const context=appearance=>({onBack:()=>{},onAction:()=>{},actionLabel:appearance==='breathing'?'Thinking...':'デモで仕分ける',actionAppearance:appearance,disabled:appearance==='breathing',commit:true});
  export const panel=(active,appearance)=>renderToStaticMarkup(createElement(StatementImportPanel,{processing:active,progress:active?{phase:'sorting',entries:[],count:3,demo:true}:null,reviewing:false,onExited:()=>{},context:context(appearance)},'明細'));
  export const dock=(appearance,overrides={})=>renderToStaticMarkup(createElement(FloatingDock,{tab:'home',onSelect:()=>{},panelActive:true,month:'2026-09',onMonthChange:()=>{},onPrevMonth:()=>{},onNextMonth:()=>{},context:{...context(appearance),...overrides}}));
`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
// Resolve external React imports from the project, not from a data URL.
const bundle=outputFiles[0].text.replace(/from "(react(?:-dom(?:\/server)?|\/jsx-runtime)?|lucide-react|border-beam|thinking-orbs|motion\/react)"/g,(_match,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {setup,review,processing,panel,dock,defaultOrb,withDraftEntries,jevTest}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
const sample=demoImportResult('2026-09');
const draft={...sample,card_id:'one',due_month:'2026-09',title:'カード明細',demo:true};
const props={draft,cards:[{id:'one',name:'生活費カード',active:true}],settings:[],busy:false,checked:false,onChange:()=>{},onChecked:()=>{}};

test('Jev接続テストは画像不要・1回の呼び出しを案内し、結果をコピーできる',()=>{
 const markup=jevTest({busy:false,result:'{"ok":false,"value":"<script>"}',onRun:()=>{}});
 assert.ok(markup.includes('Jev接続テスト'));assert.ok(markup.includes('AI呼び出しは1回'));assert.ok(markup.includes('診断結果をコピー'));assert.match(markup,/readonly=""/i);assert.ok(!markup.includes('<script>'));
 assert.ok(jevTest({busy:true,result:'',onRun:()=>{}}).includes('disabled=""'));
});

test('保存操作のないパネルでも削除を独立した島に表示し、操作禁止を反映する',()=>{
  for(const disabled of [false,true]){
    const html=dock(undefined,{backOnly:true,commit:false,secondaryAction:{label:'このスペースを削除',disabled,onAction:()=>{}}});
    assert.ok(html.includes('context-island context-delete'));
    assert.ok(!html.includes('context-primary'));
    const button=html.match(/<button[^>]*aria-label="このスペースを削除"[^>]*>/)?.[0];
    assert.ok(button);
    assert.equal(button.includes('disabled'),disabled);
    assert.equal((html.match(/aria-label="このスペースを削除"/g)||[]).length,1);
  }
  assert.ok(!dock(undefined,{backOnly:true,commit:false}).includes('context-delete'));
});

test('読取中はゲージを1行の要約に置き換え、未着時・デモを区別してHTMLを実行しない',()=>{
  const render=extra=>processing({progress:{phase:'reading',entries:[],count:null,demo:false,...extra},settings:[]});
  const pending=render({});
  assert.ok(pending.includes('Thinking...'));
  assert.ok(pending.includes('import-thinking-text'));
  assert.ok(!pending.includes('import-working-line'));
  const summary=render({reasoning:'金額を確認中 <img src=x onerror=alert(1)>'});
  assert.ok(summary.includes('金額を確認中 &lt;img'));
  assert.ok(!summary.includes('<img src=x'));
  assert.ok(!summary.includes('Thinking...'));
  assert.ok(render({demo:true}).includes('サンプル明細を準備中…'));
});

test('仕分け後も同じ明細行で日付・費目・金額を表示し、編集フォームは閉じている',()=>{
  const completed=review(props);
  const running=processing({progress:{phase:'checking',entries:sample.entries,count:15,demo:true,checkedCount:15,checkedTotal:sample.confirmed_total},settings:[]});
  for(const markup of [completed,running]){
    for(const entry of sample.entries){assert.ok(markup.includes(entry.title));assert.ok(markup.includes(entry.spent_on));assert.ok(markup.includes(entry.category));}
    assert.ok(markup.includes('import-entry-copy'));
    assert.ok(markup.includes(sample.confirmed_total.toLocaleString('ja-JP')));
  }
  assert.ok(completed.includes('スーパーを編集'));
  assert.ok(completed.includes('タップして編集'));
  assert.ok(!completed.includes('type="month"'));
  assert.ok(!completed.includes('type="date"'));
  assert.ok(!completed.includes('<select'));
  assert.ok(completed.includes('type="checkbox"'));
});

test('手入力で始めた空の明細は編集欄を開き、削除・金額・費目を編集できる',()=>{
  const markup=review({...props,draft:{...draft,entries:[{spent_on:'',title:'',amount:0,category:'要確認'}]}});
  for(const expected of ['type="date"','type="number"','<select','1件目を削除'])assert.ok(markup.includes(expected));
  assert.match(markup,/<div class="import-review-item" data-expanded="true"[^>]*><button[\s\S]*?<\/button>[\s\S]*?<div class="import-review-expander"[^>]*><fieldset/);
});

test('利用合計を唯一の登録先編集入口にし、重複金額と明細名の入力をなくす',()=>{
  const markup=review(props);
  assert.equal(markup.split(sample.confirmed_total.toLocaleString('ja-JP')).length-1,1);
  assert.match(markup,/<button class="import-processing-foot import-review-total"[^>]*aria-label="利用合計：登録先・引落額を編集"[^>]*aria-expanded="false"/);
  assert.ok(!markup.includes('カード引落額'));
  assert.ok(!markup.includes('import-review-destination'));
  const source=readFileSync(new URL('../src/statement-import-review.tsx',import.meta.url),'utf8');
  assert.ok(!source.includes('明細の名前'));
  assert.ok(!source.includes('value={draft.title}'));
  for(const field of ['value={draft.card_id}','value={draft.due_month}','value={draft.confirmed_total'])assert.ok(source.includes(field));
  const css=readFileSync(new URL('../src/statement-import.css',import.meta.url),'utf8');
  assert.match(css,/\.import-review-editor \{[^}]*border: 0;[^}]*border-top: 1px solid/);
});

test('フェーズはスクロール領域の外に固定し、仕分け済みの全行を保持する',()=>{
  const markup=panel(true);
  const phase=markup.indexOf('class="import-phase-status"');
  const viewport=markup.indexOf('class="card-panel-scroll"');
  assert.ok(phase>0&&phase<viewport);
  assert.ok(markup.slice(phase,viewport).includes('</section>'));
  assert.ok(markup.includes('aria-label="読み取りと仕分けの並行処理"'));
  const entries=Array.from({length:12},(_,i)=>({...sample.entries[0],title:`店舗${i+1}`}));
  const list=processing({progress:{phase:'sorting',entries,count:12,demo:true},settings:[]});
  assert.equal((list.match(/data-import-entry=""/g)||[]).length,12);
  assert.ok(list.includes('店舗1'));assert.ok(list.includes('店舗12'));
});

test('新しい明細をパネル内だけで追従し、動きを減らす設定では即時に移動する',()=>{
  const moves=[];
  const viewport={scrollHeight:980,clientHeight:400,scrollTo:value=>moves.push(value)};
  scrollImportToLatest(viewport,false);
  assert.deepEqual(moves.pop(),{top:580,behavior:'smooth'});
  scrollImportToLatest(viewport,true);
  assert.deepEqual(moves.pop(),{top:580,behavior:'instant'});
  viewport.scrollHeight=200;scrollImportToLatest(viewport,false);
  assert.equal(moves.pop().top,0);
});

test('編集できる行をアイコンで示し、確認チェックはテーマ色のアニメーションとキーボード操作を備える',()=>{
  const markup=review({...props,checked:true});
  assert.equal((markup.match(/class="import-entry-edit"/g)||[]).length,16);
  assert.ok(markup.includes('import-edit-hint'));
  assert.match(markup,/data-checked="true"><input type="checkbox" checked=""/);
  assert.ok(markup.includes('元の明細と内容・金額を確認した'));
  const css=readFileSync(new URL('../src/statement-import.css',import.meta.url),'utf8');
  assert.match(css,/input:checked \+ \.import-confirm-check \{[^}]*background: var\(--brand\);[^}]*animation: import-check-pop/);
  assert.ok(css.includes('input:focus-visible + .import-confirm-check'));
  assert.ok(css.includes('@keyframes import-check-draw'));
});

test('仕分け中だけ0.7倍のSoft Orbitを表示し、光とぼかしを角丸の内側に収める',()=>{
  const active=panel(true),inactive=panel(false);
  assert.match(active,/<div class="soft-orbit-glow" data-strength="0.7" aria-hidden="true"><canvas><\/canvas><canvas><\/canvas><canvas><\/canvas>/);
  assert.ok(!inactive.includes('soft-orbit-glow'));
  assert.ok(active.includes('class="import-border-beam"'));
  assert.ok(active.includes('data-beam='));
  assert.ok(active.includes('beam-spin-'));
  assert.ok(!inactive.includes('data-beam='));
  const css=readFileSync(new URL('../src/statement-import.css',import.meta.url),'utf8');
  const overlay=css.match(/\.soft-orbit-glow \{([^}]+)\}/)?.[1];
  assert.match(overlay,/overflow: hidden/);
  assert.match(overlay,/clip-path: inset\(0 round 28px\)/);
  assert.match(overlay,/pointer-events: none/);
});

test('仕分け開始アクションだけにStudioの色付きボタンとアイコンを表示する',()=>{
  assert.match(panel(false,'studio'),/<button class="studio-action"/);
  assert.ok(panel(false,'studio').includes('data-studio-wand'));
  assert.equal((panel(false,'studio').match(/<i style=/g)||[]).length,10);
  assert.doesNotMatch(panel(false),/<button class="studio-action"/);
});

test('処理中はナビとパネルの両方で標準20px breathingとThinking...を表示する',()=>{
  for(const markup of [panel(true,'breathing'),dock('breathing')]){
    assert.match(markup,/<button[^>]*class="[^"]*breathing-action"[^>]*disabled=""/);
    assert.ok(markup.includes(defaultOrb()));
    assert.match(markup,/<span class="import-processing-label" role="status" aria-label="Thinking\.\.\.">[\s\S]*<span class="import-processing-shimmer" data-text="Thinking\.\.\." aria-hidden="true">Thinking\.\.\.<\/span>/);
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

 test('仕分けゲージは完了件数に連動し、金額確認は別の工程として表示する',()=>{
 for(const count of [1,7,15]){
   const markup=processing({progress:{phase:'sorting',entries:sample.entries.slice(0,count),count:15,demo:true},settings:[]});
   assert.ok(markup.includes(`transform:scaleX(${count/15})`));
   assert.ok(markup.includes('class="import-verification" data-active="false"'));assert.ok(markup.includes('読み取り・仕分けの完了後'));
   const checking=processing({progress:{phase:'checking',entries:sample.entries,count:15,demo:true,checkedCount:count},settings:[]});
   assert.ok(checking.includes('class="import-verification" data-active="true"'));
 }
 });

test('実取り込みは全件数が不明な間、完了した仕分け件数を示して割合を表示しない',()=>{
 const markup=processing({progress:{phase:'sorting',entries:sample.entries.slice(0,2),count:null,demo:false},settings:[]});
 assert.ok(markup.includes('費目ごとに仕分け中'));
 assert.ok(markup.includes('仕分け済み <b>2</b>件'));
 assert.match(markup,/data-state="current" data-indeterminate="true"[\s\S]*?transform:scaleX\(0\)/);
 assert.ok(!markup.includes(' / '));
});

test('工程ゲージ直下に現在の作業と経過時間を表示し、読取中も受信した行を見せる',()=>{
 const entries=sample.entries.slice(0,3).map((entry,i)=>({...entry,import_meta:{id:String(i),status:i===0?'classified':'pending'}}));
 const activity={phase:'reading',text:'読み取り 3件・仕分け 1件完了',count:null,rechecking:false};
 const markup=processing({progress:{phase:'reading',entries,count:null,demo:false,activity},settings:[]});
 assert.ok(markup.indexOf('import-live-status')>markup.indexOf('</ul>'));
 assert.ok(!markup.includes('<ol'));assert.ok(!markup.includes('aria-current="step"'));
 assert.ok(markup.includes(activity.text));assert.ok(markup.includes('経過時間 0秒'));assert.ok(markup.includes('0:00'));
 assert.ok(markup.includes('読み取りと仕分け中'));assert.equal((markup.match(/data-import-entry=""/g)||[]).length,3);
 assert.equal((markup.match(/data-state="current"/g)||[]).length,2);assert.ok(!markup.includes('data-state="done"'));
 const sorting=processing({progress:{phase:'sorting',entries,count:3,demo:false,activity:{...activity,phase:'sorting',count:3}},settings:[]});
 assert.ok(sorting.includes('transform:scaleX(0.3333333333333333)'));assert.ok(sorting.includes('仕分け済み <b>1</b> / 3件'));
 const recheck=processing({progress:{phase:'reading',entries:[],count:null,demo:false,activity:{...activity,rechecking:true,text:'原本との差額 ¥100を再確認しています…'}},settings:[]});
 assert.ok(recheck.includes('明細を再確認中'));assert.ok(recheck.includes('原本との差額 ¥100'));
});

test('取り込みで引落月を選択でき、モデル選択は表示しない',()=>{
 const setupProps={cards:props.cards,cardId:'one',month:'2026-11',onMonth:()=>{},files:[],mode:'live',demoEnabled:true,liveEnabled:true,onCard:()=>{},onMode:()=>{},onFiles:()=>{},onRemove:()=>{},onManual:()=>{}};
 const markup=setup(setupProps);
 assert.match(markup,/<input type="month" aria-label="引落年月を選択" value="2026-11"/);
 assert.match(markup,/<label class="import-card-select">[\s\S]*<select aria-label="取り込むカード"/);
 for(const mode of ['live','demo']){
   const html=setup({...setupProps,mode});
   assert.ok(!html.includes('使用するAI'));
   assert.ok(!html.includes('GPT-6 Sol'));
 }
});

test('ファイル選択は一箇所にまとめ、追加後は種類・名前・削除操作を表示する',()=>{
 const props={cards:[{id:'one',name:'カード',active:true}],cardId:'one',month:'2026-09',files:[],mode:'live',demoEnabled:false,liveEnabled:true,onMonth(){},onCard(){},onMode(){},onFiles(){},onRemove(){},onManual(){}};
 const empty=setup(props);
 assert.equal((empty.match(/type="file"/g)||[]).length,1);
 assert.match(empty,/multiple="" accept="[^"]*\.pdf[^"]*\.csv/);
 assert.ok(empty.includes('明細ファイルを選ぶ'));
 assert.ok(!empty.includes('画像の選択'));
 const files=[{kind:'image',name:'画像.png',size:1200,data:'data:image/png;base64,iVBORw0KGgo='},{kind:'pdf',name:'明細.pdf',size:2048,data:'pdf'},{kind:'csv',name:'明細.csv',size:3000,data:'店,100'}];
 const selected=setup({...props,files});
 assert.equal((selected.match(/type="file"/g)||[]).length,1);
 assert.ok(selected.includes('3ファイル'));
 assert.ok(selected.includes('明細ファイルを追加'));
 for(const file of files)assert.ok(selected.includes(`aria-label="${file.name}を外す"`));
 assert.ok(selected.includes('lucide-file-text'));assert.ok(selected.includes('lucide-table2'));
 assert.ok(selected.includes('PDF'));assert.ok(selected.includes('CSV'));assert.ok(selected.includes('2 KB'));
 const loading=setup({...props,files,loading:true,disabled:true});
 assert.match(loading,/<fieldset class="import-setup" disabled="" aria-busy="true">/);
 assert.ok(loading.includes('ファイルを準備中…'));
});

test('デモ表示から明細読み取りを選べ、AI未設定時には無効理由を表示する',()=>{
 const props={cards:[{id:'one',name:'生活費カード',active:true}],cardId:'one',month:'2026-09',files:[],mode:'live',demoEnabled:true,demoView:true,liveEnabled:true,onMonth:()=>{},onCard:()=>{},onMode:()=>{},onFiles:()=>{},onRemove:()=>{},onManual:()=>{}};
 const ready=setup(props);
 assert.match(ready,/<button aria-pressed="true">明細を読み取る<\/button>/);
 assert.ok(ready.includes('実際のAIで明細を読み取ります'));
 assert.ok(ready.includes('結果は保存されません'));
 assert.ok(!ready.includes('使用するAI'));
 const missing=setup({...props,liveEnabled:false});
 assert.match(missing,/<button aria-pressed="true">明細を読み取る<\/button>/);
 assert.ok(missing.includes('AIの接続設定を確認できません'));
 assert.ok(!missing.includes('実際のAIで明細を読み取ります'));
});

test('要確認を分類済みより上に分け、その他は分類済みとして確認できる',()=>{
 const entries=[{title:'分類済みの利用',spent_on:'2026-09-01',category:'その他',amount:100},{title:'未解決の利用',spent_on:'2026-09-02',category:'要確認',amount:200}];
 const markup=review({...props,checked:true,draft:{...draft,entries,confirmed_total:300}});
 assert.ok(markup.indexOf('aria-label="要確認"')<markup.indexOf('aria-label="分類済み"'));
 assert.ok(markup.indexOf('未解決の利用')<markup.indexOf('分類済みの利用'));
 assert.match(markup,/type="checkbox" disabled=""/);
 assert.ok(markup.includes('確認対象の金額：¥200'));
 const resolved=review({...props,draft:{...draft,entries:entries.map(entry=>({...entry,category:'その他'})),confirmed_total:300}});
 assert.ok(!resolved.includes('aria-label="要確認"'));
 assert.doesNotMatch(resolved,/type="checkbox" disabled=""/);
});

test('名称を変えた要確認も未分類としてまとめる',()=>{
 const markup=review({...props,settings:[{category:'確認待ち',original_category:'要確認',icon:'tag',color:'#171717'}],draft:{...draft,entries:[{title:'不明',spent_on:'',category:'確認待ち',amount:100}],confirmed_total:100}});
 assert.ok(markup.includes('aria-label="要確認"'));
 assert.match(markup,/type="checkbox" disabled=""/);
});


test('原本の合計がないときは行の修正に合計が追従し、既知の合計は書き換えない',()=>{
 const entries=[{title:'スーパー',spent_on:'2026-09-01',category:'食費',amount:200}];
 assert.equal(withDraftEntries({...draft,source_total:null,confirmed_total:100},entries).confirmed_total,200);
 assert.equal(withDraftEntries({...draft,source_total:{amount:100,file:1,page:1,label:'合計'},confirmed_total:100},entries).confirmed_total,100);
 assert.equal(withDraftEntries({...draft,source_total:null,total_manual:true,confirmed_total:100},entries).confirmed_total,100);
 const markup=review({...props,draft:{...draft,entries,confirmed_total:200,source_total:null}});
 assert.ok(markup.includes('原本に照合できる合計額はありません'));
 assert.ok(!markup.includes('reconcile-error'));
});

test('未解決の金額には原本との金額差・具体的な確認理由を表示し、分類待ちを完了数にしない',()=>{
 const entry={title:'Amazon',spent_on:'2026-09-01',category:'要確認',amount:200,import_meta:{id:'1:1:1',source:{file:1,page:1,row:1,excerpt:'Amazon 200'},context:'',amount_uncertain:false,status:'review',reason:'購入内容を確認してください。',candidates:[{category:'食費',score:.6}],history:['日用品費']}};
 const markup=review({...props,draft:{...draft,entries:[entry],confirmed_total:300,source_total:{amount:300,file:1,page:1,label:'合計'}}});
 assert.ok(markup.includes('記載額との差：¥100'));assert.ok(markup.includes('購入内容を確認してください。'));
 assert.ok(markup.includes('以前の修正（今回だけ適用）'));assert.ok(markup.includes('正答率を示すものではありません'));
 assert.ok(markup.includes('元の明細：'));assert.ok(!markup.includes('日以降'));
 const progress=processing({settings:[],progress:{phase:'sorting',count:null,demo:false,entries:[{...entry,import_meta:{...entry.import_meta,status:'classifying'}}]}});
 assert.ok(progress.includes('仕分け中…'));assert.ok(progress.includes('仕分け済み <b>0</b>件'));
});
