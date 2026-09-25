import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownLeft, Check, ChevronLeft, Home, Trash2, X } from 'lucide-react';
import { billKinds, type Bill, type BillKind } from './domain';

type Props = {
  bill: Partial<Bill>;
  initialView?: 'summary'|'fixed';
  rentRuleMonth?: string;
  month: string;
  demo: boolean;
  busy: boolean;
  rentStartMonth: string;
  rentAmount: string;
  onRentStartMonth: (value:string)=>void;
  onRentAmount: (value:string)=>void;
  onChange: (data:Partial<Bill>)=>void;
  onClose: ()=>void;
  onSave: ()=>void;
  onSaveRentRule: ()=>void;
  onDelete: ()=>void;
  onDeleteRentRule: ()=>void;
};

const yen=(amount:number)=>`¥${amount.toLocaleString('ja-JP')}`;

export function BillPanel({bill,initialView='summary',rentRuleMonth,month,demo,busy,rentStartMonth,rentAmount,onRentStartMonth,onRentAmount,onChange,onClose,onSave,onSaveRentRule,onDelete,onDeleteRentRule}:Props) {
  const [view,setView]=useState<'summary'|'edit'|'fixed'>(initialView);
  const panel=useRef<HTMLElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const previousSize=useRef<{width:number;height:number}|null>(null);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;
  const isRent=bill.kind==='rent';
  const title=isRent?'家賃':bill.title||'引落';
  const amount=Number(bill.amount)||0;
  const changeView=(next:'summary'|'edit'|'fixed')=>{
    const rect=panel.current?.getBoundingClientRect();
    previousSize.current=rect?{width:rect.width,height:rect.height}:null;
    setView(next);
  };

  useLayoutEffect(()=>{
    if(!previousSize.current||!panel.current)return;
    const before=previousSize.current;
    const after=panel.current.getBoundingClientRect();
    previousSize.current=null;
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    panel.current.animate([{width:`${before.width}px`,height:`${before.height}px`},{width:`${after.width}px`,height:`${after.height}px`}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)'});
  },[view]);

  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const originalOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeButton.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape')onCloseRef.current();
      if(event.key!=='Tab')return;
      const controls=panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])');
      if(!controls?.length)return;
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1].focus();}
      else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{document.removeEventListener('keydown',onKeyDown);document.body.style.overflow=originalOverflow;previous?.focus();};
  },[]);

  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="card-panel bill-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="bill-panel-title" ref={panel}>
      <div className="card-panel-grip" aria-hidden="true"/>
      <header className="card-panel-header">{view==='summary'?<span className="card-panel-icon">{isRent?<Home size={22}/>:<ArrowDownLeft size={22}/>}</span>:<button className="card-panel-back" aria-label="引落の概要へ戻る" onClick={()=>changeView('summary')}><ChevronLeft size={21}/></button>}<div><h2 id="bill-panel-title">{view==='fixed'?'基本家賃':title}</h2><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月</span></div><button ref={closeButton} className="card-panel-close" aria-label="閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">
        {view==='summary'?<div className="card-panel-total"><span>引落額</span><strong>{amount?yen(amount):'—'}</strong>{bill.note&&<p className="bill-panel-note">{bill.note}</p>}</div>:view==='edit'?<div className="bill-panel-form">
          <label className="field"><span>引落月</span><input type="month" value={bill.due_month||month} onChange={event=>onChange({...bill,due_month:event.target.value})}/></label>
          {bill.id&&!isRent&&<label className="field"><span>種類</span><select value={bill.kind||'other'} onChange={event=>onChange({...bill,kind:event.target.value as BillKind})}>{Object.entries(billKinds).map(([kind,label])=><option key={kind} value={kind}>{label}</option>)}</select></label>}
          {!isRent&&<label className="field"><span>名称</span><input maxLength={100} value={bill.title||''} onChange={event=>onChange({...bill,title:event.target.value})}/></label>}
          <label className="field"><span>引落額（円）</span><input type="number" inputMode="numeric" min="1" step="1" value={bill.amount||''} onChange={event=>onChange({...bill,amount:Number(event.target.value)})}/></label>
          {!isRent&&<label className="field"><span>メモ（任意）</span><input maxLength={500} value={bill.note||''} onChange={event=>onChange({...bill,note:event.target.value})}/></label>}
          {!!bill.id&&<button className="card-panel-delete" disabled={busy} onClick={onDelete}><Trash2 size={16}/> この引落を削除</button>}
        </div>:<div className="bill-panel-form"><p className="bill-panel-note">指定した月から毎月の精算に使います。</p><label className="field"><span>適用開始月</span><input type="month" value={rentStartMonth} onChange={event=>onRentStartMonth(event.target.value)}/></label><label className="field"><span>基本家賃（円）</span><input type="number" inputMode="numeric" min="1" step="1" value={rentAmount} placeholder={amount?String(amount):'例：120000'} onChange={event=>onRentAmount(event.target.value)}/></label>{rentRuleMonth&&<button className="card-panel-delete" disabled={busy} onClick={onDeleteRentRule}><Trash2 size={16}/> この基本家賃を削除</button>}</div>}
      </div>
      {!demo&&<footer className="card-panel-footer bill-panel-actions">{view==='summary'?<><button onClick={()=>changeView('edit')}>{isRent?'今月だけ変更':'引落を編集'}</button>{isRent&&<button className="bill-panel-secondary" onClick={()=>changeView('fixed')}>基本家賃を設定</button>}</>:view==='edit'?<button disabled={busy||!bill.title||!amount} onClick={onSave}><Check size={17}/>{busy?'保存中…':'保存する'}</button>:<button disabled={busy||!rentStartMonth||!Number.isSafeInteger(Number(rentAmount))||Number(rentAmount)<=0} onClick={onSaveRentRule}><Check size={17}/>{busy?'保存中…':'基本家賃を保存'}</button>}</footer>}
    </section>
  </div>;
}
