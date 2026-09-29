import type { EntryDraft } from './domain';
import type { ImportResult, ImportEvent } from './statement-import-flow';
import type { StatementFile } from './statement-files';
import { streamLines } from './streaming/lines';
import { abortable, idleWatch, ImportIdleError, CLIENT_IDLE_MS } from './streaming/idle';
import { runImportPipeline } from './ai-import-pipeline';
import { ImportError } from './import-errors';

export async function receiveStatement(response:Response,onEntry:(entry:EntryDraft)=>void,signal:AbortSignal,idleMs=CLIENT_IDLE_MS,onReasoning?:(text:string)=>void,onEvent?:(event:ImportEvent)=>void,onRetry?:(attempt:number)=>void):Promise<ImportResult> {
  if(!response.ok){
    const timeout=new AbortController();
    const watch=idleWatch(()=>timeout.abort(new ImportIdleError()),idleMs);
    const combined=AbortSignal.any([signal,timeout.signal]);
    const data=await abortable(response.json(),combined).catch(error=>{combined.throwIfAborted();return null;}).finally(()=>watch.clear()) as {error?:string;code?:string;diagnostics?:unknown}|null;
    throw Object.assign(new Error(data?.error||'明細を読み取れませんでした'),{code:data?.code},data?.diagnostics?{diagnostics:data.diagnostics}:{});
  }
  if(!response.body||!response.headers.get('Content-Type')?.includes('application/x-ndjson'))throw new Error('明細の受信形式を確認できませんでした');
  for await(const line of streamLines(response.body,signal,idleMs)){
    if(!line.trim())continue;
    const event=JSON.parse(line);
    if(event.type==='entry')onEntry(event.entry);
    else if(event.type==='reasoning'&&typeof event.text==='string'&&event.text.trim())onReasoning?.(event.text);
    else if(event.type==='entry_update'||event.type==='replace'||event.type==='status'||event.type==='activity')onEvent?.(event);
    else if(event.type==='retry'&&(event.attempt===2||event.attempt===3))onRetry?.(event.attempt);
    else if(event.type==='error')throw Object.assign(new Error(event.error||'明細の受信に失敗しました'),{code:event.code},event.diagnostics?{diagnostics:event.diagnostics}:{});
    else if(event.type==='complete')return event.result as ImportResult;
  }
  throw new Error('受信が途中で切れました。もう一度取り込んでください。');
}

export async function streamStatement(files:StatementFile[],signal:AbortSignal,onEntry:(entry:EntryDraft)=>void,onReasoning?:(text:string)=>void,spaceId?:string,onEvent?:(event:ImportEvent)=>void,pipeline:'luna'|'split'='luna'):Promise<ImportResult> {
  const startedAt=performance.now();
  const controller=new AbortController();
  const abort=()=>controller.abort(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  const request=async(path:string,body:unknown,requestSignal:AbortSignal)=>{
    const timeout=new AbortController();
    const watch=idleWatch(()=>timeout.abort(new ImportIdleError()),CLIENT_IDLE_MS);
    const combined=AbortSignal.any([requestSignal,timeout.signal]);
    try{
      const response=await abortable(fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(spaceId?{'X-Space-Id':spaceId}:{})},cache:'no-store',signal:combined,body:JSON.stringify(body)}),combined);
      if(response.status===401)window.dispatchEvent(new Event('uchiwake:session-expired'));
      return response;
    }finally{watch.clear();}
  };
  const extractRequest=(recheck:string|undefined,requestSignal:AbortSignal)=>request('/api/statement/analyze',{files,mode:'live',stream:true,pipeline,...(recheck?{recheck}:{})},requestSignal);
  try {
    onReasoning?.(`${files.length}ファイルを送信して、読み取りを開始しています…`);
    const response=await extractRequest(undefined,controller.signal);
    // Preserve the direct OpenAI provider and older deployed Worker protocol.
    const engine=response.headers.get('X-Import-Pipeline');
    if(engine!=='split'&&engine!=='luna')return await receiveStatement(response,onEntry,controller.signal,CLIENT_IDLE_MS,onReasoning,onEvent);
    let initial:Response|undefined=response;
    return await runImportPipeline({fileCount:files.length,hasNonCsv:files.some(file=>file.kind!=='csv'),engine:engine==='luna'?'luna':'jev',startedAt,
      extract:async(recheck,requestSignal,accept,onReading)=>{
        const reading=initial??await extractRequest(recheck,requestSignal);initial=undefined;
        if(reading.ok&&reading.headers.get('X-Import-Pipeline')!==engine)throw new ImportError('invalid_result');
        const result=await receiveStatement(reading,entry=>{
          if(engine==='luna'&&(!entry.import_meta||!['classified','review'].includes(entry.import_meta.status)))throw new ImportError('classification_result');
          accept(entry);
        },requestSignal,CLIENT_IDLE_MS,onReading);
        return {source_total:result.source_total??null};
      },
      classify:async(entry,requestSignal,onRetry)=>{
        if(engine==='luna')throw new ImportError('classification_result');
        const response=await request('/api/statement/classify',{entry},requestSignal);
        const result=await receiveStatement(response,()=>{},requestSignal,CLIENT_IDLE_MS,undefined,undefined,onRetry);
        const row=result.entries?.[0];
        if(result.entries?.length!==1||row?.import_meta?.id!==entry.import_meta?.id||!['classified','review'].includes(row?.import_meta?.status??''))throw new ImportError('classification_result');
        return row;
      }
    },controller.signal,event=>{
      if(event.type==='entry')onEntry(event.entry as EntryDraft);
      else if(event.type==='reasoning')onReasoning?.(event.text as string);
      else onEvent?.(event as ImportEvent);
    });
  } finally {
    signal.removeEventListener('abort',abort);controller.abort();
  }
}
