// Limit silence, not the number of images, entries, bytes, or total running time.
export const IMPORT_IDLE_MS=180_000;
export const CLIENT_IDLE_MS=IMPORT_IDLE_MS+30_000;
export class ImportIdleError extends Error {
  constructor(){super('読み取りの応答が途絶えたため中断しました。画像は選択したままです。もう一度取り込んでください。');this.name='ImportIdleError';}
}

export function idleWatch(onTimeout:()=>void,ms=IMPORT_IDLE_MS) {
  let timer:ReturnType<typeof setTimeout>|undefined;
  const clear=()=>{if(timer!==undefined)clearTimeout(timer);timer=undefined;};
  const touch=()=>{clear();timer=setTimeout(onTimeout,ms);};
  touch();
  return {touch,clear};
}

// Also reject when an underlying transport's cancellation never settles.
export function abortable<T>(pending:Promise<T>,signal:AbortSignal):Promise<T> {
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason??new DOMException('Aborted','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    pending.then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
    if(signal.aborted)abort();
  });
}
