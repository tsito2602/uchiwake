import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

export type PanelOrigin = {left:number;top:number;width:number;height:number};
export const panelOrigin = (element:HTMLElement):PanelOrigin => {
  const {left,top,width,height}=element.getBoundingClientRect();
  return {left,top,width,height};
};

export function usePanelMorph(panel:RefObject<HTMLElement|null>,origin:PanelOrigin|undefined,closing:boolean|undefined,onExited:()=>void,onBack:()=>void) {
  const exited=useRef(onExited);
  const back=useRef(onBack);
  exited.current=onExited;
  back.current=onBack;
  const motion=useRef<Animation|null>(null);
  const geometry=()=>{
    const target=panel.current?.getBoundingClientRect();
    if(!target)return null;
    const source=origin||{left:window.innerWidth/2-28,top:window.innerHeight-88,width:56,height:56};
    const x=source.left+source.width/2-target.left-target.width/2;
    const y=source.top+source.height/2-target.top-target.height/2;
    return {transform:`translate(${x}px, ${y}px) scale(${Math.max(.12,source.width/target.width)}, ${Math.max(.12,source.height/target.height)})`,opacity:.5,borderRadius:'28px'};
  };
  useLayoutEffect(()=>{
    if(!panel.current||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const from=geometry();
    if(!from)return;
    motion.current=panel.current.animate([from,{transform:'none',opacity:1,borderRadius:'30px'}],{duration:520,easing:'cubic-bezier(.22,1,.36,1)'});
    return()=>{motion.current?.cancel();};
  },[]);
  useEffect(()=>{
    if(!closing)return;
    motion.current?.cancel();
    if(!panel.current||window.matchMedia('(prefers-reduced-motion: reduce)').matches){exited.current();return;}
    const to=geometry();
    if(!to){exited.current();return;}
    const animation=panel.current.animate([{transform:'none',opacity:1,borderRadius:'30px'},to],{duration:360,easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'});
    motion.current=animation;
    void animation.finished.then(()=>exited.current(),()=>exited.current());
  },[closing]);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const originalOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const visible=(element:HTMLElement)=>element.getClientRects().length>0;
    const focus=()=>{
      const backButton=document.querySelector<HTMLElement>('.context-host .context-back button');
      const closeButton=panel.current?.querySelector<HTMLElement>('.card-panel-close');
      (backButton&&visible(backButton)?backButton:closeButton)?.focus();
    };
    const frame=requestAnimationFrame(focus);
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();back.current();return;}
      if(event.key!=='Tab')return;
      const controls=[...document.querySelectorAll<HTMLElement>('.card-panel button:not([disabled]), .card-panel input:not([disabled]), .card-panel select:not([disabled]), .context-host button:not([disabled])')].filter(visible);
      if(!controls.length)return;
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1].focus();}
      else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',onKeyDown);document.body.style.overflow=originalOverflow;previous?.focus();};
  },[]);
}
