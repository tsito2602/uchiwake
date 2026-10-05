import { EntryGroupTabs, EntrySortControls } from './entry-sort-controls';
import type { EntrySort, ListSort } from './entry-sort';
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
import { LiveSpring, reducedMotion } from './cartoon-motion';
import { haptic } from './haptics';
import { DockFaces, type DockFace } from './dock-faces';

export type DockTab = 'home' | 'ledger' | 'import' | 'settings';
export const dockTabs = [
  { key: 'home', label: '精算', icon: Calculator },
  { key: 'ledger', label: '明細', icon: ReceiptText },
  { key: 'settings', label: '設定', icon: Settings }
] as const;

export type DockAction = {icon?:'invite'|'copy'|'refresh'|'shuffle';label:string;onAction:()=>void;disabled?:boolean;commit?:boolean};
export type DockContext = { contentKey?:string; detailAction?:DockAction; entryControls?:{sort:ListSort;onSort:(value:EntrySort)=>void;groupByCard?:boolean;onGroupByCard?:(value:boolean)=>void;trailing?:boolean}; backOnly?:boolean;label:string; onBack:()=>void; actionLabel:string; onAction:()=>void; disabled?:boolean; compact?:boolean; actionIcon?:'edit'|'done'|'details'|'shuffle'; actionAppearance?:'studio'|'breathing'; commit?:boolean; secondaryAction?:DockAction; auxiliaryAction?:DockAction; trailingEdit?:DockAction; rentActions?:boolean };
type DockAdd = {label:string;options:AddOption[];disabled?:boolean};
export type DockSpace = {name:string;faces:DockFace[];open?:boolean;onOpen:(source:HTMLElement)=>void};
type Props = {space?:DockSpace;personal?:boolean;tab:DockTab;onSelect:(tab:DockTab)=>void;add?:DockAdd;context?:DockContext;panelActive?:boolean;month:string;onMonthChange:(month:string)=>void;onPrevMonth:()=>void;onNextMonth:()=>void};

function DockActionIcon({action,fallback}:{action:DockAction;fallback:'settings'|'details'}) {
 const Icon=action.icon==='shuffle'?Shuffle:action.icon==='invite'?UserRoundPlus:action.icon==='copy'?Copy:action.icon==='refresh'?RefreshCw:fallback==='details'?ReceiptText:Settings;
 return <Icon size={22} aria-hidden="true"/>;
}

