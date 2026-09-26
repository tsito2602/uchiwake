import type { ImportModel } from './import-model';
import type { EntryDraft } from './domain';
import type { ImportResult } from './statement-import-flow';
import { streamLines } from './streaming/lines';
import { abortable, idleWatch, ImportIdleError, CLIENT_IDLE_MS } from './streaming/idle';

export async function receiveStatement(response:Response,onEntry:(entry:EntryDraft)=>void,signal:AbortSignal,idleMs=CLIENT_IDLE_MS):Promise<ImportResult> {
  if(!response.ok){
    const timeout=new AbortController();
    const watch=idleWatch(()=>timeout.abort(new ImportIdleError()),idleMs);
    const combined=AbortSignal.any([signal,timeout.signal]);
    const data=await abortable(response.json(),combined).catch(error=>{combined.throwIfAborted();return null;}).finally(()=>watch.clear()) as {error?:string}|null;
    throw new Error(data?.error||'明細を読み取れませんでした');
  }
  if(!response.body||!response.headers.get('Content-Type')?.includes('application/x-ndjson'))throw new Error('明細の受信形式を確認できませんでした');
  for await(const line of streamLines(response.body,signal,idleMs)){
    if(!line.trim())continue;
    const event=JSON.parse(line);
    if(event.type==='entry')onEntry(event.entry);
    else if(event.type==='error')throw new Error(event.error||'明細の受信に失敗しました');
    else if(event.type==='complete')return event.result as ImportResult;
  }
  throw new Error('受信が途中で切れました。もう一度取り込んでください。');
}

export async function streamStatement(images:string[],signal:AbortSignal,onEntry:(entry:EntryDraft)=>void,model?:ImportModel):Promise<ImportResult> {
  const controller=new AbortController();
  const abort=()=>controller.abort(signal.reason);
  signal.addEventListener('abort',abort,{once:true});
  if(signal.aborted)abort();
  const watch=idleWatch(()=>controller.abort(new ImportIdleError()),CLIENT_IDLE_MS);
  try {
    const response=await abortable(fetch('/api/statement/analyze',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:controller.signal,body:JSON.stringify({images,mode:'live',stream:true,...(model?{model}:{})})}),controller.signal);
    watch.clear();
    return await receiveStatement(response,onEntry,controller.signal);
  } finally {
    watch.clear();signal.removeEventListener('abort',abort);controller.abort();
  }
}
