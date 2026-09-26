import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react';
import { Calculator, Check, ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, Settings, Trash2 } from 'lucide-react';
import { FluidDockSurface, type FluidDockHandle } from './kondo-fluid-dock';
import { FuseAddMenu, type AddOption } from './fuse-add-menu';
import { DockContent } from './kondo-dock-content';
import { NativeMonthPicker } from './native-month-picker';
import { PanelBackButton } from './panel-back-button';
import { dockKeyboardInset } from './panel-focus';
import { StudioActionLabel } from './studio-action-label';
import { ImportProcessingLabel } from './import-processing-label';

export type DockTab = 'home' | 'ledger' | 'import' | 'settings';
export const dockTabs = [
  { key: 'home', label: '精算', icon: Calculator },
  { key: 'ledger', label: '明細', icon: ReceiptText },
  { key: 'settings', label: '設定', icon: Settings }
] as const;

export type DockAction = {label:string;onAction:()=>void;disabled?:boolean;commit?:boolean};
export type DockContext = { label:string; onBack:()=>void; actionLabel:string; onAction:()=>void; disabled?:boolean; compact?:boolean; actionIcon?:'edit'|'done'; actionAppearance?:'studio'|'breathing'; commit?:boolean; secondaryAction?:DockAction; auxiliaryAction?:DockAction; trailingEdit?:DockAction; rentActions?:boolean };
type DockAdd = {label:string;options:AddOption[];disabled?:boolean};
type Props = {tab:DockTab;onSelect:(tab:DockTab)=>void;add?:DockAdd;context?:DockContext;panelActive?:boolean;month:string;onMonthChange:(month:string)=>void;onPrevMonth:()=>void;onNextMonth:()=>void};

