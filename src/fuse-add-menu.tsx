import { displayColor } from './display-color';
import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CreditCard, Home } from 'lucide-react';
import { LiveSpring, reducedMotion, springAnimate } from './cartoon-motion';
import { animatePanelBackground } from './kondo-panel-motion';
import { lockOverlayBackground } from './overlay-lock';
import { openedByKeyboard } from './focus-intent';
import { HapticTouch } from './haptic-touch';

export type AddOption={id:string;label:string;color?:string;kind:'card'|'rent';onClick:()=>void};

// The supplied Fuse recording expands unboxed, right-aligned actions from +.
// Each action is just a card's name and its own card icon. The icons spring
// out of the + spot one after another (the + steps away) and land with a boing.
export function FuseAddMenu({options,closing,onClose,onSelect,onExited}:{options:AddOption[];closing:boolean;onClose:()=>void;onSelect:(option:AddOption)=>void;onExited:()=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const animations=useRef<Animation[]>([]);
  const droplets=useRef<LiveSpring[]>([]),timers=useRef<number[]>([]);
  const exit=useRef(onExited);exit.current=onExited;
  useLayoutEffect(()=>{
    const node=root.current!;
    const previous=document.activeElement as HTMLElement|null;
    const layers=[...document.querySelectorAll<HTMLElement>('main.shell, .floating-nav-host')];
    const unlockBackground=lockOverlayBackground(layers);
    const buttons=[...node.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
    const plus=document.querySelector<HTMLElement>('.browse-dock .dock-add')?.getBoundingClientRect();
    const center=plus?{x:plus.left+plus.width/2,y:plus.top+plus.height/2}:null;
    const drops=buttons.map(button=>button.querySelector<HTMLElement>('.fuse-drop')!.getBoundingClientRect());
    // Mock timing: each icon rides its own spring out of the +, 55ms apart,
    // and its name rides the same spring right behind it, stretching out of
    // the icon's side as it lands.
    const draws=buttons.map((button,index)=>{
      const r=drops[index],dx=center?center.x-(r.left+r.width/2):0,dy=center?center.y-(r.top+r.height/2):0;
      const drop=button.querySelector<HTMLElement>('.fuse-drop')!,label=button.querySelector<HTMLElement>('span')!;
      return (v:number)=>{
        const q=Math.max(0,v);
        const shown=Math.max(0,Math.min(1,(v-.55)*3));
        const fly=`translate(${dx*(1-q)}px,${dy*(1-q)}px)`;
        drop.style.opacity=String(shown);drop.style.transform=`${fly} scale(${Math.max(.3,Math.min(1.2,v))})`;
        label.style.opacity=String(Math.max(0,Math.min(1,(v-.35)*2.5)));label.style.transformOrigin='right center';
        label.style.transform=`${fly} scale(${Math.max(.2,Math.min(1.15,v)).toFixed(4)}, ${Math.max(.4,Math.min(1.1,.4+v*.6)).toFixed(4)})`;
      };
    });
    droplets.current=draws.map(draw=>new LiveSpring(0,draw,{stiffness:300,damping:15}));
    draws.forEach(draw=>draw(0));
    if(!reducedMotion()){
      const timing:KeyframeAnimationOptions={duration:300,easing:'cubic-bezier(.22, 1, .36, 1)',fill:'both'};
      const veil=node.querySelector<HTMLElement>('.fuse-add-veil')!;
      animations.current=[veil.animate([{opacity:0,backdropFilter:'blur(0px)'},{opacity:1,backdropFilter:'blur(6px)'}],timing)];
      const main=layers.find(layer=>layer.matches('main.shell'));
      if(main)animations.current.push(animatePanelBackground(main,false));
    }
    const count=droplets.current.length;
    droplets.current.forEach((spring,index)=>timers.current.push(window.setTimeout(()=>spring.to(1),reducedMotion()?0:(count-1-index)*55)));
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
      timers.current.forEach(clearTimeout);droplets.current.forEach(spring=>spring.stop());
      unlockBackground();
      node.removeEventListener('keydown',keydown);
      previous?.focus({preventScroll:true});
    };
  },[]);
  useLayoutEffect(()=>{
    if(!closing)return;
    root.current!.inert=true;
    timers.current.forEach(clearTimeout);timers.current=[];
    let active=true;
    const plus=()=>{const node=document.querySelector('.browse-dock .dock-add');if(node)springAnimate(node,{transform:'scale(1.12)'},{transform:'scale(1)'},{stiffness:420,damping:12});};
    const finish=()=>{if(active){active=false;exit.current();plus();}};
    if(reducedMotion()){finish();return;}
    animations.current.forEach(animation=>{animation.playbackRate=-1.5;animation.play();});
    const springs=droplets.current;
    springs.forEach((spring,index)=>timers.current.push(window.setTimeout(()=>spring.to(0,{stiffness:420,damping:24}),index*40)));
    const check=window.setInterval(()=>{if(springs.every(spring=>spring.value<.02))finish();},16);
    const timer=window.setTimeout(finish,520);
    return()=>{active=false;clearTimeout(timer);clearInterval(check);};
  },[closing]);
  return createPortal(<div className="fuse-add-overlay" ref={root}>
    <div className="fuse-add-veil" onClick={onClose}><HapticTouch/></div>
    <div className="fuse-add-options" role="menu" aria-label="追加する項目" tabIndex={-1}>{options.map(option=>{
      const Icon=option.kind==='rent'?Home:CreditCard;
      return <button key={option.id} role="menuitem" onClick={()=>onSelect(option)}><span>{option.label}</span><i className="fuse-drop"><Icon size={25} strokeWidth={1.8} color={displayColor(option.color)}/></i></button>;
    })}</div>
  </div>,document.body);
}
