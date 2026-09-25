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
  const DB={prepare(sql){return{bind(...values){return{sql,values};}}},async batch(statements){executed.push(...statements);return statements.map(()=>({success:true}));}};
  const body={due_month:'2026-09',title:'共有カード',confirmed_total:6840,entries:[
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
  assert.equal(executed[0].values[3],6840);
  assert.equal(executed[1].values[1],executed[0].values[0]);
});
