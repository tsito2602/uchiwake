import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import app from '../dist/worker.mjs';
import { spaceFixture } from './spaces-fixture.mjs';
import { sessionCookie } from './auth-fixture.mjs';

const {outputFiles}=await build({stdin:{contents:`export * from './src/statement-import-stream';export * from './src/statement-import-flow';export * from './worker/luna-import';export * from './worker/classification-memory';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {streamStatement,runStatementImport,lunaClassifiedEntry,classificationMemoryForSpace}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const files=[{name:'synthetic.png',kind:'image',data:'data:image/png;base64,iVBORw0KGgo=',size:1}];
const source=(row=1,extra={})=>({spent_on:'2026-09-01',title:'ヤオコー',amount:100,source_file:1,page:1,row,excerpt:'9/1 ヤオコー 100',context:'',amount_uncertain:false,category:'食費',basis:'merchant',...extra});
const extraction=(entries,total=null)=>({confirmed_total:total??0,entries,source_total:total===null?null:{amount:total,file:1,page:1,label:'請求合計'}});
const frame=event=>new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
const delta=text=>frame({type:'response.output_text.delta',delta:text});
const done=()=>frame({type:'response.completed',response:{status:'completed'}});
const stream=result=>new ReadableStream({start(c){c.enqueue(delta(JSON.stringify(result)));c.enqueue(done());c.close();}});
async function setup(t,run){
 const f=spaceFixture();
 f.db.exec("INSERT INTO spaces(id,name,kind,owner_id) VALUES('a','A','shared','owner'),('b','B','shared','b'); INSERT INTO space_members(space_id,user_id,name) VALUES('a','owner','owner'),('b','b','b');");
 Object.assign(f.env,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'test',AI:{run}});
 const cookie=await sessionCookie({sub:'owner',email:'owner@example.test',name:'owner'},f.env);
 const calls=[];
 t.mock.method(globalThis,'fetch',async(path,init)=>{
  calls.push({path,body:JSON.parse(init.body)});
  const headers=new Headers(init.headers);headers.set('Cookie',cookie);headers.set('Origin','https://example.test');
  return app.fetch(new Request(`https://example.test${path}`,{...init,headers}),f.env);
 });
 t.after(()=>f.db.close());
 return {...f,calls};
}
const start=(onEntry=()=>{},signal=new AbortController().signal,onEvent=()=>{})=>streamStatement(files,signal,onEntry,()=>{},'a',onEvent);

test('通常の画像取り込みはLuna一回で68件を分類し、要確認が65件あっても再読・Jev要求をしない',async t=>{
 let aiCalls=0;
 const entries=Array.from({length:68},(_,i)=>source(i+1,i<3?{}:{title:'Amazon',category:'要確認',basis:'unknown',excerpt:'Amazon 100'}));
 const f=await setup(t,async(model,input,options)=>{
  aiCalls++;assert.equal(model,'openai/gpt-6-luna');
  assert.equal(input.reasoning.effort,'low');assert.equal(input.store,false);
  const schema=input.text.format.schema.properties.entries.items;
  assert.ok(schema.required.includes('category'));assert.ok(schema.required.includes('basis'));
  assert.deepEqual(schema.properties.basis.enum,['context','merchant','unknown']);
  assert.ok(schema.properties.category.enum.includes('食費'));
  assert.equal(options.gateway.skipCache,true);assert.equal(options.gateway.collectLog,false);
  return stream(extraction(entries));
 });
 const seen=[];const result=await start(entry=>seen.push(entry));
 assert.equal(aiCalls,1);assert.equal(f.calls.length,1);assert.equal(f.calls[0].body.pipeline,'luna');
 assert.equal(seen.length,68);assert.equal(result.entries.length,68);
 assert.equal(result.entries.filter(row=>row.import_meta.status==='classified').length,3);
 assert.equal(result.entries.filter(row=>row.import_meta.status==='review').length,65);
 const d=result.diagnostics;
 assert.equal(d.engine,'luna');assert.equal(d.recheck_reason,null);assert.equal(d.run.rechecking,false);
 assert.equal(d.classification.evaluated,68);assert.equal(d.classification.review,65);
 assert.equal(d.classification.confidence_min,null);assert.equal(d.classification.noul_max,null);
 assert.equal(d.timing.extraction_requests,1);assert.equal(d.timing.classification_requests,0);
 for(const key of ['total_ms','first_entry_ms','reading_ms','sorting_wait_ms'])assert.ok(Number.isInteger(d.timing[key])&&d.timing[key]>=0);
 assert.ok(d.timing.first_entry_ms<=d.timing.total_ms);
 for(const text of ['ヤオコー','Amazon','請求合計','食費',files[0].name,files[0].data])assert.ok(!JSON.stringify(d).includes(text));
 assert.equal(f.db.prepare('SELECT count(*) n FROM card_statements').get().n,0);
});

