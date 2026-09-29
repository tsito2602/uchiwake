import { sortEntries, type EntrySort } from './entry-sort';
import { displayColor } from './display-color';
import { useLayoutEffect, useRef } from 'react';
import { ArrowRight, CreditCard, Trash2, Undo2, X } from 'lucide-react';
import { categoryTotals, statementSettlementAmount, type CategoryAppearance, type CardEntry, type CardStatement, type Category } from './domain';
import { allCategoryAppearances, categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import { CategoryChart } from './spending-charts';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

type Props = {
  title: string;
  sort: EntrySort;
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
  deletedEntryIds: string[];
  onToggleDeleteEntry: (id:string) => void;
  onDeleteStatement: (id:string) => void;
};

const yen=(amount:number)=>`¥${Math.round(amount).toLocaleString('ja-JP')}`;

export function CardStatementPanel({title,sort,color,categorySettings=[],month,statements,entries,demo,view,origin,closing,onClose,onExited,actionLabel,actionDisabled,busy,error,onAction,onChangeCategory,onChangeAmount,amountDraft,deletedEntryIds,onToggleDeleteEntry,onDeleteStatement}:Props) {
  const panel=useRef<HTMLElement>(null);
  usePanelMorph(panel,origin,closing,onExited,onClose);
  useLayoutEffect(()=>{if(panel.current)panel.current.scrollTop=0;},[view]);
  const total=statements.reduce((sum,item)=>sum+item.confirmed_total,0);
  const matchingEntries=entries.filter(entry=>statements.some(statement=>statement.id===entry.statement_id));
  const cardEntries=view==='edit'?matchingEntries:sortEntries(matchingEntries,sort);
  const deletedIds=new Set(deletedEntryIds);
  const remainingEntries=cardEntries.filter(entry=>!deletedIds.has(entry.id));
  const editTotal=remainingEntries.reduce((sum,entry)=>sum+entry.amount,0);

  const settlementTotal=statements.reduce((sum,item)=>sum+statementSettlementAmount(item,cardEntries,categorySettings),0);
  const excluded=total-settlementTotal;
  const entryGroups=[
    {label:'精算対象',included:true},
    {label:'精算対象外',included:false}
  ].map(group=>({...group,entries:cardEntries.filter(entry=>(categoryAppearance(entry.category,categorySettings).include_in_settlement!==false)===group.included)}));
  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <div className="card-panel-frame">
      <div className="card-panel-glass" aria-hidden="true"/>
      <section className="card-panel" data-view={view} role="dialog" aria-modal="true" aria-labelledby="card-panel-title" ref={panel}>
        <header className="card-panel-header"><span className="card-panel-icon"><CreditCard size={22} color={displayColor(color)}/></span><div><h2 tabIndex={-1} id="card-panel-title">{view==='edit'?'明細を編集':title}</h2><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月</span></div><button className="card-panel-close" aria-label="明細を閉じる" onClick={onClose}><X size={20}/></button></header>
        <div className="card-panel-scroll">
          {error&&<p className="notice" role="alert">{error}</p>}
          {statements.length?<>
            {view==='summary'&&<div className="card-panel-total"><span>精算対象額</span><strong>{yen(settlementTotal)}</strong>{excluded!==0&&<small>引落額 ¥{total.toLocaleString('ja-JP')} · 精算対象外 ¥{excluded.toLocaleString('ja-JP')}</small>}</div>}
            {view==='details'&&cardEntries.length>0&&<CategoryChart data={categoryTotals(cardEntries)} settings={categorySettings} animateAmounts={false}/>}
            {view==='edit'?<div className="statement-editor">
              <div className="statement-edit-summary"><div><span>変更後の合計</span><strong>{Number.isFinite(editTotal)?yen(editTotal):'—'}</strong></div><span>{remainingEntries.length}件</span></div>
              <p className="statement-edit-hint">金額・費目を変更できます。削除は保存するまで取り消せます。</p>
              {statements.map(statement=>{
                const statementEntries=cardEntries.filter(entry=>entry.statement_id===statement.id);
                const remaining=statementEntries.filter(entry=>!deletedIds.has(entry.id));
                const statementTotal=remaining.reduce((sum,entry)=>sum+entry.amount,0);
                return <section className="statement-edit-group" aria-label={statement.title} key={statement.id}>
                  {statements.length>1&&<div className="card-panel-statement-title"><strong>{statement.title}</strong><span>{Number.isFinite(statementTotal)?yen(statementTotal):'—'}</span></div>}
                  <div className="statement-edit-list">{statementEntries.map(entry=>{
                    const deleted=deletedIds.has(entry.id);
                    const invalid=!Number.isSafeInteger(entry.amount)||entry.amount===0||Math.abs(entry.amount)>100_000_000;
                    return <div className="statement-edit-item" data-deleted={deleted} key={entry.id}>
                      <div className="statement-edit-heading"><div><strong>{entry.title}</strong><small>{entry.spent_on?<time dateTime={entry.spent_on}>{entry.spent_on}</time>:'利用日不明'}</small></div><button type="button" className={deleted?'entry-restore':'entry-delete'} disabled={demo||busy} aria-label={`${entry.title}${deleted?'の削除を取り消す':'を削除'}`} onClick={()=>onToggleDeleteEntry(entry.id)}>{deleted?<><Undo2 size={16} aria-hidden="true"/>戻す</>:<Trash2 size={18} aria-hidden="true"/>}</button></div>
                      {deleted?<p className="statement-entry-deleted">保存すると削除されます</p>:<>
                        <div className="statement-edit-fields">
                          <label className="statement-edit-field"><span>金額</span><span className="entry-amount-editor"><span aria-hidden="true">¥</span><input type="number" inputMode="decimal" step="1" aria-label={`${entry.title}の金額（円）`} aria-invalid={invalid} aria-describedby={invalid?`entry-error-${entry.id}`:undefined} disabled={busy} value={amountDraft[entry.id]??String(entry.amount)} onChange={event=>onChangeAmount(entry.id,event.target.value)}/></span></label>
                          <label className="statement-edit-field"><span>費目</span><select disabled={busy} aria-label={`${entry.title}の費目`} value={entry.category} onChange={event=>onChangeCategory(entry.id,event.target.value as Category)}>{allCategoryAppearances(categorySettings).map(({category})=><option key={category}>{category}</option>)}</select></label>
                        </div>
                        {invalid&&<p className="statement-entry-error" id={`entry-error-${entry.id}`}>金額は0以外の整数で、1億円以内にしてください。</p>}
                      </>}
                    </div>;
                  })}</div>
                  {!remaining.length?<p className="statement-edit-hint" role="status">全項目を削除すると、この明細も削除されます。</p>:(!Number.isFinite(statementTotal)||statementTotal<=0||statementTotal>100_000_000)&&<p className="statement-entry-error" role="status">明細の合計は1円以上、1億円以下にしてください。</p>}
                </section>;
              })}
            </div>:view==='summary'?entryGroups.map(group=><section className="card-panel-statement" aria-label={group.label} key={group.label}>
              <div className="card-panel-statement-title"><strong>{group.label}</strong><span>{group.entries.length}件 · {yen(group.entries.reduce((sum,entry)=>sum+entry.amount,0))}</span></div>
              {group.entries.map(entry=><div className="card-panel-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{entry.spent_on?<time dateTime={entry.spent_on}>{entry.spent_on}</time>:'利用日不明'}</small><small className="entry-category"><CategoryIcon name={categoryAppearance(entry.category,categorySettings).icon} color={categoryAppearance(entry.category,categorySettings).color} size={14}/>{entry.category}</small></div><span>{yen(entry.amount)}</span></div>)}
              {!group.entries.length&&<p className="card-panel-more">該当する明細はありません。</p>}
            </section>):statements.map(statement=><div className="card-panel-statement" key={statement.id}>
              <div className="card-panel-statement-title"><strong>{statements.length===1?'合計':statement.title}</strong><span>{yen(statement.confirmed_total)}</span></div>
              {cardEntries.filter(entry=>entry.statement_id===statement.id).map(entry=><div className="card-panel-entry" key={entry.id}><div><strong>{entry.title}</strong><small>{entry.spent_on||'利用日不明'}</small><small className="entry-category"><CategoryIcon name={categoryAppearance(entry.category,categorySettings).icon} color={categoryAppearance(entry.category,categorySettings).color} size={14}/>{entry.category}</small></div><span>{yen(entry.amount)}</span></div>)}
            </div>)}
          </>:<div className="card-panel-empty"><p>この月の明細はまだありません。</p></div>}
        </div>
        <footer className="card-panel-footer panel-desktop-actions"><button disabled={actionDisabled} onClick={onAction}>{actionLabel} <ArrowRight size={17}/></button>{view==='edit'&&statements.length===1&&<button className="delete-action" disabled={demo||busy} onClick={()=>onDeleteStatement(statements[0].id)}><Trash2 size={16}/> 明細全体を削除</button>}</footer>
      </section>
    </div>
  </div>;
}
