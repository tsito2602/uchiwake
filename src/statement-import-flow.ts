import type { EntryDraft } from './domain';

export type ImportResult={confirmed_total:number;entries:EntryDraft[];demo?:boolean};
export type ImportProgress={phase:'reading'|'sorting'|'checking';entries:EntryDraft[];count:number|null;demo:boolean;reasoning?:string;checkedCount?:number;checkedTotal?:number};

export function demoImportResult(month:string):ImportResult {
  const entries:EntryDraft[]=[
    {spent_on:`${month}-03`,title:'スーパー',amount:3980,category:'食費'},
    {spent_on:`${month}-07`,title:'日用品',amount:1760,category:'日用品費'},
    {spent_on:`${month}-12`,title:'カフェ',amount:1100,category:'外食費'},
    {spent_on:`${month}-13`,title:'ベーカリー',amount:860,category:'食費'},
    {spent_on:`${month}-14`,title:'ドラッグストア',amount:2340,category:'日用品費'},
    {spent_on:`${month}-15`,title:'ランチ',amount:1580,category:'外食費'},
    {spent_on:`${month}-16`,title:'青果店',amount:1240,category:'食費'},
    {spent_on:`${month}-17`,title:'ホームセンター',amount:3280,category:'日用品費'},
    {spent_on:`${month}-18`,title:'レストラン',amount:4680,category:'外食費'},
    {spent_on:`${month}-19`,title:'精肉店',amount:2160,category:'食費'},
    {spent_on:`${month}-20`,title:'生活雑貨',amount:990,category:'日用品費'},
    {spent_on:`${month}-21`,title:'テイクアウト',amount:1890,category:'外食費'},
    {spent_on:`${month}-22`,title:'鮮魚店',amount:1780,category:'食費'},
    {spent_on:`${month}-23`,title:'キッチン用品',amount:2420,category:'日用品費'},
    {spent_on:`${month}-24`,title:'喫茶店',amount:1280,category:'外食費'},
  ];
  return {demo:true,confirmed_total:entries.reduce((sum,entry)=>sum+entry.amount,0),entries};
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
  analyze:(onEntry:(entry:EntryDraft)=>void,onReasoning:(text:string)=>void)=>Promise<ImportResult>;onProgress:(progress:ImportProgress)=>void;
  signal:AbortSignal;demo:boolean;reducedMotion?:boolean;
  pause?:(ms:number,signal:AbortSignal)=>Promise<void>;
}) {
  signal.throwIfAborted();
  onProgress({phase:'reading',entries:[],count:demo?0:null,demo});
  if(!demo){
    const entries:EntryDraft[]=[];
    let reasoning:string|undefined;
    const result=await analyze(entry=>{
      signal.throwIfAborted();
      entries.push(entry);
      onProgress({phase:'sorting',entries:[...entries],count:null,demo:false,reasoning});
    },text=>{
      signal.throwIfAborted();
      reasoning=text;
      onProgress({phase:entries.length?'sorting':'reading',entries:[...entries],count:null,demo:false,reasoning});
    });
    signal.throwIfAborted();
    const total=result.entries.reduce((sum,entry)=>sum+entry.amount,0);
    onProgress({phase:'checking',entries:result.entries,count:result.entries.length,demo:false,checkedCount:result.entries.length,checkedTotal:total});
    return result;
  }
  const started=Date.now();
  const result=await analyze(()=>{},()=>{});
  signal.throwIfAborted();
  if(!reducedMotion)await pause(demo?2000:Math.max(0,2000-(Date.now()-started)),signal);
  const batch=1;
  const steps=Math.max(1,Math.ceil(result.entries.length/batch));
  for(let count=Math.min(batch,result.entries.length);count>0;count=Math.min(count+batch,result.entries.length)){
    signal.throwIfAborted();
    onProgress({phase:'sorting',entries:result.entries.slice(0,count),count:result.entries.length,demo});
    if(!reducedMotion)await pause(6000/steps,signal);
    if(count===result.entries.length)break;
  }
  signal.throwIfAborted();
  let checkedTotal=0;
  onProgress({phase:'checking',entries:result.entries,count:result.entries.length,demo,checkedCount:0,checkedTotal});
  for(let index=0;index<result.entries.length;index++){
    if(!reducedMotion)await pause(2000/result.entries.length,signal);
    signal.throwIfAborted();
    checkedTotal+=result.entries[index].amount;
    onProgress({phase:'checking',entries:result.entries,count:result.entries.length,demo,checkedCount:index+1,checkedTotal});
  }
  signal.throwIfAborted();
  return result;
}
