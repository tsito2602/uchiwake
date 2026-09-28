import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { animatePanelBackground } from './kondo-panel-motion';
export function SpaceDialog({title,children,onClose,menu=false,busy=false}:{title:string;children:ReactNode;onClose:()=>void;menu?:boolean;busy?:boolean}) {
 const root=useRef<HTMLDivElement>(null),close=useRef(onClose),working=useRef(busy);close.current=onClose;working.current=busy;
 useLayoutEffect(()=>{
  const node=root.current!,previous=document.activeElement as HTMLElement|null;
  const layers=[...document.querySelectorAll<HTMLElement>('main.shell,.floating-nav-host,.space-switcher')],inert=layers.map(l=>l.inert);
  layers.forEach(l=>l.inert=true);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const animations:Animation[]=[];
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
   const timing={duration:300,easing:'cubic-bezier(.22,1,.36,1)',fill:'both' as const};
   animations.push(node.querySelector('.space-veil')!.animate([{opacity:0,backdropFilter:'blur(0px)'},{opacity:1,backdropFilter:'blur(8px)'}],timing));
   animations.push(node.querySelector('.space-dialog')!.animate([{opacity:0,transform:'translateY(-14px) scale(.92)'},{opacity:1,transform:'translateY(0) scale(1)'}],timing));
   const main=layers.find(l=>l.matches('main.shell'));if(main)animations.push(animatePanelBackground(main,false));
  }
  const focusable=()=>[...node.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')];
  focusable()[0]?.focus({preventScroll:true});
  const keyboard=(e:KeyboardEvent)=>{
   if(e.key==='Escape'&&!working.current){e.preventDefault();close.current();}
   if(e.key==='Tab'){const list=focusable(),i=list.indexOf(document.activeElement as HTMLElement);e.preventDefault();list[(i+(e.shiftKey?-1:1)+list.length)%list.length]?.focus();}
  };node.addEventListener('keydown',keyboard);
  return()=>{animations.forEach(a=>a.cancel());layers.forEach((l,i)=>l.inert=inert[i]);document.body.style.overflow=overflow;node.removeEventListener('keydown',keyboard);previous?.focus({preventScroll:true});};
 },[]);
 return createPortal(<div className="space-overlay" ref={root}><div className="space-veil" onClick={()=>!busy&&onClose()}/><section className={`space-dialog${menu?' space-menu':''}`} role="dialog" aria-modal="true" aria-label={title}><header><h2>{title}</h2><button type="button" className="space-close" disabled={busy} aria-label="閉じる" onClick={onClose}><X size={22}/></button></header>{children}</section></div>,document.body);
}
