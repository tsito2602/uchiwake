// kondo's route motion tokens, applied only to content. Avoid native document
// snapshots: WebKit invalidates the live dock's backdrop while capturing them.
import { useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

type RouteTransition={skipTransition:()=>void;finished:Promise<void>};
const timing={duration:240,easing:'cubic-bezier(.22, 1, .36, 1)',fill:'both'} as const;

export function startRouteTransition(direction:number,update:()=>void):RouteTransition|undefined {
  const page=document.getElementById('main-content');
  if(!page?.animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches){update();return;}
  const bounds=page.getBoundingClientRect();
  const copy=page.cloneNode(true) as HTMLElement;
  copy.classList.add('route-page-copy');
  const sources=page.querySelectorAll<HTMLElement>('.history-bar-grow');
  copy.querySelectorAll<HTMLElement>('.history-bar-grow').forEach((bar,index)=>{
    bar.style.transform=window.getComputedStyle(sources[index]).transform;
  });
  for(const node of [copy,...copy.querySelectorAll('*')])
    for(const attribute of ['id','name','form','href','autofocus'])node.removeAttribute(attribute);
  Object.assign(copy.style,{position:'absolute',top:`${bounds.top}px`,left:`${bounds.left}px`,width:`${bounds.width}px`,height:`${bounds.height}px`,margin:'0'});
  const layer=document.createElement('div');
  layer.className='route-page-layer';
  layer.inert=true;
  layer.setAttribute('aria-hidden','true');
  const header=document.querySelector<HTMLElement>('.desktop-tabs')?.getBoundingClientRect();
  layer.style.clipPath=`inset(${Math.max(0,header?.bottom??0)}px 0 0 0)`;
  layer.appendChild(copy);
  document.body.appendChild(layer);
  try{flushSync(update);}catch(error){layer.remove();throw error;}
  const next=document.getElementById('main-content');
  if(!next){layer.remove();return;}
  const outgoing=copy.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-12*direction}px)`}],timing);
  const incoming=next.animate([{opacity:0,transform:`translateX(${16*direction}px)`},{opacity:1,transform:'translateX(0)'}],timing);
  let cleaned=false;
  const cleanup=()=>{if(cleaned)return;cleaned=true;layer.remove();outgoing.cancel();incoming.cancel();};
  const finished=Promise.allSettled([outgoing.finished,incoming.finished]).then(cleanup);
  return {skipTransition:cleanup,finished};
}

export function useRouteTransition() {
  const active=useRef<RouteTransition|undefined>(undefined);
  useEffect(()=>{
    const interrupt=()=>active.current?.skipTransition();
    document.addEventListener('pointerdown',interrupt,true);
    document.addEventListener('keydown',interrupt,true);
    return()=>{
      document.removeEventListener('pointerdown',interrupt,true);
      document.removeEventListener('keydown',interrupt,true);
      interrupt();
    };
  },[]);
  return (direction:number,update:()=>void)=>{
    active.current?.skipTransition();
    active.current=startRouteTransition(direction,update);
  };
}
