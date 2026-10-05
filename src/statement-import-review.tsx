import { broadMerchant, validRule, reviewReasons, rowTotal, type SourceTotal } from './import-policy';
import { ImportSourcePreview, ImportOriginalFiles } from './import-source';
import type { StatementFile } from './statement-files';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { CategoryAppearance, EntryDraft, SharedCard } from './domain';
import { allCategoryAppearances, categoryAppearance, fallbackCategory, isReviewCategory } from './category-appearance';
import { displayColor } from './display-color';
import { ImportEntryLine } from './statement-import-content';
import { entryKey } from './import-peel-store';
import { sortByEntrySort, type ListSort } from './entry-sort';
import { moveRow } from './reorder-motion';
import { reducedMotion } from './cartoon-motion';

export type ImportDraft={due_month:string;card_id:string;title:string;confirmed_total:number;entries:EntryDraft[];demo:boolean;source_total?:SourceTotal|null;total_alternative?:SourceTotal;total_manual?:boolean};
export function withDraftEntries(draft:ImportDraft,entries:EntryDraft[]):ImportDraft {return {...draft,entries,...(draft.source_total===null&&!draft.total_manual?{confirmed_total:rowTotal(entries)}:{})};}
export const ARRIVAL_SORT:ListSort={key:null,dateAscending:false,amountAscending:false};
export const unresolvedEntries=(entries:EntryDraft[],settings:CategoryAppearance[])=>entries.filter(entry=>reviewReasons(entry,fallbackCategory(settings)).length>0).length;

const bezier=(x1:number,y1:number,x2:number,y2:number)=>(t:number)=>{
  let lo=0,hi=1,u=t;
  for(let k=0;k<20;k++){u=(lo+hi)/2;const x=3*(1-u)**2*u*x1+3*(1-u)*u*u*x2+u**3;if(x<t)lo=u;else hi=u;}
  return 3*(1-u)**2*u*y1+3*(1-u)*u*u*y2+u**3;
};
const travel=bezier(.45,0,.2,1),settle=bezier(.3,1.5,.5,1);
type Snapshot={rects:Map<string,DOMRect>;nodes:Map<string,HTMLElement>;boxHeight:number};
type BoxState='closed'|'open'|'done';
// The fallback text says no more than the candidate chips under it.
const GENERIC_REASON='費目を絞り込めませんでした。購入内容に合う費目を選んでください。';
const rowSelector=(key:string)=>`[data-row-key="${CSS.escape(key)}"]`;

function stamp(row:HTMLElement){
  row.querySelector('.import-category-tag')?.animate([{transform:'scale(1.8,.4) rotate(-6deg)',opacity:0},{opacity:1,offset:.6},{transform:'none',opacity:1}],{duration:460,easing:'cubic-bezier(.3,1.7,.5,1)'});
  row.querySelector('.import-sorted-entry > svg')?.animate([{transform:'scale(.5)'},{transform:'scale(1.2)',offset:.6},{transform:'none'}],{duration:380,easing:'cubic-bezier(.3,1.6,.5,1)'});
}
// The dock's main button answers a finished step with a small bounce.
function bounceAction(){
  if(reducedMotion())return;
  document.querySelector('.thumb-dock .context-primary .context-action')?.animate([{transform:'scale(.9,1.08)'},{transform:'scale(1.05,.95)',offset:.45},{transform:'none'}],{duration:480,easing:'cubic-bezier(.3,1.4,.5,1)'});
}

