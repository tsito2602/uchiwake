type ScrollLock = {count:number;overflow:string};
type InertLock = {count:number;inert:boolean};
const scrollLocks=new WeakMap<HTMLElement,ScrollLock>();
const inertLocks=new WeakMap<HTMLElement,InertLock>();

// An incoming overlay can mount before the outgoing one's cleanup runs.
// Only the last owner restores the state from before the first overlay opened.
export function lockOverlayBackground(layers:HTMLElement[],body:HTMLElement=document.body):()=>void {
 let scroll=scrollLocks.get(body);
 if(!scroll){scroll={count:0,overflow:body.style.overflow};scrollLocks.set(body,scroll);}
 scroll.count++;
 body.style.overflow='hidden';
 const backgrounds=[...new Set(layers)].map(layer=>{
  let state=inertLocks.get(layer);
  if(!state){state={count:0,inert:layer.inert};inertLocks.set(layer,state);}
  state.count++;
  layer.inert=true;
  return {layer,state};
 });
 let released=false;
 return()=>{
  if(released)return;
  released=true;
  for(const {layer,state} of backgrounds){
   if(--state.count===0){layer.inert=state.inert;inertLocks.delete(layer);}
  }
  if(--scroll.count===0){body.style.overflow=scroll.overflow;scrollLocks.delete(body);}
 };
}