export function FloatingDock({tab,onSelect,add,context,panelActive,month,onMonthChange,onPrevMonth,onNextMonth}:Props) {
  const [preview,setPreview]=useState<number|null>(null);
  const [menuPhase,setMenuPhase]=useState<'closed'|'open'|'closing'>('closed');
  const pendingAdd=useRef<(()=>void)|null>(null);
  const menuOpen=menuPhase==='open';
  const closeMenu=()=>setMenuPhase('closing');
  const exitMenu=()=>{setMenuPhase('closed');const action=pendingAdd.current;pendingAdd.current=null;action?.();};
  const root=useRef<HTMLDivElement>(null);
  const morph=useRef<FluidDockHandle>(null);
  const pointer=useRef<{id:number;startX:number;startY:number}|null>(null);
  const swallowClick=useRef(false);
  const separateSecondary=!!context?.secondaryAction&&(context.commit||context.rentActions);
  const showMonth=tab!=='settings';
  const selected=Math.max(0,dockTabs.findIndex(item=>item.key===tab));
  useLayoutEffect(()=>{morph.current?.measure();},[context,showMonth]);
  useEffect(()=>{if(context||add?.disabled)setMenuPhase('closed');},[!!context,add?.disabled]);
  useEffect(()=>{
    const viewport=window.visualViewport;
    const update=()=>{
      const inset=dockKeyboardInset(window.innerHeight,viewport,document.activeElement);
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
  }
  function down(event:PointerEvent<HTMLElement>) {
    if(event.button!==0||!event.isPrimary)return;
    pointer.current={id:event.pointerId,startX:event.clientX,startY:event.clientY};
    event.currentTarget.setPointerCapture(event.pointerId);
    setPreview(hit(event.clientX,event.clientY));
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
    {!context&&add&&menuPhase!=='closed'&&<FuseAddMenu options={add.options} closing={menuPhase==='closing'} onClose={closeMenu} onSelect={option=>{pendingAdd.current=option.onClick;closeMenu();}} onExited={exitMenu}/>}

    <div className={`floating-nav-host${context||panelActive?' context-host':''}`}><div ref={root} className="kondo-floating-dock thumb-dock" data-mode={context?'context':'browse'}>

      <FluidDockSurface root={root} ref={morph} addOpen={menuOpen}/>
      <DockContent identity={context?'context':'browse'} mode={context?'context':'browse'}>
        {context?<nav className={`context-dock${context.rentActions?' context-rent':''}`} aria-label={context.label}>
          <div className="context-island context-back"><PanelBackButton onBack={context.onBack}/></div>
          {context.auxiliaryAction&&<div className="context-island context-auxiliary"><button aria-label={context.auxiliaryAction.label} onClick={context.auxiliaryAction.onAction} disabled={context.auxiliaryAction.disabled}>{context.rentActions?<><Pencil size={18} aria-hidden="true"/><span>基本家賃</span></>:<Settings size={22} aria-hidden="true"/>}</button></div>}
          <div data-commit={context.commit||undefined} className={`context-island context-primary${context.compact?' context-compact':''}${context.secondaryAction&&!separateSecondary?' context-action-group':''}`}>
            <button className={`context-action${context.actionAppearance==='studio'?' studio-action':context.actionAppearance==='breathing'?' breathing-action':''}`} aria-label={context.actionLabel} onClick={context.onAction} disabled={context.disabled}>{context.actionIcon==='edit'?<><Pencil size={context.rentActions?18:22} aria-hidden="true"/>{context.rentActions&&<span>この月の家賃</span>}</>:context.actionIcon==='done'?<Check size={22} aria-hidden="true"/>:context.actionAppearance==='studio'?<StudioActionLabel label={context.actionLabel}/>:context.actionAppearance==='breathing'?<ImportProcessingLabel label={context.actionLabel}/>:context.actionLabel}</button>
            {context.secondaryAction&&!separateSecondary&&<button className="context-action context-delete-action" aria-label={context.secondaryAction.label} onClick={context.secondaryAction.onAction} disabled={context.secondaryAction.disabled}><Trash2 size={22} aria-hidden="true"/></button>}
          </div>
          {context.secondaryAction&&separateSecondary&&<div className="context-island context-delete"><button aria-label={context.secondaryAction.label} onClick={context.secondaryAction.onAction} disabled={context.secondaryAction.disabled}><Trash2 size={22} aria-hidden="true"/></button></div>}
          {context.trailingEdit&&<div className="context-island context-edit"><button aria-label={context.trailingEdit.label} onClick={context.trailingEdit.onAction} disabled={context.trailingEdit.disabled}><Pencil size={22} aria-hidden="true"/></button></div>}
        </nav>
          :<div className={`browse-dock${add?' has-add':''}${showMonth?'':' no-month'}`}><nav className="safari-dock" data-wide="true" aria-label="メインメニュー" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={release} onClickCapture={event=>{if(swallowClick.current){event.preventDefault();event.stopPropagation();swallowClick.current=false;}}} style={{'--selection-tab':preview??selected} as CSSProperties}>
            <span className="dock-selection" aria-hidden="true"/>
            {dockTabs.map((item,index)=><button key={item.key} data-dock-index={index} aria-current={tab===item.key?'page':undefined} aria-label={item.label} onClick={()=>onSelect(item.key)}><item.icon size={22} strokeWidth={1.8}/></button>)}
          </nav>{showMonth&&<div className="dock-month" aria-label="表示月"><button aria-label="前月" onClick={onPrevMonth}><ChevronLeft size={18}/></button><NativeMonthPicker value={month} onChange={onMonthChange}/><button aria-label="翌月" onClick={onNextMonth}><ChevronRight size={18}/></button></div>}{add&&<button className="dock-add" disabled={add.disabled} aria-label={add.label} aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuPhase('open')} style={{opacity:menuOpen?0:1,transform:menuOpen?'scale(.5)':undefined}}><Plus size={23}/></button>}</div>}
      </DockContent>
    </div></div>
  </>;
}
