import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, CreditCard, X } from 'lucide-react';
import type { SharedCard } from './domain';

type Props = {card?:SharedCard;busy:boolean;onClose:()=>void;onSave:(name:string,active:boolean)=>void};

export function CardSettingsPanel({card,busy,onClose,onSave}:Props) {
  const [view,setView]=useState<'summary'|'edit'>(card?'summary':'edit');
  const [name,setName]=useState(card?.name||'');
  const [active,setActive]=useState(card?.active??true);
  const panel=useRef<HTMLElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const previousSize=useRef<{width:number;height:number}|null>(null);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;
  const changeView=(next:'summary'|'edit')=>{
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
      const controls=panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
      if(!controls?.length)return;
      if(event.shiftKey&&document.activeElement===controls[0]){event.preventDefault();controls[controls.length-1].focus();}
      else if(!event.shiftKey&&document.activeElement===controls[controls.length-1]){event.preventDefault();controls[0].focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{document.removeEventListener('keydown',onKeyDown);document.body.style.overflow=originalOverflow;previous?.focus();};
  },[]);

  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="card-panel card-settings-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="card-settings-title" ref={panel}>
      <div className="card-panel-grip" aria-hidden="true"/>
      <header className="card-panel-header">{view==='summary'?<span className="card-panel-icon"><CreditCard size={22}/></span>:card?<button className="card-panel-back" aria-label="カードの概要へ戻る" onClick={()=>changeView('summary')}><ChevronLeft size={21}/></button>:<span className="card-panel-icon"><CreditCard size={22}/></span>}<div><h2 id="card-settings-title">{view==='summary'?card?.name:card?'カードの設定':'カードを追加'}</h2><span>{card?'共有カード':'新しい共有カード'}</span></div><button ref={closeButton} className="card-panel-close" aria-label="閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">{view==='summary'?<div className="card-settings-summary"><strong>{card?.name}</strong><span>{card?.active?'使用中':'使用停止中'}</span></div>:<div className="bill-panel-form"><label className="field"><span>カード名</span><input value={name} maxLength={40} placeholder="例：生活費カード" onChange={event=>setName(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&name.trim()&&!busy)onSave(name.trim(),active);}}/></label>{card&&<label className="card-settings-active"><input type="checkbox" checked={active} onChange={event=>setActive(event.target.checked)}/><span>使用する</span></label>}</div>}</div>
      <footer className="card-panel-footer bill-panel-actions">{view==='summary'?<button onClick={()=>changeView('edit')}>設定を変更</button>:<button disabled={busy||!name.trim()||(card&&name.trim()===card.name&&active===card.active)} onClick={()=>onSave(name.trim(),active)}><Check size={17}/>{busy?'保存中…':card?'変更を保存':'カードを追加'}</button>}</footer>
    </section>
  </div>;
}