test('専門店の業態で分類できるが、通販・コンビニは原文の購入内容が必要で推測を使わない',()=>{
 const cats=['食費','車','日用品費','要確認'];
 for(const [title,category] of [['ヤオコー','食費'],['オートバックス','車']]){
  const row=lunaClassifiedEntry(source(1,{title,category}),1,cats,'要確認');
  assert.equal(row.category,category);assert.equal(row.import_meta.status,'classified');
  assert.equal(row.import_meta.context,'');assert.equal(row.import_meta.confidence,undefined);assert.equal(row.import_meta.noul,undefined);
 }
 for(const title of ['Amazon','楽天市場','セブンイレブン','ファミリーマート','ローソン']){
  const row=lunaClassifiedEntry(source(1,{title,excerpt:`${title} 100`,context:'食品',basis:'context'}),1,cats,'要確認');
  assert.equal(row.category,'要確認');assert.ok(row.import_meta.review_causes.includes('missing_purchase_context'));
  const merchantOnly=lunaClassifiedEntry(source(1,{title}),1,cats,'要確認');assert.equal(merchantOnly.category,'要確認');
 }
 const specific=lunaClassifiedEntry(source(1,{title:'Amazon',excerpt:'Amazon 洗濯用洗剤 100',context:'洗濯用洗剤',basis:'context',category:'日用品費'}),1,cats,'要確認');
 assert.equal(specific.category,'日用品費');assert.equal(specific.import_meta.status,'classified');
 assert.equal(lunaClassifiedEntry(source(1,{basis:'unknown'}),1,cats,'要確認').category,'要確認');
 for(const extra of [{category:undefined},{category:'存在しない費目'},{basis:undefined},{basis:['merchant']},{basis:'high'}]){
  assert.throws(()=>lunaClassifiedEntry(source(1,extra),1,cats,'要確認'),error=>error.code==='classification_result');
 }
});

test('分類済み行は読み取り完了前に届き、独立した進行表示を更新する',{timeout:3000},async t=>{
 let controller;let completed=false;
 await setup(t,async()=>new ReadableStream({start(c){controller=c;c.enqueue(delta('{"entries":['+JSON.stringify(source())));}}));
 const seen=[],events=[];
 const result=await start(entry=>{
  assert.equal(completed,false);assert.equal(entry.category,'食費');assert.equal(entry.import_meta.status,'classified');seen.push(entry);
  controller.enqueue(delta('],"confirmed_total":0,"source_total":null}'));controller.enqueue(done());controller.close();
 },undefined,event=>events.push(event));completed=true;
 assert.equal(seen.length,1);assert.equal(result.entries.length,1);
 assert.ok(events.some(e=>e.type==='activity'&&e.activity.phase==='reading'&&e.activity.count===null&&e.activity.text.includes('仕分け 1件完了')));
 assert.ok(!events.some(e=>e.type==='entry_update'));
});

test('Lunaの費目も明示ルールを優先し、通常の修正履歴や他スペースのルールを自動適用しない',async t=>{
 const f=await setup(t,async(model,input)=>{
  assert.ok(!JSON.stringify(input).includes('history-secret'));
  return stream(extraction([source(),source(2,{title:'履歴だけの店',basis:'unknown',category:'要確認'}),source(3,{title:'他スペースの店',basis:'unknown',category:'要確認'})]));
 });
 f.db.exec("INSERT INTO classification_rules(id,space_id,merchant_key,context_keyword,category,created_by) VALUES('rule-a','a','ヤオコー','','日用品費','owner'),('rule-b','b','他スペースの店','','食費','b'); INSERT INTO classification_history(id,space_id,merchant_key,title,category,previous_category) VALUES('history-secret','a','履歴だけの店','履歴だけの店','食費','要確認');");
 const memoryQueries=[];const prepare=f.DB.prepare;
 t.mock.method(f.DB,'prepare',sql=>{if(/FROM classification_(rules|history)/.test(sql))memoryQueries.push(sql);return prepare(sql);});
 const result=await start();
 assert.equal(result.entries[0].category,'日用品費');assert.equal(result.entries[0].import_meta.rule_id,'rule-a');
 assert.equal(result.entries[1].category,'要確認');assert.deepEqual(result.entries[1].import_meta.history,['食費']);
 assert.equal(result.entries[2].category,'要確認');assert.deepEqual(result.entries[2].import_meta.history,[]);
 assert.equal(memoryQueries.length,2);assert.equal(result.diagnostics.classification.evaluated,2);
});

