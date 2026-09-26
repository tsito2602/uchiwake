import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {build} from 'esbuild';
import app from '../dist/worker.mjs';
import {runStatementImport} from '../src/statement-import-flow.ts';
const {outputFiles}=await build({stdin:{contents:`export {receiveStatement} from './src/statement-import-stream';export {StatementDecoder,statementStream} from './worker/statement-stream';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {receiveStatement,StatementDecoder,statementStream}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const entry={title:'スーパー「日本」 } ] \\"',spent_on:'2026-09-01',category:'食費',amount:1500};
const second={title:'返金',spent_on:'',category:'食費',amount:-200};
const result={confirmed_total:1300,entries:[entry,second]};
const encoder=new TextEncoder();
const frame=event=>`event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
const delta=text=>frame({type:'response.output_text.delta',delta:text});
const done=frame({type:'response.completed',response:{status:'completed'}});
const env={APP_PASSWORD:'pw',APP_ENV:'staging',OPENAI_MODEL:'test-model',OPENAI_API_KEY:'test-key',DB:{prepare(){return{async all(){return {results:[]};}};}}};
const request=(extra={})=>new Request('https://example.test/api/statement/analyze',{method:'POST',headers:{Authorization:'Basic '+btoa('guest:pw'),'Content-Type':'application/json'},body:JSON.stringify({mode:'live',stream:true,images:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X9sAAAAASUVORK5CYII='],...extra})});

test('完了通知の後は通信のcancelが戻らなくても結果を表示する',{timeout:1000},async()=>{
  let cancelled=false;
  const body=new ReadableStream({start(c){c.enqueue(encoder.encode(JSON.stringify({type:'complete',result})+'\n'));},cancel(){cancelled=true;return new Promise(()=>{});}});
  const response=new Response(body,{headers:{'Content-Type':'application/x-ndjson'}});
  assert.deepEqual(await receiveStatement(response,()=>{},new AbortController().signal),result);
  assert.equal(cancelled,true);
});

test('AI完了後も上流接続が閉じなくても、結果を返して後片付けする',{timeout:1000},async()=>{
  let cancelled=false,cleaned=false;
  const upstream=new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(delta(JSON.stringify(result))+done));},cancel(){cancelled=true;return new Promise(()=>{});}}));
  const controller=new AbortController();
  const response=statementStream(upstream,['食費'],controller,()=>{cleaned=true;});
  assert.deepEqual(await receiveStatement(response,()=>{},new AbortController().signal),result);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(cancelled,true);assert.equal(cleaned,true);assert.equal(controller.signal.aborted,true);
});

test('受信が途絶えたら途中結果を保存に渡さず、cancelが応答しなくても中断する',{timeout:1000},async()=>{
  for(const cancel of [()=>{},()=>new Promise(()=>{})]){
    const response=new Response(new ReadableStream({start(c){c.enqueue(encoder.encode(JSON.stringify({type:'entry',entry})+'\n'));},cancel}),{headers:{'Content-Type':'application/x-ndjson'}});
    const entries=[];
    await assert.rejects(receiveStatement(response,e=>entries.push(e),new AbortController().signal,10),/応答が途絶えた/);
    assert.deepEqual(entries,[entry]);
  }
});

test('AIから応答が止まったらエラーを送り、読取中を終える',{timeout:1000},async()=>{
  let cleaned=false;
  const controller=new AbortController();
  const response=statementStream(new Response(new ReadableStream({start(){},cancel(){return new Promise(()=>{});}})),['食費'],controller,()=>{cleaned=true;},'要確認',10);
  await assert.rejects(receiveStatement(response,()=>{},new AbortController().signal),/応答が途絶えた/);
  assert.equal(controller.signal.aborted,true);assert.equal(cleaned,true);
});

test('応答が届く間は処理の合計時間が長くても打ち切らない',{timeout:2000},async()=>{
  let source;
  const upstream=new Response(new ReadableStream({start(c){source=c;}}));
  const response=statementStream(upstream,['食費'],new AbortController(),()=>{},'要確認',80);
  const receiving=receiveStatement(response,()=>{},new AbortController().signal);
  for(const chunk of ['{"entries":[',JSON.stringify(entry),','+JSON.stringify(second),'],"confirmed_total":1300}']){
    await new Promise(resolve=>setTimeout(resolve,30));
    source.enqueue(encoder.encode(delta(chunk)));
  }
  source.enqueue(encoder.encode(done));source.close();
  assert.deepEqual(await receiving,result);
});

test('未完成の行は出さず、引用符や括弧を含む店名・返金を任意の分割位置で復元する',()=>{
  const text=JSON.stringify(result);
  for(let split=0;split<=text.length;split++){
    const decoder=new StatementDecoder(['食費']);
    const entries=[...decoder.append(text.slice(0,split)),...decoder.append(text.slice(split))];
    assert.deepEqual(entries,result.entries);
    assert.deepEqual(decoder.finish(),result);
  }
  const decoder=new StatementDecoder(['食費']);
  const entries=[];
  for(const char of text)entries.push(...decoder.append(char));
  assert.deepEqual(entries,result.entries);
  const many={entries:Array(120).fill(entry),confirmed_total:180000};
  const large=new StatementDecoder(['食費']);
  assert.equal(large.append(JSON.stringify(many)).length,120);
  assert.deepEqual(large.finish(),many);
});

test('AI完了前に1件目が画面へ届き、APIは1回・実取り込みの待機演出はゼロ',async()=>{
  const original=globalThis.fetch;
  let upstream,calls=0,upstreamSignal,requestBody;
  globalThis.fetch=async(_url,options)=>{
    calls++;requestBody=JSON.parse(options.body);upstreamSignal=options.signal;
    return new Response(new ReadableStream({start(controller){upstream=controller;}}));
  };
  try{
    const response=await app.fetch(request(),env);
    assert.equal(response.status,200);
    assert.match(response.headers.get('Content-Type'),/ndjson/);
    let firstReady;const first=new Promise(resolve=>{firstReady=resolve;});
    const frames=[];let finished=false;
    const running=runStatementImport({demo:false,signal:new AbortController().signal,onProgress:p=>{frames.push(p);if(p.entries.length===1)firstReady();},pause:async()=>assert.fail('live must not add artificial delay'),analyze:onEntry=>receiveStatement(response,onEntry,new AbortController().signal)}).then(r=>{finished=true;return r;});
    const prefix='{"confirmed_total":1300,"entries":['+JSON.stringify(entry);
    // Split even inside UTF-8 characters and SSE delimiters.
    for(const byte of encoder.encode(delta(prefix)))upstream.enqueue(Uint8Array.of(byte));
    await first;
    assert.equal(finished,false);
    assert.deepEqual(frames.at(-1).entries,[entry]);
    assert.equal(frames.at(-1).count,null);
    upstream.enqueue(encoder.encode(delta(','+JSON.stringify(second)+']}')+done));
    assert.deepEqual(await running,result);
    assert.equal(calls,1);assert.equal(requestBody.stream,true);
    assert.equal(requestBody.text.format.strict,true);
    assert.equal('max_output_tokens' in requestBody,false);
    assert.equal(upstreamSignal.aborted,true);
  }finally{globalThis.fetch=original;}
});

test('切断・拒否・出力上限・不正JSONを完了扱いにせず、部分結果を保存画面へ渡さない',async()=>{
  const original=globalThis.fetch;
  try{
    for(const tail of ['',frame({type:'response.incomplete'}),frame({type:'response.refusal.delta',delta:'拒否'}),done]){
      globalThis.fetch=async()=>new Response(new ReadableStream({start(controller){controller.enqueue(encoder.encode(delta('{"entries":['+JSON.stringify(entry))+tail));controller.close();}}));
      const response=await app.fetch(request(),env);
      const seen=[];
      await assert.rejects(receiveStatement(response,e=>seen.push(e),new AbortController().signal),/受信/);
      assert.equal(seen.length,1);
    }
  }finally{globalThis.fetch=original;}
});

test('画面で中止するとCloudflareからAIへの接続も中止する',async()=>{
  const original=globalThis.fetch;let signal;
  globalThis.fetch=async(_url,options)=>{signal=options.signal;return new Response(new ReadableStream({start(){}}));};
  try{
    const response=await app.fetch(request(),env);
    const controller=new AbortController();
    const running=receiveStatement(response,()=>assert.fail('no entry expected'),controller.signal);
    controller.abort();
    await assert.rejects(running,{name:'AbortError'});
    assert.equal(signal.aborted,true);
  }finally{globalThis.fetch=original;}
});

test('上流のHTTPエラーはJSONエラーとして返し、再リクエストしない',async()=>{
  const original=globalThis.fetch;let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response('private error detail',{status:429});};
  try{
    const response=await app.fetch(request(),env);
    assert.equal(response.status,502);
    await assert.rejects(receiveStatement(response,()=>{},new AbortController().signal),/リクエスト制限/);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

test('ステージングはSolとLunaをリクエストごとに選べ、ストリームと一括受信で同じモデルを使う',async()=>{
  const original=globalThis.fetch;const called=[];
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);called.push(body.model);assert.equal('max_output_tokens' in body,false);
    return body.stream?new Response(delta(JSON.stringify(result))+done):Response.json({output:[{content:[{type:'output_text',text:JSON.stringify(result)}]}]});
  };
  try{
    for(const stream of [true,false])for(const model of ['gpt-6-luna','gpt-6-sol']){
      const response=await app.fetch(request({model,stream}),env);
      assert.equal(response.status,200);
      const value=stream?await receiveStatement(response,()=>{},new AbortController().signal):await response.json();
      assert.deepEqual(value,result);
      assert.equal(called.at(-1),model);
    }
    const response=await app.fetch(request({stream:false}),{...env,APP_ENV:'production'});
    await response.json();assert.equal(called.at(-1),env.OPENAI_MODEL);
  }finally{globalThis.fetch=original;}
});

test('本番のモデル上書きと選択肢外のモデルはAIへ送信する前に拒否する',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('must not call AI');
  try{
    for(const model of ['gpt-6-sol','gpt-6-luna'])assert.equal((await app.fetch(request({model}),{...env,APP_ENV:'production'})).status,400);
    for(const model of ['unknown','',null,7])assert.equal((await app.fetch(request({model}),env)).status,400);
  }finally{globalThis.fetch=original;}
});


test('4枚以上・1枚4MB超・合計18MB超の画像を省略せずAIへ渡す',async()=>{
  const original=globalThis.fetch;
  const bytes=Buffer.alloc(4_000_001);
  bytes.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const image='data:image/png;base64,'+bytes.toString('base64');
  const images=Array(4).fill(image);
  let calls=0;
  globalThis.fetch=async(_url,options)=>{
    calls++;
    const body=JSON.parse(options.body);
    assert.deepEqual(body.input[0].content.filter(part=>part.type==='input_image').map(part=>part.image_url),images);
    assert.doesNotMatch(body.input[0].content[0].text,/最大3枚/);
    return new Response(delta(JSON.stringify(result))+done);
  };
  try{
    const req=request({images});
    req.headers.set('Content-Length',String(Buffer.byteLength(JSON.stringify({images}))));
    assert.ok(Number(req.headers.get('Content-Length'))>18_000_000);
    const response=await app.fetch(req,env);
    assert.equal(response.status,200);
    assert.deepEqual(await receiveStatement(response,()=>{},new AbortController().signal),result);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

test('枚数・容量制限を外しても空選択・非対応形式・不正な画像はAIに送らない',async()=>{
  const original=globalThis.fetch;
  globalThis.fetch=async()=>assert.fail('invalid image must not call AI');
  try{
    for(const images of [[],['data:image/gif;base64,R0lGODlh'],['data:image/png;base64,aGVsbG8='],['data:image/png;base64,iVBORw==='],['data:image/png;base64,iVBORw==AA'],['data:image/png;base64,iVBORw0KGgoA!'],['data:image/webp;base64,UklGRgAAAAAAAAAA']]){
      assert.equal((await app.fetch(request({images}),env)).status,400);
    }
  }finally{globalThis.fetch=original;}
});


test('50件・200KBを超える結果と大きな最終イベントも全件受信できる',async()=>{
  const original=globalThis.fetch;
  const many={entries:Array.from({length:4000},(_,i)=>({...entry,title:String(i)+'店'.repeat(95)})),confirmed_total:6000000};
  const text=JSON.stringify(many);
  assert.ok(text.length>500_000);
  globalThis.fetch=async()=>{
    const chunks=[];
    for(let i=0;i<text.length;i+=8192)chunks.push(delta(text.slice(i,i+8192)));
    chunks.push(frame({type:'response.completed',response:{status:'completed',output:[{content:[{type:'output_text',text}]}]}}));
    return new Response(chunks.join(''));
  };
  try{
    let received=0;
    const response=await app.fetch(request(),env);
    const value=await receiveStatement(response,()=>received++,new AbortController().signal);
    assert.equal(received,4000);
    assert.deepEqual(value,many);
  }finally{globalThis.fetch=original;}
});

test('失敗理由を区別し、途中結果を成功にせず、画像や上流メッセージをログに出さない',async()=>{
  const original=globalThis.fetch,originalError=console.error;
  const logs=[];console.error=value=>logs.push(JSON.parse(value));
  const privateText='private screenshot or API key content';
  const cases=[
    [{type:'response.incomplete',response:{incomplete_details:{reason:'max_output_tokens'}}},'output_limit','出力上限'],
    [{type:'response.incomplete',response:{incomplete_details:{reason:'content_filter'}}},'content_filter','中断'],
    [{type:'response.refusal.delta',delta:privateText},'refusal','応じなかった'],
    [{type:'error',code:'insufficient_quota',message:privateText},'quota','利用枠'],
    [{type:'response.failed',response:{error:{code:'rate_limit_exceeded',message:privateText}}},'rate_limit','リクエスト制限'],
    [{type:'error',code:privateText,message:privateText},'upstream','AI側'],
    [null,'disconnected','接続が途中で切れた'],
    [{type:'response.completed',response:{status:'completed'}},'invalid_result','形式']
  ];
  try{
    for(const [event,code,message] of cases){
      globalThis.fetch=async()=>new Response(delta('{"entries":['+JSON.stringify(entry))+(event?frame(event):''));
      const response=await app.fetch(request(),env);
      await assert.rejects(receiveStatement(response,()=>{},new AbortController().signal),error=>error.message.includes(message));
      assert.equal(logs.at(-1).code,code);
      assert.equal(logs.at(-1).received_entries,1);
    }
    assert.ok(!JSON.stringify(logs).includes(privateText));
    assert.ok(!JSON.stringify(logs).includes(entry.title));
  }finally{globalThis.fetch=original;console.error=originalError;}
});

test('不明な費目の受信はその他ではなく要確認にし、改名された要確認にも対応する',()=>{
 for(const review of ['要確認','確認待ち']){
  const decoder=new StatementDecoder(['食費','その他',review],review);
  const rows=[{...entry,category:'不明なカテゴリ'}, {...second,category:'その他'}];
  const text=JSON.stringify({entries:rows,confirmed_total:1300});
  assert.deepEqual(decoder.append(text).map(row=>row.category),[review,'その他']);
  assert.deepEqual(decoder.finish().entries.map(row=>row.category),[review,'その他']);
 }
});
