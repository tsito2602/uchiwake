import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import app from '../dist/worker.mjs';
import {spaceFixture} from './spaces-fixture.mjs';
import {sessionCookie} from './auth-fixture.mjs';

const {outputFiles}=await build({stdin:{contents:`export * from './src/statement-import-stream';export * from './src/statement-import-flow';export * from './worker/statement-request';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {streamStatement,runStatementImport,statementRequest}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
// Captured independently from the commit immediately before Gateway integration.
const original=JSON.parse(readFileSync(new URL('./fixtures/pre-gateway-statement-request.json',import.meta.url),'utf8'));
const categories=original.request.options.text.format.schema.properties.entries.items.properties.category.enum;
const files=[{name:'synthetic.csv',kind:'csv',size:30,data:'日付,店名,金額\n2026-09-01,架空店,100'}];
const row=(i=1,category='食費')=>({spent_on:'2026-09-01',title:`架空店${i}`,category,amount:100});
const frame=event=>new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
const delta=text=>frame({type:'response.output_text.delta',delta:text});
const done=()=>frame({type:'response.completed',response:{status:'completed'}});
const stream=result=>new ReadableStream({start(c){c.enqueue(delta(JSON.stringify(result)));c.enqueue(done());c.close();}});
async function setup(t,run){
 const f=spaceFixture();
 f.db.exec("INSERT INTO spaces(id,name,kind,owner_id) VALUES('a','A','shared','owner'); INSERT INTO space_members(space_id,user_id,name) VALUES('a','owner','owner');");
 Object.assign(f.env,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'test',AI:{run}});
 const cookie=await sessionCookie({sub:'owner',email:'owner@example.test',name:'owner'},f.env);
 const calls=[];
 t.mock.method(globalThis,'fetch',async(path,init)=>{
  assert.equal(path,'/api/statement/analyze');calls.push(JSON.parse(init.body));
  const headers=new Headers(init.headers);headers.set('Cookie',cookie);headers.set('Origin','https://example.test');
  return app.fetch(new Request(`https://example.test${path}`,{...init,headers}),f.env);
 });
 t.after(()=>f.db.close());return {...f,calls};
}
const start=(onEntry=()=>{},signal=new AbortController().signal,onEvent=()=>{},onReasoning=()=>{})=>streamStatement(files,signal,onEntry,onReasoning,'a',onEvent);

test('導入前のプロンプト・指示・推論設定・4項目スキーマを履歴のfixtureと完全一致させる',()=>{
 assert.equal(original.revision,'d5ab87407c9e279b102abba127e22064e5a8deac');
 assert.deepEqual(statementRequest([],categories,'要確認','その他'),original.request);
});

test('通常の画面は旧形式で68行を一回だけ取り込み、店舗補正・根拠判定・履歴・自動再読を適用しない',async t=>{
 const result={confirmed_total:9999,entries:Array.from({length:68},(_,i)=>row(i+1,i%3?'食費':'要確認'))};
 result.entries[0]={...row(1,'娯楽費'),title:'Amazon'};
 result.entries[1]={...row(2,'日用品費'),title:'ローソン'};
 let aiCalls=0;
 const f=await setup(t,async(model,input,options)=>{
  aiCalls++;assert.equal(model,'openai/gpt-6-luna');assert.equal(input.store,false);assert.equal(input.stream,true);
  assert.deepEqual(input.input[0].content[0],original.request.content[0]);
  for(const key of ['reasoning','instructions','text'])assert.deepEqual(input[key],original.request.options[key]);
  assert.equal(options.gateway.skipCache,true);assert.equal(options.gateway.collectLog,false);
  return stream(result);
 });
 f.db.exec("INSERT INTO classification_rules(id,space_id,merchant_key,context_keyword,category,created_by) VALUES('r','a','架空店3','','日用品費','owner');");
 const prepare=f.DB.prepare;
 t.mock.method(f.DB,'prepare',sql=>{assert.ok(!/FROM classification_(rules|history)/.test(sql));return prepare(sql);});
 const seen=[],events=[];const actual=await start(entry=>seen.push(entry),undefined,event=>events.push(event));
 assert.deepEqual(actual,result);assert.deepEqual(seen,result.entries);assert.equal(aiCalls,1);
 assert.deepEqual(f.calls,[{files,mode:'live',stream:true}]);
 assert.ok(events.some(e=>e.type==='activity'&&e.activity.phase==='reading'&&e.activity.text==='読み取り・仕分け 68件完了'&&e.activity.count===null));
 assert.ok(!events.some(e=>e.type==='replace'));
 assert.equal(f.db.prepare('SELECT count(*) n FROM card_statements').get().n,0);
});

