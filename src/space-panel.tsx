import { useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { DockContext } from './floating-dock';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

export type SpaceDockChange = (context:DockContext|undefined)=>void;

// Publish a stable dock description while event handlers always use current form state.
// This avoids a parent/child render loop when typing in a panel field.
function useSpaceDock(context:DockContext,onDockChange:SpaceDockChange) {
 const current=useRef(context);current.current=context;
 const dock=useMemo<DockContext>(()=>({
  ...context,
  onBack:()=>current.current.onBack(),onAction:()=>current.current.onAction(),
  ...(context.auxiliaryAction?{auxiliaryAction:{...context.auxiliaryAction,onAction:()=>current.current.auxiliaryAction?.onAction()}}:{}),
  ...(context.secondaryAction?{secondaryAction:{...context.secondaryAction,onAction:()=>current.current.secondaryAction?.onAction()}}:{}),
  ...(context.detailAction?{detailAction:{...context.detailAction,onAction:()=>current.current.detailAction?.onAction()}}:{})
 }),[context.label,context.actionLabel,context.disabled,context.backOnly,context.commit,
  context.auxiliaryAction?.label,context.auxiliaryAction?.disabled,context.auxiliaryAction?.icon,
  context.secondaryAction?.label,context.secondaryAction?.disabled,
  context.detailAction?.label,context.detailAction?.disabled,context.detailAction?.icon]);
 useLayoutEffect(()=>{onDockChange(dock);},[dock,onDockChange]);
 useLayoutEffect(()=>()=>onDockChange(undefined),[onDockChange]);
}

export function SpacePanel({title,icon:Icon,children,context,onDockChange,origin,closing,onExited}:{
 title:string;icon:LucideIcon;children:ReactNode;context:DockContext;onDockChange:SpaceDockChange;
 origin?:PanelOrigin;closing?:boolean;onExited:()=>void;
}) {
 const panel=useRef<HTMLElement>(null);
 usePanelMorph(panel,origin,closing,onExited,context.onBack);
 useSpaceDock(context,onDockChange);
 return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)context.onBack();}}>
  <div className="card-panel-scrim" aria-hidden="true"/>
  <section ref={panel} className="card-panel space-floating-panel" role="dialog" aria-modal="true" aria-labelledby="space-panel-title">
   <header className="card-panel-header"><span className="card-panel-icon"><Icon size={22}/></span><div><h2 id="space-panel-title" tabIndex={-1}>{title}</h2></div></header>
   <div className="card-panel-scroll">{children}</div>
   <footer className="card-panel-footer panel-desktop-actions">
    <button type="button" onClick={context.onBack}>戻る</button>
    {context.detailAction&&<button type="button" disabled={context.detailAction.disabled} onClick={context.detailAction.onAction}>{context.detailAction.label}</button>}
    {context.auxiliaryAction&&<button type="button" disabled={context.auxiliaryAction.disabled} onClick={context.auxiliaryAction.onAction}>{context.auxiliaryAction.label}</button>}
    {!context.backOnly&&<button type="button" disabled={context.disabled} onClick={context.onAction}>{context.actionLabel}</button>}
    {context.secondaryAction&&<button type="button" className="delete-action" disabled={context.secondaryAction.disabled} onClick={context.secondaryAction.onAction}>{context.secondaryAction.label}</button>}
   </footer>
  </section>
 </div>;
}
