import { Camera, Check, ChevronDown, CreditCard, FileImage, Pencil, ScanLine, Sparkles, X } from 'lucide-react';
import type { CategoryAppearance, SharedCard, EntryDraft } from './domain';
import { categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import type { ImportProgress } from './statement-import-flow';

export function ImportSetup({cards,cardId,month,images,mode,demoEnabled,liveEnabled,onCard,onMode,onFiles,onRemove,onManual}:{
  cards:SharedCard[];cardId:string;month:string;images:{name:string;image:string}[];
  mode:'demo'|'live';demoEnabled:boolean;liveEnabled:boolean;
  onCard:(id:string)=>void;onMode:(mode:'demo'|'live')=>void;onFiles:(files:FileList|null)=>void;onRemove:(index:number)=>void;onManual:()=>void;
}) {
  const card=cards.find(item=>item.id===cardId);
  return <div className="import-setup">
    <div className="import-card-select"><CreditCard size={24} color={card?.color}/><label><span>取り込むカード</span><select aria-label="取り込むカード" value={cardId} onChange={event=>onCard(event.target.value)}>{cards.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><ChevronDown size={18}/></div>
    <div className="import-month"><span>引落月</span><strong>{Number(month.slice(0,4))}年{Number(month.slice(5))}月</strong></div>
    {demoEnabled&&<div className="import-mode" role="group" aria-label="読み取り方法"><button aria-pressed={mode==='live'} disabled={!liveEnabled} onClick={()=>onMode('live')}>画像を読み取る</button><button aria-pressed={mode==='demo'} onClick={()=>onMode('demo')}>デモで試す</button></div>}
    {mode==='demo'?<div className="import-demo-sample">
      <span className="import-demo-badge"><Sparkles size={14}/> デモ</span>
      <h3>仕分けを体験</h3><p>画像を用意せず、サンプル明細で試せます。</p>
      <div className="import-sample-paper" aria-hidden="true"><ReceiptLines/></div>
      <small>サンプル15件 · 実データは変更されません</small>
    </div>:<>
      <label className="import-upload"><span className="import-upload-icon"><Camera size={30}/></span><strong>{images.length?'画像を選び直す':'明細の画像を選ぶ'}</strong><span>スクリーンショットを最大3枚</span><small>JPEG・PNG・WebP / 1枚4MBまで</small><input aria-label="明細の画像" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={event=>{onFiles(event.target.files);event.target.value='';}}/></label>
      {images.length>0&&<div className="import-image-list">{images.map((item,index)=><div key={`${index}-${item.name}`}><img src={item.image} alt={`明細画像 ${index+1}`}/><span>{item.name}</span><button onClick={()=>onRemove(index)} aria-label={`明細画像 ${index+1}を外す`}><X size={16}/></button></div>)}</div>}
      <p className="import-hint">店名・日付・金額から、費目ごとにまとめます。</p>
    </>}
    <button className="import-manual" onClick={onManual}><Pencil size={17}/> 手入力で登録</button>
  </div>;
}

function ReceiptLines(){return <><FileImage size={22}/><div><span>スーパー</span><strong>¥3,980</strong></div><div><span>日用品</span><strong>¥1,760</strong></div><div><span>カフェ</span><strong>¥1,100</strong></div></>;}

export function ImportEntryLine({entry,settings}:{entry:EntryDraft;settings:CategoryAppearance[]}) {
  const appearance=categoryAppearance(entry.category,settings);
  return <><CategoryIcon name={appearance.icon} color={appearance.color} size={23}/><span className="import-entry-copy"><strong>{entry.title||'新しい明細'}</strong><small>{entry.spent_on||'利用日不明'}</small><span className="import-category-tag" style={{color:appearance.color}}>{entry.category}</span></span><b>¥{entry.amount.toLocaleString('ja-JP')}</b></>;
}

export function ImportPhaseStatus({progress}:{progress:ImportProgress}) {
  const reading=progress.phase==='reading';
  const checking=progress.phase==='checking';
  const title=reading?'明細を読み取り中':checking?'金額を確認中':progress.demo?'費目ごとに仕分け中':'明細を受信中';
  const phaseIndex=reading?0:checking?2:1;
  return <section className="import-phase-status" aria-label="取り込みの進行">
    <div className="import-phase-title" role="status" aria-live="polite"><span key={progress.phase} className="import-phase-title-content">{checking?<Check className="import-animated-check" size={20} aria-hidden="true"/>:<ScanLine size={20} aria-hidden="true"/>}<strong>{title}</strong></span>{progress.demo&&<small>デモ</small>}</div>
    <ol className="import-steps">{(progress.demo?['読み取り','仕分け','金額確認']:['読み取り','受信','金額確認']).map((label,index)=>{
      const state=index<phaseIndex?'done':index===phaseIndex?'current':'pending';
      const indeterminate=state==='current'&&(reading||progress.count===null);
      const fraction=state==='done'?1:state==='pending'?0:reading||progress.count===null?0:progress.count?Math.min(1,(checking?(progress.checkedCount??0):progress.entries.length)/progress.count):1;
      return <li key={label} data-state={state} data-indeterminate={indeterminate} aria-current={state==='current'?'step':undefined}><span className="import-step-marker" aria-hidden="true">{state==='done'?<Check className="import-animated-check" size={13}/>:index+1}</span><span>{label}</span><span className="import-step-track" aria-hidden="true"><i style={{transform:`scaleX(${fraction})`}}/></span></li>;
    })}</ol>
    <div className="import-phase-summary">{reading?<span className="import-working-line" aria-hidden="true"/>:<><span>{checking?'金額確認済み':progress.demo?'仕分け済み':'受信済み'} <b>{checking?(progress.checkedCount??0):progress.entries.length}</b>{progress.count===null?'件':` / ${progress.count}件`}</span><span className="import-phase-total"><small>利用合計</small><strong>¥{(checking?(progress.checkedTotal??0):progress.entries.reduce((sum,entry)=>sum+entry.amount,0)).toLocaleString('ja-JP')}</strong></span></>}</div>
  </section>;
}

export function ImportProcessing({progress,settings}:{progress:ImportProgress;settings:CategoryAppearance[]}) {
  const reading=progress.phase==='reading';
  return <div className="import-processing">
    <div className="import-sorting-list" aria-label="仕分け結果">
      {reading?<div className="import-skeleton" aria-hidden="true">{[0,1,2].map(index=><div key={index}><i/><span/><b/></div>)}</div>:progress.entries.map((entry,index)=>{
        return <div className="import-sorted-entry" data-import-entry="" key={index}><ImportEntryLine entry={entry} settings={settings}/></div>;
      })}
    </div>
  </div>;
}
