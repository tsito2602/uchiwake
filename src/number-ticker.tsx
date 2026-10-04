// Exact text is always the fallback; first display and value changes use layout-based digit reels.
import { useLayoutEffect, useRef } from 'react';
import './number-ticker.css';
import { springSamples } from './cartoon-motion';

const DIGITS=Array.from({length:10},(_,digit)=>digit);
const HEIGHT=1.1;
// Only digits that change roll, and each lands on the boing spring: past its
// mark, back, then still.
const ROLL=springSamples({stiffness:260,damping:17}).values;
const DURATION=Math.round(ROLL.length/120*1000);
const roll=(t:number)=>ROLL[Math.min(ROLL.length-1,Math.round(t*(ROLL.length-1)))];
const STAGGER=28;

export function NumberTicker({value}:{value:number}) {
  const text=Math.round(value).toLocaleString('ja-JP');
  const previous=useRef<string|null>(null);
  const container=useRef<HTMLSpanElement>(null);
  useLayoutEffect(()=>{
    const before=previous.current;
    previous.current=text;
    const node=container.current;
    if(!node)return;
    node.dataset.settled='true';
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    // Like the mock: a change in shape (one more or fewer digit) redraws at once.
    if(before===text||reduced.matches||(before!==null&&before.replace(/[0-9]/g,'0')!==text.replace(/[0-9]/g,'0')))return;
    const bounds=node.getBoundingClientRect();
    if(bounds.bottom<0||bounds.top>window.innerHeight)return;
    const reels=[...node.querySelectorAll<HTMLElement>('.number-ticker-reel')].map(reel=>{
      const place=Number(reel.dataset.place);
      const char=before?.[before.length-1-place];
      const to=Number(reel.dataset.digit);
      return {reel,from:before===null?0:char&&/[0-9]/.test(char)?Number(char):to,to};
    });
    let frame=0;
    let timer=0;
    let started:number|null=null;
    let finished=false;
    const finish=()=>{
      if(finished)return;
      finished=true;window.cancelAnimationFrame(frame);window.clearTimeout(timer);
      node.dataset.settled='true';
    };
    // No animation frame means no decoration: the exact static value stays visible.
    const duration=DURATION+Math.max(0,reels.length-1)*STAGGER;
    const tick=(now:number)=>{
      if(finished||started===null)return;
      const elapsed=now-started;
      if(elapsed>=duration){finish();return;}
      reels.forEach(({reel,from,to},index)=>{
        if(from===to)return;
        const t=Math.min(1,Math.max(0,(elapsed-index*STAGGER)/DURATION));
        const progress=roll(t);
        // Layout positioning avoids WebKit's clipped compositor transform reels.
        reel.style.top=`${-(from+(to-from)*progress)*HEIGHT}em`;
      });
      node.dataset.settled='false';
      frame=window.requestAnimationFrame(tick);
    };
    const start=()=>{
      if(finished||started!==null)return;
      started=performance.now();
      timer=window.setTimeout(finish,duration+100);
      try { frame=window.requestAnimationFrame(tick); } catch { finish(); }
    };
    const onLifecycle=()=>{if(started!==null)finish();};
    window.addEventListener('pageshow',onLifecycle);
    window.addEventListener('focus',onLifecycle);
    document.addEventListener('visibilitychange',onLifecycle);
    reduced.addEventListener('change',finish);
    // Run the initial count when the page is revealed, not behind the splash.
    if(document.getElementById('initial-boot'))document.addEventListener('uchiwake:boot-complete',start,{once:true});
    else start();
    return()=>{
      finish();window.removeEventListener('pageshow',onLifecycle);window.removeEventListener('focus',onLifecycle);
      document.removeEventListener('visibilitychange',onLifecycle);reduced.removeEventListener('change',finish);
      document.removeEventListener('uchiwake:boot-complete',start);
    };
  },[text]);
  return <span className="number-ticker" data-settled="true" ref={container}>
    <span className="number-ticker-accessible">¥{text}</span>
    <span className="number-ticker-static" aria-hidden="true"><span>¥</span>{Array.from(text).map((char,index)=><span className="number-ticker-character" key={index} style={{width:/[0-9]/.test(char)?'1ch':'0.5ch'}}>{char}</span>)}</span>
    <span className="number-ticker-glyphs" aria-hidden="true"><span>¥</span>{Array.from(text).map((char,index)=>{
      const place=text.length-1-index;
      const isDigit=/[0-9]/.test(char);
      return <span className="number-ticker-slot" key={`place-${place}`} style={{width:isDigit?'1ch':'0.5ch'}}>{isDigit?
        <span className="number-ticker-reel" data-place={place} data-digit={char} style={{top:`-${Number(char)*HEIGHT}em`}}>
          {DIGITS.map(number=><span className="number-ticker-digit" key={number}>{number}</span>)}
        </span>:<span className="number-ticker-separator">{char}</span>}</span>;
    })}</span>
  </span>;
}
