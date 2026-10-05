import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Files, X } from 'lucide-react';
import { BorderBeam } from 'border-beam';
import { SoftOrbitGlow } from './soft-orbit-glow';
import { StudioActionLabel } from './studio-action-label';
import { ImportProcessingLabel } from './import-processing-label';
import { ImportPhaseStatus } from './statement-import-content';
import type { ImportProgress } from './statement-import-flow';
import type { ReaderResult } from './import-reader';
import type { StatementFile } from './statement-files';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';
import type { DockContext } from './floating-dock';

type Props = {
  reviewing:boolean; processing:boolean; origin?:PanelOrigin; closing?:boolean; suspended?:boolean;
  progress?:ImportProgress|null; result?:ReaderResult; files?:StatementFile[];
  onExited:()=>void; context:DockContext; children:ReactNode;
};

export function StatementImportPanel({reviewing,processing,progress,result,files,origin,closing,onExited,context,children,suspended=false}:Props) {
  const panel=useRef<HTMLDivElement>(null);
  const list=useRef<HTMLDivElement>(null);
  usePanelMorph(panel,origin,closing,onExited,context.onBack,suspended);
  // The reader stays on top after the reading, turned into the result, so the
  // list that was just filled is the list being fixed.
  const status=!!progress&&(processing||(reviewing&&!!result));
  useLayoutEffect(()=>{if(status&&reviewing)return;panel.current?.scrollTo({top:0,behavior:'instant'});list.current?.scrollTo({top:0,behavior:'instant'});},[reviewing,processing,status]);
  // The AI glow outlives the reading by a beat, fading as the result lands.
  const [glow,setGlow]=useState(processing);
  useEffect(()=>{
    if(processing){setGlow(true);return;}
    const timer=window.setTimeout(()=>setGlow(false),1300);
    return()=>window.clearTimeout(timer);
  },[processing]);
  return <div className="card-panel-backdrop" onClick={event=>{if(!suspended&&event.target===event.currentTarget)context.onBack();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <div className="card-panel-frame statement-import-frame">
      <div className="card-panel-glass" aria-hidden="true"/>
      {glow&&<div className="import-glow" data-leaving={!processing||undefined} aria-hidden="true"><SoftOrbitGlow/>
      <div className="import-border-beam"><BorderBeam size="md" theme="light" colorVariant="colorful" borderRadius={28} style={{position:'absolute',inset:0}}><div style={{height:'100%',borderRadius:28}}/></BorderBeam></div></div>}
      <div ref={panel} className="card-panel statement-import-panel" data-processing={status} style={{borderRadius:28}} role="dialog" aria-modal="true" aria-labelledby="import-panel-title">
        <header className="card-panel-header"><span className="card-panel-icon"><Files size={22}/></span><div><h2 id="import-panel-title" tabIndex={-1}>{status?'明細を仕分ける':reviewing?'明細を確認':'明細を取り込む'}</h2></div><button className="card-panel-close" aria-label={processing?'取り込みを中止':'戻る'} onClick={context.onBack}><X size={20}/></button></header>
        {status&&progress&&<ImportPhaseStatus progress={progress} files={files} result={processing?undefined:result}/>}
        <div ref={list} className="card-panel-scroll" data-import-list-viewport={status?'':undefined}>{children}</div>
        <footer className="card-panel-footer panel-desktop-actions"><button className={context.actionAppearance==='studio'?'studio-action':context.actionAppearance==='breathing'?'breathing-action':undefined} disabled={context.disabled} onClick={context.onAction}>{context.actionAppearance==='studio'?<StudioActionLabel label={context.actionLabel}/>:context.actionAppearance==='breathing'?<ImportProcessingLabel label={context.actionLabel}/>:context.actionLabel}</button></footer>
      </div>
    </div>
  </div>;
}
