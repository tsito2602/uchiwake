import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import app from '../dist/worker.mjs';

const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X9sAAAAASUVORK5CYII=';
const auth='Basic '+btoa('guest:test-password');
const env={APP_PASSWORD:'test-password',APP_ENV:'staging',OPENAI_MODEL:'gpt-6-luna'};
const request=(path,body)=>new Request(`https://example.test${path}`,{method:'POST',headers:{Authorization:auth,Origin:'https://example.test','Content-Type':'application/json'},body:JSON.stringify(body)});

test('カード明細デモはキーがあっても画像をAIへ送らず複数行を返す',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('External fetch must not be called');};
  try{
    const response=await app.fetch(request('/api/statement/analyze',{mode:'demo',images:[png]}),{...env,OPENAI_API_KEY:'dummy-key'});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.demo,true);
    assert.equal(result.entries.length,3);
    assert.equal(result.entries.reduce((a,b)=>a+b.amount,0),result.confirmed_total);
    assert.equal(calls,0);
  }finally{globalThis.fetch=original;}
});

test('本番ではデモを拒否し、キーなしの実AIも拒否する',async()=>{
  const body={mode:'demo',images:[png]};
  const production=await app.fetch(request('/api/statement/analyze',body),{...env,APP_ENV:'production'});
  assert.equal(production.status,404);
  const live=await app.fetch(request('/api/statement/analyze',{...body,mode:'live'}),env);
  assert.equal(live.status,503);
});

test('引落額と明細行の不一致を拒否し、一致した行だけ一括保存する',async()=>{
  const executed=[];
  const DB={prepare(sql){return{async all(){return {results:[]};},bind(...values){return{sql,values,async first(){return sql.includes('shared_cards')?{id:values[0]}:null;}}}}},async batch(statements){executed.push(...statements);return statements.map(()=>({success:true}));}};
  const body={due_month:'2026-09',card_id:'card-one',title:'共有カード',confirmed_total:6840,entries:[
    {spent_on:'2026-08-31',title:'スーパー',category:'食費',amount:2980},
    {spent_on:'',title:'交通',category:'交通費',amount:3860}
  ]};
  let response=await app.fetch(request('/api/statements',{...body,confirmed_total:6800}),{...env,DB});
  assert.equal(response.status,400);
  assert.equal(executed.length,0);
  response=await app.fetch(request('/api/statements',body),{...env,DB});
  assert.equal(response.status,201);
  assert.equal(executed.length,3);
  assert.match(executed[0].sql,/INSERT INTO card_statements/);
  assert.equal(executed[0].values[1],'card-one');
  assert.equal(executed[0].values[4],6840);
  assert.equal(executed[1].values[1],executed[0].values[0]);
});

test('登録していないカード、同じ月に登録済みのカードは保存できない',async()=>{
  let existing=false;
  const DB={prepare(sql){return{bind(...values){return{async first(){return sql.includes('shared_cards')?(values[0]==='card-one'?{id:'card-one'}:null):existing?{id:'saved'}:null;}}}}},async batch(){throw new Error('保存されてはならない');}};
  const body={due_month:'2026-09',card_id:'unknown',title:'カード',confirmed_total:100,entries:[{spent_on:'',title:'利用',category:'食費',amount:100}]};
  assert.equal((await app.fetch(request('/api/statements',body),{...env,DB})).status,400);
  existing=true;
  assert.equal((await app.fetch(request('/api/statements',{...body,card_id:'card-one'}),{...env,DB})).status,400);
});

test('設定済みのカードと基本家賃を画面に返し、カードの使用状態は真偽値にする',async()=>{
  const DB={prepare(sql){const all=async()=>({results:sql.includes('FROM shared_cards')?[{id:'one',name:'生活費',active:1}]:sql.includes('FROM rent_rules')?[{effective_month:'2026-09',amount:100000}]:[]});return{all,bind(){return{all};}}}};
  const response=await app.fetch(new Request('https://example.test/api/state?month=2026-10',{headers:{Authorization:auth}}),{...env,DB});
  assert.equal(response.status,200);
  const state=await response.json();
  assert.deepEqual(state.cards,[{id:'one',name:'生活費',active:true}]);
  assert.deepEqual(state.rent_rules,[{effective_month:'2026-09',amount:100000}]);
});

test('精算の棒グラフは固定家賃と月ごとの上書きを二重計上しない',async()=>{
  const DB={prepare(sql){return{async all(){return {results:[]};},bind(){return{async all(){
    const results=sql.includes('kind NOT IN')?[]:sql.includes('FROM card_statements')?[{month:'2026-09',amount:50001}]:sql.includes('FROM rent_rules')?[{effective_month:'2026-08',amount:100000}]:[{month:'2026-09',amount:110000}];
    return {results};
  }};}};}};
  const response=await app.fetch(new Request('https://example.test/api/settlement-history?month=2026-09',{headers:{Authorization:auth}}),{...env,DB});
  assert.equal(response.status,200);
  const {months}=await response.json();
  assert.equal(months.length,60);
  assert.deepEqual(months.slice(-2),[{month:'2026-08',amount:50000,total:100000},{month:'2026-09',amount:80001,total:160001}]);
});


test('50件を超える明細も合計を検証して全件保存できる',async()=>{
  let saved=[];
  const DB={prepare(sql){return{async all(){return {results:[]};},bind(...values){return{sql,values,async first(){return sql.includes('shared_cards')?{id:values[0]}:null;}}}}},async batch(rows){saved=rows;return rows.map(()=>({success:true}));}};
  const entries=Array.from({length:120},(_,i)=>({spent_on:'2026-09-01',title:'利用'+i,category:'食費',amount:100}));
  const body={due_month:'2026-09',card_id:'card-one',title:'共有カード',confirmed_total:12000,entries};
  const response=await app.fetch(request('/api/statements',body),{...env,DB});
  assert.equal(response.status,201);
  assert.equal(saved.length,121);
  assert.equal(saved[0].values[4],12000);
  assert.deepEqual(saved.slice(1).map(row=>row.values[3]),entries.map(row=>row.title));
});
