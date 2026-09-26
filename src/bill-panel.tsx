import { useRef } from 'react';
import type { DockAction } from './floating-dock';
import { ArrowDownLeft, Home, Trash2, X } from 'lucide-react';
import { billKinds, type Bill, type BillKind } from './domain';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

type Props = {
  bill: Partial<Bill>;
  view: 'summary'|'edit'|'fixed';
  onView: ()=>void;
  deleteAction?:DockAction;
  origin?: PanelOrigin;
  closing?: boolean;
  onExited: ()=>void;
  actionLabel: string;
  onAction: ()=>void;
  actionDisabled?: boolean;
  month: string;
  demo: boolean;
  busy: boolean;
  rentStartMonth: string;
  rentAmount: string;
  onRentStartMonth: (value:string)=>void;
  onRentAmount: (value:string)=>void;
  onChange: (data:Partial<Bill>)=>void;
  onClose: ()=>void;
};

const yen=(amount:number)=>`¥${amount.toLocaleString('ja-JP')}`;

export function BillPanel({bill,view,onView,deleteAction,origin,closing,onExited,actionLabel,onAction,actionDisabled,month,demo,busy,rentStartMonth,rentAmount,onRentStartMonth,onRentAmount,onChange,onClose}:Props) {
  const panel=useRef<HTMLElement>(null);
  usePanelMorph(panel,origin,closing,onExited,onClose);
  const isRent=bill.kind==='rent';
  const title=isRent?'家賃':bill.title||'引落';
  const amount=Number(bill.amount)||0;

  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <section className="card-panel bill-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="bill-panel-title" ref={panel}>
      <header className="card-panel-header"><span className="card-panel-icon">{isRent?<Home size={22}/>:<ArrowDownLeft size={22}/>}</span><div><h2 tabIndex={-1} id="bill-panel-title">{view==='fixed'?'基本家賃':title}</h2><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月</span></div><button className="card-panel-close" aria-label="閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">
        {view==='summary'?<div className="card-panel-total"><span>引落額</span><strong>{amount?yen(amount):'—'}</strong>{bill.note&&<p className="bill-panel-note">{bill.note}</p>}</div>:view==='edit'?<div className="bill-panel-form">
          <label className="field"><span>引落月</span><input type="month" value={bill.due_month||month} onChange={event=>onChange({...bill,due_month:event.target.value})}/></label>
          {bill.id&&!isRent&&<label className="field"><span>種類</span><select value={bill.kind||'other'} onChange={event=>onChange({...bill,kind:event.target.value as BillKind})}>{Object.entries(billKinds).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select></label>}
          {!isRent&&<label className="field"><span>名称</span><input maxLength={100} value={bill.title||''} onChange={event=>onChange({...bill,title:event.target.value})}/></label>}
          <label className="field"><span>引落額（円）</span><input type="number" inputMode="numeric" min="1" step="1" value={bill.amount||''} onChange={event=>onChange({...bill,amount:Number(event.target.value)})}/></label>
          {!isRent&&<label className="field"><span>メモ（任意）</span><input maxLength={500} value={bill.note||''} onChange={event=>onChange({...bill,note:event.target.value})}/></label>}
        </div>:<div className="bill-panel-form"><p className="bill-panel-note">指定した月から毎月の精算に使います。</p><label className="field"><span>適用開始月</span><input type="month" value={rentStartMonth} onChange={event=>onRentStartMonth(event.target.value)}/></label><label className="field"><span>基本家賃（円）</span><input type="number" inputMode="numeric" min="1" step="1" value={rentAmount} placeholder={amount?String(amount):'例：120000'} onChange={event=>onRentAmount(event.target.value)}/></label></div>}
      </div>
      <footer className="card-panel-footer panel-desktop-actions">{isRent&&view==='summary'&&<button disabled={busy} onClick={onView}>基本家賃を設定</button>}<button disabled={actionDisabled} onClick={onAction}>{actionLabel}</button>{deleteAction&&<button className="delete-action" disabled={deleteAction.disabled} onClick={deleteAction.onAction}><Trash2 size={16}/> 削除</button>}</footer>
    </section>
  </div>;
}