test('分類済みの行を全件完了前に表示し、現在のゲージ用件数を更新して思考文は表示しない',{timeout:3000},async t=>{
 let controller;
 const result={confirmed_total:100,entries:[row()]};
 await setup(t,async()=>new ReadableStream({start(c){controller=c;c.enqueue(frame({type:'response.reasoning_summary_text.delta',item_id:'r',summary_index:0,delta:'private reasoning'}));c.enqueue(delta('{"entries":['+JSON.stringify(row())));}}));
 const progress=[],previews=[];let completed=false;
 const actual=await runStatementImport({demo:false,signal:new AbortController().signal,onProgress:value=>progress.push(value),analyze:(onEntry,onReasoning,onEvent)=>start(entry=>{
  assert.equal(completed,false);onEntry(entry);
  controller.enqueue(delta('],"confirmed_total":100}'));controller.enqueue(done());controller.close();
 },undefined,onEvent,text=>{previews.push(text);onReasoning(text);})});completed=true;
 assert.deepEqual(actual,result);
 assert.ok(progress.some(p=>p.entries.length===1&&p.phase==='reading'&&p.activity.text.includes('1件完了')));
 assert.equal(progress.at(-1).phase,'checking');assert.equal(progress.at(-1).checkedTotal,100);
 assert.ok(!JSON.stringify(previews).includes('private reasoning'));
});

test('非ストリームでも同じプロンプトを一回使い、費目名称変更に追従する',async t=>{
 let calls=0;const result={confirmed_total:0,entries:[row(1,'食料品')]};
 const f=await setup(t,async(model,input)=>{
  calls++;assert.equal(model,'openai/gpt-6-luna');assert.equal(input.stream,false);
  const allowed=input.text.format.schema.properties.entries.items.properties.category.enum;
  assert.ok(allowed.includes('食料品'));assert.ok(!allowed.includes('食費'));
  assert.match(input.input[0].content[0].text,/食料品/);
  return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]}),{headers:{'Content-Type':'application/json; charset=utf-8'}});
 });
 f.db.prepare('INSERT INTO category_settings(space_id,category,original_category,icon,color) VALUES(?,?,?,?,?)').run('a','食料品','食費','basket','#738778');
 const response=await f.call('owner','/statement/analyze','POST',{mode:'live',files},'a');
 assert.equal(response.status,200);assert.deepEqual(await response.json(),result);assert.equal(calls,1);
});

test('途中切断・不正な金額・429を要確認や部分成功に変えずエラーにする',async t=>{
 let mode='disconnected',calls=0;const logs=[];t.mock.method(console,'error',value=>logs.push(value));
 const f=await setup(t,async()=>{
  calls++;if(mode==='rate_limit')return new Response('private provider error',{status:429});
  return new ReadableStream({start(c){c.enqueue(delta('{"entries":['+JSON.stringify(row())));if(mode==='invalid_result'){c.enqueue(delta(','+JSON.stringify({...row(2),amount:'100'})+'],"confirmed_total":100}'));c.enqueue(done());}c.close();}});
 });
 for(const code of ['disconnected','invalid_result','rate_limit']){
  mode=code;let complete=false;
  await assert.rejects(start().then(()=>{complete=true;}),error=>{assert.equal(error.code,code);assert.ok(!JSON.stringify(error).includes('private provider error'));return true;});
  assert.equal(complete,false);
 }
 assert.equal(calls,3);assert.equal(f.calls.length,3);assert.ok(!logs.join('').includes('private provider error'));
 assert.equal(f.db.prepare('SELECT count(*) n FROM card_statements').get().n,0);
});

test('単純な取り込みも中止で受信を止め、その後の追加要求を行わない',{timeout:3000},async t=>{
 let cancelled=false;
 const f=await setup(t,async()=>new ReadableStream({start(c){c.enqueue(delta('{"entries":['+JSON.stringify(row())));},cancel(){cancelled=true;}}));
 const abort=new AbortController();
 await assert.rejects(start(()=>abort.abort(),abort.signal));
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(cancelled,true);assert.equal(f.calls.length,1);
});
