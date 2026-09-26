// Decode UTF-8 across arbitrary network chunks; never split a Japanese character.
export async function* streamLines(body:ReadableStream<Uint8Array>,signal?:AbortSignal) {
  const reader=body.getReader();
  const decoder=new TextDecoder();
  let buffer='';
  const abort=()=>{void reader.cancel().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try {
    while(true){
      signal?.throwIfAborted();
      const {value,done}=await reader.read();
      signal?.throwIfAborted();
      buffer+=decoder.decode(value,{stream:!done});
      let end:number;
      while((end=buffer.indexOf('\n'))>=0){
        yield buffer.slice(0,end).replace(/\r$/,'');
        buffer=buffer.slice(end+1);
      }
      if(done){if(buffer)yield buffer;break;}
    }
  } finally {
    signal?.removeEventListener('abort',abort);
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

export async function* sseData(body:ReadableStream<Uint8Array>,signal?:AbortSignal) {
  let data:string[]=[];
  for await(const line of streamLines(body,signal)){
    if(line===''){
      if(data.length)yield data.join('\n');
      data=[];
    }else if(line.startsWith('data:'))data.push(line.slice(5).replace(/^ /,''));
  }
  if(data.length)yield data.join('\n');
}
