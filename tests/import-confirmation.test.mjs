import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

// Keep React and the actual confirmation component; capture the shared panel's
// transition callbacks so the charging boundary can be exercised without a DOM.
const {outputFiles}=await build({stdin:{contents:`
  import {createElement} from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {ImportConfirmationPanel} from './src/import-confirmation-panel';
  import {getPanel} from './src/space-panel';
  import {FloatingDock} from './src/floating-dock';
  export function render(props){
    const html=renderToStaticMarkup(createElement(ImportConfirmationPanel,props));
    const panel=getPanel();
    const dock=renderToStaticMarkup(createElement(FloatingDock,{tab:'home',onSelect(){},panelActive:true,month:props.month,onMonthChange(){},onPrevMonth(){},onNextMonth(){},context:panel.context}));
    return {html,panel,dock};
  }
`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',packages:'external',plugins:[{name:'capture-panel',setup(build){build.onLoad({filter:/\/space-panel\.tsx$/},()=>({contents:'let panel; export const getPanel=()=>panel; export function SpacePanel(props){panel=props;return props.children;}',loader:'tsx'}));}}]});
const bundle=outputFiles[0].text.replace(/from "(react(?:-dom(?:\/server)?|\/jsx-runtime)?|lucide-react|thinking-orbs|motion\/react)"/g,(_match,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {render}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
const props={spaceName:'ふたり',card:{id:'one',name:'生活費カード',color:'#8995a5',active:true},month:'2026-09',files:[{name:'明細.pdf',kind:'pdf',data:'pdf',size:20},{name:'明細.csv',kind:'csv',data:'店,100',size:7}],mode:'live',disabled:false,onClose(){},onStart(){},onDockChange(){}};

test('確認前には開始せず、明示的に開始して子パネルが閉じた後だけ一度取り込む',()=>{
  const events=[];
  const {panel}=render({...props,onClose:()=>events.push('close'),onStart:()=>events.push('start')});
  assert.deepEqual(events,[]);
  panel.onExited();assert.deepEqual(events,[]);
  panel.context.onAction();panel.context.onAction();panel.context.onBack();
  assert.deepEqual(events,[]);
  panel.onExited();panel.onExited();
  assert.deepEqual(events,['close','start']);
});

test('戻る・キャンセルでAIを呼び出さず、無効時にも開始しない',()=>{
  for(const disabled of [false,true]){
    const events=[];
    const {panel}=render({...props,disabled,onClose:()=>events.push('close'),onStart:()=>assert.fail('must not start')});
    if(disabled)panel.context.onAction();
    panel.context.onBack();panel.context.onAction();panel.onExited();panel.onExited();
    assert.deepEqual(events,['close']);
  }
});

test('有料の案内と取り込み先を表示し、虹色の開始ボタンを確認パネルのナビに置く',()=>{
  const {html,panel,dock}=render(props);
  assert.equal(panel.title,'取り込みの確認');
  for(const text of ['AI利用枠を使用します','取り込みにはAI利用料がかかります','ふたり','生活費カード','2026年9月','2ファイル','明細.pdf','明細.csv'])assert.ok(html.includes(text),text);
  assert.ok(html.includes('var(--palette-8995a5, #8995a5)'));
  assert.ok(!html.includes('無料'));
  assert.match(dock,/<nav class="context-dock" aria-label="取り込みの確認">/);
  assert.match(dock,/<button class="context-action studio-action" aria-label="取り込みを始める"/);
  assert.ok(dock.includes('data-studio-wand'));
});

test('無料なのはサンプルのデモだけで、デモ表示中の実AI取り込みには料金を明示する',()=>{
  const sample=render({...props,mode:'demo',demoView:true});
  assert.ok(sample.html.includes('AI利用枠を消費せず、利用料もかかりません'));
  assert.ok(sample.html.includes('サンプル明細'));
  assert.ok(!sample.html.includes('明細.pdf'));
  assert.ok(sample.dock.includes('aria-label="デモで仕分ける"'));
  const live=render({...props,demoView:true});
  assert.ok(live.html.includes('取り込みにはAI利用料がかかります'));
  assert.ok(live.html.includes('読み取り結果は保存されません'));
  assert.ok(!live.html.includes('デモは無料'));
});
