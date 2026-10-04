import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { LiveSpring, reducedMotion } from './cartoon-motion';

export type DockFace = {id:string;name:string;avatarUrl?:string};

let shownSpace:string|null=null;
let peeked=false;

function Face({face}:{face:DockFace}) {
  const [failed,setFailed]=useState<string>();
  const initial=Array.from(face.name.trim())[0];
  return <span className="dock-face">{face.avatarUrl&&face.avatarUrl!==failed
    ?<img src={face.avatarUrl} alt="" referrerPolicy="no-referrer" draggable={false} onError={()=>setFailed(face.avatarUrl)}/>
    :initial||<UserRound size={13} aria-hidden="true"/>}</span>;
}

// The space tab wears the faces of the people in this space. When the space
// changes, the faces turn edge-on, swap, and swing back in on a loose spring.
// The first time they appear they give a small hop, so the tab reads as a
// way into the spaces.
export function DockFaces({faces,spaceName}:{faces:DockFace[];spaceName:string}) {
  const root=useRef<HTMLSpanElement>(null);
  const [shown,setShown]=useState(faces);
  const springs=useRef<{turn:LiveSpring;hop:LiveSpring}|null>(null);
  const draw=()=>{const node=root.current,s=springs.current;if(node&&s)node.style.transform=s.turn.value===0&&s.hop.value===0?'':`translateY(${s.hop.value.toFixed(2)}px) rotateY(${s.turn.value.toFixed(2)}deg)`;};
  springs.current??={turn:new LiveSpring(0,draw,{stiffness:500,damping:30}),hop:new LiveSpring(0,draw,{stiffness:420,damping:12})};
  const key=faces.map(face=>`${face.id}:${face.avatarUrl??''}:${face.name}`).join();
  useLayoutEffect(()=>{
    const changed=shownSpace!==null&&shownSpace!==spaceName;
    shownSpace=spaceName;
    const s=springs.current!;
    if(!changed||reducedMotion()){
      setShown(faces);
      // Faces that arrive while the tab is still edge-on swing in now.
      if(s.turn.target!==0){if(reducedMotion())s.turn.set(0);else{s.turn.set(-90);s.turn.to(0,{stiffness:300,damping:12});}}
      return;
    }
    s.turn.set(0);s.turn.to(90,{stiffness:500,damping:30});
    const timer=window.setTimeout(()=>{setShown(faces);s.turn.set(-90);s.turn.to(0,{stiffness:300,damping:12});},120);
    return()=>clearTimeout(timer);
  },[spaceName,key]);
  useEffect(()=>{
    if(peeked||reducedMotion())return;peeked=true;
    const s=springs.current!;
    const timer=window.setTimeout(()=>{s.hop.to(-8,undefined,-240);window.setTimeout(()=>s.hop.to(0),160);},900);
    return()=>clearTimeout(timer);
  },[]);
  useEffect(()=>()=>{springs.current?.turn.stop();springs.current?.hop.stop();},[]);
  const visible=shown.slice(0,3);
  return <span ref={root} className="dock-faces" data-count={visible.length} aria-hidden="true">{visible.length
    ?visible.map(face=><Face key={face.id} face={face}/>)
    :<span className="dock-face"><UserRound size={13} aria-hidden="true"/></span>}</span>;
}
