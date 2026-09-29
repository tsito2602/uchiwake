export type AIBindings={
  AI_IMPORT_PROVIDER?:string;AI_GATEWAY_ID?:string;
  AI?:{run:(model:string,input:Record<string,unknown>,options?:{gateway:{id:string;skipCache:boolean;collectLog:boolean}})=>Promise<unknown>};
};
export const usesCloudflare=(env:AIBindings)=>env.AI_IMPORT_PROVIDER==='cloudflare';
export const importAIEnabled=(env:AIBindings&{OPENAI_API_KEY?:string})=>usesCloudflare(env)?Boolean(env.AI&&env.AI_GATEWAY_ID):Boolean(env.OPENAI_API_KEY);

// Reports use the same Luna transport, so enabling Cloudflare does not leave a
// second vendor key as a hidden requirement outside statement import.
export async function cloudflareReport(env:AIBindings,content:unknown[],requestSignal:AbortSignal):Promise<string|null> {
  if(!env.AI||!env.AI_GATEWAY_ID)throw new ImportError('configuration');
  const abort=new AbortController(),signal=AbortSignal.any([requestSignal,abort.signal]);
  const watch=idleWatch(()=>abort.abort(new ImportError('timeout')));
  try{
    const raw=await abortable(env.AI.run('openai/gpt-6-luna',{input:[{role:'user',content}],store:false,stream:false,reasoning:{effort:'none'},max_output_tokens:500},{gateway:{id:env.AI_GATEWAY_ID,skipCache:true,collectLog:false}}),signal);
    const data=(raw instanceof Response?await abortable(raw.json(),signal):raw) as {status?:string;output?:Array<{content?:Array<{type:string;text?:string}>}>};
    if(data?.status!=='completed'||!Array.isArray(data.output))return null;
    return data.output.flatMap(item=>item.content||[]).filter(item=>item.type==='output_text').map(item=>item.text||'').join('')||null;
  }finally{watch.clear();abort.abort();}
}
import { abortable, idleWatch } from '../src/streaming/idle';
import { ImportError } from './import-errors';
