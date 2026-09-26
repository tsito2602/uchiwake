import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { demoImportResult, importPause, runStatementImport } from '../src/statement-import-flow.ts';

test('デモは選択月の15件を順に仕分け、10秒間のプレビュー後に一致する合計を返す',async()=>{
  const frames=[],waits=[];
  const sample=demoImportResult('2026-10');
  const result=await runStatementImport({demo:true,signal:new AbortController().signal,
    analyze:async()=>sample,onProgress:progress=>frames.push(progress),pause:async ms=>{waits.push(ms);}});
  assert.deepEqual(frames.map(frame=>[frame.phase,frame.entries.length]),[['reading',0],...Array.from({length:15},(_,i)=>['sorting',i+1]),...Array.from({length:16},()=>['checking',15])]);
  assert.ok(Math.abs(waits.reduce((sum,ms)=>sum+ms,0)-10000)<.001);
  assert.equal(frames.at(-1).checkedCount,15);
  assert.equal(frames.at(-1).checkedTotal,result.confirmed_total);
  assert.ok(result.entries.every(entry=>entry.spent_on.startsWith('2026-10-')));
  assert.equal(result.entries.reduce((sum,entry)=>sum+entry.amount,0),result.confirmed_total);
  assert.ok(frames.every(frame=>frame.demo));
});

test('実AIの応答が来るまで架空の明細・件数を表示せず、返金もそのまま扱う',async()=>{
  const frames=[];let resolve;
  const result={confirmed_total:800,entries:[{title:'書店',spent_on:'2026-08-01',amount:1000,category:'その他・要確認'},{title:'返金',spent_on:'2026-08-02',amount:-200,category:'その他・要確認'}]};
  const running=runStatementImport({demo:false,signal:new AbortController().signal,
    analyze:()=>new Promise(done=>{resolve=done;}),onProgress:progress=>frames.push(progress),pause:async()=>{}});
  assert.deepEqual(frames,[{phase:'reading',entries:[],count:0,demo:false}]);
  resolve(result);
  assert.equal(await running,result);
  assert.deepEqual(frames.at(-1).entries,result.entries);
});

test('読み取り中に中止した結果は確認画面に渡さない',async()=>{
  const controller=new AbortController(),frames=[];let resolve;
  const running=runStatementImport({demo:false,signal:controller.signal,
    analyze:()=>new Promise(done=>{resolve=done;}),onProgress:progress=>frames.push(progress),pause:async()=>{}});
  controller.abort();resolve(demoImportResult('2026-09'));
  await assert.rejects(running,{name:'AbortError'});
  assert.equal(frames.length,1);
});

test('仕分け演出中に中止した場合も後続の行や結果を表示しない',async()=>{
  const controller=new AbortController(),frames=[];
  await assert.rejects(runStatementImport({demo:true,signal:controller.signal,
    analyze:async()=>demoImportResult('2026-09'),onProgress:progress=>{frames.push(progress);if(progress.phase==='sorting')controller.abort();},pause:async(_ms,signal)=>signal.throwIfAborted()}),{name:'AbortError'});
  assert.deepEqual(frames.map(frame=>frame.phase),['reading','sorting']);
});

test('AIエラーはそのまま返し、動きを減らす設定では演出の待機を行わない',async()=>{
  const error=new Error('読み取りに失敗');const frames=[];
  await assert.rejects(runStatementImport({demo:false,signal:new AbortController().signal,analyze:async()=>{throw error;},onProgress:frame=>frames.push(frame)}),error);
  assert.equal(frames.length,1);
  const result=await runStatementImport({demo:true,reducedMotion:true,signal:new AbortController().signal,analyze:async()=>demoImportResult('2026-09'),onProgress:()=>{},pause:async()=>assert.fail('reduced motion must not wait')});
  assert.equal(result.entries.length,15);
});

test('演出のタイマーは中止ですぐ終了し、0件の読み取りでも停止しない',async()=>{
  const controller=new AbortController();
  const waiting=importPause(10_000,controller.signal);controller.abort();
  await assert.rejects(waiting,{name:'AbortError'});
  const result=await runStatementImport({demo:false,signal:new AbortController().signal,analyze:async()=>({confirmed_total:0,entries:[]}),onProgress:()=>{},pause:async()=>{}});
  assert.equal(result.entries.length,0);
});
