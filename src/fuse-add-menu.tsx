import { displayColor } from './display-color';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, Home } from 'lucide-react';
import { springEasing } from './cartoon-motion';
import { animatePanelBackground } from './kondo-panel-motion';
import { lockOverlayBackground } from './overlay-lock';
import { openedByKeyboard } from './focus-intent';
import { HapticTouch } from './haptic-touch';

export type AddOption={id:string;label:string;color?:string;kind:'card'|'rent';onClick:()=>void};

// The supplied Fuse recording expands unboxed, right-aligned actions from +.
// Each action is a droplet that tears off the + (a goo filter joins the
// blobs while they are close) and lands with a boing. Card actions start an
// AI import, so only their droplets wear the Soft Orbit ring.
export function FuseAddMenu({options,closing,onClose,onSelect,onExited}:{options:AddOption[];closing:boolean;onClose:()=>void;onSelect:(option:AddOption)=>void;onExited:()=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const animations=useRef<Animation[]>([]);
  const exit=useRef(onExited);exit.current=onExited;
  useLayoutEffect(()=>{
    const node=root.current!;
    const previous=document.activeElement as HTMLElement|null;
    const layers=[...document.querySelectorAll<HTMLElement>('main.shell, .floating-nav-host')];
    const unlockBackground=lockOverlayBackground(layers);
    const buttons=[...node.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    // Park each blob under its droplet icon, and the base blob on the +.
    const plus=document.querySelector<HTMLElement>('.browse-dock .dock-add')?.getBoundingClientRect();
    const blobs=[...node.querySelectorAll<HTMLElement>('.fuse-blob[data-index]')];
    const base=node.querySelector<HTMLElement>('.fuse-blob-base');
    const center=plus?{x:plus.left+plus.width/2,y:plus.top+plus.height/2}:null;
    if(center&&base)Object.assign(base.style,{left:`${center.x}px`,top:`${center.y}px`,width:`${plus!.width}px`,height:`${plus!.height}px`});
    const drops=buttons.map(button=>button.querySelector<HTMLElement>('.fuse-drop')!.getBoundingClientRect());
    blobs.forEach((blob,index)=>{const r=drops[index];Object.assign(blob.style,{left:`${r.left+r.width/2}px`,top:`${r.top+r.height/2}px`});});
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      const timing:KeyframeAnimationOptions={duration:300,easing:'cubic-bezier(.22, 1, .36, 1)',fill:'both'};
      const tear=springEasing({stiffness:260,damping:16});
      const veil=node.querySelector<HTMLElement>('.fuse-add-veil')!;
      animations.current=[veil.animate([{opacity:0,backdropFilter:'blur(0px)'},{opacity:1,backdropFilter:'blur(8px)'}],timing)];
      const main=layers.find(layer=>layer.matches('main.shell'));
      // The veil already blurs the page; share the panel's depth motion only.
      if(main)animations.current.push(animatePanelBackground(main,false));
      buttons.forEach((button,index)=>{
        const r=drops[index],delay=(buttons.length-1-index)*45;
        const dx=center?center.x-(r.left+r.width/2):0,dy=center?center.y-(r.top+r.height/2):0;
        const travel={duration:tear.duration,easing:tear.easing,fill:'both' as const,delay};
        // The blob leaves the + stretched along its path, then rounds out.
        animations.current.push(blobs[index].animate([{transform:`translate(-50%,-50%) translate(${dx}px,${dy}px) scale(.55,.7)`},{transform:'translate(-50%,-50%) scale(1)'}],travel));
        const drop=button.querySelector<HTMLElement>('.fuse-drop')!,label=button.querySelector<HTMLElement>('span')!;
        animations.current.push(drop.animate([{opacity:0,transform:`translate(${dx}px,${dy}px) scale(.4)`},{opacity:1,transform:'none'}],travel));
        animations.current.push(label.animate([{opacity:0,transform:'translateX(14px)',filter:'blur(4px)'},{opacity:1,transform:'none',filter:'blur(0px)'}],{...timing,delay:delay+90}));
      });
      // The + itself gives up its body to the droplets.
      if(base)animations.current.push(base.animate([{transform:'translate(-50%,-50%) scale(1)'},{transform:'translate(-50%,-50%) scale(.15)'}],{duration:tear.duration,easing:tear.easing,fill:'both'}));
    }
    // A tap opens the menu without lighting a focus ring on its first item.
    (openedByKeyboard()?buttons[0]:node.querySelector<HTMLElement>('[role="menu"]')??node)?.focus({preventScroll:true});
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();onClose();return;}
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      let next:number|undefined;
      if(event.key==='ArrowDown'||(event.key==='Tab'&&!event.shiftKey))next=(index+1)%buttons.length;
      if(event.key==='ArrowUp'||(event.key==='Tab'&&event.shiftKey))next=(index-1+buttons.length)%buttons.length;
      if(event.key==='Home')next=0;
      if(event.key==='End')next=buttons.length-1;
      if(next!==undefined){event.preventDefault();buttons[next]?.focus();}
    };
    node.addEventListener('keydown',keydown);
    return()=>{
      animations.current.forEach(animation=>animation.cancel());
      unlockBackground();
      node.removeEventListener('keydown',keydown);
      previous?.focus({preventScroll:true});
    };
  },[]);
  useLayoutEffect(()=>{
    if(!closing)return;
    root.current!.inert=true;
    if(!animations.current.length){exit.current();return;}
    let active=true;
    const finish=()=>{if(active){active=false;exit.current();}};
    animations.current.forEach(animation=>{animation.playbackRate=-1.5;animation.play();});
    void Promise.all(animations.current.map(animation=>animation.finished)).then(finish,()=>undefined);
    const timer=window.setTimeout(finish,450);
    return()=>{active=false;clearTimeout(timer);};
  },[closing]);
  return createPortal(<div className="fuse-add-overlay" ref={root}>
    <div className="fuse-add-veil" onClick={onClose}><HapticTouch/></div>
    <svg className="fuse-goo-defs" aria-hidden="true" width="0" height="0"><filter id="fuse-goo"><feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur"/><feColorMatrix in="blur" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo"/><feComposite in="SourceGraphic" in2="goo" operator="atop"/></filter></svg>
    <div className="fuse-goo" aria-hidden="true"><i className="fuse-blob fuse-blob-base"/>{options.map((option,index)=><i key={option.id} className="fuse-blob" data-index={index}/>)}</div>
    <div className="fuse-add-options" role="menu" aria-label="追加する項目" tabIndex={-1}>{options.map(option=>{
      const Icon=option.kind==='rent'?Home:CreditCard;
      const ai=option.kind==='card'&&option.id!=='new-card';
      return <button key={option.id} role="menuitem" onClick={()=>onSelect(option)}><span>{option.label}{ai&&<small className="fuse-add-ai">AIで取り込む</small>}</span><i className={`fuse-drop${ai?' is-ai':''}`}><Icon size={22} strokeWidth={1.9} color={option.color?displayColor(option.color):undefined}/></i></button>;
    })}</div>
  </div>,document.body);
}
