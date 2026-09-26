import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {build} from 'esbuild';
import app from '../dist/worker.mjs';
import {runStatementImport} from '../src/statement-import-flow.ts';
const {outputFiles}=await build({stdin:{contents:`export {receiveStatement} from './src/statement-import-stream';export {StatementDecoder} from './worker/statement-stream';`,resolveDir:new URL('../',import.meta.url).pathname},bundle:true,write:false,format:'esm',platform:'node'});
const {receiveStatement,StatementDecoder}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const entry={title:'スーパー「日本」 } ] \\"',spent_on:'2026-09-01',category:'食費',amount:1500};
const second={title:'返金',spent_on:'',category:'食費',amount:-200};
const result={confirmed_total:1300,entries:[entry,second]};
const encoder=new TextEncoder();
const frame=event=>`event: ${event.type}\r\ndata: ${JSON.stringify(event)}\r\n\r\n`;
const delta=text=>frame({type:'response.output_text.delta',delta:text});
const done=frame({type:'response.completed',response:{status:'completed'}});
const env={APP_PASSWORD:'pw',APP_ENV:'staging',OPENAI_MODEL:'test-model',OPENAI_API_KEY:'test-key',DB:{prepare(){return{async all(){return {results:[]};}};}}};
const request=(extra={})=>new Request('https://example.test/api/statement/analyze',{method:'POST',headers:{Authorization:'Basic '+btoa('guest:pw'),'Content-Type':'application/json'},body:JSON.stringify({mode:'live',stream:true,...extra,images:['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/X9sAAAAASUVORK5CYII=']})});

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
  assert.throws(()=>new StatementDecoder(['食費']).append(JSON.stringify({entries:Array(51).fill(entry)})));
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
    await assert.rejects(receiveStatement(response,()=>{},new AbortController().signal),/読み取れません/);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;}
});

test('ステージングはSolとLunaをリクエストごとに選べ、ストリームと一括受信で同じモデルを使う',async()=>{
  const original=globalThis.fetch;const called=[];
  globalThis.fetch=async(_url,options)=>{
    const body=JSON.parse(options.body);called.push(body.model);
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
