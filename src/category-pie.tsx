import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { categoryAppearance } from './category-appearance';
import { displayColor } from './display-color';
import { donutSlice, pieIndexAt, pieSlice } from './chart-interaction';
import { geometry } from './brand-motion';
import { Money } from './money';
import type { Category, CategoryAppearance } from './domain';

type Item={category:Category;amount:number};
type Press={id:number;x:number;y:number;index:number;held:boolean;moved:boolean};
const yen=(amount:number)=>`¥${amount.toLocaleString('ja-JP')}`;

// The logo is a pie chart. Each time the chart appears, the う first rolls
// back into its ring (the launch played in reverse), then the category colours
// sweep over it clockwise from noon and the ring wobbles once when full.
const HANDOFF=620;
const handoffEase=(t:number)=>1-Math.pow(1-t,3);
const toPath=(points:number[][])=>`M ${points.map(([x,y])=>`${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`;
function logoFrame(progress:number){
  // progress 0 = the finished letter, 1 = the closed ring.
  const {body,head}=geometry(1100+1150*(1-progress));
  return [head,...body].map(toPath);
}
const LOGO_TONES=['ink','ink','mid','pale','ink'];

export function CategoryPie({items,settings,onSelectCategory,onActiveChange}:{items:Item[];settings:CategoryAppearance[];onSelectCategory?:(category:Category,source:HTMLElement)=>void;onActiveChange?:(category:Category|null)=>void}) {
  const reduce=useReducedMotion();
  const id=useId();
  const source=useRef<HTMLDivElement>(null);
  const svg=useRef<SVGSVGElement>(null);
  const mask=useRef<SVGPathElement>(null);
  const group=useRef<SVGGElement>(null);
  const stopReveal=useRef(()=>{});
  const press=useRef<Press|null>(null);
  const timer=useRef(0);
  const lastPointer=useRef(-Infinity);
  const [active,setActive]=useState<number|null>(null);
  const logoGroup=useRef<SVGGElement>(null);
  const [handoff,setHandoff]=useState(true);
  const [initialLogo]=useState(()=>logoFrame(0));
  const total=items.reduce((sum,item)=>sum+item.amount,0);
  let offset=0;
  const slices=items.map(item=>{
    const start=offset;offset+=item.amount/total;
    return {...item,start,end:offset,path:donutSlice(start,offset)};
  });
  const signature=JSON.stringify(items);
  const reset=()=>{window.clearTimeout(timer.current);press.current=null;setActive(null);};
  useEffect(()=>{
    reset();
    window.addEventListener('blur',reset);
    document.addEventListener('visibilitychange',reset);
    return()=>{window.clearTimeout(timer.current);press.current=null;window.removeEventListener('blur',reset);document.removeEventListener('visibilitychange',reset);};
  },[signature]);

  useLayoutEffect(()=>{
    const target=group.current,clip=mask.current;
    if(!target||!clip||reduce)return;
    let frame=0,finished=false;
    const finish=()=>{if(finished)return;finished=true;window.cancelAnimationFrame(frame);window.clearTimeout(deadline);target.removeAttribute('clip-path');setHandoff(false);
      // Full: the ring wobbles once like jelly.
      if(!reduce)target.animate([{transform:'scale(1)'},{transform:'scale(1.05,.95)'},{transform:'scale(.98,1.03)'},{transform:'scale(1)'}],{duration:520,easing:'ease-out'});};
    stopReveal.current=finish;
    // Start once the page has risen into view; the sweep chases the closing ring.
    const logoStart=performance.now()+(logoGroup.current?160:0);
    const started=logoGroup.current?logoStart+HANDOFF-160:performance.now();
    const duration=900;
    const deadline=window.setTimeout(finish,duration+HANDOFF+150);
    const logo=logoGroup.current,pieces=logo?[...logo.querySelectorAll('path')]:[];
    const tick=(now:number)=>{
      if(finished)return;
      if(logo){const h=Math.min(1,Math.max(0,(now-logoStart)/HANDOFF)),frame=logoFrame(handoffEase(h));pieces.forEach((piece,i)=>piece.setAttribute('d',frame[i]));}
      const t=Math.min(1,Math.max(0,(now-started)/duration));
      if(t===1){finish();return;}
      // A single sweeping clip reveals contiguous sectors clockwise from noon.
      const progress=t<.5?8*Math.pow(t,4):1-8*Math.pow(1-t,4);
      clip.setAttribute('d',pieSlice(0,progress,104));
      target.setAttribute('clip-path',`url(#${id})`);
      frame=window.requestAnimationFrame(tick);
    };
    try{frame=window.requestAnimationFrame(tick);}catch{finish();}
    return finish;
  },[signature,reduce,id]);

  const hit=(event:PointerEvent<SVGSVGElement>)=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    if(!bounds.width||!bounds.height)return null;
    return pieIndexAt((event.clientX-bounds.left)/bounds.width*200,(event.clientY-bounds.top)/bounds.height*200,slices.map(item=>item.end));
  };
  const open=(index:number)=>{const item=slices[index];if(item&&source.current)onSelectCategory?.(item.category,source.current);};
  const pointerDown=(event:PointerEvent<SVGSVGElement>)=>{
    if(!event.isPrimary||event.button!==0)return;
    const index=hit(event);if(index===null)return;
    reset();stopReveal.current();
    lastPointer.current=performance.now();
    // Touch feedback is immediate; the timer only distinguishes hold from tap.
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const next={id:event.pointerId,x:event.clientX,y:event.clientY,index,held:false,moved:false};
    press.current=next;
    setActive(index);
    timer.current=window.setTimeout(()=>{if(press.current===next&&!next.moved){next.held=true;}},350);
  };
  const pointerMove=(event:PointerEvent<SVGSVGElement>)=>{
    const current=press.current;if(!current||current.id!==event.pointerId)return;
    setActive(hit(event));
    if(current.held)return;
    if(Math.hypot(event.clientX-current.x,event.clientY-current.y)>10){current.moved=true;window.clearTimeout(timer.current);}
  };
  const pointerUp=(event:PointerEvent<SVGSVGElement>)=>{
    const current=press.current;if(!current||current.id!==event.pointerId)return;
    lastPointer.current=performance.now();
    const tapped=!current.held&&!current.moved&&hit(event)===current.index;
    reset();
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(tapped)open(current.index);
  };
  const selected=active===null?null:slices[active];
  useEffect(()=>{onActiveChange?.(selected?.category??null);},[selected?.category]);
  return <div className="category-pie" ref={source}>
    {total>0?<svg ref={svg} viewBox="0 0 200 200" role="group" aria-label="カテゴリ別の支払い割合。長押ししてスライドすると金額を確認できます。" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={reset} onLostPointerCapture={event=>{if(press.current?.id===event.pointerId)reset();}} onContextMenu={event=>event.preventDefault()}>
      <defs><clipPath id={id}><path ref={mask} d={pieSlice(0,1,104)}/></clipPath></defs>
      {handoff&&!reduce&&<g ref={logoGroup} className="category-pie-logo" transform={`translate(100 100) scale(${88/325}) translate(-627 -666)`} aria-hidden="true">{initialLogo.map((d,index)=><path key={index} d={d} className={`category-pie-logo-${LOGO_TONES[index]}`}/>)}</g>}
      <g ref={group}>{slices.map((item,index)=>{
        const angle=(item.start+item.end)*Math.PI-Math.PI/2;
        const highlighted=active===index;
        return <path className="category-pie-slice" data-category={item.category} data-active={highlighted} key={item.category} d={item.path} role="button" tabIndex={0} aria-label={`${item.category}：${yen(item.amount)}${onSelectCategory?'。明細を見る':''}`} aria-haspopup={onSelectCategory?'dialog':undefined}
          onFocus={()=>{if(!press.current){stopReveal.current();setActive(index);}}} onBlur={()=>{if(!press.current)setActive(null);}}
          onClick={event=>{
            // Some touch browsers send a zero-detail compatibility click after
            // pointerup. Only an independent assistive click may open here.
            if(event.detail===0&&performance.now()-lastPointer.current>700)open(index);
          }}
          onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open(index);}if(event.key==='Escape')setActive(null);}}
          fill={displayColor(categoryAppearance(item.category,settings).color)} fillRule="evenodd"
          style={{transform:highlighted?`translate(${Math.cos(angle)*6}px,${Math.sin(angle)*6}px) scale(1.04)`:'translate(0px,0px) scale(1)'}}/>;
      })}</g>
    </svg>:<p className="category-pie-empty">割合を表示できる支払いがありません</p>}
    {total>0&&<div className="category-pie-center" role="status" aria-live="polite" data-selected={selected?'true':undefined} key={selected?.category??'total'}><span>{selected?selected.category:'合計'}</span><strong><Money value={selected?selected.amount:total}/></strong>{selected&&<small>{Math.round(selected.amount/total*100)}%</small>}</div>}
  </div>;
}
