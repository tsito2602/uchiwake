import type { EntryDraft } from './domain';

export type ImportResult={confirmed_total:number;entries:EntryDraft[];demo?:boolean};
export type ImportProgress={phase:'reading'|'sorting'|'checking';entries:EntryDraft[];count:number;demo:boolean};

export function demoImportResult(month:string):ImportResult {
  return {demo:true,confirmed_total:6840,entries:[
    {spent_on:`${month}-03`,title:'スーパー',amount:3980,category:'食費'},
    {spent_on:`${month}-07`,title:'日用品',amount:1760,category:'日用品費'},
    {spent_on:`${month}-12`,title:'カフェ',amount:1100,category:'外食費'},
  ]};
}

export function importPause(ms:number,signal:AbortSignal):Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>{clearTimeout(timer);reject(signal.reason);};
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
    signal.addEventListener('abort',abort,{once:true});
  });
}

// Reveal only returned data. Pending AI requests show an indeterminate state.
export async function runStatementImport({analyze,onProgress,signal,demo,reducedMotion=false,pause=importPause}:{
  analyze:()=>Promise<ImportResult>;onProgress:(progress:ImportProgress)=>void;
  signal:AbortSignal;demo:boolean;reducedMotion?:boolean;
  pause?:(ms:number,signal:AbortSignal)=>Promise<void>;
}) {
  signal.throwIfAborted();
  onProgress({phase:'reading',entries:[],count:0,demo});
  const started=Date.now();
  const result=await analyze();
  signal.throwIfAborted();
  if(!reducedMotion)await pause(demo?2000:Math.max(0,2000-(Date.now()-started)),signal);
  const batch=Math.max(1,Math.ceil(result.entries.length/6));
  const steps=Math.max(1,Math.ceil(result.entries.length/batch));
  for(let count=Math.min(batch,result.entries.length);count>0;count=Math.min(count+batch,result.entries.length)){
    signal.throwIfAborted();
    onProgress({phase:'sorting',entries:result.entries.slice(0,count),count:result.entries.length,demo});
    if(!reducedMotion)await pause(6000/steps,signal);
    if(count===result.entries.length)break;
  }
  signal.throwIfAborted();
  onProgress({phase:'checking',entries:result.entries,count:result.entries.length,demo});
  if(!reducedMotion)await pause(2000,signal);
  signal.throwIfAborted();
  return result;
}
