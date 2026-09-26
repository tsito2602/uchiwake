import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import app from '../dist/worker.mjs';
import { demoHistory, demoState } from '../worker/demo-data.ts';

const auth = 'Basic ' + btoa('guest:test-password');
const base = { APP_PASSWORD: 'test-password', APP_ENV: 'staging', OPENAI_MODEL: 'gpt-6-luna' };
const request = (path, body) => new Request(`https://example.test${path}`, { method: 'POST', headers: { Authorization:auth, Origin:'https://example.test', 'Content-Type':'application/json' }, body: JSON.stringify(body) });
const read = path => new Request(`https://example.test${path}`, { headers: { Authorization:auth } });

test('デモ表示は半年分のカード2枚と家賃を使い、各月の明細と棒グラフが一致する', () => {
  const anchor='2026-09';
  const history=demoHistory(anchor,anchor).filter(item=>item.amount>0);
  assert.equal(history.length,6);
  for(const item of history) {
    const state=demoState(item.month,anchor);
    assert.equal(state.cards.length,2);
    assert.equal(state.statements.length,2);
    for(const statement of state.statements)assert.equal(statement.confirmed_total,state.entries.filter(row=>row.statement_id===statement.id).reduce((sum,row)=>sum+row.amount,0));
    const rent=state.bills[0]?.amount??state.rent_rules[0].amount;
    assert.equal(item.total,rent+state.statements.reduce((sum,row)=>sum+row.confirmed_total,0));
    assert.equal(item.amount,Math.ceil((rent+state.statements.reduce((sum,row)=>sum+row.confirmed_total,0))/2));
  }
});

test('デモデータはステージングだけで読み取り可能でDBを書き換えない', async () => {
  const DB={prepare:()=>{throw Error('Demo must not use DB');}};
  for(const path of ['/api/state?month=2026-09&demo=1','/api/settlement-history?month=2026-09&demo=1']) {
    const staging=await app.fetch(read(path),{...base,DB});
    assert.equal(staging.status,200);
    const production=await app.fetch(read(path),{...base,DB,APP_ENV:'production'});
    assert.equal(production.status,404);
  }
  const legacy=await app.fetch(request('/api/expenses',{spent_on:'2026-09-01',title:'旧レシート',amount:100}),base);
  assert.equal(legacy.status,404);
});

test('月次デモコメントは実際の費目集計を使い、外部APIを呼ばない', async () => {
  const original=globalThis.fetch;
  let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('External fetch must not be called');};
  try {
    const DB={prepare:()=>({bind:()=>({all:async()=>({results:[{category:'食費',amount:2000},{category:'交通費',amount:400}]})})})};
    const response=await app.fetch(request('/api/report/comment',{month:'2026-09',mode:'demo'}),{...base,DB,OPENAI_API_KEY:'dummy-key'});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.demo,true);
    assert.match(result.comment,/2,400円/);
    assert.match(result.comment,/食費/);
    assert.equal(calls,0);
  } finally { globalThis.fetch=original; }
});
