import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react';
import { ArrowLeft, Calculator, ChevronLeft, ChevronRight, Plus, ReceiptText, Settings } from 'lucide-react';
import { animateDockPress } from './kondo-dock-surface';
import { FluidDockSurface, type FluidDockHandle } from './kondo-fluid-dock';
import { DockContent } from './kondo-dock-content';

export type DockTab = 'home' | 'ledger' | 'import' | 'settings';
export const dockTabs = [
  { key: 'home', label: '精算', icon: Calculator },
  { key: 'ledger', label: '明細', icon: ReceiptText },
  { key: 'settings', label: '設定', icon: Settings }
] as const;

type DockContext = { label:string; onBack:()=>void; actionLabel:string; onAction:()=>void; disabled?:boolean };
type DockAdd = {label:string;options:{label:string;onClick:()=>void}[]};
type Props = {tab:DockTab;onSelect:(tab:DockTab)=>void;add?:DockAdd;context?:DockContext;panelActive?:boolean;month:string;onPrevMonth:()=>void;onNextMonth:()=>void};

export function FloatingDock({tab,onSelect,add,context,panelActive,month,onPrevMonth,onNextMonth}:Props) {
  const [preview,setPreview]=useState<number|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null);
  const morph=useRef<FluidDockHandle>(null);
  const pointer=useRef<{id:number;startX:number;startY:number}|null>(null);
  const animation=useRef<Animation|undefined>(undefined);
  const swallowClick=useRef(false);
  const selected=Math.max(0,dockTabs.findIndex(item=>item.key===tab));
  useLayoutEffect(()=>{morph.current?.measure();},[context]);
  useEffect(()=>()=>{animation.current?.cancel();},[]);
  useEffect(()=>{
    const viewport=window.visualViewport;
    const update=()=>{
      const focused=document.activeElement;
      const editable=focused instanceof HTMLElement&&(focused.isContentEditable||focused.matches('input:not([readonly]):not([disabled]):not([type="checkbox"]):not([type="file"]), textarea, select'));
      const inset=viewport&&editable&&Math.abs(viewport.scale-1)<.01&&window.innerHeight-viewport.height>120?Math.max(0,window.innerHeight-viewport.height-Math.max(0,viewport.offsetTop)):0;
      document.documentElement.style.setProperty('--dock-keyboard-inset',`${inset}px`);
    };
    const schedule=()=>window.requestAnimationFrame(update);
    viewport?.addEventListener('resize',update);viewport?.addEventListener('scroll',update);
    window.addEventListener('focusin',schedule);window.addEventListener('focusout',schedule);
    return()=>{viewport?.removeEventListener('resize',update);viewport?.removeEventListener('scroll',update);window.removeEventListener('focusin',schedule);window.removeEventListener('focusout',schedule);document.documentElement.style.removeProperty('--dock-keyboard-inset');};
  },[]);
  function hit(x:number,y:number) {
    const buttons=root.current?.querySelectorAll<HTMLButtonElement>('[data-dock-index]');
    return Array.from(buttons||[]).findIndex(button=>{const rect=button.getBoundingClientRect();return x>=rect.left&&x<rect.right&&y>=rect.top&&y<=rect.bottom;});
  }
  function release() {
    pointer.current=null;setPreview(null);
    if(root.current) animation.current=animateDockPress(root.current,false,animation.current);
  }
  function down(event:PointerEvent<HTMLElement>) {
    if(event.button!==0||!event.isPrimary)return;
    pointer.current={id:event.pointerId,startX:event.clientX,startY:event.clientY};
    root.current?.setPointerCapture(event.pointerId);
    setPreview(hit(event.clientX,event.clientY));
    if(root.current) animation.current=animateDockPress(root.current,true,animation.current);
  }
  function move(event:PointerEvent<HTMLElement>) {
    if(pointer.current?.id===event.pointerId)setPreview(hit(event.clientX,event.clientY));
  }
  function up(event:PointerEvent<HTMLElement>) {
    if(pointer.current?.id!==event.pointerId)return;
    const index=hit(event.clientX,event.clientY);
    swallowClick.current=true;
    window.setTimeout(()=>{swallowClick.current=false;},0);
    release();
    if(index>=0)onSelect(dockTabs[index].key);
  }
  return <>
    {!context&&add&&<div className="dock-add-wrap">{menuOpen&&<div className="dock-add-menu">{add.options.map(option=><button key={option.label} onClick={()=>{setMenuOpen(false);option.onClick();}}>{option.label}</button>)}</div>}<button className="dock-add" aria-label={add.label} aria-expanded={menuOpen} onClick={()=>setMenuOpen(value=>!value)}><Plus size={23}/></button></div>}
    <div className={`floating-nav-host${context||panelActive?' context-host':''}`}><div ref={root} className="kondo-floating-dock thumb-dock" data-mode={context?'context':'browse'}>
      <FluidDockSurface root={root} ref={morph}/>
      <DockContent identity={context?'context':'browse'} mode={context?'context':'browse'}>
        {context?<nav className="context-dock" aria-label={context.label}><div className="context-island context-back"><button onClick={context.onBack} aria-label="戻る"><ArrowLeft size={22}/></button></div><div className="context-island context-primary"><button className="context-action" onClick={context.onAction} disabled={context.disabled}>{context.actionLabel}</button></div></nav>
          :<div className="browse-dock"><nav className="safari-dock" data-wide="true" aria-label="メインメニュー" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={release} onClickCapture={event=>{if(swallowClick.current){event.preventDefault();event.stopPropagation();swallowClick.current=false;}}} style={{'--selection-tab':preview??selected} as CSSProperties}>
            <span className="dock-selection" aria-hidden="true"/>
            {dockTabs.map((item,index)=><button key={item.key} data-dock-index={index} aria-current={tab===item.key?'page':undefined} aria-label={item.label} onClick={()=>onSelect(item.key)}><item.icon size={22} strokeWidth={1.8}/></button>)}
          </nav><div className="dock-month" aria-label="表示月"><button aria-label="前月" onClick={onPrevMonth}><ChevronLeft size={18}/></button><span>{month.slice(0,4)}-{month.slice(5)}</span><button aria-label="翌月" onClick={onNextMonth}><ChevronRight size={18}/></button></div></div>}
      </DockContent>
    </div></div>
  </>;
}