// The read rows stay in the order they arrived (newest on top). Rows that
// need a decision lift out one by one and fly into "確認が必要" above the
// list; picking a category stamps the row and sends it back to its place.
export function ImportReview({draft,cards,settings,busy,checked,onChange,onChecked,files=[],sort=ARRIVAL_SORT,intro=false,onIntroDone}:{
  files?:StatementFile[];draft:ImportDraft;cards:SharedCard[];settings:CategoryAppearance[];busy:boolean;checked:boolean;
  onChange:(draft:ImportDraft)=>void;onChecked:(checked:boolean)=>void;sort?:ListSort;intro?:boolean;onIntroDone?:()=>void;
}) {
  const reviewCategory=fallbackCategory(settings);
  const keyed=draft.entries.map((entry,index)=>({entry,index,key:entryKey(entry,index),spent_on:entry.spent_on,amount:entry.amount}));
  const needsReview=(entry:EntryDraft)=>reviewReasons(entry,reviewCategory).length>0;
  const boxable=needsReview;
  const arrival=[...keyed].reverse();
  const rank=new Map(arrival.map((item,k)=>[item.key,k]));
  const ordered=sortByEntrySort(arrival,sort,(a,b)=>rank.get(a.key)!-rank.get(b.key)!);
  const [editing,setEditing]=useState<string|null>(()=>draft.entries.length===1&&!draft.entries[0].title?entryKey(draft.entries[0],0):null);
  const [metadataOpen,setMetadataOpen]=useState(false);
  const [inBox,setInBox]=useState<string[]>(()=>intro?[]:ordered.filter(item=>boxable(item.entry)).map(item=>item.key));
  const [box,setBox]=useState<BoxState>(()=>inBox.length?'open':'closed');
  const [whyOpen,setWhyOpen]=useState<Set<string>>(()=>new Set(inBox));
  const [pens,setPens]=useState(!intro);
  const [settled,setSettled]=useState(!intro);
  const reduced=useReducedMotion();
  const expand={initial:{height:0,opacity:0},animate:{height:'auto',opacity:1},exit:{height:0,opacity:0},transition:{duration:reduced?0:.24,ease:[.22,1,.36,1] as [number,number,number,number]}};
  const id=useId();
  const root=useRef<HTMLDivElement>(null);
  const total=draft.entries.reduce((sum,entry)=>sum+entry.amount,0);
  const matches=total===draft.confirmed_total;
  const categories=allCategoryAppearances(settings);
  const unresolved=keyed.filter(({entry})=>needsReview(entry));
  const unresolvedAmount=unresolved.reduce((sum,{entry})=>sum+Math.abs(entry.amount),0);
  const blocked=draft.entries.some(entry=>isReviewCategory(entry.category,settings)||!entry.title||!entry.amount||entry.import_meta?.amount_uncertain);
  const boxRows=inBox.map(key=>keyed.find(item=>item.key===key)).filter(item=>!!item);
  const listRows=ordered.filter(item=>!inBox.includes(item.key));
  const inBoxNow=useRef(inBox);inBoxNow.current=inBox;

  // Every commit: rows glide from where they were drawn to where they are now,
  // the box springs to its new height, and rows that changed home fly there.
  // Where they were drawn is read here, before React moves anything.
  const snapshot=useRef<Snapshot|null>(null);
  if(root.current){
    const rows=[...root.current.querySelectorAll<HTMLElement>('[data-row-key]')];
    snapshot.current={rects:new Map(rows.map(row=>[row.dataset.rowKey!,row.getBoundingClientRect()])),nodes:new Map(rows.map(row=>[row.dataset.rowKey!,row])),boxHeight:root.current.querySelector<HTMLElement>('.import-review-box')?.offsetHeight??0};
  }
  const committed=useRef({inBox:new Set(inBox),order:JSON.stringify(sort),why:new Set(whyOpen),categories:new Map(keyed.map(item=>[item.key,item.entry.category])),pens});
  const flying=useRef(new Set<string>());
  const alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;document.querySelectorAll('.import-review-flyer').forEach(flyer=>flyer.remove());};},[]);
  const tick=()=>root.current?.closest('.card-panel-frame')?.animate([{translate:'0 0'},{translate:'0 .8px'},{translate:'0 -.5px'},{translate:'0 0'}],{duration:110});

  // A row lifts, swings along a shallow arc to its new place and lands with a
  // squash. Its new slot stays hidden under it and is chased every frame,
  // since the box and the list keep moving while it flies.
  function fly(key:string,from:DOMRect,source:HTMLElement,toBox:boolean){
    const panel=root.current;if(!panel)return;
    const slot=()=>panel.querySelector<HTMLElement>(rowSelector(key));
    const flyer=document.createElement('div');flyer.className='import-review-flyer';
    const list=document.createElement('div');list.className='import-sorting-list import-review-list';
    list.appendChild((source.querySelector('.import-sorted-entry')??source).cloneNode(true));
    flyer.appendChild(list);document.body.appendChild(flyer);
    flying.current.add(key);
    const target=slot();if(target)target.dataset.flying='';
    const duration=820,started=performance.now(),up={left:from.left,top:from.top-5};
    flyer.animate([
      {transform:'scale(1)',boxShadow:'0 0 0 #0000'},
      {transform:'scale(1.04) rotate(-1.2deg)',boxShadow:'0 16px 22px -12px #0005',offset:.22},
      {transform:'scale(1.02) rotate(.8deg)',boxShadow:'0 14px 22px -12px #0004',offset:.66},
      {transform:'scale(1.03,.86)',boxShadow:'0 2px 4px -2px #0002',offset:.86},
      {transform:'scale(.99,1.03)',offset:.94},
      {transform:'none',boxShadow:'0 0 0 #0000'}],{duration,easing:'linear',fill:'forwards'});
    if(toBox)flyer.animate([{backgroundColor:'var(--paper)'},{backgroundColor:'var(--paper)',offset:.6},{backgroundColor:'transparent'}],{duration,fill:'forwards'});
    const place=()=>{const live=slot();return live?live.getBoundingClientRect():from;};
    const step=(now:number)=>{
      if(!alive.current){flyer.remove();return;}
      const t=Math.min(1,(now-started)/duration),b=place();
      let left:number,top:number;
      if(t<.22){left=from.left;top=from.top+(up.top-from.top)*(t/.22);}
      else if(t<.84){const k=travel((t-.22)/.62);left=up.left+(b.left-up.left)*k+Math.sin(k*Math.PI)*14;top=up.top+(b.top+4-up.top)*k;}
      else{const k=settle((t-.84)/.16);left=b.left;top=b.top+4-4*k;}
      Object.assign(flyer.style,{left:`${left}px`,top:`${top}px`,width:`${b.width}px`,height:`${Math.min(b.height,from.height)}px`});
      if(t<1){requestAnimationFrame(step);return;}
      flyer.remove();flying.current.delete(key);
      const landed=slot();if(landed)delete landed.dataset.flying;
      if(toBox){tick();setWhyOpen(current=>new Set(current).add(key));}
    };
    requestAnimationFrame(step);
  }

  useLayoutEffect(()=>{
    const panel=root.current,snap=snapshot.current,last=committed.current;
    snapshot.current=null;
    const order=JSON.stringify(sort),now=new Set(inBox);
    committed.current={inBox:now,order,why:new Set(whyOpen),categories:new Map(keyed.map(item=>[item.key,item.entry.category])),pens};
    if(!panel)return;
    const added=[...now].filter(key=>!last.inBox.has(key));
    if(reducedMotion()){if(added.length)setWhyOpen(current=>new Set([...current,...added]));return;}
    const moved=[...new Set([...last.inBox,...now])].filter(key=>last.inBox.has(key)!==now.has(key)&&!!snap?.rects.has(key));
    for(const key of flying.current){const row=panel.querySelector<HTMLElement>(rowSelector(key));if(row)row.dataset.flying='';}
    const boxNode=panel.querySelector<HTMLElement>('.import-review-box');
    if(snap&&boxNode&&!boxNode.dataset.collapsing){
      const height=boxNode.offsetHeight;
      if(Math.abs(height-snap.boxHeight)>.5)boxNode.animate([{height:`${snap.boxHeight}px`},{height:`${height}px`}],{duration:520,easing:'cubic-bezier(.3,1.25,.5,1)'});
    }
    if(snap){
      const reorder=order!==last.order;let rank=0;
      for(const row of panel.querySelectorAll<HTMLElement>('[data-row-key]')){
        const key=row.dataset.rowKey!;
        if(moved.includes(key)||flying.current.has(key))continue;
        const top=snap.rects.get(key)?.top;if(top===undefined)continue;
        row.getAnimations().forEach(animation=>{if(animation.id==='reorder'||animation.id==='glide')animation.cancel();});
        const dy=top-row.getBoundingClientRect().top;
        if(Math.abs(dy)<=.5)continue;
        if(reorder){moveRow(row,dy,rank++);continue;}
        row.animate([{translate:`0 ${dy}px`},{translate:'0 2px',offset:.7},{translate:'0 0'}],{duration:460,easing:'cubic-bezier(.3,1.2,.5,1)'}).id='glide';
      }
      for(const key of moved)fly(key,snap.rects.get(key)!,snap.nodes.get(key)!,now.has(key));
    }
    // A category that changes on a row (a chip, the editor) is stamped on.
    for(const item of keyed){
      const before=last.categories.get(item.key);
      if(before===undefined||before===item.entry.category)continue;
      const row=panel.querySelector<HTMLElement>(rowSelector(item.key));
      if(row){stamp(row);tick();}
    }
    for(const key of whyOpen)if(!last.why.has(key))panel.querySelector(`${rowSelector(key)} .import-review-why`)?.animate([{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'none'}],{duration:300});
    if(pens&&!last.pens)[...panel.querySelectorAll('.import-review-list .import-entry-edit')].forEach((pen,k)=>pen.animate([{opacity:0,transform:'translateX(-6px)'},{opacity:1,transform:'none'}],{duration:260,delay:Math.min(k,9)*30,fill:'backwards'}));
  });

  // After the reading: the pencils come in, the box opens, and the rows that
  // need a decision fly up one after another, 0.22s apart.
  const introDone=useRef(onIntroDone);introDone.current=onIntroDone;
  const introRows=useRef<string[]|null>(null);
  useEffect(()=>{
    if(!intro)return;
    const timers:number[]=[];
    const at=(ms:number,run:()=>void)=>timers.push(window.setTimeout(run,reducedMotion()?0:ms));
    const pending=ordered.filter(item=>boxable(item.entry)).map(item=>item.key);
    introRows.current=pending;
    at(380,()=>setPens(true));
    if(pending.length){
      at(800,()=>setBox('open'));
      pending.forEach((key,k)=>at(1050+k*220,()=>setInBox(current=>current.includes(key)?current:[...current,key])));
    }else at(800,()=>{setSettled(true);introDone.current?.();bounceAction();});
    return()=>timers.forEach(window.clearTimeout);
    // The intro plays once, for the draft the reading handed over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{
    const pending=introRows.current;
    if(settled||!pending?.length||pending.some(key=>!whyOpen.has(key)&&draft.entries.some((entry,index)=>entryKey(entry,index)===key)))return;
    setSettled(true);introDone.current?.();bounceAction();
  },[settled,whyOpen,draft.entries]);

  // A row that no longer needs a decision gets its stamp, then flies back
  // to its place in the list; the last one closes the box.
  const leaving=boxRows.filter(item=>!boxable(item.entry)).map(item=>item.key).join('\n');
  const gone=inBox.filter(key=>!keyed.some(item=>item.key===key)).join('\n');
  useEffect(()=>{
    if(!settled||!(leaving||gone))return;
    const keys=[...leaving.split('\n'),...gone.split('\n')];
    const timer=window.setTimeout(()=>{
      const next=inBoxNow.current.filter(key=>!keys.includes(key));
      setInBox(next);
      if(!next.length)setBox('done');
    },reducedMotion()||!leaving?0:420);
    return()=>window.clearTimeout(timer);
  },[leaving,gone,settled]);
  // A row that starts needing a decision later (and is not being edited) joins the box.
  const joining=settled?listRows.filter(item=>boxable(item.entry)&&item.key!==editing).map(item=>item.key).join('\n'):'';
  useEffect(()=>{
    if(!joining)return;
    const keys=joining.split('\n');
    setBox('open');setInBox(current=>[...current,...keys.filter(key=>!current.includes(key))]);
  },[joining]);
  useEffect(()=>{
    if(box!=='done')return;
    const boxNode=root.current?.querySelector<HTMLElement>('.import-review-box');
    if(!boxNode||reducedMotion()){setBox('closed');bounceAction();return;}
    let stop=false,collapse:Animation|null=null;
    boxNode.querySelector('.import-review-allok')?.animate([{transform:'scale(.5)',opacity:0},{transform:'scale(1.1)',opacity:1,offset:.6},{transform:'none',opacity:1}],{duration:420,easing:'cubic-bezier(.3,1.5,.5,1)'});
    const timer=window.setTimeout(async()=>{
      boxNode.dataset.collapsing='';
      collapse=boxNode.animate([{height:`${boxNode.offsetHeight}px`},{height:'0px',opacity:.4}],{duration:420,easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'});
      await collapse.finished.catch(()=>undefined);
      if(stop)return;
      setBox(current=>current==='done'?'closed':current);bounceAction();tick();
    },700);
    // A row that needs a decision again reopens the box mid-collapse.
    return()=>{stop=true;window.clearTimeout(timer);collapse?.cancel();delete boxNode.dataset.collapsing;};
  },[box]);

  const update=(index:number,change:Partial<EntryDraft>)=>onChange(withDraftEntries(draft,draft.entries.map((entry,i)=>i===index?{...entry,...change,...(entry.import_meta?{import_meta:{...entry.import_meta,...change.import_meta,...('amount' in change?{amount_uncertain:false}:{}),...('title' in change?{remember_rule:false}:{}),...('category' in change?{status:'classified' as const}: {})}}:{})}:entry)));
  const chooseCategory=(index:number,category:string)=>update(index,{category});
  const chip=(category:string,index:number,title?:string)=><button disabled={busy} key={category} title={title} onClick={()=>chooseCategory(index,category)}><i style={{background:displayColor(categoryAppearance(category,settings).color)}}/>{category}</button>;

  const row=({entry,index,key}:typeof keyed[number],where:'list'|'box')=>{
    const open=editing===key;
    const name=entry.title||`${index+1}件目`;
    return <div className="import-review-row" data-row-key={key} key={key}>
      <button className="import-sorted-entry import-entry-button" data-classification={entry.import_meta?.status} data-rule={entry.import_meta?.rule_id?'':undefined} disabled={busy} aria-label={`${name}を編集`} aria-expanded={open} aria-controls={`${id}-entry-${index}`} onClick={()=>setEditing(open?null:key)}><ImportEntryLine entry={entry} settings={settings}/><span className="import-entry-edit" aria-hidden="true">{open?<X size={16}/>:<Pencil size={16}/>}</span></button>
      {where==='box'&&whyOpen.has(key)&&needsReview(entry)&&<div className="import-review-why">
        {reviewReasons(entry,reviewCategory).filter(reason=>reason!==GENERIC_REASON||!entry.import_meta?.candidates?.length).map(reason=><p key={reason}>{reason}</p>)}
        {isReviewCategory(entry.category,settings)&&!!entry.import_meta?.candidates?.length&&<><span className="import-review-why-label">合いそうな費目</span><div className="import-candidates">{entry.import_meta.candidates.map(candidate=>chip(candidate.category,index,`候補の比較用 ${Math.round(candidate.score*100)}%`))}</div></>}
        {isReviewCategory(entry.category,settings)&&!!entry.import_meta?.history?.length&&<><span className="import-review-why-label">以前の修正（今回だけ適用）</span><div className="import-candidates">{entry.import_meta.history.map(category=>chip(category,index))}</div></>}
        {entry.import_meta?.amount_uncertain&&entry.amount!==0&&<div className="import-candidates"><button disabled={busy} onClick={()=>update(index,{amount:entry.amount})}>¥{entry.amount.toLocaleString('ja-JP')}で原本と一致している</button></div>}
        {entry.import_meta?.source&&<ImportSourcePreview source={entry.import_meta.source} files={files}/>}
      </div>}
      <AnimatePresence initial={false}>{open&&<motion.div key="editor" className="import-review-expander" {...expand}><fieldset className="import-review-editor" id={`${id}-entry-${index}`} disabled={busy}>
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
        {entry.import_meta?.source&&where==='list'&&<ImportSourcePreview source={entry.import_meta.source} files={files}/>}
        <div className="import-edit-actions"><button className="import-remove-entry" aria-label={`${name}を削除`} onClick={()=>{setEditing(null);onChange(withDraftEntries(draft,draft.entries.filter((_,i)=>i!==index)));}}><Trash2 size={18}/></button><button onClick={()=>setEditing(null)}>閉じる</button></div>
      </fieldset></motion.div>}</AnimatePresence>
    </div>;
  };

  return <div ref={root} className="import-processing import-review" data-pens={pens}>
    {box!=='closed'&&<section className="import-review-box" aria-label="確認が必要"><div className="import-review-box-in">
      {box==='done'?<span className="import-review-allok" role="status"><Check size={14} strokeWidth={3} aria-hidden="true"/>すべて確認しました</span>:<>
        <h4><span>確認が必要 {unresolved.length}件</span><small>{unresolvedAmount?`¥${unresolvedAmount.toLocaleString('ja-JP')}`:''}</small></h4>
        <div className="import-sorting-list import-review-list">{boxRows.map(item=>row(item,'box'))}</div>
      </>}
    </div></section>}
    {box!=='closed'&&<div className="import-review-sec"><span>仕分け済み <b>{draft.entries.length-inBox.length}</b>件</span><span>タップして直せます</span></div>}
    <div className="import-sorting-list import-review-list" aria-label="仕分け結果">{listRows.map(item=>row(item,'list'))}</div>
    {/* The list shows the newest read row first, so a row put at the front lands last. */}
    <button className="import-review-add" disabled={busy} onClick={()=>{const entry={spent_on:'',title:'',amount:0,category:fallbackCategory(settings)};const key=entryKey(entry,0);setEditing(key);onChange(withDraftEntries(draft,[entry,...draft.entries]));requestAnimationFrame(()=>root.current?.querySelector(rowSelector(key))?.scrollIntoView({block:'center',behavior:reducedMotion()?'auto':'smooth'}));}}><Plus size={16}/> 明細を追加</button>
    <ImportOriginalFiles files={files}/>
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
    {draft.demo&&<p className="import-review-demo">デモのため保存されません。編集は試せます。</p>}
    {settled&&<label className="confirm-line import-review-confirm" data-checked={checked}><input type="checkbox" disabled={busy||blocked||draft.entries.some(entry=>entry.import_meta?.remember_rule&&!validRule(entry))} checked={checked&&!blocked} onChange={event=>onChecked(event.target.checked)}/><span className="import-confirm-check" aria-hidden="true"><Check size={18}/></span><span>元の明細と内容・金額を確認した</span></label>}
  </div>;
}
