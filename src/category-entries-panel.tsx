import { useRef, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, CreditCard, X } from 'lucide-react';
import type { CardEntry, Category, State } from './domain';
import { categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import { displayColor } from './display-color';
import { usePanelMorph, type PanelOrigin } from './use-panel-morph';
import './category-entries-panel.css';

type Props = Pick<State, 'entries' | 'statements' | 'cards' | 'category_settings' | 'month'> & {
  category: Category;
  origin?: PanelOrigin;
  closing?: boolean;
  onClose: () => void;
  onExited: () => void;
};
const yen=(amount:number)=>`¥${Math.round(amount).toLocaleString('ja-JP')}`;
const dateLabel=(date:string)=>{
  const [year,month,day]=date.split('-');
  return `${Number(year)}年${Number(month)}月${day?`${Number(day)}日`:''}`;
};

export function CategoryEntriesPanel({category,entries,statements,cards,category_settings,month,origin,closing,onClose,onExited}:Props) {
  const panel=useRef<HTMLElement>(null);
  const [groupByCard,setGroupByCard]=useState(false);
  const [sort,setSort]=useState<{key:'date'|'amount';ascending:boolean}>({key:'date',ascending:false});
  usePanelMorph(panel,origin,closing,onExited,onClose);
  const appearance=categoryAppearance(category,category_settings);
  const statementCards=new Map(statements.filter(item=>item.due_month===month).map(item=>{
    const card=cards.find(card=>card.id===item.card_id);
    return [item.id,{id:item.card_id||`statement:${item.id}`,name:card?.name||item.title,color:card?.color}];
  }));
  const rows=entries.filter(entry=>entry.category===category&&statementCards.has(entry.statement_id))
    .sort((a,b)=>{
      if(sort.key==='amount')return (sort.ascending?1:-1)*(a.amount-b.amount)||a.id.localeCompare(b.id);
      if(!a.spent_on||!b.spent_on)return Number(!a.spent_on)-Number(!b.spent_on)||a.id.localeCompare(b.id);
      return (sort.ascending?1:-1)*a.spent_on.localeCompare(b.spent_on)||a.id.localeCompare(b.id);
    });
  const groups=[...new Map(rows.map(entry=>{
    const card=statementCards.get(entry.statement_id)!;
    return [card.id,card];
  })).values()].sort((a,b)=>{
    const order=(id:string)=>{const index=cards.findIndex(card=>card.id===id);return index<0?cards.length:index;};
    return order(a.id)-order(b.id)||a.name.localeCompare(b.name,'ja');
  }).map(card=>({...card,entries:rows.filter(entry=>statementCards.get(entry.statement_id)!.id===card.id)}));
  const renderEntry=(entry:CardEntry)=>{
    const card=statementCards.get(entry.statement_id)!;
    return <div className="card-panel-entry" key={entry.id}>
      <div><strong>{entry.title}</strong><small>{entry.spent_on?<time dateTime={entry.spent_on}>{dateLabel(entry.spent_on)}</time>:'利用日不明'}</small>
        {!groupByCard&&<small className="category-entry-card"><CreditCard size={14} color={displayColor(card.color)} aria-hidden="true"/><span>{card.name}</span></small>}
      </div><span>{yen(entry.amount)}</span>
    </div>;
  };
  return <div className="card-panel-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div className="card-panel-scrim" aria-hidden="true"/>
    <section className="card-panel category-entries-panel" role="dialog" aria-modal="true" aria-labelledby="category-entries-title" ref={panel}>
      <header className="card-panel-header"><span className="card-panel-icon"><CategoryIcon name={appearance.icon} color={appearance.color} size={24}/></span><div><h2 id="category-entries-title" tabIndex={-1}>{category}</h2><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月 · {appearance.include_in_settlement===false?'精算対象外':'精算対象'}</span></div><button className="card-panel-close" aria-label="カテゴリの明細を閉じる" onClick={onClose}><X size={20}/></button></header>
      <div className="card-panel-scroll">
        <div className="card-panel-total"><span>利用合計 · {rows.length}件</span><strong>{yen(rows.reduce((sum,entry)=>sum+entry.amount,0))}</strong></div>
        <div className="category-entries-toolbar">
          <div className="category-entries-modes" role="group" aria-label="明細の表示方法">
            <button type="button" aria-pressed={!groupByCard} onClick={()=>setGroupByCard(false)}>すべて</button>
            <button type="button" aria-pressed={groupByCard} onClick={()=>setGroupByCard(true)}>カード別</button>
          </div>
          <div className="category-entries-sorts" role="group" aria-label="明細の並べ替え">{([{key:'date',label:'日付',name:'利用日'},{key:'amount',label:'金額',name:'金額'}] as const).map(option=>{
            const active=sort.key===option.key;
            const ascending=active&&sort.ascending;
            const nextAscending=active?!sort.ascending:false;
            const SortIcon=ascending?ArrowUpNarrowWide:ArrowDownWideNarrow;
            return <button key={option.key} type="button" className="category-entries-sort" aria-pressed={active} aria-label={`${option.name}の${nextAscending?'昇順':'降順'}に並べ替え`} title={`${option.label}${active?`：${ascending?'昇順':'降順'}`:''}（タップで${nextAscending?'昇順':'降順'}）`} onClick={()=>setSort({key:option.key,ascending:nextAscending})}><span>{option.label}</span><SortIcon size={20} aria-hidden="true"/></button>;
          })}</div>
        </div>
        {groupByCard?groups.map(group=><section className="card-panel-statement category-card-group" aria-label={group.name} key={group.id}>
          <div className="card-panel-statement-title"><h3><CreditCard size={18} color={displayColor(group.color)} aria-hidden="true"/><span>{group.name}</span></h3><span>{group.entries.length}件 · {yen(group.entries.reduce((sum,entry)=>sum+entry.amount,0))}</span></div>
          {group.entries.map(renderEntry)}
        </section>):<div className="card-panel-statement">{rows.map(renderEntry)}</div>}
        {!rows.length&&<p className="card-panel-empty">このカテゴリの明細はありません。</p>}
      </div>
      <footer className="card-panel-footer panel-desktop-actions"><button onClick={onClose}>閉じる</button></footer>
    </section>
  </div>;
}
