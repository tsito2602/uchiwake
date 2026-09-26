import { useRef } from 'react';
import { CreditCard, Pencil, Trash2, X } from 'lucide-react';
import type { DockAction } from './floating-dock';
import { ColorSwatchPicker } from './color-swatch-picker';
import { cardColors, defaultCardColor } from './card-colors';
import type { SharedCard } from './domain';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

type Props = {card?:SharedCard;view:'summary'|'edit';origin?:PanelOrigin;closing?:boolean;busy:boolean;name:string;active:boolean;color:string;onColor:(color:string)=>void;actionLabel:string;actionDisabled?:boolean;deleteAction?:DockAction;error?:string;onName:(name:string)=>void;onActive:(active:boolean)=>void;onClose:()=>void;onExited:()=>void;onSave:()=>void};

export function CardSettingsPanel({card,view,origin,closing,busy,name,active,color,onColor,actionLabel,actionDisabled,deleteAction,error,onName,onActive,onClose,onExited,onSave}:Props) {
  const panel=useRef<HTMLElement>(null);
  usePanelMorph(panel,origin,closing,onExited,onClose);
  const savedColor=card?.color??defaultCardColor;

  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <section className="card-panel card-settings-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="card-settings-title" ref={panel}>
      <header className="card-panel-header"><span className="card-panel-icon"><CreditCard size={22} color={view==='summary'?savedColor:color}/></span><div><h2 tabIndex={-1} id="card-settings-title">{card?'カードの設定':'カードを追加'}</h2><span>{card?'共有カード':'新しい共有カード'}</span></div><button className="card-panel-close" aria-label="閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">{error&&<p className="notice" role="alert">{error}</p>}{view==='summary'?<dl className="card-settings-summary">
        <div><dt>カード名</dt><dd>{card?.name}</dd></div>
        <div><dt>アイコンのカラー</dt><dd className="card-settings-color"><i aria-hidden="true" style={{background:savedColor}}/>{cardColors.find(item=>item.value===savedColor)?.label??savedColor}</dd></div>
        <div><dt>使用状態</dt><dd>{card?.active?'使用中':'使用停止中'}</dd></div>
      </dl>:<div className="bill-panel-form"><label className="field"><span>カード名</span><input value={name} maxLength={40} placeholder="例：生活費カード" onChange={event=>onName(event.target.value)} disabled={busy} onKeyDown={event=>{if(event.key==='Enter'&&!actionDisabled)onSave();}}/></label><ColorSwatchPicker value={color} onChange={onColor} disabled={busy}/>{card&&<label className="card-settings-active"><span>使用する</span><input type="checkbox" role="switch" checked={active} disabled={busy} onChange={event=>onActive(event.target.checked)}/><span className="card-active-switch" aria-hidden="true"><span className="card-active-switch-thumb"/></span></label>}</div>}</div>
      <footer className="card-panel-footer panel-desktop-actions"><button disabled={actionDisabled} onClick={onSave} aria-label={actionLabel}>{view==='summary'?<Pencil size={22}/>:actionLabel}</button>{deleteAction&&<button className="delete-action" disabled={deleteAction.disabled} onClick={deleteAction.onAction} aria-label={deleteAction.label}><Trash2 size={22}/></button>}</footer>
    </section>
  </div>;
}