test('まとめて取得する修正候補も同一スペース・店の直近5件の順序と有効費目を守る',async()=>{
 const f=spaceFixture();try{
  f.db.exec("INSERT INTO spaces(id,name,kind,owner_id) VALUES('a','A','shared','owner'),('b','B','shared','b');");
  const insert=f.db.prepare('INSERT INTO classification_history(id,space_id,merchant_key,title,category,previous_category,created_at) VALUES(?,?,?,?,?,?,?)');
  for(const [i,category] of ['古い費目','食費','日用品費','食費','削除済み費目','車'].entries())insert.run(`a${i}`,'a','店','店',category,'要確認','2026-09-01');
  insert.run('b','b','店','店','他スペース','要確認','2026-09-02');
  const memory=await classificationMemoryForSpace(f.DB,'a',['古い費目','食費','日用品費','車','他スペース']);
  assert.deepEqual(memory.history(' 店 '),['車','食費','日用品費']);assert.deepEqual(memory.history('別の店'),[]);
 }finally{f.db.close();}
});

test('具体的な合計不一致だけ再読し、再読で原本合計を失っても不一致を隠さない',async t=>{
 let count=0;
 const f=await setup(t,async()=>stream(extraction([source()],++count===1?200:null)));
 const result=await start();
 assert.equal(count,2);assert.equal(result.source_total.amount,200);assert.equal(result.confirmed_total,200);
 assert.equal(result.entries[0].amount,100);assert.equal(result.diagnostics.recheck_reason,'amount_mismatch');
 assert.equal(result.diagnostics.timing.extraction_requests,2);assert.equal(result.diagnostics.timing.classification_requests,0);
 assert.equal(f.calls[1].body.pipeline,'luna');assert.ok(f.calls[1].body.recheck);
});

test('金額不明の再読でも要確認の分類だけを再読理由にしない',async t=>{
 let calls=0;
 await setup(t,async()=>stream(extraction([source(1,{amount:++calls===1?0:100,category:'要確認',basis:'unknown'})])));
 const result=await start();
 assert.equal(calls,2);assert.equal(result.diagnostics.recheck_reason,'unclear_entries');
 assert.equal(result.entries[0].category,'要確認');assert.equal(result.entries[0].amount,100);
});

test('必要な再読でLunaが429を返したら成功にも部分保存にもせず工程と計測値だけを返す',async t=>{
 let calls=0;const logs=[];t.mock.method(console,'error',value=>logs.push(value));
 const f=await setup(t,async()=>++calls===1?stream(extraction([source()],200)):new Response('private upstream',{status:429}));
 let completed=false;
 await assert.rejects(runStatementImport({demo:false,signal:new AbortController().signal,onProgress:()=>{},analyze:(onEntry,onReasoning,onEvent)=>streamStatement(files,new AbortController().signal,onEntry,onReasoning,'a',onEvent)}).then(()=>{completed=true;}),error=>{
  assert.equal(error.code,'rate_limit');const d=error.diagnostics;
  assert.equal(d.failure.model,'luna');assert.equal(d.failure.http_status,429);assert.equal(d.engine,'luna');
  assert.equal(d.run.rechecking,true);assert.equal(d.run.received_entries,0);assert.equal(d.recheck_reason,'amount_mismatch');
  assert.equal(d.timing.extraction_requests,2);assert.equal(d.timing.classification_requests,0);
  for(const secret of ['private upstream','ヤオコー',source().excerpt])assert.ok(!JSON.stringify(d).includes(secret));return true;
 });
 assert.equal(calls,2);assert.equal(completed,false);assert.ok(!logs.join('').includes('private upstream'));
 assert.equal(f.db.prepare('SELECT count(*) n FROM card_statements').get().n,0);
});

test('途中の正常行があっても不正分類や未完了ストリームは取り込み全体を失敗させる',async t=>{
 let current='invalid';t.mock.method(console,'error',()=>{});
 await setup(t,async()=>new ReadableStream({start(c){
  c.enqueue(delta('{"entries":['+JSON.stringify(source())));
  if(current==='invalid'){c.enqueue(delta(','+JSON.stringify(source(2,{category:'不正な費目'}))+'],"confirmed_total":0,"source_total":null}'));c.enqueue(done());}
  c.close();
 }}));
 for(const [kind,code] of [['invalid','classification_result'],['incomplete','disconnected']]){
  current=kind;const seen=[];await assert.rejects(start(row=>seen.push(row)),error=>{
   assert.equal(error.code,code);assert.equal(error.diagnostics.failure.model,'luna');return true;
  });assert.equal(seen.length,1);
 }
});

test('Luna単独の処理を中止すると受信を止め、追加の読み取りも分類も送信しない',{timeout:3000},async t=>{
 let cancelled=false;
 const f=await setup(t,async()=>new ReadableStream({start(c){c.enqueue(delta('{"entries":['+JSON.stringify(source())));},cancel(){cancelled=true;}}));
 const abort=new AbortController();let entries=0;
 await assert.rejects(start(()=>{entries++;abort.abort();},abort.signal));
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(entries,1);assert.equal(f.calls.length,1);assert.equal(cancelled,true);
});
