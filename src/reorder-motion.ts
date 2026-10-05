import { useLayoutEffect, useRef, type RefObject } from 'react';
import { reducedMotion } from './cartoon-motion';

// A re-sort: every row slides to its new place, one after another from the
// top. Rows that move up lift a little and pass in front of the ones moving
// down. The row's own transform stays free: the slide runs on `translate`.
export function moveRow(row:HTMLElement,dy:number,rank:number){
  const duration=Math.min(620,420+Math.abs(dy)*.6),delay=Math.min(rank,12)*14,easing='cubic-bezier(.3,1.15,.5,1)';
  row.getAnimations().forEach(animation=>{if(animation.id==='reorder')animation.cancel();});
  if(dy>0){
    row.dataset.reordering='';
    const animation=row.animate([{translate:`0 ${dy}px`,scale:'1',boxShadow:'0 0 0 #0000'},{translate:`0 ${dy*.45}px`,scale:'1.03',boxShadow:'0 12px 20px -12px #0005',offset:.45},{translate:'0 -1px',scale:'1',offset:.8},{translate:'0 0',scale:'1',boxShadow:'0 0 0 #0000'}],{duration,delay,easing,fill:'backwards'});
    animation.id='reorder';
    animation.finished.then(()=>{delete row.dataset.reordering;},()=>{delete row.dataset.reordering;});
  }else{
    const animation=row.animate([{translate:`0 ${dy}px`},{translate:'0 1px',offset:.8},{translate:'0 0'}],{duration,delay,easing,fill:'backwards'});
    animation.id='reorder';
  }
}

const measure=(root:HTMLElement|null)=>new Map([...root?.querySelectorAll<HTMLElement>('[data-reorder-key]')??[]].map(row=>[row.dataset.reorderKey!,row.getBoundingClientRect().top]));

// Plays moveRow on every [data-reorder-key] inside root whenever `order`
// changes. Positions are read during render, before React moves the rows.
// A change of `scope` (another view of the same rows) is not a re-sort.
export function useReorderMotion(root:RefObject<HTMLElement|null>,order:string,scope=''){
  const last=useRef({order,scope});
  const before=useRef<Map<string,number>|null>(null);
  if(last.current.order!==order||last.current.scope!==scope){
    before.current=last.current.scope===scope?measure(root.current):null;
    last.current={order,scope};
  }
  useLayoutEffect(()=>{
    const tops=before.current;before.current=null;
    if(!tops||reducedMotion())return;
    let rank=0;
    for(const row of root.current?.querySelectorAll<HTMLElement>('[data-reorder-key]')??[]){
      const top=tops.get(row.dataset.reorderKey!);
      if(top===undefined)continue;
      row.getAnimations().forEach(animation=>{if(animation.id==='reorder')animation.cancel();});
      const dy=top-row.getBoundingClientRect().top;
      if(Math.abs(dy)>.5)moveRow(row,dy,rank++);
    }
  },[order,root]);
}
