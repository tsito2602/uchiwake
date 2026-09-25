import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { animatePanel, panelTiming, reversePanel, type PanelOrigin } from './kondo-panel-motion';
export type { PanelOrigin } from './kondo-panel-motion';

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
  const companions=useRef<Animation[]>([]);
  const isClosing=useRef(closing);
  isClosing.current=closing;
  useLayoutEffect(()=>{
    const node=panel.current;
    if(!node)return;
    const shell=node.parentElement!;
    const viewport=window.visualViewport;
    const updateViewport=()=>{
      shell.style.setProperty('--panel-viewport-top',`${viewport?.offsetTop||0}px`);
      shell.style.setProperty('--panel-viewport-height',`${viewport?.height||window.innerHeight}px`);
    };
    updateViewport();
    viewport?.addEventListener('resize',updateViewport);
    viewport?.addEventListener('scroll',updateViewport);
    const main=document.querySelector<HTMLElement>('main.shell');
    const wasInert=main?.inert;
    if(main)main.inert=true;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const oldFilter=main?.style.filter;
    if(!reduced){
      motion.current=animatePanel(node,origin);
      const scrim=shell.querySelector<HTMLElement>('.card-panel-scrim');
      companions.current=scrim?[scrim.animate([{opacity:0},{opacity:1}],panelTiming)]:[];
      if(main){
        const bounds=main.getBoundingClientRect();
        const transformOrigin=`${window.innerWidth/2-bounds.left}px ${(viewport?.offsetTop||0)+(viewport?.height||window.innerHeight)/2-bounds.top}px`;
        companions.current.push(main.animate([{scale:'1',filter:'blur(0px)',transformOrigin},{scale:'.94',filter:'blur(6px)',transformOrigin}],panelTiming));
      }
    }else if(main)main.style.filter='blur(6px)';
    return()=>{
      viewport?.removeEventListener('resize',updateViewport);
      viewport?.removeEventListener('scroll',updateViewport);
      motion.current?.cancel();
      companions.current.forEach(animation=>animation.cancel());
      if(main){main.inert=wasInert||false;main.style.filter=oldFilter||'';}
    };
  },[]);
  useLayoutEffect(()=>{
    if(!closing)return;
    if(panel.current)panel.current.inert=true;
    const animation=motion.current;
    if(!animation){exited.current();return;}
    // Reverse the retained entrance, including a dismissal before it finishes.
    reversePanel(animation,companions.current);
    let active=true;
    const finish=()=>{if(active){active=false;exited.current();}};
    const timer=window.setTimeout(finish,600);
    void animation.finished.then(finish,()=>undefined);
    return()=>{active=false;window.clearTimeout(timer);};
  },[closing]);
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const originalOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    const visible=(element:HTMLElement)=>element.getClientRects().length>0;
    const frame=requestAnimationFrame(()=>panel.current?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true}));
    const onKeyDown=(event:KeyboardEvent)=>{
      if(isClosing.current)return;
      if(event.key==='Escape'){event.preventDefault();back.current();return;}
      if(event.key!=='Tab')return;
      const controls=[...document.querySelectorAll<HTMLElement>('.card-panel button:not([disabled]), .card-panel input:not([disabled]), .card-panel select:not([disabled]), .context-host button:not([disabled])')].filter(visible);
      if(!controls.length)return;
      const index=controls.indexOf(document.activeElement as HTMLElement);
      if(event.shiftKey&&index<=0){event.preventDefault();controls[controls.length-1].focus();}
      else if(!event.shiftKey&&(index===controls.length-1||index<0)){event.preventDefault();controls[0].focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('keydown',onKeyDown);document.body.style.overflow=originalOverflow;previous?.focus({preventScroll:true});};
  },[]);
}
