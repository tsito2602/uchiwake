import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spaceFixture } from './spaces-fixture.mjs';

const {outputFiles}=await build({stdin:{contents:`export * from './worker/luna-jev-import';export * from './worker/classification-memory';export * from './src/import-policy';export * from './src/statement-import-flow';export * from './src/statement-import-stream';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {runLunaJev,lunaJevStream,extractedEntry,jevDecision,matchingRule,validRule,classificationMemory,runStatementImport,receiveStatement}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const cats=['食費','日用品費','要確認'];
const file={name:'明細.csv',kind:'csv',data:'利用日,店名,金額\n2026-09-01,スーパー,100',size:100};
const source={spent_on:'2026-09-01',title:'スーパー',amount:100,source_file:1,page:1,row:1,excerpt:'9/1 スーパー 100',context:'',amount_uncertain:false};
const extraction=(entries=[source],amount=null)=>({confirmed_total:amount??0,entries,source_total:amount===null?null:{amount,file:1,page:1,label:'お支払い合計'}});
const decision=(confidence=.99,noul=.99)=>({answers:{category:{type:'choice',choice:'食費',confidence,probabilities:{食費:.99,日用品費:.01}},sufficient:{type:'noul',noul}}});
const frame=event=>new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
const delta=text=>frame({type:'response.output_text.delta',delta:text});
const done=()=>frame({type:'response.completed',response:{status:'completed'}});
function stream(result){return new ReadableStream({start(c){c.enqueue(delta(JSON.stringify(result)));c.enqueue(done());c.close();}});}
function fixture(){const f=spaceFixture();f.db.exec("INSERT INTO spaces(id,name,kind,owner_id) VALUES('a','A','shared','owner'),('b','B','shared','b'); INSERT INTO space_members(space_id,user_id,name) VALUES('a','owner','owner'),('b','b','b');");return f;}
const envFor=(f,run)=>({DB:f.DB,AI_GATEWAY_ID:'test',AI:{run}});
const signal=()=>new AbortController().signal;

test('CloudflareのJev JSONをcharset付きResponseでもバイトストリームでも読み取れる',async()=>{
 const f=fixture();try{
  for(const bodyOnly of [false,true]){
   const env=envFor(f,async model=>{
    if(model!=='typesafe/jev')return new Response(stream(extraction()),{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});
    const response=new Response(JSON.stringify(decision()),{headers:{'Content-Type':'application/json; charset=utf-8'}});
    return bodyOnly?response.body:response;
   });
   const result=await runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{});
   assert.equal(result.entries[0].category,'食費');
  }
 }finally{f.db.close();}
});

test('Jevは分布・信頼度・根拠を独立に検証し、Amazonの店名だけなら高スコアでも自動適用しない',()=>{
 const row=extractedEntry(source,1,'要確認');
 assert.equal(jevDecision(decision(),cats.slice(0,2),row,'要確認').category,'食費');
 assert.equal(jevDecision(decision(.84),cats.slice(0,2),row,'要確認').category,'要確認');
 assert.equal(jevDecision(decision(.99,.89),cats.slice(0,2),row,'要確認').category,'要確認');
 assert.equal(jevDecision(decision(),cats.slice(0,2),{...row,title:'Amazon'},'要確認').category,'要確認');
 assert.throws(()=>jevDecision({answers:{category:{...decision().answers.category,probabilities:{食費:99,日用品費:1}},sufficient:{type:'noul',noul:.99}}},cats.slice(0,2),row,'要確認'));
 assert.throws(()=>jevDecision(decision(NaN),cats.slice(0,2),row,'要確認'));
 assert.equal(extractedEntry({...source,title:'Amazon',context:'食品'},1,'要確認').import_meta.context,'');
});

test('合計のない原本は合計を推測せず、同日・同店・同額でも出典位置の違う明細は残す',async()=>{
 const f=fixture();try{
  const events=[],requests=[];
  const result=await runLunaJev(envFor(f,async(model,input,options)=>{requests.push({model,input,options});return model==='typesafe/jev'?decision():stream(extraction([source,{...source,row:2},source]));}),'a',[file],cats,'要確認',signal(),event=>events.push(event));
  assert.equal(result.entries.length,2);assert.equal(result.confirmed_total,0);assert.equal(result.source_total,null);
  assert.equal(result.entries.reduce((n,e)=>n+e.amount,0),200);
  assert.equal(events.filter(e=>e.type==='entry').length,2);
  assert.ok(requests.every(r=>r.options.gateway.skipCache&&!r.options.gateway.collectLog));
  assert.ok(requests.every(r=>r.options.returnRawResponse&&r.options.signal instanceof AbortSignal));
 }finally{f.db.close();}
});

test('Lunaの全行受信を待たずJevの完了を同じ行へ通知する', {timeout:2000},async()=>{
 const f=fixture();try{
  let controller,notify;const classified=new Promise(resolve=>notify=resolve);
  const upstream=new ReadableStream({start(c){controller=c;c.enqueue(delta('{"entries":['+JSON.stringify(source)));}});
  const promise=runLunaJev(envFor(f,async model=>model==='typesafe/jev'?decision():new Response(upstream,{headers:{'Content-Type':'text/event-stream'}})),'a',[file],cats,'要確認',signal(),event=>{if(event.type==='entry_update'&&event.entry.category==='食費')notify(event);});
  const event=await classified;assert.equal(event.entry.import_meta.id,'1:1:1');
  controller.enqueue(delta('],"confirmed_total":0,"source_total":null}'));controller.enqueue(done());controller.close();
  assert.equal((await promise).entries[0].category,'食費');
 }finally{f.db.close();}
});

test('Jevが4件とも応答待ちでもLunaを最後まで受信し、確定した全件数と実際の工程を通知する',{timeout:2000},async()=>{
 const f=fixture();try{
  let release,readDone,started,calls=0,inFlight=0,maxFlight=0;
  const gate=new Promise(resolve=>release=resolve),received=new Promise(resolve=>readDone=resolve),fourStarted=new Promise(resolve=>started=resolve);
  const events=[];
  const env=envFor(f,async model=>{
   if(model!=='typesafe/jev')return stream(extraction(Array.from({length:9},(_,i)=>({...source,row:i+1}))));
   calls++;maxFlight=Math.max(maxFlight,++inFlight);if(calls===4)started();
   await gate;inFlight--;return decision();
  });
  const running=runLunaJev(env,'a',[file],cats,'要確認',signal(),event=>{events.push(event);if(event.type==='activity'&&event.activity.phase==='sorting'&&event.activity.count===9)readDone();});
  await Promise.all([received,fourStarted]);
  assert.equal(events.filter(e=>e.type==='entry').length,9);assert.equal(calls,4);
  assert.ok(events.some(e=>e.type==='activity'&&e.activity.phase==='reading'&&e.activity.count===null));
  assert.ok(events.some(e=>e.type==='activity'&&e.activity.text==='仕分け 0 / 9件完了'));
  release();const result=await running;
  assert.equal(result.entries.length,9);assert.equal(calls,9);assert.equal(maxFlight,4);
  assert.ok(events.some(e=>e.type==='activity'&&e.activity.text==='仕分け 9 / 9件完了'));
 }finally{f.db.close();}
});

test('仕分け待ちの行が残っていても中止後に追加のJevを呼ばず進行表示を更新しない',{timeout:2000},async()=>{
 const f=fixture();try{
  let release,started,calls=0;const controller=new AbortController(),events=[];
  const gate=new Promise(resolve=>release=resolve),fourStarted=new Promise(resolve=>started=resolve);
  const env=envFor(f,async model=>{
   if(model!=='typesafe/jev')return stream(extraction(Array.from({length:9},(_,i)=>({...source,row:i+1}))));
   if(++calls===4)started();await gate;return decision();
  });
  const running=runLunaJev(env,'a',[file],cats,'要確認',controller.signal,event=>events.push(event));
  await fourStarted;controller.abort();await assert.rejects(running);const count=events.length;
  release();await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(calls,4);assert.equal(events.length,count);
 }finally{f.db.close();}
});

test('差額を再読し、参照合計が消えても差額を解消したことにしない。変更のない行はJevへ再送しない',async()=>{
 const f=fixture();try{
  let luna=0,jev=0;const events=[];
  const result=await runLunaJev(envFor(f,async model=>{if(model==='typesafe/jev'){jev++;return decision();}return stream(extraction([source],++luna===1?200:null));}),'a',[file],cats,'要確認',signal(),event=>events.push(event));
  assert.equal(luna,2);assert.equal(jev,1);assert.equal(result.source_total.amount,200);assert.equal(result.entries[0].amount,100);
  assert.ok(events.some(e=>e.type==='replace'));assert.ok(events.some(e=>e.text?.includes('差')));
  assert.ok(events.some(e=>e.type==='activity'&&e.activity.rechecking&&e.activity.phase==='reading'&&e.activity.text.includes('差額 ¥100')));
 }finally{f.db.close();}
});

test('返金を符号付きで合計し、原本の全利用額を費目の精算設定に関係なく照合する',async()=>{
 const f=fixture();try{
  let calls=0;
  const result=await runLunaJev(envFor(f,async model=>model==='typesafe/jev'?decision():(calls++,stream(extraction([source,{...source,row:2,amount:-20}],80)))),'a',[file],cats,'要確認',signal(),()=>{});
  assert.equal(calls,1);assert.equal(result.source_total.amount,80);
 }finally{f.db.close();}
});

test('Jevの故障は要確認で完了させずエラーにし、部分結果を保存画面に渡さない',async()=>{
 const f=fixture();try{
  const env=envFor(f,async model=>{if(model==='typesafe/jev')throw new Error('secret upstream detail');return stream(extraction());});
  const response=lunaJevStream(env,'a',[file],cats,'要確認',signal());
  const text=await response.text();assert.ok(text.includes('"type":"error"'));assert.ok(!text.includes('"type":"complete"'));assert.ok(!text.includes('secret upstream detail'));
 }finally{f.db.close();}
});

test('中止した処理は遅延したJev応答が来ても行更新・完了を送らない', {timeout:2000},async()=>{
 const f=fixture();try{
  const abort=new AbortController(),events=[];let release,started;const waiting=new Promise(resolve=>started=resolve);
  const promise=runLunaJev(envFor(f,async model=>{if(model!=='typesafe/jev')return stream(extraction());started();return new Promise(resolve=>release=resolve);}),'a',[file],cats,'要確認',abort.signal,event=>events.push(event));
  await waiting;abort.abort();await assert.rejects(promise);const count=events.length;release(decision());await new Promise(resolve=>setTimeout(resolve,0));assert.equal(events.length,count);
 }finally{f.db.close();}
});

test('修正履歴は候補表示だけ。明示した条件一致のルールだけがJevを省略する',async()=>{
 const f=fixture();try{
  f.db.prepare('INSERT INTO classification_history(id,space_id,merchant_key,title,category,previous_category) VALUES(?,?,?,?,?,?)').run('h','a','スーパー','スーパー','日用品費','食費');
  let jev=0;
  const env=envFor(f,async(model,input)=>{if(model!=='typesafe/jev')return stream(extraction());jev++;assert.ok(!JSON.stringify(input.state).includes('日用品費'));return decision();});
  const first=await runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{});assert.equal(first.entries[0].category,'食費');assert.deepEqual(first.entries[0].import_meta.history,['日用品費']);
  f.db.prepare('INSERT INTO classification_rules(id,space_id,merchant_key,category,created_by) VALUES(?,?,?,?,?)').run('r','a','スーパー','日用品費','owner');
  const next=await runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{});assert.equal(next.entries[0].category,'日用品費');assert.equal(jev,1);
  assert.deepEqual(await classificationMemory(f.DB,'b',next.entries[0],cats),{rules:[],history:[]});
 }finally{f.db.close();}
});

test('Amazonのルールは購入内容の条件が必要で、他の商品へ伝播しない',()=>{
 const row=extractedEntry({...source,title:'Amazon',excerpt:'Amazon 洗剤 100',context:'洗剤'},1,'要確認');
 row.import_meta.remember_rule=true;assert.equal(validRule(row),false);
 row.import_meta.rule_keyword='洗剤';assert.equal(validRule(row),true);
 const rule={id:'r',merchant_key:'amazon',context_keyword:'洗剤',category:'日用品費'};
 assert.equal(matchingRule(row,[rule]).category,'日用品費');
 assert.equal(matchingRule({...row,import_meta:{...row.import_meta,context:'食品'}},[rule]),undefined);
 assert.equal(matchingRule(row,[{...rule,context_keyword:''}]),undefined);
});

test('分類ルールと修正履歴は保存と同じトランザクションで作り、別スペースから読めず削除できない',async()=>{
 const f=fixture();try{
  f.db.exec("INSERT INTO shared_cards(id,name,active,space_id) VALUES('c','カード',1,'a');");
  const row={...extractedEntry(source,1,'要確認'),category:'日用品費'};row.import_meta.original_category='要確認';row.import_meta.remember_rule=true;
  const body={due_month:'2026-09',card_id:'c',title:'明細',confirmed_total:100,entries:[row]};
  const saved=await f.call('owner','/statements','POST',body,'a');assert.equal(saved.status,201,await saved.clone().text());
  const data=await (await f.call('owner','/classification/rules','GET',undefined,'a')).json();assert.equal(data.rules.length,1);
  assert.equal((await f.call('b',`/classification/rules/${data.rules[0].id}`,'DELETE',undefined,'b')).status,404);
  assert.equal((await f.call('b','/classification/rules','GET',undefined,'a')).status,404);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM classification_history').get().n,1);
  const entry=f.db.prepare('SELECT id FROM card_entries').get();
  assert.equal((await f.call('owner',`/card-entries/${entry.id}/category`,'PUT',{category:'食費'},'a')).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM classification_history').get().n,2);
  assert.equal(f.db.prepare('SELECT category FROM classification_rules').get().category,'日用品費');
  assert.equal((await f.call('owner',`/classification/rules/${data.rules[0].id}`,'DELETE',undefined,'a')).status,200);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM classification_rules').get().n,0);
 }finally{f.db.close();}
});

test('フロントの逐次更新は追記せず同じ行を置き換え、再読結果へ切り替える',async()=>{
 const row=extractedEntry(source,1,'要確認'),updated={...row,category:'食費',import_meta:{...row.import_meta,status:'classified'}},progress=[];
 const result=await runStatementImport({signal:signal(),demo:false,onProgress:p=>progress.push(p),analyze:async(onEntry,onReasoning,onEvent)=>{
  onEntry(row);onEvent({type:'entry_update',entry:updated});onEvent({type:'replace',entries:[]});onEntry(updated);return {confirmed_total:0,source_total:null,entries:[updated]};
 }});
 assert.ok(progress.some(p=>p.entries.length===1&&p.entries[0].category==='食費'));
 assert.ok(progress.every(p=>p.entries.length<=1));assert.equal(result.entries.length,1);
 const events=[];const activity={phase:'sorting',text:'仕分け 1 / 1件完了',count:1,rechecking:false};const encoded=[{type:'entry_update',entry:updated},{type:'replace',entries:[]},{type:'activity',activity},{type:'complete',result}].map(e=>JSON.stringify(e)).join('\n');
 assert.deepEqual(await receiveStatement(new Response(encoded,{headers:{'Content-Type':'application/x-ndjson'}}),()=>{},signal(),1000,()=>{},event=>events.push(event)),result);assert.equal(events.length,3);assert.deepEqual(events.at(-1).activity,activity);
});

test('Cloudflareを選択したAPIはOpenAIキーなしで取り込みとレポートを処理し、未設定時は直接APIへ黙って切り替えない',async()=>{
 const f=fixture();try{
  const models=[];Object.assign(f.env,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'test',AI:{async run(model,input){models.push(model);
   if(model==='typesafe/jev'){const keys=Object.keys(input.questions.category.criteria);return {answers:{category:{type:'choice',choice:'食費',confidence:.99,probabilities:Object.fromEntries(keys.map(key=>[key,key==='食費'?1:0]))},sufficient:{type:'noul',noul:.99}}};}
   return input.stream?stream(extraction()):new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:'食費が100円です。'}]}]}),{headers:{'Content-Type':'application/json; charset=utf-8'}});
  }}});
  const response=await f.call('owner','/statement/analyze','POST',{mode:'live',files:[file]},'a');assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).entries[0].category,'食費');
  f.db.exec("INSERT INTO shared_cards(id,name,active,space_id) VALUES('c','カード',1,'a'); INSERT INTO card_statements(id,card_id,due_month,title,confirmed_total,space_id) VALUES('s','c','2026-09','明細',100,'a'); INSERT INTO card_entries(id,statement_id,spent_on,title,category,amount,space_id) VALUES('e','s','2026-09-01','スーパー','食費',100,'a');");
  const report=await f.call('owner','/report/comment','POST',{mode:'live',month:'2026-09'},'a');assert.equal(report.status,200,await report.clone().text());assert.equal((await report.json()).comment,'食費が100円です。');
  assert.ok(models.includes('typesafe/jev'));assert.equal(models.filter(m=>m==='openai/gpt-6-luna').length,2);
  delete f.env.AI;f.env.OPENAI_API_KEY='do-not-use';assert.equal((await f.call('owner','/statement/analyze','POST',{mode:'live',files:[file]},'a')).status,503);
 }finally{f.db.close();}
});

test('再読で原本合計が変わったときは自動で帳尻を合わせず候補をユーザーへ渡す',async()=>{
 const f=fixture();try{
  let luna=0;
  const result=await runLunaJev(envFor(f,async model=>model==='typesafe/jev'?decision():stream(extraction([source],++luna===1?200:100))),'a',[file],cats,'要確認',signal(),()=>{});
  assert.equal(result.source_total.amount,200);assert.equal(result.total_alternative.amount,100);assert.equal(result.confirmed_total,200);
 }finally{f.db.close();}
});

test('CloudflareのHTTP失敗はJSON形式エラーへ潰さず認証・利用枠・制限として通知する',async()=>{
 const f=fixture();try{
  for(const [status,body,code] of [[401,null,'authentication'],[403,'forbidden upstream detail','permission'],[429,'slow down','rate_limit'],[429,JSON.stringify({error:{code:'insufficient_quota',message:'private upstream detail'}}),'quota']]){
   const env=envFor(f,async model=>model==='typesafe/jev'?new Response(body,{status}):stream(extraction()));
   await assert.rejects(runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{}),error=>error.code===code&&!error.message.includes('upstream detail'));
  }
 }finally{f.db.close();}
});

test('Jevの不正JSONと不正な分布を仕分け段階のエラーとして返し、完了させない',async()=>{
 const f=fixture();try{
  for(const body of ['{incomplete',JSON.stringify({answers:{}})]){
   const env=envFor(f,async model=>model==='typesafe/jev'?new Response(body):stream(extraction()));
   const events=(await lunaJevStream(env,'a',[file],cats,'要確認',signal()).text()).trim().split('\n').map(JSON.parse);
   assert.equal(events.at(-1).code,'classification_result');
   assert.ok(!events.some(event=>event.type==='complete'));
  }
 }finally{f.db.close();}
});

test('JevのJSON本体を受信中に中止するとストリームを解放して終了する',{timeout:2000},async()=>{
 const f=fixture();try{
  const abort=new AbortController();let started,cancelled=false;
  const waiting=new Promise(resolve=>started=resolve);
  const env=envFor(f,async model=>{
   if(model!=='typesafe/jev')return stream(extraction());
   return new Response(new ReadableStream({pull(){started();},cancel(){cancelled=true;}}));
  });
  const promise=runLunaJev(env,'a',[file],cats,'要確認',abort.signal,()=>{});
  await waiting;abort.abort();await assert.rejects(promise);assert.equal(cancelled,true);
 }finally{f.db.close();}
});
