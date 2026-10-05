import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FileText, Table2 } from 'lucide-react';
import type { EntryDraft } from './domain';
import type { ImportProgress } from './statement-import-flow';
import type { StatementFile } from './statement-files';
import { reducedMotion, springAnimate } from './cartoon-motion';
import { NumberTicker } from './number-ticker';
import { entryKey, peelStore, usePeel } from './import-peel-store';

const sorted=(entry:EntryDraft)=>!entry.import_meta||entry.import_meta.status==='classified'||entry.import_meta.status==='review';
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
const nextFrame=()=>new Promise<number>(resolve=>requestAnimationFrame(resolve));
const bezier=(x1:number,y1:number,x2:number,y2:number)=>(t:number)=>{
  let lo=0,hi=1,u=t;
  for(let k=0;k<18;k++){u=(lo+hi)/2;const x=3*(1-u)**2*u*x1+3*(1-u)*u*u*x2+u**3;if(x<t)lo=u;else hi=u;}
  return 3*(1-u)**2*u*y1+3*(1-u)*u*u*y2+u**3;
};
const lift=bezier(.2,.8,.3,1),fall=bezier(.55,0,.85,.45),settle=bezier(.3,1.5,.5,1);
const POOL='アイウエオカキクケコサシスセソタチツテトナニヌネノハマミムメモラリルレロABCDEFGHKLMNPRSTUVXYZ';
type Box={left:number;top:number;width:number;height:number};
const mix=(a:Box,b:Box,k:number):Box=>({left:a.left+(b.left-a.left)*k,top:a.top+(b.top-a.top)*k,width:a.width+(b.width-a.width)*k,height:a.height+(b.height-a.height)*k});
const box=(rect:DOMRect):Box=>({left:rect.left,top:rect.top,width:rect.width,height:rect.height});
const lineCells=(entry:EntryDraft)=>[entry.spent_on?entry.spent_on.slice(5).replace('-','/'):'--/--',entry.title||'明細',entry.amount.toLocaleString('ja-JP')];

// Text "stands up": each cell scrambles through kana and digits, settling
// left to right on the real characters.
function decode(cell:HTMLElement,text:string,ms:number){
  const chars=[...text],started=performance.now();
  return new Promise<void>(resolve=>{
    const step=(now:number)=>{
      const p=Math.min(1,(now-started)/ms),k=Math.floor(chars.length*p);
      cell.textContent=chars.slice(0,k).join('')+chars.slice(k).map(ch=>/[\s,/.-]/.test(ch)?ch:/\d/.test(ch)?String(Math.random()*10|0):POOL[Math.random()*POOL.length|0]).join('');
      if(p<1&&cell.isConnected)requestAnimationFrame(step);else{cell.textContent=text;resolve();}
    };
    requestAnimationFrame(step);
  });
}

// The waiting stage: the person's own photos (or a sheet for PDF/CSV/demo)
// lie on the desk while a scan bar sweeps the front one up and down. The AI
// sends nothing until it starts writing rows, so there is no progress to show.
function Desk({files,demo}:{files:StatementFile[];demo:boolean}) {
  const sheets=(demo||!files.length?[null]:files.slice(0,3));
  const [front,setFront]=useState(0);
  useEffect(()=>{
    if(sheets.length<2)return;
    const timer=window.setInterval(()=>setFront(current=>(current+1)%sheets.length),20000);
    return()=>window.clearInterval(timer);
  },[sheets.length]);
  return <div className="import-desk" aria-hidden="true">
    {sheets.map((file,index)=>{
      const place=(index-front+sheets.length)%sheets.length;
      return <div key={index} className="import-desk-photo" data-place={place} data-kind={file?.kind??'paper'}>
        {file?.kind==='image'?<img src={file.data} alt=""/>:<div className="import-desk-paper">{file?.kind==='pdf'?<FileText size={16}/>:file?.kind==='csv'?<Table2 size={16}/>:null}{Array.from({length:11},(_,line)=><i key={line}/>)}</div>}
        {place===0&&<i className="import-scan-bar"/>}
      </div>;
    })}
    {sheets.length>1&&<span className="import-desk-page">{front+1} / {sheets.length}</span>}
  </div>;
}

