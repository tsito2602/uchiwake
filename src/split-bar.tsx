import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { haptic } from './haptics';
import { LiveSpring, reducedMotion, springAnimate } from './cartoon-motion';
import { Money } from './money';

export type SplitPerson={id:string;name:string;amount:number};

const STEP=5;
const percents=(people:SplitPerson[])=>{
  const total=people.reduce((sum,person)=>sum+Math.max(0,person.amount),0);
  if(!total)return people.map(()=>Math.round(100/Math.max(1,people.length)));
  const raw=people.map(person=>Math.max(0,person.amount)/total*100);
  const rounded=raw.map(Math.floor);let rest=100-rounded.reduce((a,b)=>a+b,0);
  raw.map((value,index)=>[value-Math.floor(value),index] as const).sort((a,b)=>b[0]-a[0]).forEach(([,index])=>{if(rest-->0)rounded[index]++;});
  return rounded;
};

// Who carries what, as one bar. Joined, it still names everyone and their
// share. A tap tears it apart into each person's amount; with two people the
// seam between the pieces can be dragged in 5% steps to change the split.
export function SplitBar({people,editable,onCommit}:{people:SplitPerson[];editable:boolean;onCommit?:(firstPercent:number)=>void}) {
  const [torn,setTorn]=useState(false);
  const [drag,setDrag]=useState<number|null>(null);
  const root=useRef<HTMLDivElement>(null);
  const gap=useRef<LiveSpring|null>(null);
  const press=useRef<{id:number;x:number;start:number;width:number;moved:boolean}|null>(null);
  const base=percents(people);
  const shown=drag===null||people.length!==2?base:[drag,100-drag];
  const total=people.reduce((sum,person)=>sum+person.amount,0);
  gap.current??=new LiveSpring(0,value=>root.current?.style.setProperty('--split-gap',`${Math.max(0,value).toFixed(2)}px`),'boing');
  useEffect(()=>()=>gap.current?.stop(),[]);
  useEffect(()=>{gap.current?.to(torn?6:0,torn?{stiffness:380,damping:12}:'squish');},[torn]);
  function toggle(){
    haptic();setTorn(value=>!value);
    const bar=root.current?.querySelector('.split-bar-track');
    if(bar&&!reducedMotion())springAnimate(bar,{transform:'scale(1.04,.86)'},{transform:'scale(1,1)'},{stiffness:420,damping:10});
  }
  const canDrag=editable&&torn&&people.length===2;
  function seamDown(event:PointerEvent<HTMLSpanElement>){
    if(!canDrag||event.button!==0)return;
    event.stopPropagation();event.preventDefault();
    const width=root.current?.querySelector('.split-bar-track')?.getBoundingClientRect().width??1;
    press.current={id:event.pointerId,x:event.clientX,start:shown[0],width,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);setDrag(shown[0]);
  }
  function seamMove(event:PointerEvent<HTMLSpanElement>){
    const current=press.current;if(current?.id!==event.pointerId)return;
    const next=Math.max(STEP,Math.min(100-STEP,Math.round((current.start+(event.clientX-current.x)/current.width*100)/STEP)*STEP));
    if(Math.abs(event.clientX-current.x)>3)current.moved=true;
    if(next!==drag){haptic();setDrag(next);}
  }
  function seamUp(event:PointerEvent<HTMLSpanElement>){
    const current=press.current;if(current?.id!==event.pointerId)return;press.current=null;
    if(drag!==null&&drag!==base[0]&&event.type==='pointerup')onCommit?.(drag);
    else setDrag(null);
  }
  useEffect(()=>{setDrag(null);},[base.join()]);
  return <div ref={root} className="split-bar" data-torn={torn||undefined} data-dragging={drag!==null||undefined} style={{'--split-gap':'0px'} as CSSProperties}>
    <button type="button" className="split-bar-track" aria-expanded={torn} aria-label={`負担の割合：${people.map((person,index)=>`${person.name} ${shown[index]}%`).join('、')}。${torn?'タップでまとめる':'タップで金額を表示'}`} onClick={()=>{if(!press.current)toggle();}}>
      {people.map((person,index)=><span key={person.id} className="split-bar-piece" data-tone={index%3} style={{flexGrow:Math.max(1,shown[index])}}>
        <span className="split-bar-name">{person.name}</span>
        <span className="split-bar-share">{shown[index]}%</span>
        <span className="split-bar-amount" aria-hidden={!torn}>{drag===null?<Money value={person.amount}/>:<Money value={Math.round(total*shown[index]/100)}/>}</span>
      </span>)}
    </button>
    {canDrag&&<span className="split-bar-seam" role="slider" aria-label={`${people[0].name}の割合`} aria-valuemin={STEP} aria-valuemax={100-STEP} aria-valuenow={shown[0]} tabIndex={0} style={{left:`calc(${shown[0]}% + (var(--split-gap) * ${(50-shown[0])/100}))`}}
      onPointerDown={seamDown} onPointerMove={seamMove} onPointerUp={seamUp} onPointerCancel={seamUp}
      onKeyDown={event=>{const delta=event.key==='ArrowLeft'?-STEP:event.key==='ArrowRight'?STEP:0;if(!delta)return;event.preventDefault();const next=Math.max(STEP,Math.min(100-STEP,shown[0]+delta));setDrag(next);onCommit?.(next);}}/>}
  </div>;
}
