import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import app from '../dist/worker.mjs';
import { spaceFixture } from './spaces-fixture.mjs';
import { sessionCookie } from './auth-fixture.mjs';

const {outputFiles}=await build({stdin:{contents:`export * from './src/statement-import-stream';export * from './src/statement-import-flow';export * from './worker/luna-jev-import';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {streamStatement,runStatementImport,runLunaJev}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const file={name:'fixture.csv',kind:'csv',data:'date,merchant,amount\n2026-09-01,test,100',size:50};
const source=(row=1)=>({spent_on:'2026-09-01',title:`架空の店${row}`,amount:100,source_file:1,page:1,row,excerpt:'食品 100',context:'食品',amount_uncertain:false});
const extraction=(entries,total=null)=>({confirmed_total:total??0,entries,source_total:total===null?null:{amount:total,file:1,page:1,label:'請求合計'}});
const frame=event=>new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
const delta=text=>frame({type:'response.output_text.delta',delta:text});
const done=()=>frame({type:'response.completed',response:{status:'completed'}});
const stream=result=>new ReadableStream({start(c){c.enqueue(delta(JSON.stringify(result)));c.enqueue(done());c.close();}});
function decision(input,confidence=.99,noul=.99){
 const choices=Object.keys(input.questions.category.criteria);
 return {result:{answers:{category:{type:'choice',choice:'食費',confidence,probabilities:Object.fromEntries(choices.map(name=>[name,name==='食費'?1:0]))},sufficient:{type:'noul',noul}}}};
}
async function setup(t,run){
 const f=spaceFixture();
 f.db.exec("INSERT INTO spaces(id,name,kind,owner_id) VALUES('a','A','shared','owner'),('b','B','shared','b'); INSERT INTO space_members(space_id,user_id,name) VALUES('a','owner','owner'),('b','b','b');");
 Object.assign(f.env,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'test'});
 const cookie=await sessionCookie({sub:'owner',email:'owner@example.test',name:'owner'},f.env);
 const calls=[];
 t.mock.method(globalThis,'fetch',async(path,init)=>{
  const invocation={path,calls:0,signal:init.signal};calls.push(invocation);
  const headers=new Headers(init.headers);headers.set('Cookie',cookie);headers.set('Origin','https://example.test');
  invocation.done=app.fetch(new Request(`https://example.test${path}`,{...init,headers}),{...f.env,AI:{run:async(model,input,options)=>{
   if(++invocation.calls>50)throw new Error('Too many subrequests.');
   return run(model,input,options,invocation);
  }}});
  return invocation.done;
 });
 t.after(async()=>{await Promise.allSettled(calls.map(call=>call.done));f.db.close();});
 return {...f,calls};
}
const start=(signal=new AbortController().signal,onEntry=()=>{},onEvent=()=>{},files=[file])=>streamStatement(files,signal,onEntry,()=>{},'a',onEvent);

test('50回の予算を再現し、120明細をリクエスト分割すると閾値を変えず最後まで分類できる',async t=>{
 const rows=Array.from({length:120},(_,i)=>source(i+1));let jev=0,luna=0;
 const f=await setup(t,async(model,input)=>{
  if(model==='openai/gpt-6-luna'){luna++;return stream(extraction(rows,12000));}
  jev++;return decision(input,...(input.state.merchant.endsWith('1')?[.79,.71]:[.99,.99]));
 });
 let legacyCalls=0;
 await assert.rejects(runLunaJev({...f.env,AI:{run:async(model,input)=>{
  if(++legacyCalls>50)throw new Error('Too many subrequests.');
  return model==='openai/gpt-6-luna'?stream(extraction(rows)):decision(input);
 }}},'a',[file],['食費','要確認'],'要確認',new AbortController().signal,()=>{}),{code:'upstream'});
 assert.ok(legacyCalls>50);
 const seen=[],updates=[];
 const result=await start(undefined,row=>seen.push(row),event=>updates.push(event));
 assert.equal(result.entries.length,120);assert.equal(result.confirmed_total,12000);
 assert.equal(result.entries.filter(row=>row.import_meta.status==='review').length,12);
 assert.equal(result.entries.filter(row=>row.import_meta.status==='classified').length,108);
 assert.deepEqual(result.entries[0].import_meta.review_causes,['low_confidence','low_evidence']);
 assert.equal(seen.length,120);assert.equal(jev,120);assert.equal(luna,1);
 assert.equal(f.calls.length,121);assert.ok(f.calls.every(call=>call.calls===1));
 assert.equal(updates.filter(e=>e.type==='entry_update'&&e.entry.import_meta.status==='classifying').length,120);
 assert.equal(f.db.prepare('SELECT count(*) n FROM card_entries').get().n,0);
});

