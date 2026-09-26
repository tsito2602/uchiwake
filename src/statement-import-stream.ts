import type { EntryDraft } from './domain';
import type { ImportResult } from './statement-import-flow';
import { streamLines } from './streaming/lines';

export async function receiveStatement(response:Response,onEntry:(entry:EntryDraft)=>void,signal:AbortSignal):Promise<ImportResult> {
  if(!response.ok){
    const data=await response.json().catch(()=>null) as {error?:string}|null;
    throw new Error(data?.error||'明細を読み取れませんでした');
  }
  if(!response.body||!response.headers.get('Content-Type')?.includes('application/x-ndjson'))throw new Error('明細の受信形式を確認できませんでした');
  for await(const line of streamLines(response.body,signal)){
    if(!line.trim())continue;
    const event=JSON.parse(line);
    if(event.type==='entry')onEntry(event.entry);
    else if(event.type==='error')throw new Error(event.error||'明細の受信に失敗しました');
    else if(event.type==='complete')return event.result as ImportResult;
  }
  throw new Error('受信が途中で切れました。もう一度取り込んでください。');
}

export async function streamStatement(images:string[],signal:AbortSignal,onEntry:(entry:EntryDraft)=>void):Promise<ImportResult> {
  const response=await fetch('/api/statement/analyze',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal,body:JSON.stringify({images,mode:'live',stream:true})});
  return receiveStatement(response,onEntry,signal);
}
