import { importModels, type ImportModel } from './import-model';
import { useId, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CategoryAppearance, EntryDraft, SharedCard } from './domain';
import { allCategoryAppearances } from './category-appearance';
import { ImportEntryLine } from './statement-import-content';

export type ImportDraft={due_month:string;card_id:string;title:string;confirmed_total:number;entries:EntryDraft[];demo:boolean;model?:ImportModel};
export function ImportReview({draft,cards,settings,busy,checked,onChange,onChecked}:{
  draft:ImportDraft;cards:SharedCard[];settings:CategoryAppearance[];busy:boolean;checked:boolean;
  onChange:(draft:ImportDraft)=>void;onChecked:(checked:boolean)=>void;
}) {
  const [editing,setEditing]=useState<number|null>(()=>draft.entries.length===1&&!draft.entries[0].title?0:null);
  const [metadataOpen,setMetadataOpen]=useState(false);
  const reduced=useReducedMotion();
  const expand={initial:{height:0,opacity:0},animate:{height:'auto',opacity:1},exit:{height:0,opacity:0},transition:{duration:reduced?0:.24,ease:[.22,1,.36,1] as [number,number,number,number]}};
  const id=useId();
  const total=draft.entries.reduce((sum,entry)=>sum+entry.amount,0);
  const matches=total===draft.confirmed_total;
  const card=cards.find(item=>item.id===draft.card_id);
  const categories=allCategoryAppearances(settings);
  const update=(index:number,change:Partial<EntryDraft>)=>onChange({...draft,entries:draft.entries.map((entry,i)=>i===index?{...entry,...change}:entry)});
  return <div className="import-processing import-review">
    <div className="import-processing-symbol import-complete-symbol" aria-hidden="true"><Check className="import-animated-check" size={30}/></div>
    <div className="import-processing-heading"><h3>仕分け結果</h3><p>{card?.name} · {Number(draft.due_month.slice(0,4))}年{Number(draft.due_month.slice(5))}月{draft.demo?' · デモ':draft.model?` · ${importModels.find(item=>item.id===draft.model)?.label}`:''}</p></div>
    <div className="import-review-list-heading"><span>{draft.entries.length}件の明細</span><span className="import-edit-hint"><Pencil size={14} aria-hidden="true"/>タップして編集</span></div>
    <div className="import-sorting-list import-review-list" aria-label="仕分け結果">
      {draft.entries.map((entry,index)=><div className="import-review-item" data-expanded={editing===index} key={index} style={{'--import-row-delay':`${Math.min(index,7)*25}ms`} as CSSProperties}>
        <button className="import-sorted-entry import-entry-button" disabled={busy} aria-label={`${entry.title||`${index+1}件目`}を編集`} aria-expanded={editing===index} aria-controls={`${id}-entry-${index}`} onClick={()=>setEditing(editing===index?null:index)}><ImportEntryLine entry={entry} settings={settings}/><span className="import-entry-edit" aria-hidden="true">{editing===index?<X size={16}/>:<Pencil size={16}/>}</span></button>
        <AnimatePresence initial={false}>{editing===index&&<motion.div key="editor" className="import-review-expander" {...expand}><fieldset className="import-review-editor" id={`${id}-entry-${index}`} disabled={busy}>
          <label className="field"><span>店名・内容</span><input value={entry.title} maxLength={100} onChange={event=>update(index,{title:event.target.value})}/></label>
          <div className="import-edit-pair">
            <label className="field"><span>利用日</span><input type="date" value={entry.spent_on} onChange={event=>update(index,{spent_on:event.target.value})}/></label>
            <label className="field"><span>金額（円）</span><input type="number" inputMode="decimal" step="1" value={entry.amount||''} onChange={event=>update(index,{amount:Number(event.target.value)})}/></label>
          </div>
          <label className="field"><span>費目</span><select value={entry.category} onChange={event=>update(index,{category:event.target.value})}>{categories.map(({category})=><option key={category}>{category}</option>)}</select></label>
          <div className="import-edit-actions"><button className="import-remove-entry" aria-label={`${entry.title||`${index+1}件目`}を削除`} onClick={()=>{setEditing(null);onChange({...draft,entries:draft.entries.filter((_,i)=>i!==index)});}}><Trash2 size={18}/></button><button onClick={()=>setEditing(null)}>閉じる</button></div>
        </fieldset></motion.div>}</AnimatePresence>
      </div>)}
    </div>
    <button className="import-review-add" disabled={busy||draft.entries.length>=50} onClick={()=>{setEditing(draft.entries.length);onChange({...draft,entries:[...draft.entries,{spent_on:'',title:'',amount:0,category:'その他・要確認'}]});}}><Plus size={16}/> 明細を追加</button>
    <div className="import-review-summary" data-expanded={metadataOpen}>
    <button className="import-processing-foot import-review-total" disabled={busy} aria-label="利用合計：登録先・引落額を編集" aria-expanded={metadataOpen} aria-controls={`${id}-metadata`} onClick={()=>setMetadataOpen(!metadataOpen)}><span>利用合計</span><strong>¥{total.toLocaleString('ja-JP')}</strong><span className="import-entry-edit" aria-hidden="true">{metadataOpen?<X size={16}/>:<Pencil size={16}/>}</span></button>
    <AnimatePresence initial={false}>{metadataOpen&&<motion.div key="metadata" className="import-review-expander" {...expand}><fieldset className="import-review-editor import-review-metadata" id={`${id}-metadata`} disabled={busy}>
      <label className="field"><span>カード</span><select value={draft.card_id} onChange={event=>onChange({...draft,card_id:event.target.value})}>{cards.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>引落月</span><input type="month" value={draft.due_month} onChange={event=>onChange({...draft,due_month:event.target.value})}/></label>
      <label className="field"><span>カード引落額（円）</span><input type="number" inputMode="numeric" min="1" step="1" value={draft.confirmed_total||''} onChange={event=>onChange({...draft,confirmed_total:Number(event.target.value)})}/></label>
    </fieldset></motion.div>}</AnimatePresence>
    </div>
    {!matches&&<p className="reconcile-error" role="status">引落額と合計が一致していません。利用合計をタップして確認してください。</p>}
    <label className="confirm-line import-review-confirm" data-checked={checked}><input type="checkbox" disabled={busy} checked={checked} onChange={event=>onChecked(event.target.checked)}/><span className="import-confirm-check" aria-hidden="true"><Check size={18}/></span><span>元の明細と内容・金額を確認した</span></label>
    {draft.demo&&<p className="import-review-demo">デモのため保存されません。編集は試せます。</p>}
  </div>;
}
