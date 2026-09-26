import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Camera, X } from 'lucide-react';
import { SoftOrbitGlow } from './soft-orbit-glow';
import { StudioActionLabel } from './studio-action-label';
import { ImportProcessingLabel } from './import-processing-label';
import { ImportPhaseStatus } from './statement-import-content';
import type { ImportProgress } from './statement-import-flow';
import { scrollImportToLatest } from './import-follow-scroll';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';
import type { DockContext } from './floating-dock';

type Props = {
  reviewing:boolean; processing:boolean; origin?:PanelOrigin; closing?:boolean;
  progress?:ImportProgress|null;
  onExited:()=>void; context:DockContext; children:ReactNode;
};

export function StatementImportPanel({reviewing,processing,progress,origin,closing,onExited,context,children}:Props) {
  const panel=useRef<HTMLDivElement>(null);
  const scroll=useRef<HTMLDivElement>(null);
  usePanelMorph(panel,origin,closing,onExited,context.onBack);
  useLayoutEffect(()=>{scroll.current?.scrollTo({top:0,behavior:'instant'});},[reviewing,processing]);
  useEffect(()=>{
    if(!processing||!progress?.entries.length)return;
    const frame=requestAnimationFrame(()=>{
      const viewport=scroll.current;
      if(viewport)scrollImportToLatest(viewport,window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    });
    return ()=>cancelAnimationFrame(frame);
  },[processing,progress?.entries.length]);
  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)context.onBack();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <div ref={panel} className="card-panel statement-import-panel" style={{display:'flex',position:'relative',borderRadius:28}} role="dialog" aria-modal="true" aria-labelledby="import-panel-title">
      {processing&&<SoftOrbitGlow/>}
      <header className="card-panel-header"><span className="card-panel-icon"><Camera size={22}/></span><div><h2 id="import-panel-title" tabIndex={-1}>{processing?'明細を仕分ける':reviewing?'明細を確認':'明細を取り込む'}</h2></div><button className="card-panel-close" aria-label={processing?'取り込みを中止':'戻る'} onClick={context.onBack}><X size={20}/></button></header>
      {processing&&progress&&<ImportPhaseStatus progress={progress}/>}
      <div ref={scroll} className="card-panel-scroll">{children}</div>
      <footer className="card-panel-footer panel-desktop-actions"><button className={context.actionAppearance==='studio'?'studio-action':context.actionAppearance==='breathing'?'breathing-action':undefined} disabled={context.disabled} onClick={context.onAction}>{context.actionAppearance==='studio'?<StudioActionLabel label={context.actionLabel}/>:context.actionAppearance==='breathing'?<ImportProcessingLabel label={context.actionLabel}/>:context.actionLabel}</button></footer>
    </div>
  </div>;
}
