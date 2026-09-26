import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, Keyboard } from 'lucide-react';
import { panelEditor } from './panel-focus';

export function PanelBackButton({onBack}:{onBack:()=>void}) {
  const [editor,setEditor]=useState<HTMLElement|null>(null);
  const pressedEditor=useRef<HTMLElement|null>(null);
  useEffect(()=>{
    let frame=0;
    const update=()=>setEditor(panelEditor(document.activeElement));
    const afterBlur=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
    update();document.addEventListener('focusin',update);document.addEventListener('focusout',afterBlur);
    return()=>{cancelAnimationFrame(frame);document.removeEventListener('focusin',update);document.removeEventListener('focusout',afterBlur);};
  },[]);
  return <button type="button" aria-label={editor?'キーボードを閉じる':'戻る'}
    onPointerDown={event=>{pressedEditor.current=editor;if(editor)event.preventDefault();}}
    onPointerCancel={()=>{pressedEditor.current=null;}}
    onClick={()=>{const target=pressedEditor.current??editor;pressedEditor.current=null;if(target){target.blur();setEditor(null);}else onBack();}}>
    {editor?<span className="keyboard-dismiss-icon" aria-hidden="true"><Keyboard size={20}/><ChevronDown size={12}/></span>:<ArrowLeft size={22}/>}
  </button>;
}
