import { ImportError, incompleteImportError, upstreamImportError, logImportFailure } from './import-errors';
import type { EntryDraft } from '../src/domain';
import type { ImportResult } from '../src/statement-import-flow';
import { sseData } from '../src/streaming/lines';
import { idleWatch, IMPORT_IDLE_MS } from '../src/streaming/idle';

function normalizeEntry(raw:unknown,categories:string[],reviewCategory:string):EntryDraft {
  if(!raw||typeof raw!=='object')throw new ImportError('invalid_result');
  const row=raw as Record<string,unknown>;
  if(typeof row.title!=='string'||typeof row.spent_on!=='string'||typeof row.category!=='string'||!Number.isSafeInteger(row.amount)||Math.abs(Number(row.amount))>100_000_000)throw new ImportError('invalid_result');
  return {title:row.title.trim().slice(0,100),spent_on:/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(row.spent_on)?row.spent_on:'',category:categories.includes(row.category)?row.category:reviewCategory,amount:Number(row.amount)};
}

// Only emit a complete entry object. Braces/quotes inside titles are not delimiters.
export class StatementDecoder {
  text='';
  entries:EntryDraft[]=[];
  private position=0;
  private arrayStarted=false;
  private arrayEnded=false;
  private objectStart=-1;
  private depth=0;
  private quoted=false;
  private escaped=false;
  constructor(private categories:string[],private reviewCategory='要確認'){}
  append(delta:string):EntryDraft[] {
    this.text+=delta;
    if(!this.arrayStarted){
      const match=/"entries"\s*:\s*\[/.exec(this.text);
      if(!match)return [];
      this.position=match.index+match[0].length;
      this.arrayStarted=true;
    }
    const added:EntryDraft[]=[];
    for(;this.position<this.text.length&&!this.arrayEnded;this.position++){
      const char=this.text[this.position];
      if(this.quoted){
        if(this.escaped)this.escaped=false;
        else if(char==='\\')this.escaped=true;
        else if(char==='"')this.quoted=false;
        continue;
      }
      if(char==='"'){this.quoted=true;continue;}
      if(char==='{'){if(this.depth===0)this.objectStart=this.position;this.depth++;}
      else if(char==='}'){
        this.depth--;
        if(this.depth===0){
          const entry=normalizeEntry(JSON.parse(this.text.slice(this.objectStart,this.position+1)),this.categories,this.reviewCategory);
          this.entries.push(entry);added.push(entry);
        }
      }else if(char===']'&&this.depth===0)this.arrayEnded=true;
    }
    return added;
  }
  finish():ImportResult {
    const parsed=JSON.parse(this.text);
    if(!Array.isArray(parsed.entries)||!Number.isSafeInteger(parsed.confirmed_total))throw new ImportError('invalid_result');
    const entries=parsed.entries.map((entry:unknown)=>normalizeEntry(entry,this.categories,this.reviewCategory));
    if(JSON.stringify(entries)!==JSON.stringify(this.entries))throw new ImportError('invalid_result');
    const amount=parsed.confirmed_total;
    return {entries,confirmed_total:amount>0&&amount<=100_000_000?amount:0};
  }
}

export function statementStream(upstream:Response,categories:string[],abort:AbortController,cleanup:()=>void,reviewCategory='要確認',idleMs=IMPORT_IDLE_MS):Response {
  const encoder=new TextEncoder();
  let cancelled=false;
  let stop=()=>{};
  const body=new ReadableStream<Uint8Array>({
    async start(controller){
      const send=(value:unknown)=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(value)+'\n'));};
      const watch=idleWatch(()=>abort.abort(new ImportError('timeout')),idleMs);
      const heartbeat=setInterval(()=>send({type:'heartbeat'}),15_000);
      stop=()=>{watch.clear();clearInterval(heartbeat);cleanup();abort.abort();};
      send({type:'status',phase:'reading'});
      const decoder=new StatementDecoder(categories,reviewCategory);
      let completed=false;
      try {
        if(!upstream.body)throw new ImportError('disconnected');
        for await(const data of sseData(upstream.body,abort.signal)){
          if(data==='[DONE]')break;
          const event=JSON.parse(data);
          if(event.type==='response.output_text.delta'){
            if(typeof event.delta!=='string')throw new ImportError('invalid_result');
            if(event.delta.length)watch.touch();
            for(const entry of decoder.append(event.delta))send({type:'entry',entry});
          }else if(event.type==='response.completed'){
            if(event.response?.status!=='completed')throw incompleteImportError(event.response?.incomplete_details?.reason);
            const result=decoder.finish();
            send({type:'complete',result});completed=true;break;
          }else if(event.type==='response.incomplete')throw incompleteImportError(event.response?.incomplete_details?.reason);
          else if(event.type==='response.refusal.delta')throw new ImportError('refusal');
          else if(event.type==='error'||event.type==='response.failed')throw upstreamImportError(event.response?.error?.code??event.error?.code??event.code);
        }
        if(!completed)throw new ImportError('disconnected');
      }catch(error){
        if(!cancelled&&(!abort.signal.aborted||abort.signal.reason instanceof ImportError)){
          const failure=abort.signal.reason instanceof ImportError?abort.signal.reason:error instanceof ImportError?error:new ImportError(error instanceof SyntaxError?'invalid_result':'disconnected');
          logImportFailure(failure,decoder.entries.length);
          send({type:'error',code:failure.code,error:failure.message});
        }
      }finally{
        stop();
        if(!cancelled)controller.close();
      }
    },
    cancel(){cancelled=true;stop();}
  });
  return new Response(body,{headers:{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff'}});
}
