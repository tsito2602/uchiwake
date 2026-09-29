import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
import app from '../dist/worker.mjs';
import {spaceFixture} from './spaces-fixture.mjs';
import {sessionCookie} from './auth-fixture.mjs';

const {outputFiles}=await build({stdin:{contents:`export * from './src/statement-import-stream';export * from './src/statement-import-flow';export * from './worker/statement-request';export {StatementDecoder} from './worker/statement-stream';export {reviewReasons} from './src/import-policy';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {streamStatement,runStatementImport,statementRequest,StatementDecoder,reviewReasons}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
// Captured independently from the commit immediately before Gateway integration.
const original=JSON.parse(readFileSync(new URL('./fixtures/pre-gateway-statement-request.json',import.meta.url),'utf8'));
const categories=original.request.options.text.format.schema.properties.entries.items.properties.category.enum;
const files=[{name:'synthetic.csv',kind:'csv',size:30,data:'日付,店名,金額\n2026-09-01,架空店,100'}];
const row=(i=1,category='食費')=>({spent_on:'2026-09-01',title:`架空店${i}`,category,amount:100,review_reason:category==='要確認'?['purchase_unknown','merchant_unknown','multiple_categories'][i%3]:'none'});
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

test('導入前のプロンプト・指示・推論設定・4項目に理由区分だけを追加する',()=>{
 assert.equal(original.revision,'d5ab87407c9e279b102abba127e22064e5a8deac');
 const request=statementRequest([],categories,'要確認','その他');
 const item=request.options.text.format.schema.properties.entries.items;
 assert.deepEqual(item.properties.review_reason,{type:'string',enum:['purchase_unknown','merchant_unknown','multiple_categories','none']});
 assert.deepEqual(item.required,['spent_on','title','category','amount','review_reason']);
 const extension=request.content.splice(1,1)[0];
 assert.match(extension.text,/分類できた場合はnone/);assert.match(extension.text,/理由を創作しない/);assert.match(extension.text,/分類できる明細を「要確認」に変更しない/);
 delete item.properties.review_reason;item.required.pop();
 assert.deepEqual(request,original.request);
});

test('通常の画面は理由付き68行を一回だけ取り込み、店舗補正・根拠判定・履歴・自動再読を適用しない',async t=>{
 const result={confirmed_total:9999,entries:Array.from({length:68},(_,i)=>row(i+1,i%3?'食費':'要確認'))};
 result.entries[0]={...row(1,'娯楽費'),title:'Amazon'};
 result.entries[1]={...row(2,'日用品費'),title:'ローソン'};
 let aiCalls=0;
 const f=await setup(t,async(model,input,options)=>{
  aiCalls++;assert.equal(model,'openai/gpt-6-luna');assert.equal(input.store,false);assert.equal(input.stream,true);
  assert.deepEqual(input.input[0].content[0],original.request.content[0]);
  for(const key of ['reasoning','instructions'])assert.deepEqual(input[key],original.request.options[key]);
  assert.ok(input.text.format.schema.properties.entries.items.required.includes('review_reason'));
  assert.match(input.input[0].content[1].text,/review_reason/);
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

test('理由3種と該当なしを逐次受信・完了結果で保持し、理由なしの旧形式も読める',()=>{
 const rows=['purchase_unknown','merchant_unknown','multiple_categories','none'].map((review_reason,i)=>({...row(i,i===3?'食費':'要確認'),review_reason}));
 const {review_reason,...legacy}=row(5,'要確認');rows.push(legacy);
 const result={confirmed_total:500,entries:rows},text=JSON.stringify(result);
 for(let split=0;split<=text.length;split++){
  const decoder=new StatementDecoder(categories);
  assert.deepEqual([...decoder.append(text.slice(0,split)),...decoder.append(text.slice(split))],rows);
  assert.deepEqual(decoder.finish(),result);
 }
 const oldReasons=reviewReasons(legacy,'要確認');
 assert.deepEqual(oldReasons,['費目を絞り込めませんでした。購入内容に合う費目を選んでください。']);
});

test('通常取り込みで理由3種をAI一回から返し、理由があるだけで分類済みを要確認にしない',async t=>{
 const result={confirmed_total:500,entries:[
  {...row(1,'要確認'),review_reason:'purchase_unknown'},
  {...row(2,'要確認'),review_reason:'merchant_unknown'},
  {...row(3,'要確認'),review_reason:'multiple_categories'},
  row(4),{...row(5),review_reason:'purchase_unknown'}
 ]};
 let aiCalls=0;const f=await setup(t,async()=>{aiCalls++;return stream(result);});
 const seen=[];assert.deepEqual(await start(e=>seen.push(e)),result);assert.deepEqual(seen,result.entries);
 assert.equal(aiCalls,1);assert.equal(f.calls.length,1);
 assert.deepEqual(reviewReasons(seen[4],'要確認'),[]);
});

test('不正な理由区分はエラーにして自由文や原本をログ・診断に出さない',async t=>{
 const privateText='原本の店名・明細を含む非公開の自由文';
 let reason;const logs=[];t.mock.method(console,'error',value=>logs.push(value));
 const f=await setup(t,async()=>stream({confirmed_total:200,entries:[row(),{...row(2,'要確認'),review_reason:reason}]}));
 for(reason of [privateText,'',null,10,{},['purchase_unknown'],'constructor']){
  await assert.rejects(start(),error=>{assert.equal(error.code,'invalid_result');assert.ok(!JSON.stringify(error).includes(privateText));return true;});
 }
 assert.ok(!JSON.stringify(logs).includes(privateText));assert.ok(!JSON.stringify(logs).includes('架空店'));
 assert.equal(f.calls.length,7);assert.equal(f.db.prepare('SELECT count(*) n FROM card_statements').get().n,0);
});

test('改名された要確認でも非ストリームの理由を保持する',async t=>{
 let aiCalls=0;const result={confirmed_total:100,entries:[{...row(1,'確認待ち'),review_reason:'multiple_categories'}]};
 const f=await setup(t,async(model,input)=>{
  aiCalls++;assert.equal(input.stream,false);assert.match(input.input[0].content[1].text,/「確認待ち」/);
  return {status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]};
 });
 f.db.prepare('INSERT INTO category_settings(space_id,category,original_category,icon,color) VALUES(?,?,?,?,?)').run('a','確認待ち','要確認','circle-help','#999999');
 const response=await f.call('owner','/statement/analyze','POST',{mode:'live',files},'a');
 assert.equal(response.status,200);assert.deepEqual(await response.json(),result);assert.equal(aiCalls,1);
 assert.match(reviewReasons(result.entries[0],'確認待ち')[0],/^複数の費目が候補/);
});

test('OpenAI直接接続の非ストリームでも同じ理由を返し、不正な区分は拒否する',async t=>{
 const result={confirmed_total:100,entries:[{...row(1,'要確認'),review_reason:'purchase_unknown'}]};
 const f=await setup(t,async()=>assert.fail('direct connection must not use the binding'));
 Object.assign(f.env,{AI_IMPORT_PROVIDER:'openai',OPENAI_API_KEY:'test-key'});
 let calls=0;t.mock.method(globalThis,'fetch',async(url,init)=>{
  calls++;assert.equal(url,'https://api.openai.com/v1/responses');
  const input=JSON.parse(init.body);assert.ok(input.text.format.schema.properties.entries.items.required.includes('review_reason'));
  return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]}));
 });
 const response=await f.call('owner','/statement/analyze','POST',{mode:'live',files},'a');
 assert.equal(response.status,200);assert.deepEqual(await response.json(),result);
 result.entries[0].review_reason='invalid';
 const invalid=await f.call('owner','/statement/analyze','POST',{mode:'live',files},'a');
 assert.equal(invalid.status,502);assert.equal(calls,2);
});
