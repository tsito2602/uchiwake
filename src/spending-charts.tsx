import { displayColor } from './display-color';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChartBar, ChartPie } from 'lucide-react';
import { categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import type { Category, CategoryAppearance } from './domain';
import './spending-charts.css';
import { NumberTicker } from './number-ticker';
import { CategoryPie } from './category-pie';
import { historyIndexAt, historyLabelLeft } from './chart-interaction';

export type HistoryPoint={month:string;amount:number;total:number};
const yen=(amount:number)=>`¥${amount.toLocaleString('ja-JP')}`;
const monthLabel=(month:string)=>`${Number(month.slice(0,4))}年${Number(month.slice(5))}月`;
const ease=[0.22,1,0.36,1] as const;

export function SettlementChart({data,month}:{data:HistoryPoint[];month:string}) {
  const reduce=useReducedMotion();
  const [active,setActive]=useState<number|null>(null);
  const plot=useRef<HTMLDivElement>(null);
  const [plotWidth,setPlotWidth]=useState(0);
  const dragging=useRef<number|null>(null);
  const cursor=useRef<number|null>(null);
  const release=()=>{dragging.current=null;setActive(null);};
  const hit=(event:PointerEvent<HTMLDivElement>)=>{
    const bounds=event.currentTarget.getBoundingClientRect();
    const index=historyIndexAt(event.clientX,bounds.left,bounds.width,data.length);
    cursor.current=index;
    setActive(index);
  };
  useLayoutEffect(()=>{
    const element=plot.current;
    if(!element)return;
    const measure=()=>setPlotWidth(element.getBoundingClientRect().width);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{setActive(null);dragging.current=null;cursor.current=null;},[data.length,month]);
  useEffect(()=>{
    const end=(event:globalThis.PointerEvent)=>{if(dragging.current===event.pointerId)release();};
    window.addEventListener('blur',release);
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',end);
    return()=>{window.removeEventListener('blur',release);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
  },[]);
  const maximum=Math.max(1,...data.map(item=>Math.abs(item.total)));
  const slot=1000/Math.max(1,data.length);
  const index=Math.min(data.length-1,active??cursor.current??Math.max(0,data.findIndex(item=>item.month===month)));
  const point=active===null?null:data[active];
  const displayPoint=data[index];
  const labelWidth=Math.min(184,plotWidth);
  const labelStyle={width:labelWidth,left:historyLabelLeft(index,data.length,plotWidth,labelWidth)};
  function keyDown(event:KeyboardEvent<HTMLDivElement>) {
    const next=event.key==='ArrowLeft'?index-1:event.key==='ArrowRight'?index+1:event.key==='Home'?0:event.key==='End'?data.length-1:null;
    if(next!==null){event.preventDefault();cursor.current=Math.max(0,Math.min(data.length-1,next));setActive(cursor.current);}
    if(event.key==='Escape')setActive(null);
  }
  return <div className="history-chart">
    <div ref={plot} className="history-plot" role="slider" tabIndex={0} aria-label="月別の支払い合計" aria-valuemin={0} aria-valuemax={Math.max(0,data.length-1)} aria-valuenow={index} aria-valuetext={displayPoint?`${monthLabel(displayPoint.month)}、支払い合計 ${yen(displayPoint.total)}`:undefined} onKeyDown={keyDown} onKeyUp={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))setActive(null);}} onBlur={release}
      onPointerDown={event=>{if(event.button!==0||!event.isPrimary)return;dragging.current=event.pointerId;event.currentTarget.setPointerCapture(event.pointerId);hit(event);}}
      onPointerMove={event=>{if(dragging.current===event.pointerId)hit(event);}}
      onPointerUp={event=>{if(dragging.current!==event.pointerId)return;release();if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={release} onLostPointerCapture={release}>
      <svg viewBox="0 0 1000 160" preserveAspectRatio="none" aria-hidden="true">
        {point&&<motion.line x1={(index+.5)*slot} x2={(index+.5)*slot} y1="0" y2="156" stroke="var(--line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke"/>}
        {data.map((item,i)=>{
          const selected=active===i;
          const height=item.total?Math.max(5,Math.abs(item.total)/maximum*132):3;
          const width=slot*(selected?.74:.42);
          // Entrance is separate from scrubbing, so the stagger never delays selection.
          return <g key={`${data.length}-${item.month}`} className="history-bar-grow" style={{'--bar-delay':`${i*Math.min(.045,.3/Math.max(1,data.length-1))}s`,animation:reduce?'none':undefined} as CSSProperties}>
            <motion.rect fill={selected?'var(--ink)':item.month===month?'var(--history-current)':item.total?'var(--history-bar)':'var(--soft)'} initial={false} animate={{x:(i+.5)*slot-width/2,y:156-height*(selected?1.08:1),width,height:height*(selected?1.08:1)}} transition={{duration:reduce?0:.28,ease}} rx={Math.min(5,slot*.12)}/>
          </g>;
        })}
      </svg>
    </div>
    <div className="history-tooltip" aria-hidden="true" data-visible={!!point} style={labelStyle}>{displayPoint&&<><strong>{yen(displayPoint.total)}</strong><span>{monthLabel(displayPoint.month)}</span></>}</div>
  </div>;
}

export function CategoryChart({data,settings=[],animateAmounts=true,onSelectCategory}:{data:{category:Category;amount:number}[];settings?:CategoryAppearance[];animateAmounts?:boolean;onSelectCategory?:(category:Category,source:HTMLElement)=>void}) {
  const reduce=useReducedMotion();
  const [view,setView]=useState<'bar'|'pie'>('bar');
  const items=[...data].sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount));
  const maximum=Math.max(1,...items.map(item=>Math.abs(item.amount)));
  const positive=data.reduce((sum,item)=>sum+Math.max(0,item.amount),0);
  const refunds=data.some(item=>item.amount<0);
  return <section className="category-chart" aria-label="カテゴリ別のカード利用額">
    <div className="category-chart-heading"><h2>カテゴリ別</h2>
      <div className="category-chart-switch" role="group" aria-label="グラフの表示形式">
        <button type="button" aria-label="円グラフ" title="円グラフ" aria-pressed={view==='pie'} onClick={()=>setView('pie')}><ChartPie size={19} aria-hidden="true"/></button>
        <button type="button" aria-label="横棒グラフ" title="横棒グラフ" aria-pressed={view==='bar'} onClick={()=>setView('bar')}><ChartBar size={19} aria-hidden="true"/></button>
      </div>
    </div>
    <AnimatePresence mode="wait" initial={false}><motion.div key={view} initial={{opacity:0,y:reduce?0:5}} animate={{opacity:1,y:0}} exit={{opacity:0,y:reduce?0:-3}} transition={{duration:reduce?0:.15}}>
    {view==='pie'&&<CategoryPie items={items.filter(item=>item.amount>0)} settings={settings} onSelectCategory={onSelectCategory}/>}
    <ul><AnimatePresence initial={false}>{items.map((item,index)=>{
      const content=<>
      <div className="category-chart-label"><span><CategoryIcon name={categoryAppearance(item.category,settings).icon} color={categoryAppearance(item.category,settings).color} size={17}/>{item.category}</span><span><strong>{animateAmounts?<NumberTicker value={item.amount}/>:yen(item.amount)}</strong><small>{item.amount<0?'返金':positive?`${Math.round(item.amount/positive*100)}%`:''}</small></span></div>
      {view==='bar'&&<div className={`category-chart-track${item.amount<0?' is-refund':''}`} aria-hidden="true"><motion.div initial={reduce?false:{scaleX:0}} whileInView={{scaleX:1}} viewport={{once:true,amount:.5}} animate={{width:`${Math.abs(item.amount)/maximum*100}%`}} transition={{duration:reduce?0:.55,ease,scaleX:{delay:reduce?0:index*.035,duration:reduce?0:.55,ease}}} style={{background:displayColor(categoryAppearance(item.category,settings).color),transformOrigin:'left'}}/></div>}
      </>;
      return <motion.li layout={reduce?false:"position"} key={item.category} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,height:0,marginBottom:-20}} transition={{duration:reduce?0:.45,ease}}>{onSelectCategory?<button type="button" className="category-chart-row panel-source" aria-label={`${item.category}の明細を見る`} aria-haspopup="dialog" onClick={event=>onSelectCategory(item.category,event.currentTarget)}>{content}</button>:content}</motion.li>;
    })}</AnimatePresence></ul>
    </motion.div></AnimatePresence>
    {refunds&&<p className="category-chart-note">返金はマイナス額で表示。割合はプラスのカテゴリ合計を基準にしています。{view==='pie'&&'円グラフにはプラスのカテゴリのみ表示しています。'}</p>}
  </section>;
}
