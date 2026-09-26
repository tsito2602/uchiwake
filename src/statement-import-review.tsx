import { useId, useState } from 'react';
import { Check, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react';
import type { CategoryAppearance, EntryDraft, SharedCard } from './domain';
import { allCategoryAppearances } from './category-appearance';
import { ImportEntryLine } from './statement-import-content';

export type ImportDraft={due_month:string;card_id:string;title:string;confirmed_total:number;entries:EntryDraft[];demo:boolean};
export function ImportReview({draft,cards,settings,busy,checked,onChange,onChecked}:{
  draft:ImportDraft;cards:SharedCard[];settings:CategoryAppearance[];busy:boolean;checked:boolean;
  onChange:(draft:ImportDraft)=>void;onChecked:(checked:boolean)=>void;
}) {
  const [editing,setEditing]=useState<number|null>(()=>draft.entries.length===1&&!draft.entries[0].title?0:null);
  const [metadataOpen,setMetadataOpen]=useState(false);
  const id=useId();
  const total=draft.entries.reduce((sum,entry)=>sum+entry.amount,0);
  const matches=total===draft.confirmed_total;
  const card=cards.find(item=>item.id===draft.card_id);
  const categories=allCategoryAppearances(settings);
  const update=(index:number,change:Partial<EntryDraft>)=>onChange({...draft,entries:draft.entries.map((entry,i)=>i===index?{...entry,...change}:entry)});
  return <div className="import-processing import-review">
    <div className="import-processing-symbol" aria-hidden="true"><Check size={30}/></div>
    <div className="import-processing-heading"><h3>仕分け結果</h3><p>{card?.name} · {Number(draft.due_month.slice(0,4))}年{Number(draft.due_month.slice(5))}月{draft.demo?' · デモ':''}</p></div>
    <div className="import-review-list-heading"><span>{draft.entries.length}件の明細</span><small>タップして編集</small></div>
    <div className="import-sorting-list import-review-list" aria-label="仕分け結果">
      {draft.entries.map((entry,index)=><div className="import-review-item" key={index}>
        <button className="import-sorted-entry import-entry-button" disabled={busy} aria-label={`${entry.title||`${index+1}件目`}を編集`} aria-expanded={editing===index} aria-controls={`${id}-entry-${index}`} onClick={()=>setEditing(editing===index?null:index)}><ImportEntryLine entry={entry} settings={settings}/></button>
        {editing===index&&<fieldset className="import-review-editor" id={`${id}-entry-${index}`} disabled={busy}>
          <label className="field"><span>店名・内容</span><input value={entry.title} maxLength={100} onChange={event=>update(index,{title:event.target.value})}/></label>
          <div className="import-edit-pair">
            <label className="field"><span>利用日</span><input type="date" value={entry.spent_on} onChange={event=>update(index,{spent_on:event.target.value})}/></label>
            <label className="field"><span>金額（円）</span><input type="number" inputMode="decimal" step="1" value={entry.amount||''} onChange={event=>update(index,{amount:Number(event.target.value)})}/></label>
          </div>
          <label className="field"><span>費目</span><select value={entry.category} onChange={event=>update(index,{category:event.target.value})}>{categories.map(({category})=><option key={category}>{category}</option>)}</select></label>
          <div className="import-edit-actions"><button className="import-remove-entry" aria-label={`${entry.title||`${index+1}件目`}を削除`} onClick={()=>{setEditing(null);onChange({...draft,entries:draft.entries.filter((_,i)=>i!==index)});}}><Trash2 size={18}/></button><button onClick={()=>setEditing(null)}>閉じる</button></div>
        </fieldset>}
      </div>)}
    </div>
    <button className="import-review-add" disabled={busy||draft.entries.length>=50} onClick={()=>{setEditing(draft.entries.length);onChange({...draft,entries:[...draft.entries,{spent_on:'',title:'',amount:0,category:'その他・要確認'}]});}}><Plus size={16}/> 明細を追加</button>
    <div className="import-processing-foot import-review-total"><span>利用合計</span><strong>¥{total.toLocaleString('ja-JP')}</strong></div>
    <button className="import-review-meta-button" disabled={busy} aria-expanded={metadataOpen} aria-controls={`${id}-metadata`} onClick={()=>setMetadataOpen(!metadataOpen)}><span>カード引落額</span><strong>¥{draft.confirmed_total.toLocaleString('ja-JP')}</strong><Pencil size={15}/></button>
    {!matches&&<p className="reconcile-error" role="status">引落額と合計が一致していません。</p>}
    <button className="import-review-destination" disabled={busy} aria-expanded={metadataOpen} aria-controls={`${id}-metadata`} onClick={()=>setMetadataOpen(!metadataOpen)}>登録先・引落額を編集<ChevronDown size={15}/></button>
    {metadataOpen&&<fieldset className="import-review-editor import-review-metadata" id={`${id}-metadata`} disabled={busy}>
      <label className="field"><span>カード</span><select value={draft.card_id} onChange={event=>onChange({...draft,card_id:event.target.value})}>{cards.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>引落月</span><input type="month" value={draft.due_month} onChange={event=>onChange({...draft,due_month:event.target.value})}/></label>
      <label className="field"><span>明細の名前</span><input maxLength={100} value={draft.title} onChange={event=>onChange({...draft,title:event.target.value})}/></label>
      <label className="field"><span>カード引落額（円）</span><input type="number" inputMode="numeric" min="1" step="1" value={draft.confirmed_total||''} onChange={event=>onChange({...draft,confirmed_total:Number(event.target.value)})}/></label>
    </fieldset>}
    <label className="confirm-line import-review-confirm"><input type="checkbox" disabled={busy} checked={checked} onChange={event=>onChecked(event.target.checked)}/>元の明細と内容・金額を確認した</label>
    {draft.demo&&<p className="import-review-demo">デモのため保存されません。編集は試せます。</p>}
  </div>;
}
