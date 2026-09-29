import { abortable, idleWatch, IMPORT_IDLE_MS, ImportIdleError } from '../src/streaming/idle';
import { streamLines } from '../src/streaming/lines';
import { ImportError, upstreamImportError } from './import-errors';

export type AIBindings={
  AI_IMPORT_PROVIDER?:string;AI_GATEWAY_ID?:string;
  AI?:{run:(model:string,input:Record<string,unknown>,options?:{gateway:{id:string;skipCache:boolean;collectLog:boolean};returnRawResponse?:boolean;signal?:AbortSignal})=>Promise<unknown>};
};
export const usesCloudflare=(env:AIBindings)=>env.AI_IMPORT_PROVIDER==='cloudflare';
export const importAIEnabled=(env:AIBindings&{OPENAI_API_KEY?:string})=>usesCloudflare(env)?Boolean(env.AI&&env.AI_GATEWAY_ID):Boolean(env.OPENAI_API_KEY);

async function bindingJson(raw:unknown,signal:AbortSignal):Promise<unknown> {
  const body=raw instanceof Response?raw.body:raw instanceof ReadableStream?raw:null;
  if(!body){if(raw instanceof Response)throw new ImportError('invalid_result');return raw;}
  const lines:string[]=[];
  for await(const line of streamLines(body,signal,IMPORT_IDLE_MS))lines.push(line);
  return JSON.parse(lines.join('\n'));
}

export async function cloudflareRun(env:AIBindings,model:string,input:Record<string,unknown>,requestSignal:AbortSignal):Promise<unknown> {
  if(!env.AI||!env.AI_GATEWAY_ID)throw new ImportError('configuration');
  const timer=new AbortController(),signal=AbortSignal.any([requestSignal,timer.signal]);
  signal.throwIfAborted();
  const watch=idleWatch(()=>timer.abort(new ImportError('timeout')));
  try{
    // The binding auto-decodes only the exact Content-Type "application/json".
    // Preserve HTTP status and decode JSON bodies ourselves, including charset variants.
    const raw=await abortable(env.AI.run(model,input,{gateway:{id:env.AI_GATEWAY_ID,skipCache:true,collectLog:false},returnRawResponse:true,signal}),signal);
    watch.clear();
    if(raw instanceof Response&&!raw.ok){
      let data:unknown;
      try{data=await bindingJson(raw,signal);}catch(error){if(!(error instanceof SyntaxError)&&!(error instanceof ImportError&&error.code==='invalid_result'))throw error;}
      const code=(data as {error?:{code?:unknown};errors?:{code?:unknown}[]})?.error?.code??(data as {errors?:{code?:unknown}[]})?.errors?.[0]?.code;
      throw upstreamImportError(code,raw.status);
    }
    return input.stream===true?raw:await bindingJson(raw,signal);
  }catch(error){
    if(signal.aborted)throw signal.reason;
    if(error instanceof ImportError)throw error;
    if(error instanceof ImportIdleError)throw new ImportError('timeout');
    if(error instanceof SyntaxError)throw new ImportError('invalid_result');
    throw upstreamImportError((error as {code?:unknown})?.code,(error as {status?:number})?.status);
  }finally{watch.clear();}
}

// Reports use the same Luna transport, so enabling Cloudflare does not leave a
// second vendor key as a hidden requirement outside statement import.
export async function cloudflareReport(env:AIBindings,content:unknown[],requestSignal:AbortSignal):Promise<string|null> {
  const data=await cloudflareRun(env,'openai/gpt-6-luna',{input:[{role:'user',content}],store:false,stream:false,reasoning:{effort:'none'},max_output_tokens:500},requestSignal) as {status?:string;output?:Array<{content?:Array<{type:string;text?:string}>}>};
  if(data?.status!=='completed'||!Array.isArray(data.output))return null;
  return data.output.flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('')||null;
}
