import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Camera, X } from 'lucide-react';
import { BorderBeam } from 'border-beam';
import { importBeamCSS } from './import-beam';
import { StudioActionLabel } from './studio-action-label';
import { ImportProcessingLabel } from './import-processing-label';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';
import type { DockContext } from './floating-dock';

type Props = {
  reviewing:boolean; processing:boolean; origin?:PanelOrigin; closing?:boolean;
  onExited:()=>void; context:DockContext; children:ReactNode;
};

export function StatementImportPanel({reviewing,processing,origin,closing,onExited,context,children}:Props) {
  const panel=useRef<HTMLDivElement>(null);
  const scroll=useRef<HTMLDivElement>(null);
  usePanelMorph(panel,origin,closing,onExited,context.onBack);
  useLayoutEffect(()=>{scroll.current?.scrollTo({top:0,behavior:'instant'});},[reviewing,processing]);
  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)context.onBack();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    {/* Light Rotate, with panel-only contrast corrections in importBeamCSS. */}
    <BorderBeam ref={panel} className="card-panel statement-import-panel" style={{display:'flex',position:'relative',borderRadius:28}} size="md" theme="light" active={processing} borderRadius={28} role="dialog" aria-modal="true" aria-labelledby="import-panel-title" css={importBeamCSS}>
      <header className="card-panel-header"><span className="card-panel-icon"><Camera size={22}/></span><div><h2 id="import-panel-title" tabIndex={-1}>{processing?'明細を仕分ける':reviewing?'明細を確認':'明細を取り込む'}</h2></div><button className="card-panel-close" aria-label={processing?'取り込みを中止':'戻る'} onClick={context.onBack}><X size={20}/></button></header>
      <div ref={scroll} className="card-panel-scroll">{children}</div>
      <footer className="card-panel-footer panel-desktop-actions"><button className={context.actionAppearance==='studio'?'studio-action':context.actionAppearance==='breathing'?'breathing-action':undefined} disabled={context.disabled} onClick={context.onAction}>{context.actionAppearance==='studio'?<StudioActionLabel label={context.actionLabel}/>:context.actionAppearance==='breathing'?<ImportProcessingLabel label={context.actionLabel}/>:context.actionLabel}</button></footer>
    </BorderBeam>
  </div>;
}
