import { useEffect, useRef, useState } from 'react';
import { pathData } from './brand-motion';
import { haptic } from './haptics';
import { LiveSpring, reducedMotion, springAnimate } from './cartoon-motion';

const THRESHOLD=80;
const MAX=124;
const CENTER=[640,640] as const;
const TONES=['ink','ink','mid','pale','ink'];
// A pie sector from noon, clockwise, the way the logo's chart fills at launch.
function sector(progress:number) {
  const p=Math.max(0,Math.min(.9999,progress)),r=640,[cx,cy]=CENTER;
  if(p<=0)return '';
  const angle=p*Math.PI*2-Math.PI/2,x=cx+r*Math.cos(angle),y=cy+r*Math.sin(angle);
  return `M ${cx} ${cy} L ${cx} ${cy-r} A ${r} ${r} 0 ${p>.5?1:0} 1 ${x.toFixed(1)} ${y.toFixed(1)} Z`;
}

// Pull down at the top of a page: the う mark fills clockwise as the finger
// travels, bounces when it is full, and spins gently while the month reloads.
export function PullRefresh({onRefresh,disabled}:{onRefresh:()=>Promise<void>;disabled?:boolean}) {
  const [progress,setProgress]=useState(0);
  const [busy,setBusy]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const pull=useRef<LiveSpring|null>(null);
  const latest=useRef({onRefresh,disabled,busy});latest.current={onRefresh,disabled,busy};
  pull.current??=new LiveSpring(0,value=>{
    const node=root.current;if(!node)return;
    node.style.setProperty('--pull',`${Math.max(0,value).toFixed(2)}px`);
    document.querySelector<HTMLElement>('main.shell')?.style.setProperty('translate',value>0.5?`0 ${(value*.45).toFixed(2)}px`:'');
    setProgress(Math.min(1,Math.max(0,value)/THRESHOLD));
  },'boing');
  useEffect(()=>{
    let start:{x:number;y:number;id:number}|null=null,armed=false,active=false;
    const blocked=(target:EventTarget|null)=>{
      const element=target instanceof Element?target:null;
      return !element?.closest('main.shell')||!!element.closest('.history-plot, .category-pie, input, textarea, select, [data-no-pull]')||document.body.style.position==='fixed';
    };
    const down=(event:TouchEvent)=>{
      if(latest.current.disabled||latest.current.busy||event.touches.length!==1||window.scrollY>0||blocked(event.target))return;
      const touch=event.touches[0];start={x:touch.clientX,y:touch.clientY,id:touch.identifier};armed=false;active=false;
    };
    const move=(event:TouchEvent)=>{
      if(!start)return;const touch=[...event.touches].find(t=>t.identifier===start!.id);if(!touch)return;
      const dy=touch.clientY-start.y,dx=touch.clientX-start.x;
      if(!active){if(dy<8||Math.abs(dx)>dy||window.scrollY>0){if(Math.abs(dx)>12||dy<-4)start=null;return;}active=true;}
      if(event.cancelable)event.preventDefault();
      const rubber=Math.min(MAX,dy*.5*(1-Math.min(.5,dy/900)));
      pull.current!.set(rubber);
      if((rubber>=THRESHOLD)!==armed){armed=rubber>=THRESHOLD;if(armed){haptic();const mark=root.current?.querySelector('svg');if(mark)springAnimate(mark,{transform:'scale(1.22,.82)'},{transform:'scale(1)'},{stiffness:500,damping:9});}}
    };
    const up=()=>{
      if(!start)return;start=null;
      if(!active)return;active=false;
      if(!armed){pull.current!.to(0,'squish');return;}
      armed=false;setBusy(true);pull.current!.to(THRESHOLD*.72,'boing');
      const finish=()=>{setBusy(false);pull.current!.to(0,{stiffness:320,damping:20});};
      latest.current.onRefresh().then(finish,finish);
    };
    window.addEventListener('touchstart',down,{passive:true});
    window.addEventListener('touchmove',move,{passive:false});
    window.addEventListener('touchend',up);window.addEventListener('touchcancel',up);
    return()=>{window.removeEventListener('touchstart',down);window.removeEventListener('touchmove',move);window.removeEventListener('touchend',up);window.removeEventListener('touchcancel',up);pull.current?.stop();document.querySelector<HTMLElement>('main.shell')?.style.removeProperty('translate');};
  },[]);
  const fill=busy?1:progress;
  return <div ref={root} className="pull-refresh" data-busy={busy||undefined} data-full={fill>=1||undefined} aria-hidden={!busy} role="status" style={{opacity:busy?1:Math.min(1,progress*1.8)}} aria-label={busy?'更新しています':undefined}>
    <svg viewBox="260 180 760 880" aria-hidden="true">
      <defs><clipPath id="pull-refresh-fill"><path d={reducedMotion()?sector(fill>0?1:0):sector(fill)}/></clipPath></defs>
      <g className="pull-refresh-ghost">{pathData.map((d,index)=><path key={index} d={d} transform={index===0?'translate(0 -28)':undefined}/>)}</g>
      <g clipPath="url(#pull-refresh-fill)">{pathData.map((d,index)=><path key={index} className={`pull-refresh-${TONES[index]}`} d={d} transform={index===0?'translate(0 -28)':undefined}/>)}</g>
    </svg>
  </div>;
}
