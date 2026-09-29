import type { EntryDraft } from './domain';
import type { ImportResult, ImportActivity } from './statement-import-flow';
import { rowTotal, type SourceTotal } from './import-policy';
import { ImportError, asImportError, describeAIFailure, type ImportDiagnostics } from './import-errors';
import { ImportIdleError } from './streaming/idle';

export type ImportSend=(event:Record<string,unknown>)=>void;
export type ImportServices={
  fileCount:number;hasNonCsv:boolean;
  extract:(recheck:string|undefined,signal:AbortSignal,accept:(entry:EntryDraft)=>void,onReading:(text:string)=>void)=>Promise<{source_total:SourceTotal|null}>;
  classify:(entry:EntryDraft,signal:AbortSignal,onRetry:(attempt:number)=>void)=>Promise<EntryDraft>;
};
// This scheduler runs in the browser for split requests and in the Worker for
// the legacy endpoint. No account credentials or AI implementation live here.
export async function runImportPipeline(services:ImportServices,requestSignal:AbortSignal,send:ImportSend):Promise<ImportResult> {
  const control=new AbortController();
  const signal=AbortSignal.any([requestSignal,control.signal]);
  let rechecking=false,receivedEntries=0,readingInProgress=true;
  const classification:NonNullable<ImportDiagnostics['classification']>={evaluated:0,classified:0,review:0,low_confidence:0,low_evidence:0,missing_merchant:0,missing_purchase_context:0,with_purchase_context:0,retries:0,confidence_min:null,confidence_max:null,noul_min:null,noul_max:null};
  try{
  const activity=(value:ImportActivity)=>send({type:'activity',activity:value});
  const classify=async(entry:EntryDraft):Promise<EntryDraft>=>{
    try{
    const row=await services.classify(entry,signal,attempt=>{
      classification.retries++;
      activity({phase:readingInProgress?'reading':'sorting',count:readingInProgress?null:receivedEntries,rechecking,text:`仕分けサービスが一時的に応答できないため、再試行を待っています（${attempt}/3回目）…`});
    });
    // Explicit rules do not count as Jev evaluations.
    if(row.import_meta?.confidence===undefined)return row;
    classification.evaluated++;classification[row.import_meta!.status==='classified'?'classified':'review']++;
    classification.with_purchase_context+=Number(!!entry.import_meta?.context.trim());
    for(const cause of row.import_meta!.review_causes??[])classification[cause]++;
    for(const key of ['confidence','noul'] as const){const value=row.import_meta![key]!;classification[`${key}_min`]=Math.min(classification[`${key}_min`]??value,value);classification[`${key}_max`]=Math.max(classification[`${key}_max`]??value,value);}
    return row;
    }catch(error){
      if(signal.aborted)throw signal.reason;
      let failure=asImportError(error,'upstream');
      if(failure.code==='invalid_result')failure=new ImportError('classification_result',failure.diagnostics);
      describeAIFailure(failure,'typesafe/jev','validation');
      const {file,page,row}=entry.import_meta!.source;
      failure.diagnostics!.failure!.source={file,page,row};
      throw failure;
    }
  };
  const extract=async(recheck:string|undefined,previous?:EntryDraft[],recheckReason?:string)=>{
    rechecking=!!recheck;receivedEntries=0;readingInProgress=true;
    const entries:EntryDraft[]=[];
    const active=new Set<Promise<void>>();
    const queue:{index:number;entry:EntryDraft}[]=[];
    const sources=new Map<string,EntryDraft>();
    const fingerprints=new Map((previous||[]).map(entry=>[JSON.stringify([entry.title,entry.spent_on,entry.amount,entry.import_meta?.context,entry.import_meta?.amount_uncertain]),entry]));
    let failure:unknown,readingFinished=false;
    let classified=0,nextQueued=0;
    const publish=(text?:string)=>{
      activity({phase:readingFinished?'sorting':'reading',count:readingFinished?entries.length:null,rechecking:!!recheck,
        text:text??(readingFinished?`仕分け ${classified} / ${entries.length}件完了`:`${recheck?'再読み取り':'読み取り'} ${entries.length}件・仕分け ${classified}件完了`)});
    };
    const finished=(entry:EntryDraft)=>entry.import_meta!.status==='classified'||entry.import_meta!.status==='review';
    const update=(index:number,entry:EntryDraft)=>{signal.throwIfAborted();if(failure)throw failure;classified+=Number(finished(entry))-Number(finished(entries[index]));entries[index]=entry;send({type:'entry_update',entry});publish();};
    const pump=()=>{
      while(nextQueued<queue.length&&active.size<4&&!failure&&!signal.aborted){
        const {index,entry}=queue[nextQueued++];
        update(index,{...entry,import_meta:{...entry.import_meta!,status:'classifying'}});
        let task:Promise<void>;
        task=classify(entry).then(row=>update(index,row)).catch(error=>{failure=error;control.abort(error);}).finally(()=>{active.delete(task);pump();});
        active.add(task);
      }
    };
    const accept=(entry:EntryDraft)=>{
      signal.throwIfAborted();if(failure)throw failure;
      const duplicate=sources.get(entry.import_meta!.id);
      if(duplicate){
        if(duplicate.title===entry.title&&duplicate.amount===entry.amount&&duplicate.spent_on===entry.spent_on)return;
        throw new ImportError('invalid_result'); // Conflicting readings of one source location.
      }
      const index=entries.length;entries.push(entry);receivedEntries=entries.length;sources.set(entry.import_meta!.id,entry);send({type:'entry',entry});publish();
      const old=fingerprints.get(JSON.stringify([entry.title,entry.spent_on,entry.amount,entry.import_meta?.context,entry.import_meta?.amount_uncertain]));
      if(old){update(index,{...old,import_meta:{...old.import_meta!,id:entry.import_meta!.id,source:entry.import_meta!.source}});return;}
      // Keep consuming Luna's stream while the bounded Jev queue works independently.
      queue.push({index,entry});pump();
    };
    publish(recheckReason??`${services.fileCount}ファイルの読み取りを開始しています…`);
    let completed=false;
    try{
      const result=await services.extract(recheck,signal,accept,text=>publish(recheckReason??text));
      completed=true;
      readingFinished=true;readingInProgress=false;publish();
      while(active.size)await Promise.all([...active]);
      signal.throwIfAborted();if(failure)throw failure;
      return {entries,source_total:result.source_total};
    }catch(error){
      if(signal.aborted)throw signal.reason;
      throw describeAIFailure(asImportError(error,error instanceof ImportIdleError?'timeout':'invalid_result'),'openai/gpt-6-luna','stream');
    }finally{
      // Handlers above always consume rejections; stop writes after this extraction fails.
      if(!completed)failure=failure||new ImportError('incomplete');
    }
  };
  send({type:'reasoning',text:'明細を読み取り、読み取れた行から仕分けています…'});
  let result=await extract(undefined);
  let totalAlternative:SourceTotal|undefined;
  activity({phase:'checking',text:result.source_total?'利用合計と原本の記載額を照合しています…':'読み取った金額を合計しています…',count:result.entries.length,rechecking:false});
  const mismatch=result.source_total&&rowTotal(result.entries)!==result.source_total.amount;
  const unclear=result.entries.filter(row=>!row.amount||row.import_meta?.amount_uncertain||!row.title||!row.spent_on);
  const ambiguous=result.entries.filter(row=>row.import_meta?.status==='review');
  if(mismatch||unclear.length||(ambiguous.length&&services.hasNonCsv)){
    const recheckReason=mismatch?`原本との差額 ¥${Math.abs(rowTotal(result.entries)-result.source_total!.amount).toLocaleString('ja-JP')}を再確認しています…`:unclear.length?'曖昧な金額や利用日を原本で再確認しています…':'費目を判断するため、原本の購入内容を再確認しています…';
    send({type:'reasoning',text:recheckReason});
    activity({phase:'reading',text:recheckReason,count:null,rechecking:true});
    send({type:'replace',entries:[]});
    const originalTotal=result.source_total;
    const repaired=await extract(JSON.stringify({source_total:originalTotal,calculated_total:rowTotal(result.entries),unclear_sources:[...unclear,...ambiguous].map(row=>row.import_meta!.source)}),result.entries,recheckReason);
    // Losing a previously observed reference is not a successful reconciliation.
    if(originalTotal&&repaired.source_total&&originalTotal.amount!==repaired.source_total.amount)totalAlternative=repaired.source_total;
    result={...repaired,source_total:originalTotal??repaired.source_total};
  }
  signal.throwIfAborted();
  activity({phase:'checking',text:'金額の照合結果と要確認の項目をまとめています…',count:result.entries.length,rechecking:false});
  send({type:'status',phase:'checking'});
  return {...result,confirmed_total:result.source_total?.amount??0,...(totalAlternative?{total_alternative:totalAlternative}:{})};
  }catch(error){
    if(requestSignal.aborted)throw requestSignal.reason;
    const failure=asImportError(error,error instanceof ImportIdleError?'timeout':'invalid_result');
    failure.diagnostics={...failure.diagnostics,run:{rechecking,received_entries:receivedEntries},classification:{...classification}};
    throw failure;
  }finally{control.abort();}
}
