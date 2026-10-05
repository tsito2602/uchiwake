import { displayColor } from './display-color';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ChartBar, ChartPie } from 'lucide-react';
import { categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import type { Category, CategoryAppearance } from './domain';
import './spending-charts.css';
import { NumberTicker } from './number-ticker';
import { CategoryPie } from './category-pie';
import { LiveSpring, reducedMotion, springAnimate } from './cartoon-motion';
import { historyScrollForIndex } from './chart-interaction';
import { createHistoryGesture } from './history-chart-gesture';

export type HistoryPoint={month:string;amount:number;total:number};
const yen=(amount:number)=>`¥${amount.toLocaleString('ja-JP')}`;
const monthLabel=(month:string)=>`${Number(month.slice(0,4))}年${Number(month.slice(5))}月`;
const ease=[0.22,1,0.36,1] as const;

export function SettlementChart({data,month,visibleMonths,onSelectMonth,onPreview}:{data:HistoryPoint[];month:string;visibleMonths:number;onSelectMonth:(month:string)=>void;onPreview?:(point:HistoryPoint|null)=>void}) {
  const reduce=useReducedMotion();
  const [active,setActive]=useState<number|null>(null);
  const plot=useRef<HTMLDivElement>(null);
  const [plotWidth,setPlotWidth]=useState(0);
  const [scrollLeft,setScrollLeft]=useState(0);
  // The row's width while a period change squeezes it (null once it rests).
  const [morphWidth,setMorphWidth]=useState<number|null>(null);
  const cursor=useRef<number|null>(null);
  const latest=useRef({data,visibleMonths,onSelectMonth,onPreview});
  useLayoutEffect(()=>{latest.current={data,visibleMonths,onSelectMonth,onPreview};});
  const scrollTo=(left:number)=>{
    const element=plot.current;
    if(element){element.scrollLeft=left;setScrollLeft(element.scrollLeft);}
  };
  const gesture=useMemo(()=>createHistoryGesture({
    viewport:()=>{
      const element=plot.current,bounds=element?.getBoundingClientRect();
      return {left:bounds?.left??0,width:bounds?.width??0,scrollLeft:element?.scrollLeft??0,count:latest.current.data.length,visibleMonths:latest.current.visibleMonths};
    },
    scrollTo,
    onPreview:index=>{if(index!==null)cursor.current=index;setActive(index);latest.current.onPreview?.(index===null?null:latest.current.data[index]??null);},
    onSelect:index=>{const point=latest.current.data[index];if(point)latest.current.onSelectMonth(point.month);}
  }),[]);
  useLayoutEffect(()=>{
    const element=plot.current;
    if(!element)return;
    const measure=()=>setPlotWidth(element.getBoundingClientRect().width);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  const position=useRef<{width:number;visibleMonths:number;firstMonth?:string}|null>(null);
  useLayoutEffect(()=>{
    gesture.cancel();cursor.current=null;
    if(!plot.current||!plotWidth||!data.length)return;
    const index=Math.max(0,data.findIndex(item=>item.month===month));
    const previous=position.current;
    const reset=!previous||previous.width!==plotWidth||previous.visibleMonths!==visibleMonths||previous.firstMonth!==data[0]?.month;
    const left=reset?Math.max(0,(index+1-Math.min(data.length,visibleMonths))*plotWidth/Math.min(data.length,visibleMonths)):plot.current.scrollLeft;
    scrollTo(historyScrollForIndex(index,data.length,plotWidth,visibleMonths,left));
    position.current={width:plotWidth,visibleMonths,firstMonth:data[0]?.month};
  },[plotWidth,visibleMonths,month,data.length,data[0]?.month,gesture]);
  useEffect(()=>{
    const release=()=>gesture.cancel();
    const end=(event:globalThis.PointerEvent)=>gesture.cancel(event.pointerId);
    const hide=()=>{if(document.hidden)release();};
    window.addEventListener('blur',release);
    window.addEventListener('pointerup',end);
    window.addEventListener('pointercancel',end);
    document.addEventListener('visibilitychange',hide);
    return()=>{release();window.removeEventListener('blur',release);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);document.removeEventListener('visibilitychange',hide);};
  },[gesture]);
  // Another period (6M/1Y/3Y/5Y), like the mock: the bars squeeze or widen on a
  // spring with the current month held in place, and the bars in view dip and
  // spring back up one after another.
  const bars=useRef<HTMLDivElement>(null);
  const shownPeriod=useRef(visibleMonths);
  const widthSpring=useRef<LiveSpring|null>(null);
  useLayoutEffect(()=>{
    const from=shownPeriod.current;shownPeriod.current=visibleMonths;
    const element=plot.current,row=bars.current;
    if(from===visibleMonths||!element||!row||!plotWidth||!data.length||reducedMotion())return;
    const widthFor=(months:number)=>Math.max(1,data.length/months)*plotWidth;
    const at=Math.max(0,data.findIndex(item=>item.month===month));
    const place=(width:number)=>{
      row.style.width=`${width}px`;
      // Keep the current month's right edge where the period leaves it.
      const end=(at+1)*width/data.length,left=Math.max(0,Math.min(width-plotWidth,end-plotWidth));
      element.scrollLeft=left;
      setMorphWidth(width);setScrollLeft(element.scrollLeft);
    };
    widthSpring.current?.stop();
    const spring=new LiveSpring(widthFor(from),width=>{place(width);if(width===spring.target){row.style.width=`${Math.max(1,data.length/visibleMonths)*100}%`;setMorphWidth(null);setScrollLeft(element.scrollLeft);}},{stiffness:420,damping:28});
    widthSpring.current=spring;place(widthFor(from));spring.to(widthFor(visibleMonths));
    const slots=[...row.querySelectorAll<HTMLElement>('.history-bar')],first=Math.max(0,at+1-Math.min(data.length,visibleMonths));
    slots.slice(first,at+1).forEach((bar,index)=>springAnimate(bar,{scale:'1 .85'},{scale:'1 1'},{stiffness:300,damping:17},{delay:index*35,fill:'backwards'}));
    return()=>{spring.stop();setMorphWidth(null);};
  },[visibleMonths]);
  const visibleCount=Math.min(data.length,visibleMonths);
  // Scale to the months actually in view. Mid-squeeze the row is neither
  // period's width, so read the range from its live width; otherwise the old
  // scroll offset points past the data and every bar shoots to full height.
  const rowWidth=morphWidth??plotWidth*Math.max(1,data.length/visibleCount);
  const firstVisible=plotWidth?Math.max(0,Math.min(data.length-1,Math.floor(scrollLeft/rowWidth*data.length+1e-9))):Math.max(0,data.length-visibleCount);
  const lastVisible=plotWidth?Math.max(firstVisible+1,Math.ceil((scrollLeft+plotWidth)/rowWidth*data.length-1e-9)):data.length;
  const maximum=Math.max(1,...data.slice(firstVisible,lastVisible).map(item=>Math.abs(item.total)));
  const index=Math.min(data.length-1,active??cursor.current??Math.max(0,data.findIndex(item=>item.month===month)));
  const point=active===null?null:data[active];
  const displayPoint=data[index];
  const slotWidth=plotWidth/Math.max(1,visibleCount);
  const grown=useRef(false);
  useEffect(()=>{const timer=window.setTimeout(()=>{grown.current=true;},900);return()=>clearTimeout(timer);},[]);
  const barHeight=(item:HistoryPoint)=>item.total?Math.max(5,Math.abs(item.total)/maximum*132):3;
  const bubbleX=Math.max(80,Math.min(plotWidth-80,(index+.5)*slotWidth-scrollLeft));
  const bubbleY=displayPoint?156-barHeight(displayPoint)-8:0;
  function keyDown(event:KeyboardEvent<HTMLDivElement>) {
    const next=event.key==='ArrowLeft'?index-1:event.key==='ArrowRight'?index+1:event.key==='Home'?0:event.key==='End'?data.length-1:null;
    if(next!==null){event.preventDefault();cursor.current=Math.max(0,Math.min(data.length-1,next));setActive(cursor.current);scrollTo(historyScrollForIndex(cursor.current,data.length,plotWidth,visibleMonths,plot.current?.scrollLeft??0));}
    if(event.key==='Enter'||event.key===' '){event.preventDefault();if(!event.repeat&&displayPoint)onSelectMonth(displayPoint.month);}
    if(event.key==='Escape')gesture.cancel();
  }
  return <div className="history-chart">
    <div ref={plot} className="history-plot" role="slider" tabIndex={0} aria-label="月別の支払い合計" aria-valuemin={0} aria-valuemax={Math.max(0,data.length-1)} aria-valuenow={Math.max(0,index)} aria-valuetext={displayPoint?`${monthLabel(displayPoint.month)}、支払い合計 ${yen(displayPoint.total)}`:undefined} onKeyDown={keyDown} onKeyUp={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))setActive(null);}} onBlur={()=>gesture.cancel()}
      onPointerDown={event=>{if(event.button!==0||!event.isPrimary||!gesture.start(event))return;event.currentTarget.setPointerCapture(event.pointerId);}}
      onPointerMove={event=>gesture.move(event)}
      onPointerUp={event=>{gesture.end(event);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}}
      onPointerCancel={event=>gesture.cancel(event.pointerId)} onLostPointerCapture={event=>gesture.cancel(event.pointerId)}
      onScroll={event=>{setScrollLeft(event.currentTarget.scrollLeft);gesture.refresh();}}
      onContextMenu={event=>event.preventDefault()}>
      <div ref={bars} className="history-bars" style={{width:`${Math.max(1,data.length/visibleMonths)*100}%`}} aria-hidden="true">
        {data.map((item,i)=>{
          const hot=active===i;
          // Bars grow in one after another on the first draw, then follow the data directly.
          const delay=grown.current||reduce?0:Math.max(0,i-(data.length-visibleCount))*.035;
          return <span key={`${data.length}-${item.month}`} className="history-bar-slot">
            <motion.span className="history-bar" data-current={item.month===month||undefined} data-hot={hot||undefined} data-empty={!item.total||undefined}
              initial={reduce?false:{height:0,scaleX:1}} animate={{height:barHeight(item),scaleX:hot?1.28:1}}
              transition={reduce?{duration:0}:{height:{type:'spring',stiffness:300,damping:17,delay},scaleX:{type:'spring',stiffness:600,damping:20}}}/>
          </span>;
        })}
      </div>
    </div>
    <motion.div className="history-bubble" aria-hidden="true" initial={false}
      animate={{x:bubbleX,y:bubbleY,scale:point?1:0}}
      transition={reduce?{duration:0}:{x:{type:'spring',stiffness:700,damping:40},y:{type:'spring',stiffness:700,damping:40},scale:point?{type:'spring',stiffness:520,damping:20}:{type:'spring',stiffness:500,damping:30}}}>
      {displayPoint&&<span key={displayPoint.month}>{monthLabel(displayPoint.month)} <strong>{yen(displayPoint.total)}</strong></span>}
    </motion.div>
  </div>;
}

