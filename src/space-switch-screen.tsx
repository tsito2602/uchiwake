import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UserRound, UsersRound } from 'lucide-react';
import type { Space } from './spaces';
import { lockOverlayBackground } from './overlay-lock';
import { finishSpaceSwitch, spaceSwitchFadeDuration } from './space-switch-motion';
import './space-switch-screen.css';

export function SpaceSwitchScreen({space,ready,onExited}:{space:Space;ready:boolean;onExited:()=>void}) {
  const screen=useRef<HTMLDivElement>(null);
  const started=useRef(performance.now());
  const exit=useRef(onExited);exit.current=onExited;
  const [leaving,setLeaving]=useState(false);
  useLayoutEffect(()=>{
    const root=document.getElementById('root');
    const node=screen.current;
    const unlock=lockOverlayBackground(root?[root]:[]);
    node?.focus({preventScroll:true});
    return()=>{
      const restoreFocus=document.activeElement===node;
      unlock();
      if(restoreFocus&&root&&!root.inert){
        const next=root.querySelector<HTMLElement>('.card-panel h2')??root.querySelector<HTMLElement>('.space-switcher');
        next?.focus({preventScroll:true});
      }
    };
  },[]);
  useEffect(()=>{
    if(!ready)return;
    return finishSpaceSwitch(document.getElementById('root'),started.current,()=>setLeaving(true),()=>exit.current());
  },[ready]);
  const Icon=space.kind==='personal'?UserRound:UsersRound;
  return createPortal(<div ref={screen} className="space-switch-screen" data-leaving={leaving} role="status" aria-label={`${space.kind==='personal'?'個人':'共有'}スペースに切り替え中`} tabIndex={-1} style={{transitionDuration:`${spaceSwitchFadeDuration}ms`}} onKeyDown={event=>{if(event.key==='Tab')event.preventDefault();}}>
    <Icon className="space-switch-symbol" size={58} strokeWidth={1.5} aria-hidden="true"/>
  </div>,document.body);
}
