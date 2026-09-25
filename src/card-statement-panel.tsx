import { useLayoutEffect, useRef } from 'react';
import { ArrowRight, CreditCard, Trash2, X } from 'lucide-react';
import { categories, type CardEntry, type CardStatement, type Category } from './domain';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

type Props = {
  title: string;
  month: string;
  statements: CardStatement[];
  entries: CardEntry[];
  demo: boolean;
  view: 'summary'|'details';
  origin?: PanelOrigin;
  closing?: boolean;
  onClose: () => void;
  onExited: () => void;
  actionLabel: string;
  onAction: () => void;
  onImport: () => void;
  onChangeCategory: (id:string,category:Category) => void;
  onDeleteStatement: (id:string) => void;
};

const yen = (amount:number) => `¥${amount.toLocaleString('ja-JP')}`;

export function CardStatementPanel({title,month,statements,entries,demo,view,origin,closing,onClose,onExited,actionLabel,onAction,onImport,onChangeCategory,onDeleteStatement}:Props) {
  const panel=useRef<HTMLElement>(null);
  const previousSize=useRef<{width:number;height:number}|null>(null);
  usePanelMorph(panel,origin,closing,onExited,onClose);
  const total=statements.reduce((sum,item)=>sum+item.confirmed_total,0);
  const cardEntries=entries.filter(entry=>statements.some(statement=>statement.id===entry.statement_id));
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
    <section className="card-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="card-panel-title" ref={panel}>
      <div className="card-panel-grip" aria-hidden="true"/>
      <header className="card-panel-header"><span className="card-panel-icon"><CreditCard size={22}/></span><div><h2 id="card-panel-title">{view==='details'?'カード明細':title}</h2><span>{view==='details'?title:`${Number(month.slice(0,4))}年${Number(month.slice(5))}月`}</span></div><button className="card-panel-close" aria-label="明細を閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">
        {statements.length?<>
          <div className="card-panel-total"><span>カードの引落額</span><strong>{yen(total)}</strong></div>
          {view==='summary'?<div className="card-panel-statement"><div className="card-panel-statement-title"><strong>利用明細</strong><span>{cardEntries.length}件</span></div>{cardEntries.slice(0,3).map(entry=><div className="card-panel-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{entry.category}</small></div><span>{yen(entry.amount)}</span></div>)}{cardEntries.length>3&&<p className="card-panel-more">ほか {cardEntries.length-3} 件</p>}</div>:statements.map(statement=><div className="card-panel-statement" key={statement.id}>
            <div className="card-panel-statement-title"><strong>{statement.title}</strong><span>{yen(statement.confirmed_total)}</span></div>
            {entries.filter(entry=>entry.statement_id===statement.id).map(entry=><div className="card-panel-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{entry.spent_on||'利用日不明'}</small>{demo?<small>{entry.category}</small>:<select aria-label={`${entry.title}の費目`} value={entry.category} onChange={event=>onChangeCategory(entry.id,event.target.value as Category)}>{categories.map(category=><option key={category}>{category}</option>)}</select>}</div><span>{yen(entry.amount)}</span></div>)}
            {!demo&&<button className="card-panel-delete" onClick={()=>onDeleteStatement(statement.id)}><Trash2 size={16}/> この明細を削除</button>}
          </div>)}
        </>:<div className="card-panel-empty"><p>この月の明細はまだありません。</p>{!demo&&<button onClick={onImport}>明細を取り込む <ArrowRight size={17}/></button>}</div>}
      </div>
      <footer className="card-panel-footer panel-desktop-actions"><button onClick={onAction}>{actionLabel} <ArrowRight size={17}/></button></footer>
    </section>
  </div>;
}
