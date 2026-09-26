import { useId, useRef } from 'react';
import { Pencil, X } from 'lucide-react';
import type { CategoryAppearance } from './domain';
import { CategoryIcon } from './category-icon';
import { categoryIcons } from './category-appearance';
import { categoryColors } from './card-colors';
import { ColorSwatchPicker } from './color-swatch-picker';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

type Props = {
  value:CategoryAppearance;view:'summary'|'edit';isNew?:boolean;origin?:PanelOrigin;closing?:boolean;
  busy:boolean;error?:string;actionLabel:string;actionDisabled?:boolean;
  onChange:(value:CategoryAppearance)=>void;onAction:()=>void;onClose:()=>void;onExited:()=>void;
};

export function CategorySettingsPanel({value,view,isNew,origin,closing,busy,error,actionLabel,actionDisabled,onChange,onAction,onClose,onExited}:Props) {
  const panel=useRef<HTMLElement>(null);
  const radioName=useId();
  usePanelMorph(panel,origin,closing,onExited,onClose);
  const colors=categoryColors;
  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <section className="card-panel category-settings-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="category-settings-title" ref={panel}>
      <header className="card-panel-header"><span className="card-panel-icon"><CategoryIcon name={value.icon} color={value.color} size={24}/></span><div><h2 tabIndex={-1} id="category-settings-title">{isNew?'費目を追加':'費目の設定'}</h2>{!isNew&&<span>{value.category}</span>}</div><button className="card-panel-close" aria-label="閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">
        {error&&<p className="notice" role="alert">{error}</p>}
        {view==='summary'?<dl className="card-settings-summary">
          <div><dt>費目名</dt><dd>{value.category}</dd></div>
          <div><dt>アイコン</dt><dd className="category-icon-label" aria-label={categoryIcons.find(item=>item.value===value.icon)?.label}><CategoryIcon name={value.icon} color={value.color}/></dd></div>
          <div><dt>カラー</dt><dd className="card-settings-color"><i aria-hidden="true" style={{background:value.color}}/>{colors.find(item=>item.value===value.color)?.label}</dd></div>
        </dl>:<div className="bill-panel-form">
          <label className="field"><span>費目名</span><input value={value.category} maxLength={30} placeholder="例：旅行費" disabled={busy} onChange={event=>onChange({...value,category:event.target.value})}/></label>
          <fieldset className="category-icon-picker" disabled={busy}><legend>アイコン</legend><div className="category-icon-options">{categoryIcons.map(icon=><label key={icon.value}>
            <input type="radio" name={radioName} value={icon.value} checked={value.icon===icon.value} onChange={()=>onChange({...value,icon:icon.value})} aria-label={icon.label}/>
            <span title={icon.label}><CategoryIcon name={icon.value} color={value.color} size={26}/></span>
          </label>)}</div></fieldset>
          <label className="card-settings-active"><span>精算に含める</span><input type="checkbox" role="switch" checked={value.include_in_settlement!==false} disabled={busy} onChange={event=>onChange({...value,include_in_settlement:event.target.checked})}/><span className="card-active-switch" aria-hidden="true"><span className="card-active-switch-thumb"/></span></label>
          <p className="subtle">オフにすると、この費目の明細は残したまま、すべての月の精算額から除外します。</p>
          <ColorSwatchPicker value={value.color} options={colors} onChange={color=>onChange({...value,color})} disabled={busy}/>
        </div>}
      </div>
      <footer className="card-panel-footer panel-desktop-actions"><button disabled={actionDisabled} onClick={onAction} aria-label={actionLabel}>{view==='summary'?<Pencil size={22}/>:actionLabel}</button></footer>
    </section>
  </div>;
}
