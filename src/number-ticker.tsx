// Adapted from beUI Number Ticker: https://beui.dev/components/motion/number
// Same digit reels, easing, entrance stagger, and place-value identity.
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import './number-ticker.css';

const DIGITS=Array.from({length:10},(_,digit)=>digit);
const HEIGHT=1.1;
const EASE_OUT=[0.16,1,0.3,1] as const;
const DURATION=0.9;
const STAGGER=0.04;

export function NumberTicker({value}:{value:number}) {
  const container=useRef<HTMLSpanElement>(null);
  const inView=useInView(container,{once:true,amount:0.6});
  const reduce=useReducedMotion();
  const [entered,setEntered]=useState(false);
  const text=Math.round(value).toLocaleString('ja-JP');
  const glyphs=Array.from(text);
  useEffect(()=>{
    if(!inView||entered)return;
    const timer=window.setTimeout(()=>setEntered(true),(DURATION+glyphs.length*STAGGER)*1000);
    return()=>window.clearTimeout(timer);
  },[inView,entered,glyphs.length]);
  return <span className="number-ticker" ref={container}>
    <span className="number-ticker-accessible">¥{text}</span>
    <span className="number-ticker-glyphs" aria-hidden="true"><span>¥</span><AnimatePresence initial={false}>{glyphs.map((char,index)=>{
      // Preserve units/tens/hundreds when switching totals or adding a digit.
      const key=`place-${glyphs.length-1-index}`;
      const isDigit=/[0-9]/.test(char);
      const digit=isDigit&&(inView||reduce)?Number(char):0;
      // Retain exiting slots until their width collapses. The same right-keyed
      // reels keep rolling while new leading digits and separators make room.
      return <motion.span className="number-ticker-slot" key={key}
        initial={reduce?false:{width:0,opacity:0}}
        animate={{width:isDigit?'1ch':'0.5ch',opacity:1}}
        exit={{width:0,opacity:0}}
        transition={reduce?{duration:0}:{duration:DURATION,ease:EASE_OUT}}
      >{isDigit?
        <motion.span className="number-ticker-reel" initial={reduce?false:{y:0}} animate={{y:`-${digit*HEIGHT}em`}} transition={reduce?{duration:0}:{duration:DURATION,delay:entered?0:index*STAGGER,ease:EASE_OUT}}>
          {DIGITS.map(number=><span className="number-ticker-digit" key={number}>{number}</span>)}
        </motion.span>
      :<span className="number-ticker-separator">{char}</span>}</motion.span>;
    })}</AnimatePresence></span>
  </span>;
}
