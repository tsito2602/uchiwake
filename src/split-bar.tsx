import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from './haptics';
import { LiveSpring, reducedMotion } from './cartoon-motion';
import { NumberTicker } from './number-ticker';

export type SplitPerson={id:string;name:string;amount:number};

const STEP=.05;
const initial=(name:string)=>Array.from(name.trim())[0]??'';
const shares=(people:SplitPerson[])=>{
  const total=people.reduce((sum,person)=>sum+Math.max(0,person.amount),0);
  return people.map(person=>total?Math.max(0,person.amount)/total:1/Math.max(1,people.length));
};

// Who carries what, as one gooey bar. Joined, it still names everyone and
// their share. A tap stretches it until it tears in two: the hero amount
// squashes away and each person's amount springs out in its place. With two
// people the seam can then be pulled in 5% steps to change the split.
export function SplitBar({people,editable,onCommit}:{people:SplitPerson[];editable:boolean;onCommit?:(firstPercent:number)=>void}) {
  const filter=`split-goo-${useId().replace(/:/g,'')}`;
  const root=useRef<HTMLDivElement>(null);
  const [split,setSplit]=useState(false);
  const [slot,setSlot]=useState<HTMLElement|null>(null);
  const base=shares(people);
  const pair=people.length===2;
  const [ratio,setRatio]=useState(base[0]);
  const total=people.reduce((sum,person)=>sum+person.amount,0);
  const shown=pair?[ratio,1-ratio]:base;
  const amounts=pair&&Math.abs(ratio-base[0])>.001?[Math.round(total*ratio),total-Math.round(total*ratio)]:people.map(person=>person.amount);
  const springs=useRef<{gap:LiveSpring;ratio:LiveSpring;squash:LiveSpring;heroX:LiveSpring;heroY:LiveSpring;heroOpacity:LiveSpring;nums:LiveSpring[]}|null>(null);
  const shapes=useRef(base);shapes.current=base;
  const drag=useRef<{id:number;left:number;width:number;moved:boolean}|null>(null);

  function draw(){
    const node=root.current,s=springs.current;if(!node||!s)return;
    const width=node.clientWidth,gap=Math.max(0,s.gap.value),squash=s.squash.value;
    const pieces=[...node.querySelectorAll<HTMLElement>('.split-bar-piece')],labels=[...node.querySelectorAll<HTMLElement>('.split-bar-label')];
    const parts=pair?[s.ratio.value,1-s.ratio.value]:shapes.current;
    const gaps=Math.max(0,parts.length-1)*gap;let left=0;
    parts.forEach((part,index)=>{
      const w=Math.max(0,part*(width-gaps)),piece=pieces[index],label=labels[index];
      if(piece){piece.style.left=`${left}px`;piece.style.width=`${w}px`;piece.style.transform=`scaleY(${squash})`;}
      if(label){
        const edge=index===0?-1:index===parts.length-1?1:0;
        label.style.left=`${left}px`;label.style.width=`${w}px`;label.style.transform=`translateX(${edge*gap*.15}px)`;
        label.style.opacity=w>(index===0?96:112)?'1':'0';
      }
      left+=w+gap;
    });
    const seam=node.querySelector<HTMLElement>('.split-bar-seam');
    if(seam)seam.style.left=`${s.ratio.value*(width-gap)+gap/2}px`;
    const hero=node.closest('.settlement-hero')?.querySelector<HTMLElement>('.hero-money');
    if(hero){hero.style.transform=s.heroX.value===1&&s.heroY.value===1?'':`scale(${s.heroX.value},${s.heroY.value})`;hero.style.opacity=s.heroOpacity.value>=.999?'':String(Math.max(0,s.heroOpacity.value));}
    const nums=slot?[...slot.querySelectorAll<HTMLElement>('.hero-split-person')]:[];
    nums.forEach((num,index)=>{const v=s.nums[index]?.value??1;num.style.opacity=String(Math.max(0,Math.min(1,1-v)));num.style.transform=`translateY(${v*22}px) scale(${1-v*.35})`;});
  }
  const drawRef=useRef(draw);drawRef.current=draw;
  springs.current??={
    gap:new LiveSpring(0,()=>drawRef.current(),{stiffness:260,damping:12}),
    ratio:new LiveSpring(base[0],()=>drawRef.current(),{stiffness:500,damping:30}),
    squash:new LiveSpring(1,()=>drawRef.current(),{stiffness:500,damping:16}),
    heroX:new LiveSpring(1,()=>drawRef.current(),{stiffness:520,damping:15}),
    heroY:new LiveSpring(1,()=>drawRef.current(),{stiffness:520,damping:15}),
    heroOpacity:new LiveSpring(1,()=>drawRef.current(),{stiffness:300,damping:26}),
    nums:[0,1,2,3,4,5].map(()=>new LiveSpring(1,()=>drawRef.current(),{stiffness:380,damping:13})),
  };
  useLayoutEffect(()=>{setSlot(root.current?.closest('.settlement-hero')?.querySelector<HTMLElement>('.hero-split-slot')??null);},[]);
  useLayoutEffect(()=>{draw();});
  useEffect(()=>{
    const node=root.current;if(!node)return;
    const observer=new ResizeObserver(()=>drawRef.current());observer.observe(node);
    return()=>{observer.disconnect();const s=springs.current!;[s.gap,s.ratio,s.squash,s.heroX,s.heroY,s.heroOpacity,...s.nums].forEach(spring=>spring.stop());
      const hero=node.closest('.settlement-hero')?.querySelector<HTMLElement>('.hero-money');if(hero){hero.style.transform='';hero.style.opacity='';}};
  },[]);
  // A new month or a saved split moves the seam to the stored shares.
  useEffect(()=>{if(drag.current)return;setRatio(base[0]);springs.current!.ratio.to(base[0]);},[base.map(v=>v.toFixed(4)).join()]);

  const later=(ms:number,fn:()=>void)=>window.setTimeout(fn,reducedMotion()?0:ms);
  function toggle(){
    const s=springs.current!,next=!split;setSplit(next);haptic();
    if(next){
      s.squash.set(.6);s.squash.to(1,{stiffness:500,damping:16});
      s.gap.to(14,{stiffness:230,damping:10});
      s.heroX.to(1.12);s.heroY.to(.7);
      later(90,()=>{s.heroOpacity.to(0);s.nums.forEach((num,index)=>later(index*70,()=>num.to(0,{stiffness:380,damping:13})));});
    }else{
      s.gap.to(0,{stiffness:420,damping:20});
      if(pair){setRatio(base[0]);s.ratio.to(base[0]);}
      s.nums.forEach(num=>num.to(1,{stiffness:500,damping:30}));
      s.heroOpacity.to(1);s.heroX.set(.9);s.heroY.set(1.12);s.heroX.to(1,{stiffness:420,damping:12});s.heroY.to(1,{stiffness:420,damping:12});
    }
  }
  const canDrag=editable&&split&&pair;
  function down(event:PointerEvent<HTMLDivElement>){
    if(event.button!==0)return;
    const rect=event.currentTarget.getBoundingClientRect(),x=event.clientX-rect.left;
    if(canDrag&&Math.abs(x-springs.current!.ratio.value*rect.width)<34){
      drag.current={id:event.pointerId,left:rect.left,width:rect.width,moved:false};
      event.currentTarget.setPointerCapture(event.pointerId);springs.current!.squash.to(.82);
    }else drag.current={id:-1-event.pointerId,left:0,width:0,moved:false};
  }
  function move(event:PointerEvent<HTMLDivElement>){
    const current=drag.current;if(current?.id!==event.pointerId)return;current.moved=true;
    const raw=Math.max(.2,Math.min(.8,(event.clientX-current.left)/current.width)),snapped=Math.round(raw/STEP)*STEP;
    if(Math.abs(snapped-ratio)>.001){haptic();const squash=springs.current!.squash;squash.set(.9);squash.to(1);setRatio(snapped);}
    springs.current!.ratio.to(snapped,{stiffness:700,damping:34});
  }
  function up(event:PointerEvent<HTMLDivElement>){
    const current=drag.current;drag.current=null;
    if(current&&current.id===event.pointerId){
      springs.current!.squash.to(1,{stiffness:420,damping:12});
      if(current.moved){if(event.type==='pointerup'&&Math.abs(ratio-base[0])>.001)onCommit?.(Math.round(ratio*100));return;}
    }
    if(event.type==='pointerup'&&current)toggle();
  }
  function key(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle();return;}
    if(!canDrag||(event.key!=='ArrowLeft'&&event.key!=='ArrowRight'))return;
    event.preventDefault();
    const next=Math.max(.2,Math.min(.8,Math.round(ratio/STEP)*STEP+(event.key==='ArrowLeft'?-STEP:STEP)));
    setRatio(next);springs.current!.ratio.to(next);onCommit?.(Math.round(next*100));
  }
  const percent=(value:number)=>Math.round(value*100);
  return <>
    <div ref={root} className="split-bar" data-split={split||undefined} role="button" tabIndex={0} aria-expanded={split}
      aria-label={`負担の割合：${people.map((person,index)=>`${person.name} ${percent(shown[index])}%`).join('、')}。${split?'タップでまとめる':'タップで金額を表示'}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
      <svg className="split-bar-filter" aria-hidden="true" width="0" height="0"><filter id={filter}><feGaussianBlur in="SourceGraphic" stdDeviation="5" result="b"/><feColorMatrix in="b" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" result="g"/><feComposite in="SourceGraphic" in2="g" operator="atop"/></filter></svg>
      <div className="split-bar-goo" style={{filter:`url(#${filter})`}} aria-hidden="true">{people.map((person,index)=><i key={person.id} className="split-bar-piece" data-tone={index%3}/>)}</div>
      {people.map((person,index)=><span key={person.id} className="split-bar-label" data-tone={index%3} data-edge={index===people.length-1&&index>0?'end':undefined} aria-hidden="true">
        <i>{initial(person.name)}</i><span className="split-bar-name">{person.name}</span><span className="split-bar-share">{percent(shown[index])}%</span>
      </span>)}
      {canDrag&&<span className="split-bar-seam" aria-hidden="true"><span/></span>}
    </div>
    <p className="split-bar-hint">{split?(canDrag?'継ぎ目を左右に引くと、負担割合が変わります':'もう一度タップでまとまります'):`${pair?'ふたり':'みんな'}の負担。タップすると、ちぎれて金額が出ます`}</p>
    {slot&&createPortal(<span className="hero-split-nums" aria-live="polite" aria-hidden={!split}>{people.map((person,index)=><span key={person.id} className="hero-split-person"><small>{person.name}</small><b><NumberTicker value={amounts[index]}/></b></span>)}</span>,slot)}
  </>;
}
