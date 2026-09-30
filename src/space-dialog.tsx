import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { animatePanelBackground } from './kondo-panel-motion';
import { lockOverlayBackground } from './overlay-lock';

// Match FuseAddMenu's timing and reverse dismissal, anchored at the top right.
export function SpaceDialog({title,children,onClose,closing,onExited}:{title:string;children:ReactNode;onClose:()=>void;closing:boolean;onExited:()=>void}) {
 const root=useRef<HTMLDivElement>(null),close=useRef(onClose),exit=useRef(onExited);
 const animations=useRef<Animation[]>([]);close.current=onClose;exit.current=onExited;
 useLayoutEffect(()=>{
  const node=root.current!,previous=document.activeElement as HTMLElement|null;
  const layers=[...document.querySelectorAll<HTMLElement>('main.shell,.floating-nav-host,.space-switcher')];
  const unlockBackground=lockOverlayBackground(layers);
  const buttons=[...node.querySelectorAll<HTMLButtonElement>('.space-options>button')];
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const timing:KeyframeAnimationOptions={duration:300,easing:'cubic-bezier(.22, 1, .36, 1)',fill:'both'};
   animations.current=[node.querySelector('.space-veil')!.animate([{opacity:0,backdropFilter:'blur(0px)'},{opacity:1,backdropFilter:'blur(8px)'}],timing)];
   const main=layers.find(l=>l.matches('main.shell'));if(main)animations.current.push(animatePanelBackground(main,false));
   const anchor=buttons[0]?.getBoundingClientRect();
   buttons.forEach((button,index)=>{
    const bounds=button.getBoundingClientRect(),distance=(anchor?.top??bounds.top)-bounds.top;
    animations.current.push(button.animate([{opacity:0,transform:`translateY(${distance-12}px) scale(.65)`},{opacity:1,transform:'translateY(0px) scale(1)'}],{...timing,delay:index*25}));
   });
   const chrome=node.querySelectorAll<HTMLElement>('.space-options hr');
   chrome.forEach(element=>animations.current.push(element.animate([{opacity:0},{opacity:1}],timing)));
  }
  buttons[0]?.focus({preventScroll:true});
  const keyboard=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();close.current();return;}
   const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
   let next:number|undefined;
   if(event.key==='ArrowDown'||(event.key==='Tab'&&!event.shiftKey))next=(index+1)%buttons.length;
   if(event.key==='ArrowUp'||(event.key==='Tab'&&event.shiftKey))next=(index-1+buttons.length)%buttons.length;
   if(event.key==='Home')next=0;
   if(event.key==='End')next=buttons.length-1;
   if(next!==undefined){event.preventDefault();buttons[next]?.focus();}
  };node.addEventListener('keydown',keyboard);
  return()=>{animations.current.forEach(a=>a.cancel());unlockBackground();node.removeEventListener('keydown',keyboard);if(previous?.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});};
 },[]);
 useLayoutEffect(()=>{
  if(!closing)return;
  root.current!.inert=true;
  if(!animations.current.length){exit.current();return;}
  let active=true;const finish=()=>{if(active){active=false;exit.current();}};
  animations.current.forEach(animation=>{animation.playbackRate=-1.5;animation.play();});
  void Promise.all(animations.current.map(animation=>animation.finished)).then(finish,()=>undefined);
  const timer=window.setTimeout(finish,450);
  return()=>{active=false;clearTimeout(timer);};
 },[closing]);
 return createPortal(<div className="space-overlay" ref={root}><div className="space-veil" onClick={onClose}/><section className="space-dialog space-menu" role="dialog" aria-modal="true" aria-label={title}>{children}</section></div>,document.body);
}
