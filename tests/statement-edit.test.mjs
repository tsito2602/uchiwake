import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { prepareStatementEdits, applyStatementEdit } from '../src/statement-edit.ts';

const statements=[{id:'s',title:'生活費',confirmed_total:3000,revision:4}];
const entries=[{id:'a',statement_id:'s',title:'スーパー',category:'食費',amount:2000,spent_on:'2026-09-01'},
  {id:'b',statement_id:'s',title:'カフェ',category:'外食費',amount:1000,spent_on:'2026-09-02'}];
const empty={categories:{},amounts:{},deletedIds:[]};

test('削除は下書きだけに反映し、取り消しで入力内容が戻り、キャンセルすると変更がなくなる',()=>{
  const draft={categories:{a:'日用品費'},amounts:{a:'2500',b:''},deletedIds:['b']};
  const prepared=prepareStatementEdits(statements,entries,draft);
  assert.equal(prepared.valid,true);
  assert.deepEqual(prepared.changes[0].deleted_ids,['b']);
  assert.equal(prepared.changes[0].entries.length,1);
  assert.equal(prepared.changes[0].confirmed_total,2500);
  assert.equal(prepared.changes[0].revision,4);
  assert.equal(entries[0].amount,2000);
  const restored=prepareStatementEdits(statements,entries,{...draft,deletedIds:[]});
  assert.equal(restored.valid,false); // The restored blank amount still needs correction.
  assert.equal(restored.editedEntries[0].category,'日用品費');
  assert.equal(prepareStatementEdits(statements,entries,empty).changes.length,0);
});

test('全項目削除は保存でき、成功した明細のみを反映して次の明細の再試行を妨げない',()=>{
  const other={id:'other',title:'別明細',confirmed_total:900,revision:0};
  const otherEntry={...entries[0],id:'c',statement_id:'other',amount:900};
  const state={statements:[...statements,other],entries:[...entries,otherEntry]};
  const draft={...empty,amounts:{c:'1200'},deletedIds:['a','b']};
  const prepared=prepareStatementEdits(state.statements,state.entries,draft);
  assert.equal(prepared.valid,true);
  assert.equal(prepared.changes.length,2);
  const saved=applyStatementEdit(state,prepared.changes[0]);
  assert.deepEqual(saved.statements,[other]);
  assert.deepEqual(saved.entries,[otherEntry]);
  const pending=prepareStatementEdits(saved.statements,saved.entries,draft);
  assert.equal(pending.changes.length,1);
  assert.equal(pending.changes[0].id,'other');
  const done=applyStatementEdit(saved,pending.changes[0]);
  assert.equal(done.statements[0].confirmed_total,1200);
  assert.equal(done.statements[0].revision,1);
  assert.equal(prepareStatementEdits(done.statements,done.entries,draft).changes.length,0);
});

test('返金を残した削除でも金額と合計の妥当性を検証する',()=>{
  for(const amount of ['0','-1','1.5','100000001','NaN']){
    assert.equal(prepareStatementEdits(statements,entries,{...empty,amounts:{a:amount},deletedIds:['b']}).valid,false,amount);
  }
  assert.equal(prepareStatementEdits(statements,entries,{...empty,amounts:{b:'-500'}}).valid,true);
});

const {outputFiles}=await build({stdin:{contents:`
 import {createElement} from 'react';
 import {renderToStaticMarkup} from 'react-dom/server';
 import {CardStatementPanel} from './src/card-statement-panel';
 export const render=props=>renderToStaticMarkup(createElement(CardStatementPanel,props));
`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'}});
const bundle=outputFiles[0].text.replace(/from "(react(?:-dom(?:\/server)?|\/jsx-runtime)?|lucide-react|motion\/react)"/g,(_match,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {render}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
const props={title:'生活費',sort:{key:'date',dateAscending:false,amountAscending:false},month:'2026-09',statements,entries,demo:false,view:'edit',amountDraft:{},deletedEntryIds:[],onClose(){},onExited(){},onAction(){},onChangeCategory(){},onChangeAmount(){},onToggleDeleteEntry(){},onDeleteStatement(){},actionLabel:'変更を保存する'};

test('編集は項目順のカードと削除操作を表示し、カテゴリ集計は閲覧画面だけに表示する',()=>{
  const html=render(props);
  assert.ok(!html.includes('category-chart'));
  assert.equal((html.match(/class="statement-edit-item"/g)||[]).length,2);
  for(const entry of entries){
    assert.ok(html.includes(`aria-label="${entry.title}を削除"`));
    assert.ok(html.includes(`aria-label="${entry.title}の金額（円）"`));
    assert.ok(html.includes(`aria-label="${entry.title}の費目"`));
  }
  assert.ok(html.indexOf('スーパー')<html.indexOf('カフェ'));
  assert.ok(render({...props,view:'details'}).includes('category-chart'));
});

test('削除予定の行は戻す操作に切り替わり、合計と件数から除外される',()=>{
  const html=render({...props,deletedEntryIds:['a']});
  assert.ok(html.includes('スーパーの削除を取り消す'));
  assert.ok(!html.includes('スーパーの金額（円）'));
  assert.ok(html.includes('¥1,000'));
  assert.ok(html.includes('1件'));
  assert.ok(render({...props,deletedEntryIds:['a','b']}).includes('この明細も削除されます'));
  for(const extra of [{busy:true},{demo:true}])assert.match(render({...props,...extra}),/<button[^>]*disabled=""[^>]*aria-label="スーパーを削除"/);
});
