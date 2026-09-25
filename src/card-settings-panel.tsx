import { useLayoutEffect, useRef } from 'react';
import { CreditCard, X } from 'lucide-react';
import type { SharedCard } from './domain';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

type Props = {card?:SharedCard;view:'summary'|'edit';origin?:PanelOrigin;closing?:boolean;busy:boolean;name:string;active:boolean;actionLabel:string;actionDisabled?:boolean;onName:(name:string)=>void;onActive:(active:boolean)=>void;onClose:()=>void;onExited:()=>void;onSave:()=>void};

export function CardSettingsPanel({card,view,origin,closing,busy,name,active,actionLabel,actionDisabled,onName,onActive,onClose,onExited,onSave}:Props) {
  const panel=useRef<HTMLElement>(null);
  const previousSize=useRef<{width:number;height:number}|null>(null);
  usePanelMorph(panel,origin,closing,onExited,onClose);
  const lastView=useRef(view);
  useLayoutEffect(()=>{
    const after=panel.current?.getBoundingClientRect();
    if(lastView.current===view){if(after)previousSize.current={width:after.width,height:after.height};return;}
    lastView.current=view;
    if(!previousSize.current||!panel.current||!after)return;
    const before=previousSize.current;
    previousSize.current={width:after.width,height:after.height};
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    panel.current.animate([{width:`${before.width}px`,height:`${before.height}px`},{width:`${after.width}px`,height:`${after.height}px`}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
  },[view]);

  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="card-panel card-settings-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="card-settings-title" ref={panel}>
      <div className="card-panel-grip" aria-hidden="true"/>
      <header className="card-panel-header"><span className="card-panel-icon"><CreditCard size={22}/></span><div><h2 id="card-settings-title">{view==='summary'?card?.name:card?'カードの設定':'カードを追加'}</h2><span>{card?'共有カード':'新しい共有カード'}</span></div><button className="card-panel-close" aria-label="閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">{view==='summary'?<div className="card-settings-summary"><strong>{card?.name}</strong><span>{card?.active?'使用中':'使用停止中'}</span></div>:<div className="bill-panel-form"><label className="field"><span>カード名</span><input value={name} maxLength={40} placeholder="例：生活費カード" onChange={event=>onName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&name.trim()&&!busy)onSave();}}/></label>{card&&<label className="card-settings-active"><input type="checkbox" checked={active} onChange={event=>onActive(event.target.checked)}/><span>使用する</span></label>}</div>}</div>
      <footer className="card-panel-footer panel-desktop-actions"><button disabled={actionDisabled} onClick={onSave}>{actionLabel}</button></footer>
    </section>
  </div>;
}
