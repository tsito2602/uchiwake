import { useEffect, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { categoryAppearance } from './category-appearance';
import { displayColor } from './display-color';
import { LiveSpring, reducedMotion } from './cartoon-motion';
import { NumberTicker } from './number-ticker';
import { haptic } from './haptics';
import { ios } from './haptic-touch';
import type { Category, CategoryAppearance } from './domain';

type Item={category:Category;amount:number};
type Segment={out:LiveSpring;rot:LiveSpring;scale:LiveSpring;draw:()=>void};
const yen=(amount:number)=>`¥${amount.toLocaleString('ja-JP')}`;
const INNER=64,OUTER=110,GAP=.02,POP=12;

// One square-cornered piece of the ring, like a piece of the う.
function arc(a0:number,a1:number){
  if(a1-a0>=Math.PI*2-.001){
    const ring=(r:number)=>`M ${r} 0 A ${r} ${r} 0 1 1 ${-r} 0 A ${r} ${r} 0 1 1 ${r} 0 Z`;
    return `${ring(OUTER)} ${ring(INNER)}`;
  }
  const p=(a:number,r:number)=>`${(Math.cos(a)*r).toFixed(2)} ${(Math.sin(a)*r).toFixed(2)}`,big=a1-a0>Math.PI?1:0;
  return `M ${p(a0,OUTER)} A ${OUTER} ${OUTER} 0 ${big} 1 ${p(a1,OUTER)} L ${p(a1,INNER)} A ${INNER} ${INNER} 0 ${big} 0 ${p(a0,INNER)} Z`;
}

// The category donut. When it comes into view its pieces spin in and gather
// into the ring. A tapped piece opens that category's statements; a held piece
// pops out and the centre rolls to its amount, following the finger round the
// ring. Another month replays the same gathering.
export function CategoryPie({items,settings,selected,opened,onPick,onOpen}:{items:Item[];settings:CategoryAppearance[];selected:Category|null;opened?:Category|null;onPick:(category:Category|null)=>void;onOpen?:(category:Category,source:Element)=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const groups=useRef<(SVGGElement|null)[]>([]);
  const segments=useRef(new Map<Category,Segment>());
  const total=items.reduce((sum,item)=>sum+item.amount,0);
  let angle=-Math.PI/2;
  const slices=items.map(item=>{
    const span=item.amount/total*Math.PI*2,single=items.length===1;
    const a0=single?0:angle+GAP,a1=single?Math.PI*2:angle+span-GAP;angle+=span;
    return {...item,mid:(a0+a1)/2,path:arc(a0,a1)};
  });
  const latest=useRef(slices);latest.current=slices;
  const segment=(category:Category,index:number)=>{
    let s=segments.current.get(category);
    if(!s){
      const draw=()=>{const list=latest.current,at=list.findIndex(item=>item.category===category),g=groups.current[at],x=segments.current.get(category),slice=list[at];
        if(!g||!x||!slice)return;
        g.setAttribute('transform',`rotate(${x.rot.value.toFixed(2)}) translate(${(Math.cos(slice.mid)*x.out.value).toFixed(2)} ${(Math.sin(slice.mid)*x.out.value).toFixed(2)}) scale(${Math.max(0,x.scale.value).toFixed(4)})`);};
      s={out:new LiveSpring(0,draw,{stiffness:420,damping:16}),rot:new LiveSpring(0,draw,{stiffness:260,damping:18}),scale:new LiveSpring(1,draw,{stiffness:320,damping:14}),draw};
      segments.current.set(category,s);void index;
    }
    return s;
  };
  slices.forEach((slice,index)=>segment(slice.category,index));
  const signature=items.map(item=>`${item.category}:${item.amount}`).join();
  const assembled=useRef(false);
  const timers=useRef<number[]>([]);
  const later=(ms:number,fn:()=>void)=>{timers.current.push(window.setTimeout(fn,reducedMotion()?0:ms));};

  // On screen, every piece spins in from behind and gathers: the first time,
  // and again whenever another month brings new numbers.
  const previous=useRef<string|null>(null);
  useLayoutEffect(()=>{
    const node=root.current,first=previous.current===null;
    if(previous.current===signature)return;previous.current=signature;
    if(!node||reducedMotion()){assembled.current=true;return;}
    timers.current.forEach(clearTimeout);timers.current=[];
    const list=latest.current;
    list.forEach((slice,index)=>{const s=segment(slice.category,index);s.out.set(0);s.rot.set(-70-index*12);s.scale.set(0);});
    const gather=()=>list.forEach((slice,index)=>{const s=segment(slice.category,index);later(index*55,()=>{s.rot.to(0);s.scale.to(1);});});
    if(!first){gather();assembled.current=true;return;}
    const observer=new IntersectionObserver(entries=>{
      if(!entries.some(entry=>entry.isIntersecting))return;observer.disconnect();
      gather();assembled.current=true;
    },{threshold:.35});
    observer.observe(node);
    return()=>observer.disconnect();
  },[signature]);
  // Selection pops the chosen piece out of the ring.
  useEffect(()=>{
    if(!assembled.current)return;
    slices.forEach((slice,index)=>{const s=segment(slice.category,index),on=slice.category===selected;
      s.out.to(on?POP:0,on?{stiffness:420,damping:12}:{stiffness:420,damping:22});
      if(on){s.scale.set(.9);s.scale.to(1,{stiffness:420,damping:10});}});
  },[selected]);
  useLayoutEffect(()=>{slices.forEach((slice,index)=>segment(slice.category,index).draw());});
  useEffect(()=>()=>{timers.current.forEach(clearTimeout);segments.current.forEach(s=>{s.out.stop();s.rot.stop();s.scale.stop();});},[]);

  const current=slices.find(item=>item.category===selected)??null;
  // The centre figure shrinks with its digits so it never runs onto the ring.
  const figure=yen(current?current.amount:total).length,figureSize=figure<=7?24:figure<=8?21:figure<=10?18:15;
  // A tap on a piece opens its statements straight away. Holding a piece
  // pops it out instead, and sliding the finger round the ring pops each
  // piece it passes; letting go puts them all back.
  const pieceAt=(x:number,y:number):Category|null=>{
    const svg=root.current?.querySelector('svg'),box=svg?.getBoundingClientRect();if(!box||!box.width)return null;
    const scale=260/box.width,dx=(x-box.left)*scale-130,dy=(y-box.top)*scale-130,r=Math.hypot(dx,dy);
    if(r<INNER*.55||r>OUTER+34)return null;
    let a=Math.atan2(dy,dx);if(a<-Math.PI/2)a+=Math.PI*2;
    const list=latest.current;let at=-Math.PI/2;
    for(const item of list){const span=item.amount/total*Math.PI*2;if(a<at+span)return item.category;at+=span;}
    return list.at(-1)?.category??null;
  };
  const gesture=useRef<{id:number;x:number;y:number;category:Category;held:boolean;moved:boolean;timer:number}|null>(null);
  const lastTap=useRef<{category:Category;at:number}|null>(null);
  const openPiece=(category:Category)=>{const node=root.current?.querySelector<SVGPathElement>(`.category-pie-slice[data-category="${CSS.escape(category)}"]`);if(node&&onOpen){haptic();onOpen(category,node);}};
  const end=()=>{const g=gesture.current;if(g)window.clearTimeout(g.timer);gesture.current=null;};
  const down=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(!event.isPrimary||event.button!==0)return;
    const category=pieceAt(event.clientX,event.clientY);if(!category)return;
    end();event.currentTarget.setPointerCapture?.(event.pointerId);
    const g={id:event.pointerId,x:event.clientX,y:event.clientY,category,held:false,moved:false,timer:0};
    g.timer=window.setTimeout(()=>{if(gesture.current!==g||g.moved)return;g.held=true;haptic();onPickRef.current(g.category);},320);
    gesture.current=g;
  };
  const move=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;
    if(g.held){const category=pieceAt(event.clientX,event.clientY);if(category&&category!==g.category){g.category=category;haptic();onPickRef.current(category);}return;}
    if(Math.hypot(event.clientX-g.x,event.clientY-g.y)>10){g.moved=true;window.clearTimeout(g.timer);}
  };
  const up=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const g=gesture.current;if(!g||g.id!==event.pointerId)return;end();
    if(g.held){onPickRef.current(null);return;}
    if(g.moved||event.type!=='pointerup'||pieceAt(event.clientX,event.clientY)!==g.category)return;
    // iPhone opens from its haptic switch (below) so the tap ticks.
    if(ios)lastTap.current={category:g.category,at:performance.now()};else openPiece(g.category);
  };
  const openRef=useRef(openPiece);openRef.current=openPiece;
  // iPhone ticks only through a native switch, so one invisible label lies over
  // the ring; its toggle after a plain tap is what opens the piece.
  const label=useRef<HTMLLabelElement>(null);
  const onPickRef=useRef(onPick);onPickRef.current=onPick;
  useLayoutEffect(()=>{
    const node=label.current,input=node?.querySelector('input');if(!node||!input)return;
    const tap=(event:MouseEvent)=>event.stopPropagation();
    const change=()=>{window.setTimeout(()=>{const t=lastTap.current;lastTap.current=null;if(t&&performance.now()-t.at<600)openRef.current(t.category);},0);};
    node.addEventListener('click',tap);input.addEventListener('change',change);
    return()=>{node.removeEventListener('click',tap);input.removeEventListener('change',change);};
  },[total>0]);
  return <div className="category-pie" ref={root} data-selected={current?'true':undefined}
    onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onContextMenu={event=>event.preventDefault()}>
    {total>0?<svg viewBox="-130 -130 260 260" role="group" aria-label="カテゴリ別の支払い割合。片をタップすると明細が開きます。長押ししてなぞると金額を確認できます。">
      {slices.map((item,index)=><g key={item.category} ref={node=>{groups.current[index]=node;}}>
        <path className={`category-pie-slice${onOpen?' panel-source':''}`} data-panel-source={opened===item.category?'true':undefined} data-category={item.category} data-mid={item.mid} data-radius={(INNER+OUTER)/2} data-dim={current&&current.category!==item.category?'true':undefined} d={item.path} fillRule="evenodd" role="button" tabIndex={0} aria-pressed={item.category===selected}
          aria-label={`${item.category}：${yen(item.amount)}`} fill={displayColor(categoryAppearance(item.category,settings).color)}
          onClick={event=>{if(event.detail===0)openPiece(item.category);}}
          onFocus={()=>onPick(item.category)} onBlur={()=>onPick(null)}
          onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openPiece(item.category);}if(event.key==='Escape')onPick(null);}}/>
      </g>)}
    </svg>:<p className="category-pie-empty">割合を表示できる支払いがありません</p>}
    {total>0&&<div className="category-pie-center" role="status" aria-live="polite">
      <small>{current?current.category:'カード合計'}</small><b style={{fontSize:figureSize}}><NumberTicker value={current?current.amount:total}/></b><span>{current?`${Math.round(current.amount/total*100)}%`:`${items.length}つの費目`}</span>
    </div>}
    {total>0&&ios&&<label ref={label} className="haptic-touch category-pie-haptic" aria-hidden="true"><input type="checkbox" {...{switch:''}} tabIndex={-1}/></label>}
  </div>;
}
