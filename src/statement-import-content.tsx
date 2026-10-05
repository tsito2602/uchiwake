import { useLayoutEffect, useRef } from 'react';
import { LiveSpring, reducedMotion } from './cartoon-motion';
import { displayColor } from './display-color';
import { NativeMonthPicker } from './native-month-picker';
import { ChevronDown, CreditCard, FileImage, FileText, Files, Table2, Plus, Pencil, Sparkles, X } from 'lucide-react';
import type { CategoryAppearance, SharedCard, EntryDraft } from './domain';
import { categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import type { ImportProgress } from './statement-import-flow';
import { ImportReader, type ReaderResult } from './import-reader';
import { entryKey, usePeel } from './import-peel-store';
import { statementFileAccept, statementFileSize, type StatementFile } from './statement-files';
import { reviewCauseLabel } from './import-policy';

export function ImportSetup({cards,cardId,month,files,mode,demoEnabled,liveEnabled,demoView=false,loading=false,disabled=false,onCard,onMonth,onMode,onFiles,onRemove,onManual}:{
  cards:SharedCard[];cardId:string;month:string;files:StatementFile[];loading?:boolean;disabled?:boolean;
  mode:'demo'|'live';demoEnabled:boolean;liveEnabled:boolean;demoView?:boolean;onMonth:(month:string)=>void;
  onCard:(id:string)=>void;onMode:(mode:'demo'|'live')=>void;onFiles:(files:FileList|null)=>void;onRemove:(index:number)=>void;onManual:()=>void;
}) {
  const card=cards.find(item=>item.id===cardId);
  return <fieldset className="import-setup" disabled={disabled} aria-busy={loading}>
    <label className="import-card-select"><CreditCard size={24} color={displayColor(card?.color)} aria-hidden="true"/><span className="import-card-copy" aria-hidden="true"><span>取り込むカード</span><strong>{card?.name}</strong></span><ChevronDown size={18} aria-hidden="true"/><select aria-label="取り込むカード" value={cardId} onChange={event=>onCard(event.target.value)}>{cards.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <div className="import-month"><span>引落月</span><NativeMonthPicker value={month} onChange={onMonth} label="引落年月を選択"/></div>
    {demoEnabled&&<div className="import-mode" role="group" aria-label="読み取り方法"><button aria-pressed={mode==='live'} onClick={()=>onMode('live')}>明細を読み取る</button><button aria-pressed={mode==='demo'} onClick={()=>onMode('demo')}>デモで試す</button></div>}
    {mode==='live'&&!liveEnabled&&<p className="import-hint" role="status">AIの接続設定を確認できません。管理者にAIの接続設定を確認してください。</p>}
    {mode==='live'&&liveEnabled&&demoView&&<p className="import-hint">実際のAIで明細を読み取ります。デモ表示中のため、結果は保存されません。</p>}
    {mode==='demo'?<div className="import-demo-sample">
      <span className="import-demo-badge"><Sparkles size={14}/> デモ</span>
      <h3>仕分けを体験</h3><p>ファイルを用意せず、サンプル明細で試せます。</p>
      <div className="import-sample-paper" aria-hidden="true"><ReceiptLines/></div>
      <small>サンプル15件 · 実データは変更されません</small>
    </div>:<>
      <div className="import-file-section">
        {files.length>0&&<><div className="import-file-heading"><h3>取り込む明細</h3><span>{files.length}ファイル</span></div><ul className="import-file-list" aria-label="選択した明細ファイル">{files.map((item,index)=><li key={`${index}-${item.name}`}>
          <span className="import-file-preview" data-kind={item.kind} aria-hidden="true">{item.kind==='image'?<img src={item.data} alt=""/>:item.kind==='pdf'?<FileText size={25}/>:<Table2 size={25}/>}</span>
          <span className="import-file-copy"><strong>{item.name}</strong><small>{item.kind==='image'?'画像':item.kind.toUpperCase()}<span aria-hidden="true"> · </span>{statementFileSize(item.size)}</small></span>
          <button type="button" onClick={()=>onRemove(index)} aria-label={`${item.name}を外す`}><X size={17}/></button>
        </li>)}</ul></>}
        <label className="import-upload" data-compact={files.length>0}>
          <span className="import-upload-icon" aria-hidden="true">{files.length?<Plus size={22}/>:<Files size={32}/>}</span>
          <strong>{loading?'ファイルを準備中…':files.length?'明細ファイルを追加':'明細ファイルを選ぶ'}</strong>
          {!files.length&&<><span className="import-upload-formats" aria-hidden="true"><span><FileImage size={15}/>画像</span><span><FileText size={15}/>PDF</span><span><Table2 size={15}/>CSV</span></span><small>同じカード・引落月の明細をまとめて選択</small></>}
          <input aria-label={files.length?'明細ファイルを追加':'明細ファイルを選ぶ'} type="file" multiple accept={statementFileAccept} onChange={event=>{onFiles(event.target.files);event.target.value='';}}/>
        </label>
        {loading&&<p className="import-file-status" role="status">選択したファイルを準備しています</p>}
      </div>
    </>}
    <button className="import-manual" onClick={onManual}><Pencil size={17}/> 手入力で登録</button>
  </fieldset>;
}

function ReceiptLines(){return <><FileImage size={22}/><div><span>スーパー</span><strong>¥3,980</strong></div><div><span>日用品</span><strong>¥1,760</strong></div><div><span>カフェ</span><strong>¥1,100</strong></div></>;}

export function ImportEntryLine({entry,settings}:{entry:EntryDraft;settings:CategoryAppearance[]}) {
  const appearance=categoryAppearance(entry.category,settings);
  const label=entry.import_meta?.status==='pending'?'仕分け待ち':entry.import_meta?.status==='classifying'?'仕分け中…':entry.category;
  const causes=entry.import_meta?.status==='review'?entry.import_meta.review_causes:undefined;
  return <><CategoryIcon name={appearance.icon} color={appearance.color} size={23}/><span className="import-entry-copy"><strong>{entry.title||'新しい明細'}</strong><small>{entry.spent_on||'利用日不明'}</small><span className="import-category-tag" style={{color:displayColor(appearance.color),'--tag-color':displayColor(appearance.color)} as React.CSSProperties}>{label}</span>{!!causes?.length&&<small>{causes.map(reviewCauseLabel).join('・')}</small>}</span><b>¥{entry.amount.toLocaleString('ja-JP')}</b></>;
}

export function ImportPhaseStatus({progress,files,result}:{progress:ImportProgress;files?:StatementFile[];result?:ReaderResult}) {
  return <ImportReader progress={progress} files={files} result={result}/>;
}

const sorted=(entry:EntryDraft)=>!entry.import_meta||entry.import_meta.status==='classified'||entry.import_meta.status==='review';
function stamp(row:HTMLElement){
  const tag=row.querySelector<HTMLElement>('.import-category-tag'),icon=row.querySelector<SVGElement|HTMLElement>(':scope > svg');
  tag?.animate([{transform:'scale(1.8,.4) rotate(-6deg)',opacity:0},{opacity:1,offset:.6},{transform:'none',opacity:1}],{duration:460,easing:'cubic-bezier(.3,1.7,.5,1)'});
  icon?.animate([{transform:'scale(.5)'},{transform:'scale(1.2)',offset:.6},{transform:'none'}],{duration:380,easing:'cubic-bezier(.3,1.6,.5,1)'});
}
function shake(row:HTMLElement){
  const spring=new LiveSpring(0,value=>{row.style.translate=Math.abs(value)<.05?'':`${value.toFixed(2)}px 0`;},{stiffness:900,damping:9});
  spring.to(0,undefined,420);
}

// Rows are listed newest first, right under the statement they peel off.
// While the reader runs, a row joins the list when its strip lets go of the
// sheet (the rows below step down to make room) and shows once it lands.
// Its category tag waits as a shimmer until that row's own classification
// comes back, then stamps on; rule matches stamp as they land.
export function ImportProcessing({progress,settings}:{progress:ImportProgress;settings:CategoryAppearance[]}) {
  const peel=usePeel();
  const list=useRef<HTMLDivElement>(null);
  const keyed=progress.entries.map((entry,index)=>({entry,key:entryKey(entry,index)}));
  const shown=(peel.active?keyed.filter(({key})=>peel.admitted.has(key)):keyed).reverse();
  const places=useRef(new Map<string,number>());
  const seen=useRef(new Map<string,string>());
  useLayoutEffect(()=>{
    const node=list.current;if(!node)return;
    const rows=[...node.querySelectorAll<HTMLElement>('[data-entry-id]')];
    const motion=peel.active&&!reducedMotion();
    for(const row of rows){
      const key=row.dataset.entryId!,top=row.offsetTop,before=places.current.get(key);
      places.current.set(key,top);
      // Rows already in the list glide down to make room, with a small dip.
      if(motion&&before!==undefined&&Math.abs(before-top)>.5)row.animate([{translate:`0 ${before-top}px`},{translate:'0 2px',offset:.7},{translate:'0 0'}],{duration:460,easing:'cubic-bezier(.3,1.2,.5,1)'});
      if(!peel.active||!row.hasAttribute('data-landed'))continue;
      const entry=keyed.find(item=>item.key===key)?.entry;if(!entry)continue;
      const status=sorted(entry)?(entry.import_meta?.status==='review'?'review':'sorted'):'waiting';
      const before2=seen.current.get(key);seen.current.set(key,status);
      if(!motion||before2===status)continue;
      if(status!=='waiting'&&before2!==status)stamp(row);
      if(status==='review'&&before2!=='review')shake(row);
    }
  });
  return <div className="import-processing">
    <div ref={list} className="import-sorting-list" data-peel={peel.active||undefined} aria-label="仕分け結果">
      {!shown.length&&progress.phase==='reading'?null:shown.map(({entry,key})=><div className="import-sorted-entry" data-import-entry="" data-entry-id={key} data-landed={!peel.active||peel.landed.has(key)?'':undefined} data-classification={entry.import_meta?.status} data-rule={entry.import_meta?.rule_id?'':undefined} key={key}><ImportEntryLine entry={entry} settings={settings}/><span className="import-entry-edit" data-hidden="" aria-hidden="true"><Pencil size={16}/></span></div>)}
    </div>
  </div>;
}
