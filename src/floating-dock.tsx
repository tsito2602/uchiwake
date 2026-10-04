import { EntryGroupTabs, EntrySortControls } from './entry-sort-controls';
import type { EntrySort } from './entry-sort';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type CSSProperties } from 'react';
import { Copy, Shuffle, RefreshCw, UserRoundPlus, Calculator, Check, ChevronLeft, ChevronRight, Pencil, Plus, ReceiptText, Settings, Trash2 } from 'lucide-react';
import { FluidDockSurface, type FluidDockHandle } from './kondo-fluid-dock';
import { FuseAddMenu, type AddOption } from './fuse-add-menu';
import { DockContent } from './kondo-dock-content';
import { NativeMonthPicker } from './native-month-picker';
import { PanelBackButton } from './panel-back-button';
import { StudioActionLabel } from './studio-action-label';
import { ImportProcessingLabel } from './import-processing-label';
import { dockTabAt } from './dock-tab-hit';

export type DockTab = 'home' | 'ledger' | 'import' | 'settings';
export const dockTabs = [
  { key: 'home', label: '精算', icon: Calculator },
  { key: 'ledger', label: '明細', icon: ReceiptText },
  { key: 'settings', label: '設定', icon: Settings }
] as const;

export type DockAction = {icon?:'invite'|'copy'|'refresh'|'shuffle';label:string;onAction:()=>void;disabled?:boolean;commit?:boolean};
export type DockContext = { contentKey?:string; detailAction?:DockAction; entryControls?:{sort:EntrySort;onSort:(value:EntrySort)=>void;groupByCard?:boolean;onGroupByCard?:(value:boolean)=>void}; backOnly?:boolean;label:string; onBack:()=>void; actionLabel:string; onAction:()=>void; disabled?:boolean; compact?:boolean; actionIcon?:'edit'|'done'|'details'|'shuffle'; actionAppearance?:'studio'|'breathing'; commit?:boolean; secondaryAction?:DockAction; auxiliaryAction?:DockAction; trailingEdit?:DockAction; rentActions?:boolean };
type DockAdd = {label:string;options:AddOption[];disabled?:boolean};
type Props = {personal?:boolean;tab:DockTab;onSelect:(tab:DockTab)=>void;add?:DockAdd;context?:DockContext;panelActive?:boolean;month:string;onMonthChange:(month:string)=>void;onPrevMonth:()=>void;onNextMonth:()=>void};

function DockActionIcon({action,fallback}:{action:DockAction;fallback:'settings'|'details'}) {
 const Icon=action.icon==='shuffle'?Shuffle:action.icon==='invite'?UserRoundPlus:action.icon==='copy'?Copy:action.icon==='refresh'?RefreshCw:fallback==='details'?ReceiptText:Settings;
 return <Icon size={22} aria-hidden="true"/>;
}