export function FloatingDock({space,personal,tab,onSelect,add,context,panelActive,month,onMonthChange,onPrevMonth,onNextMonth}:Props) {
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
  // While the space sheet is out, the pill sits on the space (face) tab it came from.
  const selected=space?.open?dockTabs.findIndex(item=>item.key==='settings'):Math.max(0,dockTabs.findIndex(item=>item.key===tab));
  useLayoutEffect(()=>{morph.current?.measure();},[context,showMonth]);
  // Liquid selection: the edge in the direction of travel leads on a stiff
  // spring and the trailing edge follows on a soft one, so the fill stretches
  // toward the new tab, then gathers itself there.
  const tabsNav=useRef<HTMLElement|null>(null);
  const swipe=useRef(false);
  const island=useRef<LiveSpring|null>(null);
  island.current??=new LiveSpring(1,value=>{const nav=tabsNav.current;if(nav)nav.style.scale=Math.abs(value-1)<.0005?'':`${(2-value).toFixed(4)} ${value.toFixed(4)}`;},{stiffness:600,damping:18});
  const edges=useRef<{left:LiveSpring;right:LiveSpring}|null>(null);
  const target=preview??selected;
  useLayoutEffect(()=>{
    const nav=tabsNav.current;if(!nav)return;
    const paint=()=>{const e=edges.current;if(!e)return;nav.style.setProperty('--sel-l',e.left.value.toFixed(4));nav.style.setProperty('--sel-r',e.right.value.toFixed(4));};
    if(!edges.current||!nav.style.getPropertyValue('--sel-l')){edges.current={left:new LiveSpring(target,paint,'lead'),right:new LiveSpring(target+1,paint,'lead')};paint();return;}
    const {left,right}=edges.current;
    if(reducedMotion()){left.set(target);right.set(target+1);return;}
    const forward=target>left.value;
    (forward?right:left).to(forward?target+1:target,'lead');
    (forward?left:right).to(forward?target:target+1,'split');
  },[target,!!context]);
  useEffect(()=>()=>{edges.current?.left.stop();edges.current?.right.stop();},[]);
  // Month pill: drag sideways like turning a page; the label follows on a
  // rubber band and a pull past 36px turns the month.
  const monthLabel=useRef<HTMLDivElement|null>(null);
  const monthDrag=useRef<{id:number;x:number;y:number;dragging:boolean;armed:boolean}|null>(null);
  const monthSpring=useRef<LiveSpring|null>(null);
  const swallowMonthClick=useRef(false);
  const monthOffset=(value:number)=>{const label=monthLabel.current?.querySelector<HTMLElement>('.dock-month-value');if(label)label.style.translate=value?`${value.toFixed(2)}px 0`:'';};
  monthSpring.current??=new LiveSpring(0,monthOffset,{stiffness:520,damping:26});
  const monthStretch=useRef<LiveSpring|null>(null);
  monthStretch.current??=new LiveSpring(1,value=>{const pill=monthLabel.current;if(pill)pill.style.scale=Math.abs(value-1)<.0005?'':`${value.toFixed(4)} 1`;},{stiffness:520,damping:16});
  const shownMonth=useRef(month);
  useLayoutEffect(()=>{
    const before=shownMonth.current;shownMonth.current=month;
    if(!before||!month||before===month)return;
    monthSpring.current!.set(month>before?-40:40);monthSpring.current!.to(0,{stiffness:420,damping:16});
  },[month]);
  function monthDown(event:PointerEvent<HTMLDivElement>){
    if(event.button!==0||!event.isPrimary||(event.target as HTMLElement).closest('button'))return;
    monthDrag.current={id:event.pointerId,x:event.clientX,y:event.clientY,dragging:false,armed:false};
  }
  function monthMove(event:PointerEvent<HTMLDivElement>){
    const drag=monthDrag.current;if(drag?.id!==event.pointerId)return;
    const dx=event.clientX-drag.x;
    if(!drag.dragging){if(Math.abs(dx)<8||Math.abs(dx)<Math.abs(event.clientY-drag.y))return;drag.dragging=true;event.currentTarget.setPointerCapture(event.pointerId);}
    const armed=Math.abs(dx)>36;
    if(armed!==drag.armed){drag.armed=armed;if(armed)haptic();}
    monthSpring.current!.set(Math.sign(dx)*Math.min(70,Math.abs(dx)*.55));
    monthStretch.current!.set(1+Math.min(Math.abs(dx),90)/520);
  }
  function monthUp(event:PointerEvent<HTMLDivElement>){
    const drag=monthDrag.current;if(drag?.id!==event.pointerId)return;monthDrag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    if(!drag.dragging)return;
    swallowMonthClick.current=true;window.setTimeout(()=>{swallowMonthClick.current=false;},0);
    const dx=event.clientX-drag.x;
    monthStretch.current!.to(1,{stiffness:420,damping:10});
    if(Math.abs(dx)>36&&event.type==='pointerup'){
      if(dx<0)onNextMonth();else onPrevMonth();
    }else monthSpring.current!.to(0,{stiffness:420,damping:14});
  }
  useEffect(()=>{if(context||add?.disabled)setMenuPhase('closed');},[!!context,add?.disabled]);
  function hit(event:PointerEvent<HTMLElement>) {
    // Scope to the captured nav, excluding calendar controls and outgoing copies.
    const buttons=event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-dock-index]');
    return dockTabAt(event.clientX,event.clientY,Array.from(buttons,button=>button.getBoundingClientRect()));
  }
  function release() {
    if(!swipe.current)island.current?.to(1,{stiffness:420,damping:12});
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
    // haptic switch, which pointer capture would redirect to the nav.
    pointer.current={id:event.pointerId,target:event.currentTarget,x:event.clientX,y:event.clientY};
    swipe.current=false;island.current!.to(.97,{stiffness:600,damping:18});
    setPreview(hit(event));
  }
  function move(event:PointerEvent<HTMLElement>) {
    const held=pointer.current;if(held?.id!==event.pointerId)return;
    const dy=event.clientY-held.y;
    // Pulling up on the tab island stretches it like taffy; let go past the
    // mark and it grows into the space list.
    if(space&&(swipe.current||(dy<-6&&Math.abs(event.clientX-held.x)<-dy*.8))){
      if(!swipe.current){swipe.current=true;if(!held.target.hasPointerCapture(held.id))held.target.setPointerCapture(held.id);setPreview(null);}
      island.current!.set(1+Math.min(.18,Math.max(0,-dy)/260));
      return;
    }
    if(!held.target.hasPointerCapture(held.id)&&Math.hypot(event.clientX-held.x,dy)>6)held.target.setPointerCapture(held.id);
    setPreview(hit(event));
  }
  function up(event:PointerEvent<HTMLElement>) {
    const held=pointer.current;if(held?.id!==event.pointerId)return;
    island.current!.to(1,{stiffness:420,damping:12});
    if(swipe.current){
      swipe.current=false;const nav=held.target;release();swallowClick.current=true;window.setTimeout(()=>{swallowClick.current=false;},0);
      if(space&&event.clientY-held.y<-24){haptic();space.onOpen(nav);}
      return;
    }
    // A plain tap selects through the tab's own click, which on iPhone first
    // passes through its haptic switch. Switching tabs here would change the
    // page before that click, and iOS then drops the click and its tick.
    if(!held.target.hasPointerCapture(held.id)){release();return;}
    const index=hit(event);
    swallowClick.current=true;
    window.setTimeout(()=>{swallowClick.current=false;},0);
    release();
    if(index!==null)choose(index,held.target);
  }
  function choose(index:number,source:HTMLElement){
    const key=dockTabs[index].key;
    if(key==='settings'&&space){space.onOpen(source.closest('nav')??source);return;}
    onSelect(key);
  }
  return <>
    {!context&&add&&menuPhase!=='closed'&&<FuseAddMenu options={add.options} closing={menuPhase==='closing'} onClose={closeMenu} onSelect={option=>{pendingAdd.current=option.onClick;closeMenu();}} onExited={exitMenu}/>}

    <div className={`floating-nav-host${context?.entryControls&&!context.entryControls.trailing?' has-entry-controls':''}${context||panelActive?' context-host':''}`}><div ref={root} className="kondo-floating-dock thumb-dock" data-mode={context?'context':'browse'}>

      <FluidDockSurface root={root} ref={morph} addOpen={menuOpen}/>
      <DockContent identity={context?.contentKey??(context?'context':'browse')} mode={context?'context':'browse'}>
        {context?<nav className={`context-dock${context.entryControls?' context-entries':''}${context.entryControls?.trailing?' context-trailing-sorts':''}${context.rentActions?' context-rent':''}`} aria-label={context.label}>
          <div className="context-island context-back"><PanelBackButton onBack={context.onBack}/></div>
          {context.detailAction&&<div className="context-island context-detail"><button aria-label={context.detailAction.label} onClick={context.detailAction.onAction} disabled={context.detailAction.disabled}><DockActionIcon action={context.detailAction} fallback="details"/></button></div>}
          {context.entryControls?.onGroupByCard&&<div className="context-island context-entry-groups"><EntryGroupTabs groupByCard={!!context.entryControls.groupByCard} onChange={context.entryControls.onGroupByCard}/></div>}
          {context.entryControls&&!context.entryControls.trailing&&<div className="context-island context-entry-sorts"><EntrySortControls value={context.entryControls.sort} onChange={context.entryControls.onSort}/></div>}
          {context.auxiliaryAction&&<div className="context-island context-auxiliary"><button aria-label={context.auxiliaryAction.label} onClick={context.auxiliaryAction.onAction} disabled={context.auxiliaryAction.disabled}>{context.rentActions?<><Pencil size={18} aria-hidden="true"/><span>基本家賃</span></>:<DockActionIcon action={context.auxiliaryAction} fallback="settings"/>}</button></div>}
          {!context.backOnly&&<div data-commit={context.commit||undefined} className={`context-island context-primary${context.compact?' context-compact':''}${context.secondaryAction&&!separateSecondary?' context-action-group':''}`}>
            <button className={`context-action${context.actionAppearance==='studio'?' studio-action':context.actionAppearance==='breathing'?' breathing-action':''}`} aria-label={context.actionLabel} onClick={context.onAction} disabled={context.disabled}>{context.actionIcon==='shuffle'?<><Shuffle size={20} aria-hidden="true"/><span>{context.actionLabel}</span></>:context.actionIcon==='edit'?<><Pencil size={context.rentActions?18:22} aria-hidden="true"/>{context.rentActions&&<span>この月の家賃</span>}</>:context.actionIcon==='details'?<ReceiptText size={22} aria-hidden="true"/>:context.actionIcon==='done'?<Check size={22} aria-hidden="true"/>:context.actionAppearance==='studio'?<StudioActionLabel label={context.actionLabel}/>:context.actionAppearance==='breathing'?<ImportProcessingLabel label={context.actionLabel}/>:context.actionLabel}</button>
            {context.secondaryAction&&!separateSecondary&&<button className="context-action context-delete-action" aria-label={context.secondaryAction.label} onClick={context.secondaryAction.onAction} disabled={context.secondaryAction.disabled}><Trash2 size={22} aria-hidden="true"/></button>}
          </div>}
          {context.entryControls?.trailing&&<div className="context-island context-entry-sorts"><EntrySortControls value={context.entryControls.sort} onChange={context.entryControls.onSort}/></div>}
          {context.secondaryAction&&separateSecondary&&<div className="context-island context-delete"><button aria-label={context.secondaryAction.label} onClick={context.secondaryAction.onAction} disabled={context.secondaryAction.disabled}><Trash2 size={22} aria-hidden="true"/></button></div>}
          {context.trailingEdit&&<div className="context-island context-edit"><button aria-label={context.trailingEdit.label} onClick={context.trailingEdit.onAction} disabled={context.trailingEdit.disabled}><Pencil size={22} aria-hidden="true"/></button></div>}
        </nav>
          :<div className={`browse-dock${add?' has-add':''}${showMonth?'':' no-month'}`}><nav ref={tabsNav} className="safari-dock" data-wide="true" data-liquid="true" aria-label="メインメニュー" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={event=>{if(pointer.current?.id===event.pointerId)release();}} onLostPointerCapture={event=>{if(event.target===event.currentTarget&&pointer.current?.id===event.pointerId)release();}} onClickCapture={event=>{if(swallowClick.current){event.preventDefault();event.stopPropagation();swallowClick.current=false;}}} style={{'--selection-tab':preview??selected} as CSSProperties}>
            <span className="dock-selection" aria-hidden="true"/>
            {dockTabs.map((item,index)=>item.key==='settings'&&space
              ?<button key={item.key} data-dock-index={index} className="dock-space-tab" aria-current={tab===item.key?'page':undefined} aria-label={`スペース：${space.name}。切り替えと設定`} aria-haspopup="dialog" aria-expanded={!!space.open} onClick={event=>space.onOpen(event.currentTarget.closest('nav')??event.currentTarget)}><DockFaces faces={space.faces} spaceName={space.name}/></button>
              :<button key={item.key} data-dock-index={index} aria-current={tab===item.key?'page':undefined} aria-label={personal&&item.key==='home'?'支出':item.label} onClick={()=>onSelect(item.key)}><item.icon size={22} strokeWidth={1.8}/></button>)}
          </nav>{showMonth&&<div ref={monthLabel} className="dock-month" aria-label="表示月" onPointerDown={monthDown} onPointerMove={monthMove} onPointerUp={monthUp} onPointerCancel={monthUp} onClickCapture={event=>{if(swallowMonthClick.current){event.preventDefault();event.stopPropagation();swallowMonthClick.current=false;}}}><button aria-label="前月" onClick={onPrevMonth}><ChevronLeft size={18}/></button><NativeMonthPicker value={month} onChange={onMonthChange}/><button aria-label="翌月" onClick={onNextMonth}><ChevronRight size={18}/></button></div>}{add&&<button className="dock-add" disabled={add.disabled} aria-label={add.label} aria-haspopup="menu" aria-expanded={menuOpen} onClick={()=>setMenuPhase('open')} style={{opacity:menuOpen?0:1,transform:menuOpen?'scale(.5)':undefined}}><Plus size={23}/></button>}</div>}
      </DockContent>
    </div></div>
  </>;
}
