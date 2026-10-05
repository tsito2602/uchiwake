import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, FileText, Table2 } from 'lucide-react';
import type { EntryDraft } from './domain';
import type { ImportProgress } from './statement-import-flow';
import type { StatementFile } from './statement-files';
import { reducedMotion } from './cartoon-motion';
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
// Every 20 seconds the front sheet slides off to the back of the pile.
const PLACES=['rotate(-1.5deg)','rotate(-7deg) translate(-10px,6px)','rotate(6deg) translate(12px,8px)'];
function Desk({files,demo}:{files:StatementFile[];demo:boolean}) {
  const sheets=(demo||!files.length?[null]:files.slice(0,3));
  const [front,setFront]=useState(0);
  const desk=useRef<HTMLDivElement>(null);
  const shown=useRef(0);
  useEffect(()=>{
    if(sheets.length<2)return;
    const timer=window.setInterval(()=>setFront(current=>(current+1)%sheets.length),20000);
    return()=>window.clearInterval(timer);
  },[sheets.length]);
  useLayoutEffect(()=>{
    const previous=shown.current;shown.current=front;
    if(previous===front||reducedMotion())return;
    const old=desk.current?.querySelector<HTMLElement>(`[data-sheet="${previous}"]`);
    old?.animate([{transform:PLACES[0]},{transform:'rotate(-14deg) translate(-120px,10px)',offset:.45},{transform:PLACES[(previous-front+sheets.length)%sheets.length]}],{duration:800,easing:'cubic-bezier(.3,1.1,.5,1)'});
    desk.current?.querySelector('.import-desk-page')?.animate([{transform:'scale(1.4)'},{transform:'none'}],{duration:400,easing:'cubic-bezier(.3,1.8,.5,1)'});
  },[front,sheets.length]);
  return <div ref={desk} className="import-desk" aria-hidden="true">
    {sheets.map((file,index)=>{
      const place=(index-front+sheets.length)%sheets.length;
      return <div key={index} className="import-desk-photo" data-sheet={index} data-place={place} data-kind={file?.kind??'paper'}>
        {file?.kind==='image'?<img src={file.data} alt=""/>:<div className="import-desk-paper">{file?.kind==='pdf'?<FileText size={16}/>:file?.kind==='csv'?<Table2 size={16}/>:null}{Array.from({length:14},(_,line)=><i key={line}/>)}</div>}
        {place===0&&<i className="import-scan-bar"/>}
      </div>;
    })}
    {sheets.length>1&&<span className="import-desk-page">{front+1} / {sheets.length}</span>}
  </div>;
}

type Item={key:string;entry:EntryDraft;line?:HTMLElement;typed?:Promise<void>};
// What the reading came to, once the rows are in the list and can be fixed.
export type ReaderResult={count:number;total:number;matches:boolean|null};
const SKELETONS=9,SHEET_HEIGHT=200;