export function FloatingDock({personal,tab,onSelect,add,context,panelActive,month,onMonthChange,onPrevMonth,onNextMonth}:Props) {
  const [preview,setPreview]=useState<number|null>(null);
  const [menuPhase,setMenuPhase]=useState<'closed'|'open'|'closing'>('closed');
  const pendingAdd=useRef<(()=>void)|null>(null);
  const menuOpen=menuPhase==='open';
  const closeMenu=()=>setMenuPhase('closing');
  const exitMenu=()=>{setMenuPhase('closed');const action=pendingAdd.current;pendingAdd.current=null;action?.();};
  const root=useRef<HTMLDivElement>(null);
  const morph=useRef<FluidDockHandle>(null);
  const pointer=useRef<{id:number;target:HTMLElement;x:number;y:number}|null>(null);
  const swallowClick=useRef(false);
  const separateSecondary=!!context?.secondaryAction&&(context.commit||context.rentActions||context.backOnly);
  const showMonth=tab!=='settings';
  const selected=Math.max(0,dockTabs.findIndex(item=>item.key===tab));
  useLayoutEffect(()=>{morph.current?.measure();},[context,showMonth]);
  useEffect(()=>{if(context||add?.disabled)setMenuPhase('closed');},[!!context,add?.disabled]);
  function hit(event:PointerEvent<HTMLElement>) {
    // Scope to the captured nav, excluding calendar controls and outgoing copies.
    const buttons=event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-dock-index]');
    return dockTabAt(event.clientX,event.clientY,Array.from(buttons,button=>button.getBoundingClientRect()));
  }
  function release() {
    const held=pointer.current;
    pointer.current=null;setPreview(null);
    if(held?.target.hasPointerCapture(held.id))held.target.releasePointerCapture(held.id);
  }
  useEffect(()=>{release();},[tab,!!context]);
  useEffect(()=>{
    const end=(event:globalThis.PointerEvent)=>{if(pointer.current?.id===event.pointerId)release();};
    window.addEventListener('blur',release);window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);
    return()=>{release();window.removeEventListener('blur',release);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);};
  },[]);
  function down(event:PointerEvent<HTMLElement>) {
    if(event.button!==0||!event.isPrimary||pointer.current)return;
    swallowClick.current=false;
    // Capture only once the finger slides: a plain tap must reach the tab's
    // HapticTouch switch, which pointer capture would redirect to the nav.
    pointer.current={id:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY};
    setPreview(hit(event));
  }
  function move(event:PointerEvent<HTMLElement>) {
    const held=pointer.current;if(held?.id!==event.pointerId)return;
    if(!held.target.hasPointerCapture(held.id)&&Math.hypot(event.clientX-held.x,event.clientY-held.y)>6)held.target.setPointerCapture(held.id);
    setPreview(hit(event));
  }
  function up(event:PointerEvent<HTMLElement>) {
    if(pointer.current?.id!==event.pointerId)return;
    const index=hit(event);
    swallowClick.current=true;
    window.setTimeout(()=>{swallowClick.current=false;},0);
    release();
    if(index!==null)onSelect(dockTabs[index].key);
  }
  return <>
    {!context&&add&&menuPhase!=='closed'&&<FuseAddMenu options={add.options} closing={menuPhase==='closing'} onClose={closeMenu} onSelect={option=>{pendingAdd.current=option.onClick;closeMenu();}} onExited={exitMenu}/>}

    <div className={`floating-nav-host${context?.entryControls?' has-entry-controls':''}${context||panelActive?' context-host':''}`}><div ref={root} className="kondo-floating-dock thumb-dock" data-mode={context?'context':'browse'}>

      <FluidDockSurface root={root} ref={morph} addOpen={menuOpen}/>
      <DockContent identity={context?.contentKey??(context?'context':'browse')} mode={context?'context':'browse'}>
        {context?<nav className={`context-dock${context.entryControls?' context-entries':''}${context.rentActions?' context-rent':''}`} aria-label={context.label}>
          <div className="context-island context-back"><PanelBackButton onBack={context.onBack}/></div>
          {context.detailAction&&<div className="context-island context-detail"><button aria-label={context.detailAction.label} onClick={context.detailAction.onAction} disabled={context.detailAction.disabled}><DockActionIcon action={context.detailAction} fallback="details"/></button></div>}
          {context.entryControls?.onGroupByCard&&<div className="context-island context-entry-groups"><EntryGroupTabs groupByCard={!!context.entryControls.groupByCard} onChange={context.entryControls.onGroupByCard}/></div>}
          {context.entryControls&&<div className="context-island context-entry-sorts"><EntrySortControls value={context.entryControls.sort} onChange={context.entryControls.onSort}/></div>}
          {context.auxiliaryAction&&<div className="context-island context-auxiliary"><button aria-label={context.auxiliaryAction.label} onClick={context.auxiliaryAction.onAction} disabled={context.auxiliaryAction.disabled}>{context.rentActions?<><Pencil size={18} aria-hidden="true"/><span>基本家賃</span></>:<DockActionIcon action={context.auxiliaryAction} fallback="settings"/>}</button></div>}
          {!context.backOnly&&<div data-commit={context.commit||undefined} className={`context-island context-primary${context.compact?' context-compact':''}${context.secondaryAction&&!separateSecondary?' context-action-group':''}`}>
            <button className={`context-action${context.actionAppearance==='studio'?' studio-action':context.actionAppearance==='breathing'?' breathing-action':''}`} aria-label={context.actionLabel} onClick={context.onAction} disabled={context.disabled}>{context.actionIcon==='shuffle'?<><Shuffle size={20} aria-hidden="true"/><span>{context.actionLabel}</span></>:context.actionIcon==='edit'?<><Pencil size={context.rentActions?18:22} aria-hidden="true"/>{context.rentActions&&<span>この月の家賃</span>}</>:context.actionIcon==='details'?<ReceiptText size={22} aria-hidden="true"/>:context.actionIcon==='done'?<Check size={22} aria-hidden="true"/>:context.actionAppearance==='studio'?<StudioActionLabel label={context.actionLabel}/>:context.actionAppearance==='breathing'?<ImportProcessingLabel label={context.actionLabel}/>:context.actionLabel}</button>
            {context.secondaryAction&&!separateSecondary&&<button className="context-action context-delete-action" aria-label={context.secondaryAction.label} onClick={context.secondaryAction.onAction} disabled={context.secondaryAction.disabled}><Trash2 size={22} aria-hidden="true"/></button>}
          </div>}
          {context.secondaryAction&&separateSecondary&&<div className="context-island context-delete"><button aria-label={context.secondaryAction.label} onClick={context.secondaryAction.onAction} disabled={context.secondaryAction.disabled}><Trash2 size={22} aria-hidden="true"/></button></div>}
          {context.trailingEdit&&<div className="context-island context-edit"><button aria-label={context.trailingEdit.label} onClick={context.trailingEdit.onAction} disabled={context.trailingEdit.disabled}><Pencil size={22} aria-hidden="true"/></button></div>}
        </nav>
          :<div className={`browse-dock${add?' has-add':''}${showMonth?'':' no-month'}`}><nav className="safari-dock" data-wide="true" aria-label="メインメニュー" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={event=>{if(pointer.current?.id===event.pointerId)release();}} onLostPointerCapture={event=>{if(pointer.current?.id===event.pointerId)release();}} onClickCapture={event=>{if(swallowClick.current){if(!(event.target as Element).closest?.('.haptic-touch'))event.preventDefault();event.stopPropagation();swallowClick.current=false;}}} style={{'--selection-tab':preview??selected} as CSSProperties}>
            <span className="dock-selection" aria-hidden="true"/>
            {dockTabs.map((item,index)=><button key={item.key} data-dock-index={index} aria-current={tab===item.key?'page':undefined} aria-label={personal&&item.key==='home'?'支出':item.label} onClick={()=>onSelect(item.key)}><item.icon size={22} strokeWidth={1.8}/></button>)}
          </nav>{showMonth&&<div className="dock-month" aria-label="表示月"><button aria-label="前月" onClick={onPrevMonth}><ChevronLeft size={18}/></button><NativeMonthPicker value={month} onChange={onMonthChange}/><button aria-label="翌月" onClick={onNextMonth}><ChevronRight size={18}/></button></div>}{add&&<button className="dock-add" disabled={add.disabled} aria-label={add.label} aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuPhase('open')} style={{opacity:menuOpen?0:1,transform:menuOpen?'scale(.5)':undefined}}><Plus size={23}/></button>}</div>}
      </DockContent>
    </div></div>
  </>;
}
