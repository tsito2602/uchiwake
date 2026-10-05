import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { animatePanel, animatePanelSurroundings, cancelPanel, reversePanel, type PanelOrigin } from './kondo-panel-motion';
import { trackPanelViewport } from './panel-viewport';
import { lockOverlayBackground } from './overlay-lock';
import { registerPanel } from './panel-stack';
import { springAnimate } from './cartoon-motion';
export type { PanelOrigin } from './kondo-panel-motion';

export const panelOrigin = (element:Element):PanelOrigin => {
  // A donut piece has no box to grow from, so the panel grows out of (and
  // folds back into) a round drop sitting in the middle of the piece.
  if(element instanceof SVGGraphicsElement&&element.dataset.mid){
    const matrix=element.getScreenCTM(),mid=Number(element.dataset.mid),radius=Number(element.dataset.radius)||87;
    if(matrix){
      const x=Math.cos(mid)*radius,y=Math.sin(mid)*radius,size=Math.max(36,Math.min(64,46*Math.hypot(matrix.a,matrix.b)));
      const cx=x*matrix.a+y*matrix.c+matrix.e,cy=x*matrix.b+y*matrix.d+matrix.f;
      return {left:cx-size/2,top:cy-size/2,width:size,height:size,round:true};
    }
  }
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
    const frame=node.parentElement!;
    const shell=frame.parentElement!;
    const parentFrames=currentLayer.parents.map(parent=>parent.parentElement!);
    const parent=parentFrames.at(-1);
    const parentContent=parent?.querySelector<HTMLElement>(':scope > .card-panel');
    const parentFilter=parentContent?.style.filter;
    shell.style.setProperty('--panel-depth',String(currentLayer.parents.length));
    shell.dataset.panelNested=String(!currentLayer.ownsBackground);
    const releaseViewport=trackPanelViewport(node,shell);
    const main=document.querySelector<HTMLElement>('main.shell');
    const unlockBackground=lockOverlayBackground([...(main?[main]:[]),...currentLayer.parents]);
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const oldFilter=main?.style.filter;
    if(!reduced){
      motion.current=animatePanel(frame,origin);
      companions.current=animatePanelSurroundings(frame,main,parentFrames);
    }else{
      if(main&&currentLayer.ownsBackground)main.style.filter='blur(6px)';
      if(parentContent)parentContent.style.filter='blur(6px)';
    }
    return()=>{
      releaseViewport();
      if(motion.current)cancelPanel(motion.current);
      companions.current.forEach(animation=>animation.cancel());
      if(reduced&&parentContent)parentContent.style.filter=parentFilter||'';
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
    const source=document.querySelector<Element>('.panel-source[data-panel-source="true"]');
    reversePanel(animation,companions.current);
    let active=true;
    // Back in its place, the card gives a small squish like the mock.
    // Whatever it came from shows again under the folding box and swells as
    // the box sinks into it, then settles (a round drop into a donut piece
    // swells it more than a wide card).
    const round=!!origin?.round,end=Number(animation.effect?.getComputedTiming().endTime)||500;
    if(source instanceof HTMLElement||source instanceof SVGElement)source.style.visibility='visible';
    const gulp=window.setTimeout(()=>{if(source?.isConnected)springAnimate(source,round?{scale:'1.1 1.1'}:{scale:'1.04 1.06'},{scale:'1 1'},{stiffness:380,damping:11});},end*.42);
    const finish=()=>{if(active){active=false;exited.current();if(source instanceof HTMLElement||source instanceof SVGElement)requestAnimationFrame(()=>requestAnimationFrame(()=>{source.style.visibility='';}));}};
    const timer=window.setTimeout(finish,end+120);
    void animation.finished.then(finish,()=>undefined);
    return()=>{active=false;window.clearTimeout(timer);window.clearTimeout(gulp);};
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
      const controls=[...document.querySelectorAll<HTMLElement>('.card-panel button:not([disabled]), .card-panel input:not([disabled]), .card-panel select:not([disabled]), .card-panel textarea:not([disabled]), .card-panel [contenteditable="true"], .context-host button:not([disabled])')].filter(visible);
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