export function ImportReader({progress,files=[],result}:{progress:ImportProgress;files?:StatementFile[];result?:ReaderResult}) {
  const peel=usePeel();
  const stage=useRef<HTMLDivElement>(null);
  const lines=useRef<HTMLDivElement>(null);
  const scan=useRef<HTMLElement>(null);
  const [mode,setMode]=useState<'waiting'|'opening'|'sheet'|'folded'>('waiting');
  const [motion]=useState(()=>typeof window!=='undefined'&&!reducedMotion());
  const engine=useRef({alive:true,running:false,open:null as Promise<void>|null,flights:0,typing:0,seen:new Set<string>(),queue:[] as Item[]});
  const [seconds,setSeconds]=useState(0);
  const [finished,setFinished]=useState(!!result);
  const summary=useRef<HTMLDivElement>(null);
  const hadResult=useRef(!!result);
  useEffect(()=>{if(finished)return;const started=Date.now()-seconds*1000;const timer=window.setInterval(()=>setSeconds(Math.floor((Date.now()-started)/1000)),1000);return()=>window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[finished]);
  // The counters give way to the result: the lanes lift away, the match
  // pops in, and the title says the rows can now be fixed.
  useLayoutEffect(()=>{
    if(!result||hadResult.current)return;
    hadResult.current=true;
    if(reducedMotion()){setFinished(true);return;}
    const node=summary.current;
    node?.querySelector('.import-lanes')?.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-8px)'}],{duration:220,fill:'forwards'});
    node?.querySelector('.import-match')?.animate([{transform:'scale(.4)',opacity:0},{transform:'scale(1.12)',opacity:1,offset:.6},{transform:'none',opacity:1}],{duration:460,delay:120,easing:'cubic-bezier(.3,1.5,.5,1)',fill:'backwards'});
    window.setTimeout(()=>tick(),300);
    const timer=window.setTimeout(()=>setFinished(true),380);
    return()=>window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[!!result]);
  useLayoutEffect(()=>{
    if(!motion)return;
    const state=engine.current;state.alive=true;peelStore.start();
    return()=>{state.alive=false;peelStore.stop();document.querySelectorAll('.import-peel-fly').forEach(node=>node.remove());};
  },[motion]);

  const panel=()=>stage.current?.closest('.statement-import-panel');
  const rowFor=(key:string)=>panel()?.querySelector<HTMLElement>(`.import-sorting-list [data-entry-id="${CSS.escape(key)}"]`)??null;
  // A landing nudges the whole panel, the way a dropped card jolts a table.
  const tick=()=>panel()?.closest<HTMLElement>('.card-panel-frame')?.animate([{translate:'0 0'},{translate:'0 .8px'},{translate:'0 -.5px'},{translate:'0 0'}],{duration:110});

  function skeleton(){
    const line=document.createElement('div');line.className='import-sheet-line';line.dataset.skeleton='';
    for(let cell=0;cell<3;cell++)line.appendChild(document.createElement('span'));
    lines.current?.appendChild(line);
    return line;
  }

  // 1 The photos spring open into one statement sheet: the front photo
  // straightens, the pile bursts into a sheet that stretches and settles,
  // and grey bars wait on it for the rows the AI is about to write.
  function openSheet(){
    const state=engine.current;
    state.open??=(async()=>{
      const node=stage.current;if(!node)return;
      const front=node.querySelector<HTMLElement>('.import-desk-photo[data-place="0"]');
      front?.animate([{transform:PLACES[0]},{transform:'rotate(0) scale(1.25,1.1)',offset:.6},{transform:'rotate(0) scale(1.18,1.06)'}],{duration:600,easing:'cubic-bezier(.3,1.3,.5,1)',fill:'forwards'});
      node.querySelector('.import-scan-bar')?.animate([{opacity:1},{opacity:0}],{duration:300,fill:'forwards'});
      await sleep(520);
      // The pile keeps its size while the stage closes up around the sheet.
      const from=node.offsetHeight,width=node.offsetWidth;
      node.style.height=`${from}px`;
      const desk=node.querySelector<HTMLElement>('.import-desk');
      if(desk)desk.style.height=`${from}px`;
      setMode('opening');
      await nextFrame();
      node.style.height='';
      node.animate([{height:`${from}px`},{height:`${SHEET_HEIGHT}px`}],{duration:620,easing:'cubic-bezier(.3,1.1,.5,1)'});
      node.querySelectorAll<HTMLElement>('.import-desk-photo').forEach((photo,index)=>{
        // Each photo stretches sideways and flattens into the sheet's shape.
        const sx=width/photo.offsetWidth,sy=SHEET_HEIGHT/photo.offsetHeight,dy=SHEET_HEIGHT/2-from/2;
        photo.animate([{opacity:1},{opacity:.9,transform:`translate(0,${dy*.6}px) scale(${sx*.8},${sy*1.1})`,offset:.55},{opacity:0,transform:`translate(0,${dy}px) scale(${sx},${sy})`}],{duration:300,delay:index*20,fill:'forwards',easing:'cubic-bezier(.4,0,.6,1)'});
      });
      node.querySelector('.import-sheet')?.animate([{transform:'scale(.16,.3) rotate(-5deg)',opacity:.4},{transform:'scale(1.04,.92) rotate(.6deg)',opacity:1,offset:.5},{transform:'scale(.99,1.025)',offset:.78},{transform:'none'}],{duration:620,easing:'cubic-bezier(.25,.9,.4,1)'});
      node.querySelector('.import-sheet-crease')?.animate([{opacity:.9},{opacity:.9,offset:.35},{opacity:0}],{duration:700,fill:'forwards'});
      tick();
      for(let count=0;count<SKELETONS;count++)skeleton();
      await sleep(320);
      setMode('sheet');
      await sleep(360);
      node.querySelectorAll<HTMLElement>('.import-sheet-head > span').forEach(cell=>void decode(cell,cell.textContent??'',260));
    })();
    return state.open;
  }

  // 2 Each row the AI writes takes the next grey bar: a reading frame lights
  // up and the characters spin until they settle on the real text.
  function type(item:Item){
    const state=engine.current,host=lines.current;
    const line=host?.querySelector<HTMLElement>('.import-sheet-line[data-skeleton]')??skeleton();
    delete line.dataset.skeleton;line.dataset.reading='';item.line=line;
    while((host?.querySelectorAll('.import-sheet-line[data-skeleton]').length??SKELETONS)<SKELETONS-2)skeleton();
    const delay=Math.min(state.typing++,7)*70;
    item.typed=(async()=>{
      await sleep(delay);
      const cells=lineCells(item.entry);
      await Promise.all([...line.children].map((cell,index)=>decode(cell as HTMLElement,cells[index],300)));
      state.typing=Math.max(0,state.typing-1);
      await sleep(120);delete line.dataset.reading;
    })();
  }

  // 3 The scan line moves onto the row and the sheet feeds up; the row
  // peels from its top-left corner, falls with gravity, turns into its list
  // row on the way down and lands with a squash.
  async function fly(item:Item,D=900){
    const state=engine.current,line=item.line!;
    state.flights++;
    try{
      const from=box(line.getBoundingClientRect());
      const piece=document.createElement('div');piece.className='import-peel-fly';
      const strip=line.cloneNode(true) as HTMLElement;strip.className='import-peel-strip';
      for(const name of ['hit','reading'])delete strip.dataset[name];
      piece.appendChild(strip);document.body.appendChild(piece);
      line.dataset.peeled='';delete line.dataset.hit;
      const up={left:from.left-3,top:from.top-9,width:from.width+4,height:from.height};
      const started=performance.now();
      piece.animate([
        {transform:'perspective(420px) rotateX(0) rotate(0) scale(1)',boxShadow:'0 0 0 #0000'},
        {transform:'perspective(420px) rotateX(34deg) rotate(-3deg) scale(1.05)',boxShadow:'0 16px 18px -10px #0005',offset:.29},
        {transform:'perspective(420px) rotateX(6deg) rotate(2deg) scale(1)',boxShadow:'0 14px 22px -12px #0004',offset:.66},
        {transform:'perspective(420px) rotateX(0) rotate(0) scale(1.03,.84)',boxShadow:'0 2px 4px -2px #0002',offset:.86},
        {transform:'perspective(420px) rotateX(0) rotate(0) scale(.99,1.03)',offset:.94},
        {transform:'none',boxShadow:'0 0 0 #0000'}],{duration:D,easing:'linear',fill:'forwards'});
      strip.animate([{opacity:1},{opacity:1,offset:.42},{opacity:0,offset:.66},{opacity:0}],{duration:D,fill:'forwards'});
      // Only when the strip lets go does the list open a slot for it (the
      // rows below step down); the fall chases that live slot.
      let row:HTMLElement|null=null,face:HTMLElement|null=null,away=false;
      await new Promise<void>(resolve=>{
        const step=(now:number)=>{
          if(!state.alive){resolve();return;}
          const t=Math.min(1,(now-started)/D);
          if(t>=.29&&!row){
            peelStore.admit([item.key]);
            row=rowFor(item.key);
            if(row){
              const viewport=row.closest('.card-panel-scroll')?.getBoundingClientRect(),rect=row.getBoundingClientRect();
              away=!viewport||rect.top>viewport.bottom||rect.bottom<viewport.top;
              face=row.cloneNode(true) as HTMLElement;face.classList.add('import-peel-face');face.removeAttribute('data-entry-id');
              piece.appendChild(face);
              face.animate([{opacity:0},{opacity:0,offset:.44},{opacity:1,offset:.68},{opacity:1}],{duration:D,delay:-(now-started),fill:'forwards'});
              if(away)piece.animate([{opacity:1},{opacity:0}],{duration:200,fill:'forwards'});
            }
          }
          const to=row?.isConnected&&!away?box(row.getBoundingClientRect()):null;
          const low=to&&{...to,top:to.top+5};
          const at=t<.29||!to||!low?mix(from,up,lift(Math.min(1,t/.29))):t<.84?mix(up,low,fall((t-.29)/.55)):mix(low,to,settle((t-.84)/.16));
          Object.assign(piece.style,{left:`${at.left}px`,top:`${at.top}px`,width:`${at.width}px`,height:`${at.height}px`});
          if(t<1&&!(away&&t>.55))requestAnimationFrame(step);else resolve();
        };
        requestAnimationFrame(step);
      });
      piece.remove();
      peelStore.land([item.key]);
      if(!away)tick();
    }finally{state.flights--;}
  }

  async function pump(){
    const state=engine.current;
    if(state.running)return;
    state.running=true;
    try{
      await openSheet();
      while(state.alive&&state.queue.length){
        const item=state.queue[0];
        await item.typed;
        if(!state.alive)return;
        state.queue.shift();
        // A long backlog keeps the same beats, only closer together, so
        // every row still peels and falls on its own.
        const pace=state.queue.length<2?1:Math.max(.34,2.4/(state.queue.length+1));
        const line=item.line!,host=lines.current!;
        const shift=Math.max(0,line.offsetTop-line.offsetHeight*2);
        host.style.transitionDuration=`${Math.round(420*Math.max(pace,.6))}ms`;
        host.style.transform=`translateY(${-shift}px)`;
        if(scan.current){scan.current.style.opacity='1';scan.current.style.top=`${line.offsetTop-shift+line.offsetHeight-2}px`;}
        line.dataset.hit='';
        await sleep(260*pace);
        void fly(item,900*Math.max(pace,.75));
        await sleep(340*pace);
        while(state.alive&&state.flights>=3)await sleep(30);
      }
    }finally{state.running=false;}
  }

  useEffect(()=>{
    if(!motion)return;
    const state=engine.current;
    const fresh:Item[]=[];
    progress.entries.forEach((entry,index)=>{const key=entryKey(entry,index);if(!state.seen.has(key)){state.seen.add(key);fresh.push({key,entry});}});
    if(!fresh.length)return;
    state.queue.push(...fresh);
    void (async()=>{await openSheet();if(!state.alive)return;fresh.forEach(type);void pump();})();
  },[progress.entries,motion]);

  // Once reading is over and every strip has landed, the emptied sheet folds
  // away and the list takes its room.
  const reading=progress.phase==='reading';
  const readingDone=progress.phase==='checking'||(!reading&&progress.count!==null&&progress.entries.length>=progress.count);
  useEffect(()=>{
    if(!motion||!readingDone||mode==='folded')return;
    if(!progress.entries.length){peelStore.settle();return;}
    const state=engine.current;
    let stop=false;
    void (async()=>{
      while(!stop&&(!state.open||state.queue.length||state.flights||state.running))await sleep(120);
      if(stop)return;
      await sleep(350);
      const node=stage.current;if(!node||stop)return;
      if(scan.current)scan.current.style.opacity='0';
      const height=node.offsetHeight;
      const sheet=node.querySelector<HTMLElement>('.import-sheet');if(sheet)sheet.style.transformOrigin='50% 0';
      node.querySelector('.import-sheet')?.animate([{transform:'none'},{transform:'scale(1.02,.96)',offset:.25},{transform:'scale(.9,0)',opacity:.4}],{duration:520,easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'});
      await node.animate([{height:`${height}px`},{height:'0px',marginBottom:'-12px',opacity:.6}],{duration:620,delay:120,easing:'cubic-bezier(.3,1.1,.5,1)',fill:'forwards'}).finished.catch(()=>undefined);
      if(!stop){setMode('folded');peelStore.settle();}
    })();
    return()=>{stop=true;};
  },[readingDone,motion,mode,progress.entries.length]);

  const keyed=progress.entries.map((entry,index)=>({entry,key:entryKey(entry,index)}));
  const visible=peel.active?keyed.filter(({key})=>peel.landed.has(key)):keyed;
  const readCount=visible.length,sortedCount=visible.filter(({entry})=>sorted(entry)).length;
  const total=visible.reduce((sum,{entry})=>sum+entry.amount,0);
  const checking=progress.phase==='checking';
  const title=finished?'読み取りました':progress.activity?.rechecking?'明細を再確認中':reading?'明細を読み取り中':checking?'金額を確認中':'費目ごとに仕分け中';
  const stageMode=motion?mode:(reading&&!progress.entries.length?'waiting':'folded');
  const sheetShown=stageMode==='opening'||stageMode==='sheet';
  return <section className="import-phase-status import-reader" aria-label="取り込みの進行">
    <div className="import-phase-title" role="status" aria-live="polite"><strong key={title} className="import-phase-title-content">{title}</strong>{progress.demo&&<small>デモ</small>}{finished?<span className="import-elapsed import-reader-hint">タップして直せます</span>:<span className="import-elapsed" aria-label={`経過時間 ${seconds}秒`}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span>}</div>
    {!result&&progress.activity?.rechecking&&<p className="import-reader-note">{progress.activity.text}</p>}
    {stageMode!=='folded'&&<div ref={stage} className="import-reader-stage" data-mode={stageMode}>
      {sheetShown&&<div className="import-sheet" aria-hidden="true"><div className="import-sheet-head"><span>ご利用明細</span><span>AIが読み取った行</span></div><div className="import-sheet-window"><div ref={lines} className="import-sheet-lines"/><i ref={scan} className="import-sheet-scan"/></div><i className="import-sheet-crease"/></div>}
      {(stageMode==='waiting'||stageMode==='opening')&&<Desk files={files} demo={progress.demo}/>}
    </div>}
    <div ref={summary} className="import-phase-summary" data-result={result?'':undefined}>{result&&<span className="import-match" data-matches={result.matches??undefined}>{result.matches!==false&&<Check size={13} strokeWidth={3} aria-hidden="true"/>}{result.count}件{result.matches===true?' · 明細の合計と一致':result.matches===false?' · 合計に差があります':'を読み取り'}</span>}<span className="import-lanes" aria-hidden={result?true:undefined}><span data-live={!readingDone||undefined}>読み取り <b>{readCount}</b>件</span><span data-live={!!readCount&&sortedCount<readCount||undefined}>仕分け <b>{sortedCount}</b>件</span></span><span className="import-phase-total"><small>利用合計</small><strong><NumberTicker value={result?result.total:checking&&progress.checkedTotal!==undefined?progress.checkedTotal:total}/></strong></span></div>
  </section>;
}
