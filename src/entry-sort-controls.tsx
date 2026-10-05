import { reducedMotion } from './cartoon-motion';
import type { EntrySort, ListSort } from './entry-sort';

export function EntrySortControls({value,onChange}:{value:ListSort;onChange:(value:EntrySort)=>void}) {
  return <div className="entry-sort-controls" role="group" aria-label="明細の並べ替え">{([{key:'date',label:'日付',name:'利用日'},{key:'amount',label:'金額',name:'金額'}] as const).map(option=>{
    const active=value.key===option.key;
    const direction=option.key==='date'?'dateAscending':'amountAscending';
    const ascending=value[direction];
    const nextAscending=active?!ascending:ascending;
    return <button key={option.key} type="button" className="entry-sort-button" aria-pressed={active} aria-label={`${option.name}の${nextAscending?'昇順':'降順'}に並べ替え`} title={`${option.label}：${ascending?'昇順':'降順'}・${active?'優先':'同じ値のときに適用'}（タップで${active?(nextAscending?'昇順':'降順'):'優先'}）`} onClick={event=>{if(!reducedMotion())event.currentTarget.animate([{transform:'scale(.86)'},{transform:'scale(1.06)',offset:.5},{transform:'none'}],{duration:320,easing:'cubic-bezier(.3,1.5,.5,1)'});onChange({...value,key:option.key,[direction]:nextAscending});}}>
      <span>{option.label}</span>
      <svg className="entry-sort-icon" data-ascending={ascending} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <g className="entry-sort-arrow"><path d="M3 16l3 3 3-3M6 5v14"/></g>
        <path className="entry-sort-bar entry-sort-bar-first" d="M12 5h10"/>
        <path className="entry-sort-bar entry-sort-bar-middle" d="M12 12h10"/>
        <path className="entry-sort-bar entry-sort-bar-last" d="M12 19h10"/>
      </svg>
    </button>;
  })}</div>;
}

export function EntryGroupTabs({groupByCard,onChange}:{groupByCard:boolean;onChange:(value:boolean)=>void}) {
  return <div className="category-entries-modes" data-card-view={groupByCard} role="group" aria-label="明細の表示方法">
    <button type="button" aria-pressed={!groupByCard} onClick={()=>onChange(false)}>すべて</button>
    <button type="button" aria-pressed={groupByCard} onClick={()=>onChange(true)}>カード別</button>
  </div>;
}
