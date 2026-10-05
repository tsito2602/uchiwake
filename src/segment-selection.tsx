import {useLayoutEffect,useRef} from 'react';

const DURATION=640;
// A switch whose page re-mounts on change (the data mode re-creates the app)
// passes a memory key, so the new face picks up the move where the old one was.
const moves=new Map<string,{from:number;to:number;at:number}>();

// The white face of a segmented switch moves like the dock: it first stretches
// to reach the new option, then lets go of the old one.
export function SegmentSelection({index,memory}:{index:number;memory?:string}){
  const face=useRef<HTMLSpanElement>(null),previous=useRef<number|null>(null);
  useLayoutEffect(()=>{
    const node=face.current,first=previous.current===null;
    let from=previous.current??index,elapsed=0;previous.current=index;
    if(first&&memory){const move=moves.get(memory);if(move&&move.to===index&&performance.now()-move.at<DURATION){from=move.from;elapsed=performance.now()-move.at;}}
    if(!node||from===index||from<0||index<0||!node.animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    if(!first&&memory)moves.set(memory,{from,to:index,at:performance.now()});
    const width=node.offsetWidth,step=width+4,left=(i:number)=>4+i*step;
    const start=Math.min(from,index),span=Math.abs(index-from)*step+width;
    const animation=node.animate([
      {left:`${left(from)}px`,width:`${width}px`,transform:'none'},
      {left:`${left(start)}px`,width:`${span}px`,transform:'scaleY(.92)',offset:.42},
      {left:`${left(index)}px`,width:`${width}px`,transform:'none'},
    ],{duration:DURATION,easing:'cubic-bezier(0.22,0.72,0.18,1)'});
    animation.currentTime=elapsed;
    return()=>animation.cancel();
  },[index,memory]);
  return <span ref={face} className="appearance-selection" aria-hidden="true"/>;
}
