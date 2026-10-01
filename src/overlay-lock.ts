import { guardPanelKeyboardFocus } from './panel-keyboard';
type ScrollLock = {count:number;restore:()=>void};
type InertLock = {count:number;inert:boolean};
const scrollLocks=new WeakMap<HTMLElement,ScrollLock>();
const inertLocks=new WeakMap<HTMLElement,InertLock>();

// An incoming overlay can mount before the outgoing one's cleanup runs.
// Only the last owner restores the state from before the first overlay opened.
export function lockOverlayBackground(layers:HTMLElement[],body:HTMLElement=document.body):()=>void {
 let scroll=scrollLocks.get(body);
 if(!scroll){
  const doc=body.ownerDocument,root=doc.documentElement,view=doc.defaultView!;
  const x=view.scrollX,y=view.scrollY;
  const remember=(node:HTMLElement,keys:string[])=>{
   const saved=keys.map(key=>[key,node.style.getPropertyValue(key),node.style.getPropertyPriority(key)]);
   return()=>saved.forEach(([key,value,priority])=>value?node.style.setProperty(key,value,priority):node.style.removeProperty(key));
  };
  const restoreBody=remember(body,['overflow','position','top','left','right','overscroll-behavior']);
  const restoreRoot=remember(root,['overflow','overscroll-behavior']);
  // overflow:hidden alone lets Safari pan fixed overlays when an input focuses.
  Object.entries({overflow:'hidden',position:'fixed',top:`${-y}px`,left:`${-x}px`,right:`${x}px`,'overscroll-behavior':'none'}).forEach(([key,value])=>body.style.setProperty(key,value));
  root.style.setProperty('overflow','hidden');root.style.setProperty('overscroll-behavior','none');
  const releaseKeyboard=guardPanelKeyboardFocus(doc);
  scroll={count:0,restore:()=>{
   releaseKeyboard();restoreBody();restoreRoot();
   view.scrollTo({left:x,top:y,behavior:'instant'});
  }};
  scrollLocks.set(body,scroll);
 }
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
  if(--scroll.count===0){scroll.restore();scrollLocks.delete(body);}
 };
}