test('分割した4件のJevが待機中でもLuna受信を続け、読取完了前に仕分け結果を表示する',{timeout:4000},async t=>{
 let controller;const waiting=[];let active=0,maxActive=0,readingFinished=false;
 const f=await setup(t,async(model,input,options)=>{
  if(model==='openai/gpt-6-luna')return new ReadableStream({start(c){controller=c;c.enqueue(delta('{"entries":['+Array.from({length:8},(_,i)=>JSON.stringify(source(i+1))).join(',')));}});
  active++;maxActive=Math.max(maxActive,active);
  return new Promise(resolve=>waiting.push(()=>{active--;resolve(decision(input));}));
 });
 const received=[],events=[];let finishEarly;
 const early=new Promise(resolve=>finishEarly=resolve);
 const pending=start(undefined,row=>received.push(row),event=>{
  events.push(event);
  if(event.type==='entry_update'&&event.entry.import_meta.status==='classified'&&!readingFinished)finishEarly();
 });
 while(waiting.length<4)await new Promise(resolve=>setTimeout(resolve,1));
 assert.equal(received.length,8);assert.equal(waiting.length,4);
 waiting.splice(0,4).forEach(resolve=>resolve());await early;
 readingFinished=true;controller.enqueue(delta('],"confirmed_total":0,"source_total":null}'));controller.enqueue(done());controller.close();
 while(waiting.length<4)await new Promise(resolve=>setTimeout(resolve,1));
 waiting.splice(0,4).forEach(resolve=>resolve());
 const result=await pending;assert.equal(result.entries.length,8);assert.equal(maxActive,4);
 assert.ok(events.some(e=>e.type==='activity'&&e.activity.phase==='reading'));
 assert.ok(events.some(e=>e.type==='activity'&&e.activity.phase==='sorting'&&e.activity.count===8));
 assert.ok(f.calls.every(call=>call.calls===1));
});

test('画像の再読は別リクエストにし、元の合計と同じ行の判定を再利用する',async t=>{
 let luna=0,jev=0;
 const f=await setup(t,async(model,input)=>{
  if(model==='openai/gpt-6-luna'){luna++;return stream(extraction([source()],luna===1?200:null));}
  jev++;return decision(input,.79,.71);
 });
 const events=[];
 const result=await start(undefined,()=>{},e=>events.push(e),[{name:'sample.png',kind:'image',data:'data:image/png;base64,iVBORw0KGgo=',size:1}]);
 assert.equal(luna,2);assert.equal(jev,1);assert.equal(result.entries[0].import_meta.status,'review');
 assert.equal(result.source_total.amount,200);assert.equal(result.entries[0].amount,100);
 assert.equal(events.filter(e=>e.type==='replace').length,1);
 assert.deepEqual(f.calls.map(x=>x.path),['/api/statement/analyze','/api/statement/classify','/api/statement/analyze']);
});

test('分割後の途中障害も取り込み全体を中止し、診断には安全な集計だけを渡す',async t=>{
 let jev=0;const privateText='private-merchant-and-response';
 await setup(t,async(model,input)=>{
  if(model==='openai/gpt-6-luna')return stream(extraction(Array.from({length:90},(_,i)=>({...source(i+1),title:privateText}))));
  if(++jev===53)throw new Error(privateText);
  return decision(input,.79,.71);
 });
 const logs=[];t.mock.method(console,'error',value=>logs.push(value));
 let completed=false;
 await assert.rejects(runStatementImport({demo:false,signal:new AbortController().signal,onProgress:()=>{},analyze:(onEntry,onReasoning,onEvent)=>streamStatement([file],new AbortController().signal,onEntry,onReasoning,'a',onEvent)}).then(()=>{completed=true;}),error=>{
  assert.equal(error.code,'upstream');assert.equal(error.diagnostics.failure.model,'jev');
  assert.equal(error.diagnostics.failure.stage,'request');assert.equal(error.diagnostics.failure.source.row,53);
  assert.equal(error.diagnostics.run.received_entries,90);assert.ok(error.diagnostics.classification.evaluated>=49);
  assert.equal(error.diagnostics.classification.classified,0);
  assert.equal(error.diagnostics.classification.review,error.diagnostics.classification.evaluated);
  assert.ok(!JSON.stringify(error.diagnostics).includes(privateText));return true;
 });
 assert.equal(completed,false);assert.ok(jev<90);assert.ok(!logs.join('').includes(privateText));
});

