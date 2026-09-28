import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { animatePanel, animatePanelSurroundings, reversePanel, type PanelOrigin } from './kondo-panel-motion';
import { revealPanelField } from './panel-focus';
import { lockOverlayBackground } from './overlay-lock';
import { registerPanel } from './panel-stack';
export type { PanelOrigin } from './kondo-panel-motion';

export const panelOrigin = (element:HTMLElement):PanelOrigin => {
  const {left,top,width,height}=element.getBoundingClientRect();
  return {left,top,width,height};
};

export function usePanelMorph(panel:RefObject<HTMLElement|null>,origin:PanelOrigin|undefined,closing:boolean|undefined,onExited:()=>void,onBack:()=>void,suspended=false) {
  const exited=useRef(onExited);
  const back=useRef(onBack);
  exited.current=onExited;
  back.current=onBack;
  const motion=useRef<Animation|null>(null);
  const companions=useRef<Animation[]>([]);
  const isClosing=useRef(closing);
  isClosing.current=closing;
  const isSuspended=useRef(suspended);isSuspended.current=suspended;
  const layer=useRef<ReturnType<typeof registerPanel>|null>(null);
  useLayoutEffect(()=>{
    const node=panel.current;
    if(!node)return;
    const currentLayer=registerPanel(node);layer.current=currentLayer;
    const shell=node.parentElement!;
    const parent=currentLayer.parents.at(-1);
    const parentFilter=parent?.style.filter;
    shell.style.setProperty('--panel-depth',String(currentLayer.parents.length));
    shell.dataset.panelNested=String(!currentLayer.ownsBackground);
    const viewport=window.visualViewport;
    let revealFrame=0;
    const reveal=()=>{cancelAnimationFrame(revealFrame);revealFrame=requestAnimationFrame(()=>{if(node.contains(document.activeElement))revealPanelField(document.activeElement);});};
    const updateViewport=()=>{
      shell.style.setProperty('--panel-viewport-top',`${viewport?.offsetTop||0}px`);
      shell.style.setProperty('--panel-viewport-height',`${viewport?.height||window.innerHeight}px`);
      reveal();
    };
    updateViewport();
    viewport?.addEventListener('resize',updateViewport);
    viewport?.addEventListener('scroll',updateViewport);
    node.addEventListener('focusin',reveal);
    const main=document.querySelector<HTMLElement>('main.shell');
    const unlockBackground=lockOverlayBackground([...(main?[main]:[]),...currentLayer.parents]);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const oldFilter=main?.style.filter;
    if(!reduced){
      motion.current=animatePanel(node,origin);
      companions.current=animatePanelSurroundings(node,main,currentLayer.parents);
    }else{
      if(main&&currentLayer.ownsBackground)main.style.filter='blur(6px)';
      if(parent)parent.style.filter='blur(6px)';
    }
    return()=>{
      viewport?.removeEventListener('resize',updateViewport);
      viewport?.removeEventListener('scroll',updateViewport);
      node.removeEventListener('focusin',reveal);cancelAnimationFrame(revealFrame);
      motion.current?.cancel();
      companions.current.forEach(animation=>animation.cancel());
      if(reduced&&parent)parent.style.filter=parentFilter||'';
      shell.style.removeProperty('--panel-depth');
      delete shell.dataset.panelNested;
      unlockBackground();
      currentLayer.release();
      if(main&&currentLayer.ownsBackground)main.style.filter=oldFilter||'';
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
    const pointer=()=>{document.documentElement.dataset.inputModality='pointer';};
    const keyboard=(event:KeyboardEvent)=>{if(!event.metaKey&&!event.ctrlKey&&!event.altKey)document.documentElement.dataset.inputModality='keyboard';};
    document.addEventListener('pointerdown',pointer,true);document.addEventListener('keydown',keyboard,true);
    const visible=(element:HTMLElement)=>element.getClientRects().length>0&&!element.closest('[inert], [hidden]');
    const frame=requestAnimationFrame(()=>{if(!isSuspended.current&&layer.current?.isTop())panel.current?.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});});
    const onKeyDown=(event:KeyboardEvent)=>{
      if(isClosing.current||isSuspended.current||!layer.current?.isTop())return;
      if(event.key==='Escape'){event.preventDefault();back.current();return;}
      if(event.key!=='Tab')return;
      const controls=[...document.querySelectorAll<HTMLElement>('.card-panel button:not([disabled]), .card-panel input:not([disabled]), .card-panel select:not([disabled]), .context-host button:not([disabled])')].filter(visible);
      if(!controls.length)return;
      const index=controls.indexOf(document.activeElement as HTMLElement);
      if(event.shiftKey&&index<=0){event.preventDefault();controls[controls.length-1].focus();}
      else if(!event.shiftKey&&(index===controls.length-1||index<0)){event.preventDefault();controls[0].focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{
      cancelAnimationFrame(frame);document.removeEventListener('keydown',onKeyDown);
      document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('keydown',keyboard,true);
      if(document.documentElement.dataset.inputModality==='pointer'){
        const restored=document.activeElement;if(restored instanceof HTMLElement&&(restored===previous||panel.current?.contains(restored)))restored.blur();
      }else if(previous?.isConnected&&!previous.closest('[inert], [hidden]'))previous.focus({preventScroll:true});
    };
  },[]);
}