// One category's bar. It squirts out from the left on a loose spring, thinning
// while it rushes and settling a touch past its length, in turn down the list:
// when it first comes into view and again for every other month.
function CategoryBar({fraction,color,index,signature}:{fraction:number;color:string;index:number;signature:string}) {
  const bar=useRef<HTMLDivElement>(null);
  const spring=useRef<LiveSpring|null>(null);
  spring.current??=new LiveSpring(0,value=>{const node=bar.current,s=spring.current;if(!node)return;
    node.style.width=`${Math.max(0,value)*100}%`;
    node.style.transform=`scaleY(${(1-Math.min(.5,Math.abs(s?.velocity??0)*.14)).toFixed(3)})`;},{stiffness:300,damping:15});
  const target=useRef(fraction);target.current=fraction;
  const seen=useRef(false);
  useLayoutEffect(()=>{
    const node=bar.current,s=spring.current!;if(!node)return;
    if(reducedMotion()){s.set(target.current);return;}
    s.set(0);
    const grow=()=>{const timer=window.setTimeout(()=>s.to(target.current),index*45);return()=>clearTimeout(timer);};
    if(seen.current)return grow();
    let stop:(()=>void)|undefined;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(entry=>entry.isIntersecting))return;observer.disconnect();seen.current=true;stop=grow();},{threshold:.5});
    observer.observe(node);
    return()=>{observer.disconnect();stop?.();};
  },[signature]);
  useEffect(()=>()=>spring.current?.stop(),[]);
  return <div ref={bar} style={{background:color,transformOrigin:'left center'}}/>;
}

