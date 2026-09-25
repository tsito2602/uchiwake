import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import app from '../dist/worker.mjs';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X9sAAAAASUVORK5CYII=';
const auth = 'Basic ' + btoa('guest:test-password');
const base = { APP_PASSWORD: 'test-password', APP_ENV: 'staging', OPENAI_MODEL: 'gpt-6-luna' };
const request = (path, body) => new Request(`https://example.test${path}`, { method: 'POST', headers: { Authorization:auth, Origin:'https://example.test', 'Content-Type':'application/json' }, body: JSON.stringify(body) });

test('レシートのデモはキーがあってもOpenAIを呼ばず、サンプルと明示する', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('External fetch must not be called'); };
  try {
    const response = await app.fetch(request('/api/receipt/analyze',{mode:'demo',scenario:'restaurant',image:png}),{...base,OPENAI_API_KEY:'dummy-key'});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.amount,1240);
    assert.equal(result.category,'外食費');
    assert.equal(result.demo,true);
    assert.match(result.note,/画像の内容は読み取っていません/);
    assert.equal(calls,0);
  } finally { globalThis.fetch = original; }
});

test('実際のAIはキーがないと利用できず、ステージング外にデモを出さない', async () => {
  const live = await app.fetch(request('/api/receipt/analyze',{mode:'live',scenario:'supermarket',image:png}),base);
  assert.equal(live.status,503);
  const production = await app.fetch(request('/api/receipt/analyze',{mode:'demo',scenario:'supermarket',image:png}),{...base,APP_ENV:'production'});
  assert.equal(production.status,404);
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
