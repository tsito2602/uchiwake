import { useEffect, useRef } from 'react';
import { ArrowRight, CreditCard, X } from 'lucide-react';
import type { CardEntry, CardStatement } from './domain';

type Props = {
  title: string;
  month: string;
  statements: CardStatement[];
  entries: CardEntry[];
  demo: boolean;
  onClose: () => void;
  onImport: () => void;
  onOpenLedger: () => void;
};

const yen = (amount:number) => `¥${amount.toLocaleString('ja-JP')}`;

export function CardStatementPanel({title,month,statements,entries,demo,onClose,onImport,onOpenLedger}:Props) {
  const panel=useRef<HTMLElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);
  const total=statements.reduce((sum,item)=>sum+item.confirmed_total,0);

  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const originalOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeButton.current?.focus();
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key==='Escape')onClose();
      if(event.key!=='Tab')return;
      const buttons=panel.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
      if(!buttons?.length)return;
      if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons[buttons.length-1].focus();}
      else if(!event.shiftKey&&document.activeElement===buttons[buttons.length-1]){event.preventDefault();buttons[0].focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{document.removeEventListener('keydown',onKeyDown);document.body.style.overflow=originalOverflow;previous?.focus();};
  },[onClose]);

  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section className="card-panel" role="dialog" aria-modal="true" aria-labelledby="card-panel-title" ref={panel}>
      <div className="card-panel-grip" aria-hidden="true"/>
      <header className="card-panel-header"><span className="card-panel-icon"><CreditCard size={22}/></span><div><h2 id="card-panel-title">{title}</h2><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月</span></div><button ref={closeButton} className="card-panel-close" aria-label="明細を閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">
        {statements.length?<>
          <div className="card-panel-total"><span>カードの引落額</span><strong>{yen(total)}</strong></div>
          {statements.map(statement=><div className="card-panel-statement" key={statement.id}>
            <div className="card-panel-statement-title"><strong>{statements.length>1?statement.title:'利用明細'}</strong><span>{yen(statement.confirmed_total)}</span></div>
            {entries.filter(entry=>entry.statement_id===statement.id).map(entry=><div className="card-panel-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{entry.category}{entry.spent_on?` · ${Number(entry.spent_on.slice(5,7))}/${Number(entry.spent_on.slice(8,10))}`:''}</small></div><span>{yen(entry.amount)}</span></div>)}
          </div>)}
        </>:<div className="card-panel-empty"><p>この月の明細はまだありません。</p>{!demo&&<button onClick={onImport}>明細を取り込む <ArrowRight size={17}/></button>}</div>}
      </div>
      {statements.length>0&&<footer className="card-panel-footer"><button onClick={onOpenLedger}>{demo?'明細画面を見る':'明細画面で編集'} <ArrowRight size={17}/></button></footer>}
    </section>
  </div>;
}
