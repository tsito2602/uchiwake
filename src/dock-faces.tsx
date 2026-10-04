import { useLayoutEffect, useRef, useState } from 'react';
import { UserRound } from 'lucide-react';
import { springAnimate } from './cartoon-motion';

export type DockFace = {id:string;name:string;avatarUrl?:string};

let shownSpace:string|null=null;

function Face({face}:{face:DockFace}) {
  const [failed,setFailed]=useState<string>();
  const initial=Array.from(face.name.trim())[0];
  return <span className="dock-face">{face.avatarUrl&&face.avatarUrl!==failed
    ?<img src={face.avatarUrl} alt="" referrerPolicy="no-referrer" draggable={false} onError={()=>setFailed(face.avatarUrl)}/>
    :initial||<UserRound size={13} aria-hidden="true"/>}</span>;
}

// The space tab wears the faces of the people in this space. When the space
// changes, the old faces turn away and the new ones swing in on the boing spring.
export function DockFaces({faces,spaceName}:{faces:DockFace[];spaceName:string}) {
  const root=useRef<HTMLSpanElement>(null);
  const visible=faces.slice(0,3);
  useLayoutEffect(()=>{
    const node=root.current;if(!node)return;
    const changed=shownSpace!==null&&shownSpace!==spaceName;
    shownSpace=spaceName;
    if(!changed)return;
    [...node.children].forEach((child,index)=>springAnimate(child,{transform:'rotateY(-90deg) scale(.6)'},{transform:'rotateY(0deg) scale(1)'},{stiffness:300,damping:12},{delay:120+index*60,fill:'backwards'}));
  },[spaceName]);
  return <span ref={root} className="dock-faces" data-count={visible.length} aria-hidden="true">{visible.length
    ?visible.map(face=><Face key={face.id} face={face}/>)
    :<span className="dock-face"><UserRound size={13} aria-hidden="true"/></span>}</span>;
}