export function ImportReader({progress,files=[]}:{progress:ImportProgress;files?:StatementFile[]}) {
  const peel=usePeel();
  const stage=useRef<HTMLDivElement>(null);
  const lines=useRef<HTMLDivElement>(null);
  const scan=useRef<HTMLElement>(null);
  const [mode,setMode]=useState<'waiting'|'sheet'|'folded'>('waiting');
  const [motion]=useState(()=>typeof window!=='undefined'&&!reducedMotion());
  const engine=useRef({alive:true,running:false,open:false,flights:0,seen:new Set<string>(),queue:[] as {key:string;entry:EntryDraft}[]});
  const [seconds,setSeconds]=useState(0);
  useEffect(()=>{const started=Date.now();const timer=window.setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>window.clearInterval(timer);},[]);
  useLayoutEffect(()=>{
    if(!motion)return;
    const state=engine.current;state.alive=true;peelStore.start();
    return()=>{state.alive=false;peelStore.stop();document.querySelectorAll('.import-peel-fly').forEach(node=>node.remove());};
  },[motion]);

  const panel=()=>stage.current?.closest('.statement-import-panel');
  const rowFor=(key:string)=>panel()?.querySelector<HTMLElement>(`.import-sorting-list [data-entry-id="${CSS.escape(key)}"]`)??null;

  function addLine(entry:EntryDraft,instant:boolean){
    const host=lines.current;if(!host)return null;
    const line=document.createElement('div');line.className='import-sheet-line';
    const cells=lineCells(entry);
    cells.forEach(text=>{const cell=document.createElement('span');cell.textContent=instant?text:'';line.appendChild(cell);});
    if(!instant)line.dataset.skeleton='';
    host.appendChild(line);
    // Keep the newest line in view: the sheet feeds up like paper in a printer.
    const shift=Math.max(0,line.offsetTop+line.offsetHeight-host.parentElement!.clientHeight+28);
    host.style.transform=`translateY(${-shift}px)`;
    if(scan.current)scan.current.style.top=`${line.offsetTop-shift+line.offsetHeight-1}px`;
    return line;
  }

  async function openSheet(){
    const state=engine.current;state.open=true;
    setMode('sheet');
    await nextFrame();
    const sheet=stage.current?.querySelector<HTMLElement>('.import-sheet');
    sheet?.animate([{transform:'scale(.2,.3) rotate(-5deg)',opacity:.4},{transform:'scale(1.04,.92) rotate(.6deg)',opacity:1,offset:.5},{transform:'scale(.99,1.025)',offset:.78},{transform:'none'}],{duration:620,easing:'cubic-bezier(.25,.9,.4,1)'});
    await sleep(560);
  }

  async function fly(item:{key:string;entry:EntryDraft}){
    const state=engine.current;state.flights++;
    try{
      const line=addLine(item.entry,false);
      if(!line){peelStore.land([item.key]);return;}
      await Promise.all([...line.children].map((cell,index)=>decode(cell as HTMLElement,lineCells(item.entry)[index],240)));
      delete line.dataset.skeleton;line.dataset.hit='';
      // The list makes room while the line is still lit, before it lets go.
      peelStore.admit([item.key]);
      await sleep(130);
      if(!state.alive)return;
      let row:HTMLElement|null=null;
      for(let frame=0;frame<10&&!row;frame++){await nextFrame();row=rowFor(item.key);}
      const from=box(line.getBoundingClientRect());
      line.dataset.peeled='';delete line.dataset.hit;
      const viewport=row?.closest('.card-panel-scroll')?.getBoundingClientRect();
      const target=row?.getBoundingClientRect();
      if(!row||!viewport||!target||target.top>viewport.bottom||target.bottom<viewport.top){peelStore.land([item.key]);return;}
      // A piece of the statement lifts off, falls, and turns into the row it
      // becomes; the fall chases the row's live place as rows above make room.
      const piece=document.createElement('div');piece.className='import-peel-fly';
      const strip=line.cloneNode(true) as HTMLElement;strip.className='import-peel-strip';
      const face=row.cloneNode(true) as HTMLElement;face.classList.add('import-peel-face');face.removeAttribute('data-entry-id');
      piece.appendChild(strip);piece.appendChild(face);document.body.appendChild(piece);
      const up={left:from.left-3,top:from.top-9,width:from.width+4,height:from.height};
      const D=780,started=performance.now();
      piece.animate([
        {transform:'perspective(420px) rotateX(0) rotate(0) scale(1)',boxShadow:'0 0 0 #0000'},
        {transform:'perspective(420px) rotateX(34deg) rotate(-3deg) scale(1.05)',boxShadow:'0 16px 18px -10px #0005',offset:.28},
        {transform:'perspective(420px) rotateX(6deg) rotate(2deg) scale(1)',boxShadow:'0 14px 22px -12px #0004',offset:.66},
        {transform:'perspective(420px) rotateX(0) rotate(0) scale(1.03,.84)',boxShadow:'0 2px 4px -2px #0002',offset:.86},
        {transform:'perspective(420px) rotateX(0) rotate(0) scale(.99,1.03)',offset:.94},
        {transform:'none',boxShadow:'0 0 0 #0000'}],{duration:D,easing:'linear',fill:'forwards'});
      strip.animate([{opacity:1},{opacity:1,offset:.42},{opacity:0,offset:.66},{opacity:0}],{duration:D,fill:'forwards'});
      face.animate([{opacity:0},{opacity:0,offset:.44},{opacity:1,offset:.68},{opacity:1}],{duration:D,fill:'forwards'});
      await new Promise<void>(resolve=>{
        const step=(now:number)=>{
          if(!state.alive||!row!.isConnected){resolve();return;}
          const t=Math.min(1,(now-started)/D),to=box(row!.getBoundingClientRect()),low={...to,top:to.top+5};
          const at=t<.28?mix(from,up,lift(t/.28)):t<.84?mix(up,low,fall((t-.28)/.56)):mix(low,to,settle((t-.84)/.16));
          Object.assign(piece.style,{left:`${at.left}px`,top:`${at.top}px`,width:`${at.width}px`,height:`${at.height}px`});
          if(t<1)requestAnimationFrame(step);else resolve();
        };
        requestAnimationFrame(step);
      });
      piece.remove();
      peelStore.land([item.key]);
    }finally{state.flights--;}
  }

  async function pump(){
    const state=engine.current;
    if(state.running)return;
    state.running=true;
    try{
      while(state.alive&&state.queue.length){
        if(!state.open)await openSheet();
        // A burst of rows (or a re-read that replaces them) would leave the
        // list waiting behind a long queue: everything but the last few
        // lands at once and only those few peel.
        if(state.queue.length>6){
          const rush=state.queue.splice(0,state.queue.length-3);
          rush.forEach(item=>{const line=addLine(item.entry,true);if(line)line.dataset.peeled='';});
          peelStore.land(rush.map(item=>item.key));
        }
        const item=state.queue.shift()!;
        void fly(item);
        await sleep(state.queue.length>2?260:480);
      }
    }finally{state.running=false;}
  }

  useEffect(()=>{
    if(!motion)return;
    const state=engine.current;
    progress.entries.forEach((entry,index)=>{const key=entryKey(entry,index);if(!state.seen.has(key)){state.seen.add(key);state.queue.push({key,entry});}});
    void pump();
  },[progress.entries,motion]);

  // Once reading is over and every strip has landed, the emptied sheet folds
  // away and the list takes its room.
  const reading=progress.phase==='reading';
  const readingDone=progress.phase==='checking'||(!reading&&progress.count!==null&&progress.entries.length>=progress.count);
  useEffect(()=>{
    if(!motion||!readingDone||mode==='folded')return;
    const state=engine.current;
    let stop=false;
    void (async()=>{
      while(!stop&&(state.queue.length||state.flights||state.running))await sleep(120);
      if(stop)return;
      await sleep(350);
      const node=stage.current;if(!node||stop)return;
      if(scan.current)scan.current.style.opacity='0';
      const height=node.offsetHeight;
      node.querySelector('.import-sheet')?.animate([{transform:'none'},{transform:'scale(1.02,.96)',offset:.25},{transform:'scale(.9,0)',opacity:.4}],{duration:520,easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'});
      await node.animate([{height:`${height}px`},{height:'0px',marginBottom:'-12px',opacity:.6}],{duration:620,delay:120,easing:'cubic-bezier(.3,1.1,.5,1)',fill:'forwards'}).finished.catch(()=>undefined);
      if(!stop){setMode('folded');peelStore.settle();}
    })();
    return()=>{stop=true;};
  },[readingDone,motion,mode]);

  const keyed=progress.entries.map((entry,index)=>({entry,key:entryKey(entry,index)}));
  const visible=peel.active?keyed.filter(({key})=>peel.landed.has(key)):keyed;
  const readCount=visible.length,sortedCount=visible.filter(({entry})=>sorted(entry)).length;
  const total=visible.reduce((sum,{entry})=>sum+entry.amount,0);
  const checking=progress.phase==='checking';
  const title=progress.activity?.rechecking?'明細を再確認中':reading?'明細を読み取り中':checking?'金額を確認中':'費目ごとに仕分け中';
  const stageMode=motion?mode:(reading&&!progress.entries.length?'waiting':'folded');
  return <section className="import-phase-status import-reader" aria-label="取り込みの進行">
    <div className="import-phase-title" role="status" aria-live="polite"><strong key={title} className="import-phase-title-content">{title}</strong>{progress.demo&&<small>デモ</small>}<span className="import-elapsed" aria-label={`経過時間 ${seconds}秒`}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span></div>
    {progress.activity?.rechecking&&<p className="import-reader-note">{progress.activity.text}</p>}
    {stageMode!=='folded'&&<div ref={stage} className="import-reader-stage" data-mode={stageMode}>
      {stageMode==='waiting'?<Desk files={files} demo={progress.demo}/>:<div className="import-sheet" aria-hidden="true"><div className="import-sheet-head"><span>ご利用明細</span><span>AIが読み取った行</span></div><div className="import-sheet-window"><div ref={lines} className="import-sheet-lines"/><i ref={scan} className="import-sheet-scan"/></div></div>}
    </div>}
    <div className="import-phase-summary"><span className="import-lanes"><span data-live={!readingDone||undefined}>読み取り <b>{readCount}</b>件</span><span data-live={!!readCount&&sortedCount<readCount||undefined}>仕分け <b>{sortedCount}</b>件</span></span><span className="import-phase-total"><small>利用合計</small><strong><NumberTicker value={checking&&progress.checkedTotal!==undefined?progress.checkedTotal:total}/></strong></span></div>
  </section>;
}
