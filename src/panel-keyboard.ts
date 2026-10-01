import {panelEditor} from './panel-focus';

// iOS centers focused controls by panning the window, including fixed overlays.
// Adapted from uchino. Keep native focus from starting that pan; trackPanelViewport reveals the field
// in the panel after the keyboard has resized the available space.
export function guardPanelKeyboardFocus(doc:Document):()=>void {
  const view=doc.defaultView;
  if(!view)return()=>{};
  const {userAgent,platform,maxTouchPoints}=view.navigator;
  if(!/iP(hone|ad|od)/.test(userAgent)&&!(platform==='MacIntel'&&maxTouchPoints>1))return()=>{};
  const editorFor=(target:EventTarget|null)=>{
    if(!(target instanceof Element))return null;
    const control=target.closest('label')?.control;
    const editor=panelEditor(control??target.closest('input,textarea,[contenteditable="true"]'));
    // Leave native pickers and non-editable controls to the browser.
    return editor&&!editor.matches('select,input[type="date"],input[type="time"],input[type="datetime-local"],input[type="month"],input[type="week"]')?editor:null;
  };
  const shifted=new Map<HTMLElement,{frame:number;restore:()=>void}>();
  const preventFocusPan=(editor:HTMLElement)=>{
    if(shifted.has(editor))return;
    const properties=['transform','transition'] as const;
    const saved=properties.map(key=>[key,editor.style.getPropertyValue(key),editor.style.getPropertyPriority(key)] as const);
    const restore=()=>{
      saved.forEach(([key,value,priority])=>value?editor.style.setProperty(key,value,priority):editor.style.removeProperty(key));
      shifted.delete(editor);
    };
    editor.style.setProperty('transition','none','important');
    editor.style.setProperty('transform','translateY(-10000px)','important');
    shifted.set(editor,{restore,frame:view.requestAnimationFrame(restore)});
  };
  let tap:{id:number;x:number;y:number;time:number;editor:HTMLElement}|null=null;
  const start=(event:TouchEvent)=>{
    const editor=editorFor(event.target),touch=event.touches[0];
    tap=editor&&event.touches.length===1?{id:touch.identifier,x:touch.clientX,y:touch.clientY,time:event.timeStamp,editor}:null;
  };
  const move=(event:TouchEvent)=>{
    if(!tap)return;
    const touch=Array.from(event.touches).find(t=>t.identifier===tap!.id);
    if(event.touches.length!==1||!touch||Math.hypot(touch.clientX-tap.x,touch.clientY-tap.y)>10)tap=null;
  };
  const end=(event:TouchEvent)=>{
    const current=tap;tap=null;
    if(!current||event.touches.length||event.timeStamp-current.time>500||!event.cancelable||event.defaultPrevented)return;
    const touch=Array.from(event.changedTouches).find(t=>t.identifier===current.id);
    if(!touch||Math.hypot(touch.clientX-current.x,touch.clientY-current.y)>10)return;
    const editor=editorFor(event.target);
    if(!editor||editor!==current.editor||editor===doc.activeElement)return;
    // Must happen before native touch focus. Keep focus synchronous so iOS
    // still opens its keyboard as part of this user gesture.
    event.preventDefault();
    preventFocusPan(editor);
    editor.focus({preventScroll:true});
  };
  const cancel=()=>{tap=null;};
  const focus=(event:FocusEvent)=>{
    const editor=editorFor(event.target);
    // Accessory-bar next/previous and hardware Tab do not produce touchend.
    if(editor)preventFocusPan(editor);
  };
  const resetWindowScroll=()=>{
    if(view.visualViewport&&Math.abs(view.visualViewport.scale-1)>.01)return;
    if(view.scrollX||view.scrollY)view.scrollTo({left:0,top:0,behavior:'instant'});
  };
  // The fixed body retains the original page offset until the last panel closes.
  resetWindowScroll();
  doc.addEventListener('touchstart',start,{capture:true,passive:true});
  doc.addEventListener('touchmove',move,{capture:true,passive:true});
  doc.addEventListener('touchend',end,{capture:true,passive:false});
  doc.addEventListener('touchcancel',cancel,true);
  doc.addEventListener('focus',focus,true);
  view.addEventListener('scroll',resetWindowScroll);
  return()=>{
    doc.removeEventListener('touchstart',start,true);doc.removeEventListener('touchmove',move,true);
    doc.removeEventListener('touchend',end,true);doc.removeEventListener('touchcancel',cancel,true);
    doc.removeEventListener('focus',focus,true);view.removeEventListener('scroll',resetWindowScroll);
    shifted.forEach(({frame,restore})=>{view.cancelAnimationFrame(frame);restore();});
  };
}