test('中止すると読取と進行中の仕分けを止め、残りの明細を新規送信しない',{timeout:4000},async t=>{
 let controller;let calls=0;const aborted=[];
 await setup(t,async(model,input,options)=>{
  if(model==='openai/gpt-6-luna')return new ReadableStream({start(c){controller=c;c.enqueue(delta('{"entries":['+Array.from({length:12},(_,i)=>JSON.stringify(source(i+1))).join(',')));},cancel(){aborted.push('luna');}});
  calls++;return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{aborted.push('jev');reject(options.signal.reason);},{once:true}));
 });
 const abort=new AbortController(),events=[];const pending=start(abort.signal,()=>{},e=>events.push(e));
 while(calls<4)await new Promise(resolve=>setTimeout(resolve,1));
 const count=events.length;abort.abort();await assert.rejects(pending);
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(calls,4);assert.equal(events.length,count);assert.ok(aborted.includes('luna'));assert.equal(aborted.filter(x=>x==='jev').length,4);
});

test('仕分けAPIは認証と所属を検証し、クライアントの判定・ルール指定を信用しない',async t=>{
 let jev=0;
 const f=await setup(t,async(model,input)=>{jev++;return decision(input,.79,.71);});
 f.env.AI={run:async(model,input)=>{jev++;return decision(input,.79,.71);}};
 const entry={title:'架空の店',spent_on:'2026-09-01',amount:100,category:'食費',import_meta:{id:'1:1:1',source:{file:1,page:1,row:1,excerpt:'食品 100'},context:'食品',amount_uncertain:false,status:'classified',confidence:1,noul:1,remember_rule:true,rule_id:'spoof'}};
 const body={entry};
 const denied=await app.fetch(new Request('https://example.test/api/statement/classify',{method:'POST',headers:{Origin:'https://example.test','Content-Type':'application/json','X-Space-Id':'a'},body:JSON.stringify(body)}),f.env);
 assert.equal(denied.status,401);
 assert.equal((await f.call('owner','/statement/classify','POST',body,'b')).status,404);
 assert.equal((await f.call('owner','/statement/classify','POST',{entry:{}},'a')).status,400);
 assert.equal(jev,0);
 const response=await f.call('owner','/statement/classify','POST',body,'a');
 const events=(await response.text()).trim().split('\n').map(JSON.parse);
 const row=events.find(e=>e.type==='complete').result.entries[0];
 assert.equal(jev,1);assert.equal(row.category,'要確認');assert.equal(row.import_meta.rule_id,undefined);assert.equal(row.import_meta.remember_rule,undefined);
 assert.equal(f.db.prepare('SELECT count(*) n FROM classification_rules').get().n,0);
});

test('分割仕分けでも一時障害の再試行を表示し、1行の予算内で復旧する',{timeout:4000},async t=>{
 let jev=0;
 const f=await setup(t,async(model,input)=>{
  if(model==='openai/gpt-6-luna')return stream(extraction([source()]));
  return ++jev===1?new Response(null,{status:503}):decision(input);
 });
 const events=[];const result=await start(undefined,()=>{},event=>events.push(event));
 assert.equal(result.entries[0].import_meta.status,'classified');assert.equal(jev,2);
 assert.equal(f.calls.find(x=>x.path.endsWith('/classify')).calls,2);
 assert.ok(events.some(e=>e.type==='activity'&&e.activity.text.includes('再試行')));
});

test('分割後も壊れたJev分布を要確認へ置き換えず全体を失敗させる',async t=>{
 await setup(t,async(model,input)=>{
  if(model==='openai/gpt-6-luna')return stream(extraction([source()]));
  const result=decision(input);result.result.answers.category.probabilities.食費=0;return result;
 });
 t.mock.method(console,'error',()=>{});
 await assert.rejects(start(),error=>{
  assert.equal(error.code,'classification_result');assert.equal(error.diagnostics.failure.source.row,1);
  assert.equal(error.diagnostics.classification.evaluated,0);return true;
 });
});

test('抽出が完了していなければ、仕分け済みの行があっても成功結果を返さない',async t=>{
 await setup(t,async(model,input)=>{
  if(model==='openai/gpt-6-luna')return new ReadableStream({start(c){c.enqueue(delta(JSON.stringify(extraction([source()]))));c.close();}});
  return decision(input);
 });
 t.mock.method(console,'error',()=>{});
 await assert.rejects(start(),error=>{
  assert.equal(error.code,'disconnected');assert.equal(error.diagnostics.failure.model,'luna');return true;
 });
});

test('split非対応の従来応答は追加のJev要求をせず処理する',async t=>{
 let calls=0;const result={confirmed_total:100,entries:[{spent_on:'2026-09-01',title:'架空の店',amount:100,category:'食費'}]};
 t.mock.method(globalThis,'fetch',async()=>{calls++;return new Response(JSON.stringify({type:'complete',result})+'\n',{headers:{'Content-Type':'application/x-ndjson'}});});
 assert.deepEqual(await start(),result);assert.equal(calls,1);
});
