import { broadMerchant, validRule, reviewReasons, rowTotal, type SourceTotal } from './import-policy';
import { ImportSourcePreview } from './import-source';
import type { StatementFile } from './statement-files';
import { useId, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CategoryAppearance, EntryDraft, SharedCard } from './domain';
import { allCategoryAppearances, fallbackCategory, isReviewCategory } from './category-appearance';
import { ImportEntryLine } from './statement-import-content';

export type ImportDraft={due_month:string;card_id:string;title:string;confirmed_total:number;entries:EntryDraft[];demo:boolean;source_total?:SourceTotal|null;total_alternative?:SourceTotal;total_manual?:boolean};
export function withDraftEntries(draft:ImportDraft,entries:EntryDraft[]):ImportDraft {return {...draft,entries,...(draft.source_total===null&&!draft.total_manual?{confirmed_total:rowTotal(entries)}:{})};}
export function ImportReview({draft,cards,settings,busy,checked,onChange,onChecked,files=[]}:{
  files?:StatementFile[];draft:ImportDraft;cards:SharedCard[];settings:CategoryAppearance[];busy:boolean;checked:boolean;
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
  const indexed=draft.entries.map((entry,index)=>({entry,index}));
  const needsReview=(entry:EntryDraft)=>reviewReasons(entry,fallbackCategory(settings)).length>0;
  const unresolved=indexed.filter(({entry})=>needsReview(entry));
  const classified=indexed.filter(({entry})=>!needsReview(entry));
  const blocked=draft.entries.some(entry=>isReviewCategory(entry.category,settings)||!entry.title||!entry.amount||entry.import_meta?.amount_uncertain);
  const unresolvedAmount=unresolved.reduce((sum,{entry})=>sum+Math.abs(entry.amount),0);
  const groups=unresolved.length?[{label:'要確認',rows:unresolved,pending:true},{label:'分類済み',rows:classified,pending:false}]:[{label:'分類済み',rows:classified,pending:false}];
  const update=(index:number,change:Partial<EntryDraft>)=>onChange(withDraftEntries(draft,draft.entries.map((entry,i)=>i===index?{...entry,...change,...(entry.import_meta?{import_meta:{...entry.import_meta,...change.import_meta,...('amount' in change?{amount_uncertain:false}:{}),...('title' in change?{remember_rule:false}:{}),...('category' in change?{status:'classified' as const}: {})}}:{})}:entry)));
  const chooseCategory=(index:number,category:string)=>update(index,{category});
  return <div className="import-processing import-review">
    <div className="import-processing-symbol import-complete-symbol" aria-hidden="true"><Check className="import-animated-check" size={30}/></div>
    <div className="import-processing-heading"><h3>仕分け結果</h3><p>{card?.name} · {Number(draft.due_month.slice(0,4))}年{Number(draft.due_month.slice(5))}月{draft.demo?' · デモ':''}</p></div>
    <div className="import-review-list-heading"><span>{draft.entries.length}件の明細</span><span className="import-edit-hint"><Pencil size={14} aria-hidden="true"/>タップして編集</span></div>
    <div className="import-sorting-list import-review-list" aria-label="仕分け結果">
      {groups.filter(group=>group.rows.length>0).map(group=><section className="import-review-group" key={group.label} aria-label={group.label}>
        {unresolved.length>0&&<div className="import-review-group-heading"><h4>{group.label}<span>{group.rows.length}件</span></h4>{group.pending&&<p role="status">確認対象の金額：¥{unresolvedAmount.toLocaleString('ja-JP')}。表示された理由を確認してください。</p>}</div>}
      {group.rows.map(({entry,index})=><div className="import-review-item" data-expanded={editing===index} key={entry.import_meta?.id??index} style={{'--import-row-delay':`${Math.min(index,7)*25}ms`} as CSSProperties}>
        <button className="import-sorted-entry import-entry-button" disabled={busy} aria-label={`${entry.title||`${index+1}件目`}を編集`} aria-expanded={editing===index} aria-controls={`${id}-entry-${index}`} onClick={()=>setEditing(editing===index?null:index)}><ImportEntryLine entry={entry} settings={settings}/><span className="import-entry-edit" aria-hidden="true">{editing===index?<X size={16}/>:<Pencil size={16}/>}</span></button>
        {needsReview(entry)&&<div className="import-review-reasons"><ul>{reviewReasons(entry,fallbackCategory(settings)).map(reason=><li key={reason}>{reason}</li>)}</ul>
          {isReviewCategory(entry.category,settings)&&<><div className="import-candidates">{entry.import_meta?.candidates?.map(candidate=><button disabled={busy} key={candidate.category} onClick={()=>chooseCategory(index,candidate.category)}>{candidate.category} <small>{Math.round(candidate.score*100)}%</small></button>)}</div>{!!entry.import_meta?.candidates?.length&&<p className="subtle">割合は候補の比較用です。正答率を示すものではありません。</p>}
          {!!entry.import_meta?.history?.length&&<div className="import-candidates"><span>以前の修正（今回だけ適用）</span>{entry.import_meta.history.map(category=><button disabled={busy} key={category} onClick={()=>chooseCategory(index,category)}>{category}</button>)}</div>}</>}
          {entry.import_meta?.amount_uncertain&&entry.amount!==0&&<button disabled={busy} onClick={()=>update(index,{amount:entry.amount})}>¥{entry.amount.toLocaleString('ja-JP')}で原本と一致している</button>}
          {entry.import_meta?.source&&<ImportSourcePreview source={entry.import_meta.source} files={files}/>}
        </div>}
        <AnimatePresence initial={false}>{editing===index&&<motion.div key="editor" className="import-review-expander" {...expand}><fieldset className="import-review-editor" id={`${id}-entry-${index}`} disabled={busy}>
          <label className="field"><span>店名・内容</span><input value={entry.title} maxLength={100} onChange={event=>update(index,{title:event.target.value})}/></label>
          <div className="import-edit-pair">
            <label className="field"><span>利用日</span><input type="date" value={entry.spent_on} onChange={event=>update(index,{spent_on:event.target.value})}/></label>
            <label className="field"><span>金額（円）</span><input type="number" inputMode="decimal" step="1" value={entry.amount||''} onChange={event=>update(index,{amount:Number(event.target.value)})}/></label>
          </div>
          <label className="field"><span>費目</span><select value={entry.category} onChange={event=>chooseCategory(index,event.target.value)}>{categories.map(({category})=><option key={category}>{category}</option>)}</select></label>
          {entry.import_meta&&<div className="import-rule-opt-in"><p className="subtle">費目の修正は今回の明細だけに適用します。</p>
            {broadMerchant(entry.title)&&!entry.import_meta.context?<p className="subtle">このお店は購入内容が分かる場合だけ自動分類ルールを作れます。</p>:<>
              <label><input type="checkbox" checked={!!entry.import_meta.remember_rule} disabled={isReviewCategory(entry.category,settings)} onChange={event=>update(index,{import_meta:{...entry.import_meta!,remember_rule:event.target.checked}})}/> 今後もこの条件で分類</label>
              {entry.import_meta.remember_rule&&<><p className="subtle">店名「{entry.title}」が一致する場合に適用します。</p><label className="field"><span>購入内容に含まれる言葉{broadMerchant(entry.title)?'（必須）':'（任意）'}</span><input maxLength={100} value={entry.import_meta.rule_keyword||''} onChange={event=>update(index,{import_meta:{...entry.import_meta!,rule_keyword:event.target.value}})}/></label><p className="subtle">読み取った購入内容：{entry.import_meta.context||'記載なし'}</p>{!validRule(entry)&&<p role="status">購入内容に実際に含まれる、商品や用途が分かる言葉を指定してください。</p>}</>}
            </>}
          </div>}
          {entry.import_meta?.source&&!needsReview(entry)&&<ImportSourcePreview source={entry.import_meta.source} files={files}/>}
          <div className="import-edit-actions"><button className="import-remove-entry" aria-label={`${entry.title||`${index+1}件目`}を削除`} onClick={()=>{setEditing(null);onChange(withDraftEntries(draft,draft.entries.filter((_,i)=>i!==index)));}}><Trash2 size={18}/></button><button onClick={()=>setEditing(null)}>閉じる</button></div>
        </fieldset></motion.div>}</AnimatePresence>
      </div>)}
      </section>)}
    </div>
    <button className="import-review-add" disabled={busy} onClick={()=>{setEditing(draft.entries.length);onChange(withDraftEntries(draft,[...draft.entries,{spent_on:'',title:'',amount:0,category:fallbackCategory(settings)}]));}}><Plus size={16}/> 明細を追加</button>
    <div className="import-review-summary" data-expanded={metadataOpen}>
    <button className="import-processing-foot import-review-total" disabled={busy} aria-label="利用合計：登録先・引落額を編集" aria-expanded={metadataOpen} aria-controls={`${id}-metadata`} onClick={()=>setMetadataOpen(!metadataOpen)}><span>利用合計</span><strong>¥{total.toLocaleString('ja-JP')}</strong><span className="import-entry-edit" aria-hidden="true">{metadataOpen?<X size={16}/>:<Pencil size={16}/>}</span></button>
    <AnimatePresence initial={false}>{metadataOpen&&<motion.div key="metadata" className="import-review-expander" {...expand}><fieldset className="import-review-editor import-review-metadata" id={`${id}-metadata`} disabled={busy}>
      <label className="field"><span>カード</span><select value={draft.card_id} onChange={event=>onChange({...draft,card_id:event.target.value})}>{cards.filter(item=>item.active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="field"><span>引落月</span><input type="month" value={draft.due_month} onChange={event=>onChange({...draft,due_month:event.target.value})}/></label>
      <label className="field"><span>カード引落額（円）</span><input type="number" inputMode="numeric" min="1" step="1" value={draft.confirmed_total||''} onChange={event=>onChange({...draft,confirmed_total:Number(event.target.value),total_manual:true})}/></label>
    </fieldset></motion.div>}</AnimatePresence>
    </div>
    {draft.total_alternative&&<div className="import-review-reasons" role="status"><strong>原本の合計額を一つに確定できませんでした</strong><p>再読み取りでは「{draft.total_alternative.label}」を¥{draft.total_alternative.amount.toLocaleString('ja-JP')}と読みました。請求の対象範囲と原本の金額を確認し、利用合計から登録する金額を修正してください。</p><ImportSourcePreview source={{...draft.total_alternative,row:0,excerpt:draft.total_alternative.label}} files={files}/></div>}
    {draft.source_total===null&&<p className="import-hint">原本に照合できる合計額はありません。読み取った明細の合計と内容を確認してください。</p>}
    {draft.source_total&&draft.source_total.amount!==total&&<div className="import-review-reasons" role="status"><strong>原本の記載額との差：¥{Math.abs(draft.source_total.amount-total).toLocaleString('ja-JP')}</strong><p>「{draft.source_total.label}」は¥{draft.source_total.amount.toLocaleString('ja-JP')}、明細の合計は¥{total.toLocaleString('ja-JP')}です。再読み取り後も一致していません。原本の金額・返金や手数料・請求の対象範囲を確認してください。</p><ImportSourcePreview source={{...draft.source_total,row:0,excerpt:draft.source_total.label}} files={files}/></div>}
    {!matches&&<p className="reconcile-error" role="status">引落額と合計が一致していません。利用合計をタップして確認してください。</p>}
    <label className="confirm-line import-review-confirm" data-checked={checked}><input type="checkbox" disabled={busy||blocked||draft.entries.some(entry=>entry.import_meta?.remember_rule&&!validRule(entry))} checked={checked&&!blocked} onChange={event=>onChecked(event.target.checked)}/><span className="import-confirm-check" aria-hidden="true"><Check size={18}/></span><span>元の明細と内容・金額を確認した</span></label>
    {draft.demo&&<p className="import-review-demo">デモのため保存されません。編集は試せます。</p>}
  </div>;
}
