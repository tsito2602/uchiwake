import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { percentWeight, equalPercent, splitStatus } from '../src/split-input.ts';

test('割合の入力は小数2桁まで保持し、空欄・範囲外・不正形式を有効な負担に変換しない',()=>{
  for(const [text,weight] of [['50',5000],['33.33',3333],['0.01',1],['.5',50],['3.',300],['100',10000]])assert.equal(percentWeight(text),weight,text);
  for(const text of ['', '.', '0', '-1', '100.01', '33.333', '1e2', 'NaN', 'abc'])assert.equal(percentWeight(text),0,text);
});

test('割合の均等配分は選択者を保ち、3人以上でも合計100％になる',()=>{
  for(const count of [0,1,2,3,6,7,30]){
    const shares=Array.from({length:count},(_,index)=>({user_id:`member-${index}`,weight:1}));
    const next=equalPercent(shares);
    assert.equal(next.mode,'percent');
    assert.deepEqual(next.shares.map(share=>share.user_id),shares.map(share=>share.user_id));
    assert.equal(next.shares.reduce((sum,share)=>sum+share.weight,0),count?10000:0);
    assert.ok(next.shares.every(share=>Number.isInteger(share.weight)&&share.weight>0));
    assert.ok(shares.every(share=>share.weight===1));
  }
});

test('未選択・未入力・過不足を区別し、100％でも0％の対象者がいれば未入力を示す',()=>{
  const split=weights=>({mode:'percent',shares:weights.map((weight,index)=>({user_id:String(index),weight}))});
  for(const [weights,label,valid] of [[[],'対象者を選択',false],[[0,10000],'割合を入力',false],[[4000,5000],'残り 10%',false],[[6000,5000],'10% 超過',false],[[3333,3333,3334],'合計 100%',true]])assert.deepEqual(splitStatus(split(weights)),{label,valid});
});

const {outputFiles}=await build({stdin:{contents:`
 import {createElement} from 'react';
 import {renderToStaticMarkup} from 'react-dom/server';
 import {SplitEditor,SettlementConfigEditor} from './src/split-editor';
 export {settlementItems} from './src/spaces';
 export {displayColor} from './src/display-color';
 export const renderSplit=props=>renderToStaticMarkup(createElement(SplitEditor,props));
 export const renderConfig=props=>renderToStaticMarkup(createElement(SettlementConfigEditor,props));
`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',packages:'external'});
const bundle=outputFiles[0].text.replace(/from "(react(?:-dom(?:\/server)?|\/jsx-runtime)?|lucide-react)"/g,(_match,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {renderSplit,renderConfig,settlementItems,displayColor}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
const members=[{user_id:'a',name:'あおい',active:true},{user_id:'b',name:'はる',active:true},{user_id:'c',name:'以前のメンバー',active:false}];
const common={mode:'percent',shares:[{user_id:'a',weight:6000},{user_id:'b',weight:4000}]};
const base={config:{uniform:false,common,items:{}},members,items:[{key:'card:one',label:'生活費カード',amount:3000},{key:'rent',label:'家賃',amount:100000}],onChange(){}};

test('対象者の選択と割合入力を並べ、均等モードでは入力欄を表示しない',()=>{
  const percent=renderSplit({label:'全体の負担',value:common,members,onChange(){}});
  assert.equal((percent.match(/type="checkbox"/g)||[]).length,3);
  assert.equal((percent.match(/inputMode="decimal"/g)||[]).length,2);
  assert.ok(percent.includes('全体の負担・あおいの負担割合'));
  assert.ok(percent.includes('合計 100%'));
  assert.ok(percent.includes('現在は参加していません'));
  const equal=renderSplit({label:'全体の負担',value:{...common,mode:'equal'},members,onChange(){}});
  assert.ok(!equal.includes('inputMode="decimal"'));
  assert.ok(equal.includes('50%'));
});

test('個別設定には費用だけを表示し、従来の割合と未入力の確認を保つ',()=>{
  const render=config=>renderConfig({...base,config});
  const html=render({...base.config,items:{rent:{mode:'percent',shares:[{user_id:'a',weight:7000},{user_id:'b',weight:3000}]}}});
  assert.equal((html.match(/aria-expanded="false"/g)||[]).length,2);
  assert.equal((html.match(/inert="" aria-hidden="true"/g)||[]).length,2);
  assert.ok(html.includes('あおい 70% / はる 30%'));
  assert.ok(html.includes('あおい 60% / はる 40%'));
  assert.ok(html.includes('個別に設定'));
  assert.ok(!html.includes('費用ごとに設定'));
  assert.ok(!html.includes('共通'));
  assert.ok(!html.includes('全体の負担'));
  assert.ok(!html.includes('>個別</span>'));
  const uniform=render({...base.config,uniform:true});
  assert.ok(uniform.includes('全体の負担'));
  assert.ok(!uniform.includes('生活費カード'));
  assert.ok(render({...base.config,uniform:true,items:{rent:{mode:'percent',shares:[]}}}).includes('費用ごとの未入力を確認'));
  const invalid=render({...base.config,items:{'bill:paused':{mode:'percent',shares:[]}}});
  assert.ok(invalid.includes('この月の利用がない費用'));
  assert.ok(invalid.includes('data-invalid="true">対象者を選択'));
  assert.ok(renderConfig({...base,items:[]}).includes('費用を登録すると表示されます'));
});

test('費用ごとのカードアイコンは明細集計後も各カードの表示色を使う',()=>{
  const cards=[{id:'one',name:'生活費カード',active:true,color:'#a32931'},{id:'two',name:'予備カード',active:false,color:'#8995a5'}];
  const items=settlementItems({month:'2026-09',cards,statements:[{id:'s',card_id:'one',confirmed_total:3000}],entries:[],bills:[],rent_rules:[],category_settings:[],space_preferences:{rent_enabled:false}},true);
  assert.equal(items[0].amount,3000);
  const html=renderConfig({...base,items});
  const icons=html.match(/<svg[^>]*class="lucide lucide-credit-card[^>]*>/g)||[];
  assert.equal(icons.length,2);
  cards.forEach((card,index)=>assert.ok(icons[index].includes(`stroke="${displayColor(card.color)}"`)));
});