export function CategoryChart({data,settings=[],animateAmounts=true,onSelectCategory,openCategory}:{data:{category:Category;amount:number}[];settings?:CategoryAppearance[];animateAmounts?:boolean;onSelectCategory?:(category:Category,source:Element)=>void;openCategory?:Category|null}) {
  // The piece or row the open category grew from hides while its panel is out.
  const [openedFrom,setOpenedFrom]=useState<'pie'|'row'>('row');
  const open=onSelectCategory&&((from:'pie'|'row')=>(category:Category,source:Element)=>{setOpenedFrom(from);onSelectCategory(category,source);});
  const reduce=useReducedMotion();
  // The donut is the logo's own shape, so it is the default; a choice of bars is remembered.
  const [view,setViewState]=useState<'bar'|'pie'>(()=>{try{return localStorage.getItem('uchiwake-category-view')==='bar'?'bar':'pie';}catch{return 'pie';}});
  const setView=(next:'bar'|'pie')=>{setViewState(next);try{localStorage.setItem('uchiwake-category-view',next);}catch{/* Only a preference. */}};
  const [activeCategory,setActiveCategory]=useState<Category|null>(null);
  const items=[...data].sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount));
  const maximum=Math.max(1,...items.map(item=>Math.abs(item.amount)));
  const dataSignature=data.map(item=>`${item.category}:${item.amount}`).join();
  useEffect(()=>{setActiveCategory(null);},[dataSignature,view]);
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
    {view==='pie'&&<CategoryPie items={items.filter(item=>item.amount>0)} settings={settings} selected={activeCategory} opened={openedFrom==='pie'?openCategory:null} onPick={setActiveCategory} onOpen={open?.('pie')}/>}
    <ul><AnimatePresence initial={false}>{items.map((item,index)=>{
      const content=<>
      <div className="category-chart-label"><span><CategoryIcon name={categoryAppearance(item.category,settings).icon} color={categoryAppearance(item.category,settings).color} size={17}/>{item.category}</span><span><strong>{animateAmounts?<NumberTicker value={item.amount}/>:yen(item.amount)}</strong><small>{item.amount<0?'返金':positive?`${Math.round(item.amount/positive*100)}%`:''}</small></span></div>
      {view==='bar'&&<div className={`category-chart-track${item.amount<0?' is-refund':''}`} aria-hidden="true"><CategoryBar fraction={Math.abs(item.amount)/maximum} color={displayColor(categoryAppearance(item.category,settings).color)??'currentColor'} index={index} signature={dataSignature}/></div>}
      </>;
      // Rows slide only when the list itself changes. A re-render while a panel
      // folds (the page still scaled) would otherwise read as a move and jolt them.
      return <motion.li data-active={view==='pie'&&activeCategory===item.category?'true':undefined} data-dim={view==='pie'&&activeCategory!==null&&activeCategory!==item.category?'true':undefined} layout={reduce?false:"position"} layoutDependency={`${view}|${dataSignature}`} key={item.category} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0,height:0,marginBottom:-20}} transition={{duration:reduce?0:.45,ease}}>{view==='pie'&&item.amount>0?<button type="button" className="category-chart-row panel-source" data-panel-source={openedFrom==='row'&&openCategory===item.category?'true':undefined} aria-label={onSelectCategory?`${item.category}の明細を見る`:item.category} aria-haspopup={onSelectCategory?'dialog':undefined} onClick={event=>{if(open)open('row')(item.category,event.currentTarget);}}>{content}</button>:onSelectCategory?<button type="button" className="category-chart-row panel-source" data-panel-source={openedFrom==='row'&&openCategory===item.category?'true':undefined} aria-label={`${item.category}の明細を見る`} aria-haspopup="dialog" onClick={event=>open!('row')(item.category,event.currentTarget)}>{content}</button>:content}</motion.li>;
    })}</AnimatePresence></ul>
    </motion.div></AnimatePresence>
    {refunds&&<p className="category-chart-note">返金はマイナス額で表示。割合はプラスのカテゴリ合計を基準にしています。{view==='pie'&&'円グラフにはプラスのカテゴリのみ表示しています。'}</p>}
  </section>;
}
