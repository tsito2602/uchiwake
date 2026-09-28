import { useRef } from 'react';
import { X } from 'lucide-react';
import type { Category, State } from './domain';
import { categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';

type Props = Pick<State, 'entries' | 'statements' | 'cards' | 'category_settings' | 'month'> & {
  category: Category;
  origin?: PanelOrigin;
  closing?: boolean;
  onClose: () => void;
  onExited: () => void;
};
const yen=(amount:number)=>`¥${Math.round(amount).toLocaleString('ja-JP')}`;

export function CategoryEntriesPanel({category,entries,statements,cards,category_settings,month,origin,closing,onClose,onExited}:Props) {
  const panel=useRef<HTMLElement>(null);
  usePanelMorph(panel,origin,closing,onExited,onClose);
  const appearance=categoryAppearance(category,category_settings);
  const statementNames=new Map(statements.filter(item=>item.due_month===month).map(item=>[item.id,cards.find(card=>card.id===item.card_id)?.name||item.title]));
  const rows=entries.filter(entry=>entry.category===category&&statementNames.has(entry.statement_id))
    .sort((a,b)=>b.spent_on.localeCompare(a.spent_on)||a.id.localeCompare(b.id));
  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <section className="card-panel category-entries-panel" role="dialog" aria-modal="true" aria-labelledby="category-entries-title" ref={panel}>
      <header className="card-panel-header"><span className="card-panel-icon"><CategoryIcon name={appearance.icon} color={appearance.color} size={24}/></span><div><h2 id="category-entries-title" tabIndex={-1}>{category}</h2><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月 · {appearance.include_in_settlement===false?'精算対象外':'精算対象'}</span></div><button className="card-panel-close" aria-label="カテゴリの明細を閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">
        <div className="card-panel-total"><span>利用合計 · {rows.length}件</span><strong>{yen(rows.reduce((sum,entry)=>sum+entry.amount,0))}</strong></div>
        <div className="card-panel-statement">{rows.map(entry=><div className="card-panel-entry" key={entry.id}>
          <div><strong>{entry.title}</strong><small>{entry.spent_on?<time dateTime={entry.spent_on}>{entry.spent_on}</time>:'利用日不明'} · {statementNames.get(entry.statement_id)}</small></div><span>{yen(entry.amount)}</span>
        </div>)}</div>
        {!rows.length&&<p className="card-panel-empty">このカテゴリの明細はありません。</p>}
      </div>
      <footer className="card-panel-footer panel-desktop-actions"><button onClick={onClose}>閉じる</button></footer>
    </section>
  </div>;
}
