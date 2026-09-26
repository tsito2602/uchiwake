import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, Home } from 'lucide-react';
import { animatePanelBackground } from './kondo-panel-motion';

export type AddOption={id:string;label:string;color?:string;kind:'card'|'rent';onClick:()=>void};

// The supplied Fuse recording expands unboxed, right-aligned actions from +.
export function FuseAddMenu({options,closing,onClose,onSelect,onExited}:{options:AddOption[];closing:boolean;onClose:()=>void;onSelect:(option:AddOption)=>void;onExited:()=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const animations=useRef<Animation[]>([]);
  const exit=useRef(onExited);exit.current=onExited;
  useLayoutEffect(()=>{
    const node=root.current!;
    const previous=document.activeElement as HTMLElement|null;
    const layers=[...document.querySelectorAll<HTMLElement>('main.shell, .floating-nav-host')];
    const inert=layers.map(layer=>layer.inert);
    layers.forEach(layer=>layer.inert=true);
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const buttons=[...node.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches){
      const timing:KeyframeAnimationOptions={duration:300,easing:'cubic-bezier(.22, 1, .36, 1)',fill:'both'};
      const veil=node.querySelector<HTMLElement>('.fuse-add-veil')!;
      animations.current=[veil.animate([{opacity:0,backdropFilter:'blur(0px)'},{opacity:1,backdropFilter:'blur(8px)'}],timing)];
      const main=layers.find(layer=>layer.matches('main.shell'));
      // The veil already blurs the page; share the panel's depth motion only.
      if(main)animations.current.push(animatePanelBackground(main,false));
      const anchor=buttons.at(-1)?.getBoundingClientRect();
      buttons.forEach((button,index)=>{
        const bounds=button.getBoundingClientRect();
        const distance=(anchor?.top??bounds.top)-bounds.top;
        animations.current.push(button.animate([
          {opacity:0,transform:`translateY(${distance+12}px) scale(.65)`},
          {opacity:1,transform:'translateY(0px) scale(1)'}
        ],{...timing,delay:(buttons.length-1-index)*25}));
      });
    }
    buttons[0]?.focus({preventScroll:true});
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
      layers.forEach((layer,index)=>layer.inert=inert[index]);
      document.body.style.overflow=overflow;
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
    <div className="fuse-add-veil" onClick={onClose}/>
    <div className="fuse-add-options" role="menu" aria-label="追加する項目">{options.map(option=>{
      const Icon=option.kind==='rent'?Home:CreditCard;
      return <button key={option.id} role="menuitem" onClick={()=>onSelect(option)}><span>{option.label}</span><Icon size={25} strokeWidth={1.8} color={option.color}/></button>;
    })}</div>
  </div>,document.body);
}
