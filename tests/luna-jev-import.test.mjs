import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { spaceFixture } from './spaces-fixture.mjs';

const {outputFiles}=await build({stdin:{contents:`export * from './worker/luna-jev-import';export * from './worker/jev';export * from './worker/classification-memory';export * from './src/import-policy';export * from './src/statement-import-flow';export * from './src/statement-import-stream';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {runLunaJev,lunaJevStream,extractedEntry,jevDecision,jevDiagnostics,testJevConnection,requestJevWithRetry,matchingRule,validRule,classificationMemory,runStatementImport,receiveStatement}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
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
const answerDiagnostics=({failure,run,classification,engine,recheck_reason,timing,...answer})=>answer;

test('Jevの独立した根拠評価へ全費目の定義を渡し、原文と修正履歴の扱いを変えない',async()=>{
 const f=fixture();try{
  const allowed=['食費','外食費','日用品費','独自費目'];let calls=0;
  await testJevConnection(envFor(f,async(model,input)=>{
   calls++;assert.equal(model,'typesafe/jev');
   assert.deepEqual(input.state,{merchant:'診断用スーパー',purchase_context:'食品'});
   assert.deepEqual(Object.keys(input.questions.category.criteria),allowed);
   assert.deepEqual(input.questions.sufficient.instructions.expense_categories,input.questions.category.criteria);
   assert.match(input.questions.category.criteria.食費,/excludes restaurant/);
   assert.match(input.questions.category.criteria.外食費,/excludes groceries/);
   assert.match(input.questions.category.criteria.独自費目,/独自費目/);
   assert.ok(!JSON.stringify(input).includes('history'));return {};
  }),allowed,signal());assert.equal(calls,1);
 }finally{f.db.close();}
});

test('要確認の理由を信頼度・根拠・購入内容で分け、根拠スコアも保持する',()=>{
 const row=extractedEntry({...source,context:'食品',excerpt:'スーパー 食品 100円'},1,'要確認');
 for(const [confidence,noul,causes] of [[.79,.71,['low_confidence','low_evidence']],[.79,.99,['low_confidence']],[.99,.71,['low_evidence']],[.85,.9,[]]]){
  const result=jevDecision(decision(confidence,noul),cats.slice(0,2),row,'要確認');
  assert.deepEqual(result.import_meta.review_causes,causes);assert.equal(result.import_meta.noul,noul);
  assert.ok(!result.import_meta.reason?.includes('店名だけ'));
 }
 const broad=jevDecision(decision(),cats.slice(0,2),{...row,title:'Amazon',import_meta:{...row.import_meta,context:''}},'要確認');
 assert.deepEqual(broad.import_meta.review_causes,['missing_purchase_context']);assert.equal(broad.category,'要確認');
});

test('Jevの一時HTTP障害だけを最大2回再試行し、Retry-Afterを尊重する',async()=>{
 const f=fixture();try{
  const row=extractedEntry(source,1,'要確認');
  for(const status of [429,500,502,503,504]){
   let calls=0;const attempts=[],waits=[];
   const env=envFor(f,async()=>++calls<3?new Response('private upstream',{status,headers:{'Retry-After':'2'}}):{result:decision()});
   const result=await requestJevWithRetry(env,row,cats.slice(0,2),signal(),attempt=>attempts.push(attempt),async ms=>{waits.push(ms);});
   assert.equal(calls,3);assert.deepEqual(attempts,[2,3]);assert.deepEqual(waits,[2000,2000]);
   assert.equal(jevDecision(result.payload,cats.slice(0,2),row,'要確認').category,'食費');
  }
 }finally{f.db.close();}
});

test('Jevの認証・課金・不正応答・未知の例外を再試行せず、要確認の正常回答も呼び直さない',async()=>{
 const f=fixture();try{
  const row=extractedEntry(source,1,'要確認');
  const failures=[
   ()=>new Response('private upstream',{status:400}),()=>new Response(null,{status:401}),()=>new Response(null,{status:403}),
   ()=>new Response(JSON.stringify({error:{code:'insufficient_quota',message:'private upstream'}}),{status:429}),
   ()=>new Response('{incomplete'),()=>({result:{answers:null}}),
   ()=>new Response(null,{status:503,headers:{'Retry-After':'31'}}),
   ()=>{throw Object.assign(new Error('private upstream'),{code:'private-code',status:'private-status'});}
  ];
  for(const failure of failures){
   let calls=0;const env=envFor(f,async()=>{calls++;return failure();});
   await assert.rejects(requestJevWithRetry(env,row,cats.slice(0,2),signal(),()=>assert.fail('must not retry')));
   assert.equal(calls,1);
  }
  let calls=0;const env=envFor(f,async()=>{calls++;return {result:decision(.79,.71)};});
  const result=await requestJevWithRetry(env,row,cats.slice(0,2),signal(),()=>assert.fail('must not retry'));
  assert.equal(calls,1);assert.equal(jevDecision(result.payload,cats.slice(0,2),row,'要確認').category,'要確認');
 }finally{f.db.close();}
});

test('再試行待ちを中止すると追加のJevを呼ばず終了する',{timeout:2000},async()=>{
 const f=fixture();try{
  const abort=new AbortController();let calls=0,waiting;
  const ready=new Promise(resolve=>waiting=resolve);
  const running=requestJevWithRetry(envFor(f,async()=>{calls++;return new Response(null,{status:503});}),extractedEntry(source,1,'要確認'),cats.slice(0,2),abort.signal,waiting);
  await ready;abort.abort();await assert.rejects(running);assert.equal(calls,1);
 }finally{f.db.close();}
});

test('Luna読取中のJev再試行で読取ゲージを完了扱いせず、復旧後だけ行を分類する',{timeout:4000},async()=>{
 const f=fixture();try{
  let controller,calls=0;const events=[];
  const body=new ReadableStream({start(c){controller=c;c.enqueue(delta('{"entries":['+JSON.stringify(source)));}});
  const env=envFor(f,async model=>model==='typesafe/jev'?(++calls===1?new Response(null,{status:503}):decision()):body);
  const result=await runLunaJev(env,'a',[file],cats,'要確認',signal(),event=>{
   events.push(event);
   if(event.type==='entry_update'&&event.entry.import_meta.status==='classified'){
    controller.enqueue(delta('],"confirmed_total":0,"source_total":null}'));controller.enqueue(done());controller.close();
   }
  });
  assert.equal(calls,2);assert.equal(result.entries[0].category,'食費');
  const retry=events.find(e=>e.type==='activity'&&e.activity.text.includes('再試行'));
  assert.equal(retry.activity.phase,'reading');assert.equal(retry.activity.count,null);
 }finally{f.db.close();}
});

test('Jevの再試行を使い切ったら仕分けエラーと診断を返し、部分結果を完了・保存させない', {timeout:6000},async t=>{
 const f=fixture();try{
  t.mock.method(console,'error',()=>{});let calls=0;
  const env=envFor(f,async model=>model==='typesafe/jev'?(calls++,new Response(JSON.stringify({error:{code:'server_error',message:'private upstream'}}),{status:503})):stream(extraction()));
  const events=(await lunaJevStream(env,'a',[file],cats,'要確認',signal()).text()).trim().split('\n').map(JSON.parse);
  assert.equal(calls,3);assert.ok(!events.some(e=>e.type==='complete'));
  assert.ok(events.some(e=>e.type==='activity'&&e.activity.text.includes('再試行')));
  const failure=events.at(-1);assert.equal(failure.code,'upstream');assert.match(failure.error,/費目の仕分け中/);
  assert.deepEqual(failure.diagnostics.failure,{model:'jev',stage:'response',http_status:503,provider_code:'server_error',attempt:3,source:{file:1,page:1,row:1}});
  assert.equal(failure.diagnostics.classification.retries,2);assert.equal(failure.diagnostics.classification.evaluated,0);
  assert.ok(!JSON.stringify(failure).includes('private upstream'));
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM card_statements').get().n,0);
 }finally{f.db.close();}
});

test('途中失敗でも要確認の集計・スコア範囲を診断に残し、店名や自由文を漏らさない',{timeout:2000},async t=>{
 const f=fixture();try{
  const logs=[];t.mock.method(console,'error',value=>logs.push(value));let calls=0,reviewed=0,release;
  const twoReviews=new Promise(resolve=>release=resolve);
  const env=envFor(f,async model=>{
   if(model!=='typesafe/jev')return stream(extraction([source,{...source,row:2,context:'食品',excerpt:'スーパー 食品'},{...source,row:3}]));
   const index=++calls;if(index<3)return {result:decision(index===1?.79:.78,.71)};
   await twoReviews;return new Response(JSON.stringify({error:{code:'秘密の店名',message:'秘密の明細'}}),{status:400});
  });
  await assert.rejects(runLunaJev(env,'a',[file],cats,'要確認',signal(),event=>{if(event.type==='entry_update'&&event.entry.import_meta.status==='review'&&++reviewed===2)release();}),error=>{
   const d=error.diagnostics;assert.equal(d.failure.model,'jev');assert.equal(d.failure.http_status,400);assert.equal(d.failure.provider_code,'unrecognized');
   assert.deepEqual(d.classification,{evaluated:2,classified:0,review:2,low_confidence:2,low_evidence:2,missing_merchant:0,missing_purchase_context:0,with_purchase_context:1,retries:0,confidence_min:.78,confidence_max:.79,noul_min:.71,noul_max:.71});
   const text=JSON.stringify(d);for(const privateValue of ['秘密','スーパー','食費',source.excerpt])assert.ok(!text.includes(privateValue));return true;
  });assert.equal(calls,3);
 }finally{f.db.close();}
});

test('Lunaのストリーム内障害をJevの失敗と区別し、画像全体を再送しない',{timeout:2000},async t=>{
 const f=fixture();try{
  t.mock.method(console,'error',()=>{});let luna=0,controller;
  const body=new ReadableStream({start(c){controller=c;c.enqueue(delta('{"entries":['+JSON.stringify(source)));}});
  const env=envFor(f,async model=>{if(model==='typesafe/jev')return decision(.79,.71);luna++;return body;});
  await assert.rejects(runLunaJev(env,'a',[file],cats,'要確認',signal(),event=>{
   if(event.type==='entry_update'&&event.entry.import_meta.status==='review'){controller.enqueue(frame({type:'response.failed',response:{error:{code:'server_error',message:'private stream detail'}}}));controller.close();}
  }),error=>{
   assert.deepEqual(error.diagnostics.failure,{model:'luna',stage:'stream',http_status:null,provider_code:'server_error'});
   assert.equal(error.diagnostics.classification.review,1);assert.match(error.message,/明細の読み取り中/);assert.ok(!JSON.stringify(error).includes('private stream detail'));return true;
  });assert.equal(luna,1);
 }finally{f.db.close();}
});

test('接続テストの上流障害は1回だけで診断を返し、HTTPエラーの診断もフロントへ渡す',async()=>{
 const f=fixture();try{
  let calls=0;Object.assign(f.env,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'test',AI:{async run(){calls++;return new Response(JSON.stringify({error:{code:'server_error',message:'private detail'}}),{status:503});}}});
  const report=await (await f.call('owner','/statement/test-jev','POST',{},'a')).json();
  assert.equal(calls,1);assert.equal(report.ok,false);assert.equal(report.diagnostics.failure.model,'jev');assert.equal(report.diagnostics.failure.http_status,503);
  await assert.rejects(receiveStatement(Response.json({error:report.message,code:report.code,diagnostics:report.diagnostics},{status:502}),()=>{},signal()),error=>error.code==='upstream'&&error.diagnostics.failure.http_status===503);
  assert.ok(!JSON.stringify(report).includes('private detail'));
 }finally{f.db.close();}
});

test('Jevの直接形式とresult形式をJSON・charset付きResponse・バイトストリームから同じ基準で分類する',async()=>{
 const f=fixture();try{
  for(const wrapped of [false,true])for(const transport of ['json','response','stream']){
   const raw=wrapped?{result:decision()}:decision();
   const env=envFor(f,async model=>{
    if(model!=='typesafe/jev')return new Response(stream(extraction()),{headers:{'Content-Type':'text/event-stream; charset=utf-8'}});
    if(transport==='json')return raw;
    const response=new Response(JSON.stringify(raw),{headers:{'Content-Type':'application/json; charset=utf-8'}});
    return transport==='stream'?response.body:response;
   });
   const result=await runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{});
   assert.equal(result.entries[0].category,'食費');
   assert.equal(result.entries[0].import_meta.status,'classified');
   const report=await testJevConnection(env,cats.slice(0,2),signal());
   assert.equal(report.ok,true);assert.equal(report.diagnostics.answers,wrapped?'result':'root');
   assert.equal(report.diagnostics.success,null);
  }
 }finally{f.db.close();}
});

test('実応答と同じ13候補のresult形式・confidence 0.78・noul 0.71は接続成功し画像取り込みでは要確認になる',async()=>{
 const f=fixture();try{
  const allowed=[...cats.slice(0,2),...Array.from({length:11},(_,i)=>`診断費目${i+1}`)];
  const raw={result:decision(.78,.71)};
  raw.result.answers.category.probabilities=Object.fromEntries(allowed.map((key,i)=>[key,i===0?.7:.3/12]));
  let jev=0,luna=0;
  const env=envFor(f,async model=>{if(model==='typesafe/jev'){jev++;return raw;}luna++;return stream(extraction());});
  const report=await testJevConnection(env,allowed,signal());
  assert.equal(report.ok,true);assert.equal(jev,1);assert.equal(luna,0);
  assert.equal(report.diagnostics.answers,'result');assert.equal(report.diagnostics.success,null);
  assert.equal(report.diagnostics.confidence,.78);assert.equal(report.diagnostics.noul,.71);
  assert.equal(report.diagnostics.returned_options,13);assert.equal(report.diagnostics.probability_sum,1);
  const image={name:'fixture.png',kind:'image',data:'data:image/png;base64,AA==',size:1};
  const events=(await lunaJevStream(env,'a',[image],[...allowed,'要確認'],'要確認',signal()).text()).trim().split('\n').map(JSON.parse);
  assert.ok(!events.some(event=>event.type==='error'));
  assert.equal(events.at(-1).type,'complete');
  const row=events.at(-1).result.entries[0];
  assert.equal(row.category,'要確認');assert.equal(row.import_meta.status,'review');
  assert.equal(row.import_meta.confidence,.78);assert.equal(row.import_meta.candidates[0].category,'食費');
  assert.equal(luna,1);assert.equal(jev,2); // Connection test plus one decision; review alone never re-reads.
 }finally{f.db.close();}
});

test('result形式でもconfidenceとnoulの閾値を独立に維持し、Amazonの店名だけなら要確認にする',async()=>{
 const f=fixture();try{
  for(const [confidence,noul,title,expected] of [[.85,.9,'スーパー','食費'],[.849,.99,'スーパー','要確認'],[.99,.899,'スーパー','要確認'],[.99,.99,'Amazon','要確認']]){
   const env=envFor(f,async model=>model==='typesafe/jev'?{result:decision(confidence,noul)}:stream(extraction([{...source,title}])));
   const result=await runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{});
   assert.equal(result.entries[0].category,expected);
  }
 }finally{f.db.close();}
});

test('13候補の確率合計0.99・1.01は両形式で有効とし、自動分類の閾値は維持する',async()=>{
 const f=fixture();try{
  const allowed=['食費',...Array.from({length:12},(_,i)=>`架空費目${i+1}`)];
  const scores=[.39,.14,.12,.1,.06,.04,.04,.03,.02,.02,.01,.01,.01];
  for(const sum of [.99,1.01])for(const wrapped of [false,true])for(const [confidence,noul,status] of [[.53,.08,'review'],[.85,.9,'classified']]){
   const raw=decision(confidence,noul);
   raw.answers.category.probabilities=Object.fromEntries(allowed.map((name,i)=>[name,i===0?(sum===.99?.39:.41):scores[i]]));
   const env=envFor(f,async model=>model==='typesafe/jev'?(wrapped?{result:raw}:raw):stream(extraction()));
   const report=await testJevConnection(env,allowed,signal());
   assert.equal(report.ok,true);assert.equal(report.diagnostics.probability_sum,sum);assert.equal(report.diagnostics.probability_sum_valid,true);
   const result=await runLunaJev(env,'a',[file],[...allowed,'要確認'],'要確認',signal(),()=>{});
   const row=result.entries[0];
   assert.equal(row.import_meta.status,status);assert.equal(row.category,status==='review'?'要確認':'食費');
   assert.equal(row.import_meta.confidence,confidence);assert.equal(row.import_meta.noul,noul);
   assert.deepEqual(row.import_meta.review_causes,status==='review'?['low_confidence','low_evidence']:[]);
   assert.ok(!JSON.stringify(report.diagnostics).includes('架空費目'));
  }
 }finally{f.db.close();}
});

test('確率合計の許容差を実際に超えた応答は、診断表示が0.99・1.01に丸まっても拒否する',async()=>{
 const f=fixture();try{
  for(const wrapped of [false,true])for(const sum of [.98,.9899999999,1.0100000001,1.02]){
   const raw=decision();raw.answers.category.probabilities={食費:.7,日用品費:sum-.7};
   const env=envFor(f,async model=>model==='typesafe/jev'?(wrapped?{result:raw}:raw):stream(extraction()));
   const report=await testJevConnection(env,cats.slice(0,2),signal());
   assert.equal(report.ok,false);assert.equal(report.diagnostics.probability_sum_valid,false);
   await assert.rejects(runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{}),error=>error.code==='classification_result'&&error.diagnostics.probability_sum_valid===false);
  }
 }finally{f.db.close();}
});

test('両形式で欠けた項目・不正な分布・明示的な失敗を拒否し、別形式や混在を推測で救済しない',async t=>{
 const f=fixture();try{
  const changed=mutate=>{const raw=decision();mutate(raw);return raw;};
  const invalidAnswers=[
   ['answers欠落',{}],['answers配列',{answers:[]}],
   ['category欠落',changed(r=>delete r.answers.category)],
   ['sufficient欠落',changed(r=>delete r.answers.sufficient)],
   ['confidence欠落',changed(r=>delete r.answers.category.confidence)],
   ['noul欠落',changed(r=>delete r.answers.sufficient.noul)],
   ['confidence範囲外',decision(1.01)],['noul範囲外',decision(.99,-.01)],
   ['confidence非数',decision(NaN)],['noul非有限',decision(.99,Infinity)],
   ['確率範囲外',changed(r=>r.answers.category.probabilities={食費:99,日用品費:1})],
   ['確率合計不一致',changed(r=>r.answers.category.probabilities={食費:.6,日用品費:.1})],
   ['候補欠落',changed(r=>delete r.answers.category.probabilities.日用品費)],
   ['未知候補に置換',changed(r=>r.answers.category.probabilities={食費:.99,未知:.01})],
   ['候補追加',changed(r=>r.answers.category.probabilities.未知=0)],
   ['選択が最大でない',changed(r=>r.answers.category.choice='日用品費')],
   ['未知の選択',changed(r=>r.answers.category.choice='未知')],
   ['確率が文字列',changed(r=>r.answers.category.probabilities.食費='0.99')],
   ['success失敗',changed(r=>r.success=false)],
   ['error失敗',changed(r=>r.error={message:'private provider detail'})],
   ['errors失敗',changed(r=>r.errors=[{message:'private provider detail'}])]
  ];
  const invalid=[...invalidAnswers.flatMap(([name,raw])=>[[`直接:${name}`,raw],[`result:${name}`,{result:raw}]]),
   ['外側success失敗',{success:false,result:decision()}],
   ['外側error失敗',{error:{message:'private provider detail'},result:decision()}],
   ['外側errors失敗',{errors:[{message:'private provider detail'}],result:decision()}],
   ['response形式',{response:decision()}],['data形式',{data:decision()}],
   ['result二重',{result:{result:decision()}}],['result配列',{result:[decision()]}],
   ['両形式の混在',{...decision(),result:decision()}],
   ['不正な直接形式をresultで救済しない',{answers:null,result:decision()}],
   ['不正なresult形式を直接形式で救済しない',{...decision(),result:null}],
   ['null',null],['配列',[decision()]]
  ];
  for(const [name,raw] of invalid)await t.test(name,async()=>{
   const env=envFor(f,async model=>model==='typesafe/jev'?raw:stream(extraction()));
   const report=await testJevConnection(env,cats.slice(0,2),signal());assert.equal(report.ok,false);
   await assert.rejects(runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{}),error=>{
    assert.equal(error.code,'classification_result');assert.deepEqual(answerDiagnostics(error.diagnostics),answerDiagnostics(report.diagnostics));
    assert.equal(error.diagnostics.failure.model,'jev');assert.equal(error.diagnostics.classification.evaluated,0);
    assert.ok(!JSON.stringify(error).includes('private provider detail'));return true;
   });
  });
  for(const raw of [{...decision(),success:true,error:null,errors:[]},{success:true,error:null,errors:[],result:{...decision(),success:true,errors:[]}}]){
   const env=envFor(f,async model=>model==='typesafe/jev'?raw:stream(extraction()));
   assert.equal((await testJevConnection(env,cats.slice(0,2),signal())).ok,true);
   assert.equal((await runLunaJev(env,'a',[file],cats,'要確認',signal(),()=>{})).entries[0].category,'食費');
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
   const result={confirmed_total:0,entries:[{spent_on:source.spent_on,title:source.title,amount:source.amount,category:'食費'}]};
   return input.stream?stream(result):new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:input.text?JSON.stringify(result):'食費が100円です。'}]}]}),{headers:{'Content-Type':'application/json; charset=utf-8'}});
  }}});
  const response=await f.call('owner','/statement/analyze','POST',{mode:'live',files:[file]},'a');assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).entries[0].category,'食費');
  f.db.exec("INSERT INTO shared_cards(id,name,active,space_id) VALUES('c','カード',1,'a'); INSERT INTO card_statements(id,card_id,due_month,title,confirmed_total,space_id) VALUES('s','c','2026-09','明細',100,'a'); INSERT INTO card_entries(id,statement_id,spent_on,title,category,amount,space_id) VALUES('e','s','2026-09-01','スーパー','食費',100,'a');");
  const report=await f.call('owner','/report/comment','POST',{mode:'live',month:'2026-09'},'a');assert.equal(report.status,200,await report.clone().text());assert.equal((await report.json()).comment,'食費が100円です。');
  assert.ok(!models.includes('typesafe/jev'));assert.equal(models.filter(m=>m==='openai/gpt-6-luna').length,2);
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

test('診断は応答の包み・型・候補数・分布を区別し、入力や自由文字列を返さない',()=>{
 const raw=decision(),allowed=cats.slice(0,2);
 const good=jevDiagnostics(raw,allowed);assert.equal(good.answers,'root');assert.equal(good.probability_sum,1);assert.equal(good.missing_options,0);assert.equal(good.choice_is_max,true);
 const wrapped=jevDiagnostics({result:raw,private:'秘密の購入内容'},allowed);assert.equal(wrapped.answers,'result');
 const bad=jevDiagnostics({answers:{category:{type:'秘密の本文',choice:'秘密の店名',confidence:'secret',probabilities:{秘密の費目:1.2}},sufficient:{type:'noul',noul:true}}},allowed);
 assert.equal(bad.choice_matches,false);assert.equal(bad.confidence_type,'string');assert.equal(bad.unknown_options,1);assert.equal(bad.missing_options,2);assert.equal(bad.values_valid,false);assert.equal(bad.noul_type,'boolean');
 assert.ok(!JSON.stringify([wrapped,bad]).includes('秘密'));assert.ok(!JSON.stringify(bad).includes('secret'));
 assert.doesNotThrow(()=>jevDiagnostics(null,allowed));assert.doesNotThrow(()=>jevDiagnostics('private',allowed));
});

test('ステージングの接続テストはサンプルでJevだけ1回呼び、データを保存せず本番と他スペースを拒否する',async()=>{
 const f=fixture();try{
  let calls=0,wrapped=false;Object.assign(f.env,{AI_IMPORT_PROVIDER:'cloudflare',AI_GATEWAY_ID:'test',AI:{async run(model,input){
   calls++;assert.equal(model,'typesafe/jev');assert.deepEqual(input.state,{merchant:'診断用スーパー',purchase_context:'食品'});
   const keys=Object.keys(input.questions.category.criteria);
   const raw={answers:{category:{type:'choice',choice:keys[0],confidence:.78,probabilities:Object.fromEntries(keys.map((k,i)=>[k,i===0?1:0]))},sufficient:{type:'noul',noul:.71}}};
   return wrapped?{result:raw}:raw;
  }}});
  for(wrapped of [false,true]){
   const before=calls,response=await f.call('owner','/statement/test-jev','POST',{files:['private statement']},'a');
   assert.equal(response.status,200);const report=await response.json();assert.equal(report.ok,true);
   assert.equal(report.diagnostics.answers,wrapped?'result':'root');assert.equal(calls,before+1);
   assert.ok(!JSON.stringify(report).includes('private statement'));assert.ok(!JSON.stringify(report).includes('診断用スーパー'));
  }
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM classification_history').get().n,0);assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM card_statements').get().n,0);
  assert.equal((await f.call('b','/statement/test-jev','POST',{},'a')).status,404);assert.equal(calls,2);
  f.env.APP_ENV='production';assert.equal((await f.call('owner','/statement/test-jev','POST',{},'a')).status,404);assert.equal(calls,2);
 }finally{f.db.close();}
});

test('実取り込みの仕分けエラーでも変換前の安全な診断を渡し、ログや診断に入力・生応答を漏らさない',async t=>{
 const f=fixture();try{
  const logs=[];t.mock.method(console,'error',text=>logs.push(text));
  const raw={result:decision(),private:'secret upstream',merchant:'秘密の店名',statement:'秘密の明細'};
  raw.result.answers.category.probabilities={食費:.4,日用品費:.1};
  const env=envFor(f,async model=>model==='typesafe/jev'?raw:stream(extraction()));
  const report=await testJevConnection(env,cats.slice(0,2),signal());assert.equal(report.ok,false);
  const response=lunaJevStream(env,'a',[file],cats,'要確認',signal());
  await assert.rejects(receiveStatement(response,()=>{},signal()),error=>{
   assert.equal(error.diagnostics.answers,'result');assert.equal(error.diagnostics.probability_sum,.5);
   assert.deepEqual(answerDiagnostics(error.diagnostics),answerDiagnostics(report.diagnostics));return true;
  });
  assert.equal(logs.length,1);assert.deepEqual(answerDiagnostics(JSON.parse(logs[0]).diagnostics),answerDiagnostics(report.diagnostics));
  const exposed=JSON.stringify([logs,report]);
  for(const privateValue of ['secret upstream','秘密','スーパー','食費','日用品費',source.excerpt,JSON.stringify(raw)])assert.ok(!exposed.includes(privateValue));
 }finally{f.db.close();}
});
