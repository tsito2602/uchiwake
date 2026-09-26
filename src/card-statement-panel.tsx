import { useRef } from 'react';
import { ArrowRight, CreditCard, Trash2, X } from 'lucide-react';
import { categoryTotals, type CategoryAppearance, type CardEntry, type CardStatement, type Category } from './domain';
import { allCategoryAppearances, categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import { CategoryChart } from './spending-charts';
import { NumberTicker } from './number-ticker';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

type Props = {
  title: string;
  color?: string;
  categorySettings?:CategoryAppearance[];
  month: string;
  statements: CardStatement[];
  entries: CardEntry[];
  demo: boolean;
  view: 'summary'|'details'|'edit';
  origin?: PanelOrigin;
  closing?: boolean;
  onClose: () => void;
  onExited: () => void;
  actionLabel: string;
  actionDisabled?: boolean;
  busy?: boolean;
  error?: string;
  onAction: () => void;
  onChangeCategory: (id:string,category:Category) => void;
  onChangeAmount: (id:string,amount:string) => void;
  amountDraft: Record<string,string>;
  onDeleteStatement: (id:string) => void;
};


export function CardStatementPanel({title,color,categorySettings=[],month,statements,entries,demo,view,origin,closing,onClose,onExited,actionLabel,actionDisabled,busy,error,onAction,onChangeCategory,onChangeAmount,amountDraft,onDeleteStatement}:Props) {
  const panel=useRef<HTMLElement>(null);
  usePanelMorph(panel,origin,closing,onExited,onClose);
  const total=statements.reduce((sum,item)=>sum+item.confirmed_total,0);
  const cardEntries=entries.filter(entry=>statements.some(statement=>statement.id===entry.statement_id));

  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <section className="card-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="card-panel-title" ref={panel}>
      <header className="card-panel-header"><span className="card-panel-icon"><CreditCard size={22} color={color}/></span><div><h2 tabIndex={-1} id="card-panel-title">{view==='edit'?'明細を編集':title}</h2><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月</span></div><button className="card-panel-close" aria-label="明細を閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">
        {error&&<p className="notice" role="alert">{error}</p>}
        {statements.length?<>
          {view==='summary'&&<div className="card-panel-total"><span>カードの引落額</span><strong><NumberTicker value={total}/></strong></div>}
          {view!=='summary'&&cardEntries.length>0&&<CategoryChart data={categoryTotals(cardEntries)} settings={categorySettings}/>}
          {view==='summary'?<div className="card-panel-statement"><div className="card-panel-statement-title"><strong>利用明細</strong><span>{cardEntries.length}件</span></div>{cardEntries.slice(0,3).map(entry=><div className="card-panel-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{entry.spent_on?<time dateTime={entry.spent_on}>{entry.spent_on}</time>:'利用日不明'}</small><small className="entry-category"><CategoryIcon name={categoryAppearance(entry.category,categorySettings).icon} color={categoryAppearance(entry.category,categorySettings).color} size={14}/>{entry.category}</small></div><span><NumberTicker value={entry.amount}/></span></div>)}{cardEntries.length>3&&<p className="card-panel-more">ほか {cardEntries.length-3} 件</p>}</div>:statements.map(statement=><div className="card-panel-statement" key={statement.id}>
            <div className="card-panel-statement-title"><strong>{statements.length===1?'合計':statement.title}</strong><span><NumberTicker value={view==='edit'?entries.filter(entry=>entry.statement_id===statement.id).reduce((sum,entry)=>sum+entry.amount,0):statement.confirmed_total}/></span></div>
            {entries.filter(entry=>entry.statement_id===statement.id).map(entry=><div className="card-panel-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{entry.spent_on||'利用日不明'}</small>{view!=='edit'?<small className="entry-category"><CategoryIcon name={categoryAppearance(entry.category,categorySettings).icon} color={categoryAppearance(entry.category,categorySettings).color} size={14}/>{entry.category}</small>:<select disabled={busy} aria-label={`${entry.title}の費目`} value={entry.category} onChange={event=>onChangeCategory(entry.id,event.target.value as Category)}>{allCategoryAppearances(categorySettings).map(({category})=><option key={category}>{category}</option>)}</select>}</div>{view==='edit'?<label className="entry-amount-editor"><span aria-hidden="true">¥</span><input type="number" inputMode="decimal" step="1" aria-label={`${entry.title}の金額（円）`} aria-invalid={!Number.isSafeInteger(entry.amount)||entry.amount===0||Math.abs(entry.amount)>100_000_000} disabled={busy} value={amountDraft[entry.id]??String(entry.amount)} onChange={event=>onChangeAmount(entry.id,event.target.value)}/></label>:<span><NumberTicker value={entry.amount}/></span>}</div>)}
          </div>)}
        </>:<div className="card-panel-empty"><p>この月の明細はまだありません。</p></div>}
      </div>
      <footer className="card-panel-footer panel-desktop-actions"><button disabled={actionDisabled} onClick={onAction}>{actionLabel} <ArrowRight size={17}/></button>{view!=='summary'&&statements.length===1&&<button className="delete-action" disabled={demo||busy} onClick={()=>onDeleteStatement(statements[0].id)}><Trash2 size={16}/> 削除</button>}</footer>
    </section>
  </div>;
}
