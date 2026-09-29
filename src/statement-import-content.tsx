import { useEffect, useState } from 'react';
import { displayColor } from './display-color';
import { NativeMonthPicker } from './native-month-picker';
import { Check, ChevronDown, CreditCard, FileImage, FileText, Files, Table2, Plus, Pencil, ScanLine, Sparkles, X } from 'lucide-react';
import type { CategoryAppearance, SharedCard, EntryDraft } from './domain';
import { categoryAppearance } from './category-appearance';
import { CategoryIcon } from './category-icon';
import type { ImportProgress } from './statement-import-flow';
import { ImportThinking } from './import-thinking';
import { statementFileAccept, statementFileSize, type StatementFile } from './statement-files';

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
  return <><CategoryIcon name={appearance.icon} color={appearance.color} size={23}/><span className="import-entry-copy"><strong>{entry.title||'新しい明細'}</strong><small>{entry.spent_on||'利用日不明'}</small><span className="import-category-tag" style={{color:displayColor(appearance.color)}}>{label}</span></span><b>¥{entry.amount.toLocaleString('ja-JP')}</b></>;
}

export function ImportPhaseStatus({progress}:{progress:ImportProgress}) {
  const reading=progress.phase==='reading';
  const checking=progress.phase==='checking';
  const parallel=reading&&progress.entries.length>0;
  const title=progress.activity?.rechecking?'明細を再確認中':parallel?'読み取りと仕分け中':reading?'明細を読み取り中':checking?'金額を確認中':'費目ごとに仕分け中';
  const classified=progress.entries.filter(entry=>!entry.import_meta||entry.import_meta.status==='classified'||entry.import_meta.status==='review').length;
  const sortingDone=checking||(!reading&&progress.count!==null&&classified===progress.count);
  const tasks=[
    {label:'読み取り',icon:FileText,state:reading?'current':'done',fraction:reading?null:1,description:reading?`${progress.entries.length}件を受信`:'完了'},
    {label:'仕分け',icon:Sparkles,state:sortingDone?'done':(progress.entries.length>0||!reading)?'current':'pending',fraction:sortingDone?1:progress.count===null?null:progress.count?Math.min(1,classified/progress.count):0,description:sortingDone?'完了':`${classified}件完了`}
  ];
  const detail=progress.activity?.text??(reading&&progress.demo?'サンプル明細を準備中…':progress.reasoning??(checking?'明細の金額を合計しています…':reading?undefined:`仕分け ${classified}件完了`));
  return <section className="import-phase-status" aria-label="取り込みの進行">
    <div className="import-phase-title" role="status" aria-live="polite"><span key={progress.phase} className="import-phase-title-content">{checking?<Check className="import-animated-check" size={20} aria-hidden="true"/>:<ScanLine size={20} aria-hidden="true"/>}<strong>{title}</strong></span>{progress.demo&&<small>デモ</small>}</div>
    <ul className="import-tasks" aria-label="読み取りと仕分けの並行処理">{tasks.map(({label,icon:Icon,state,fraction,description})=><li key={label} data-state={state} data-indeterminate={state==='current'&&fraction===null}>
      <span className="import-task-marker" aria-hidden="true">{state==='done'?<Check className="import-animated-check" size={13}/>:<Icon size={13}/>}</span><span>{label}</span><small>{state==='pending'?'待機中':description}</small>
      <span className="import-task-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state==='pending'?0:fraction===null?undefined:Math.round(fraction*100)} aria-valuetext={state==='pending'?'読み取れた行から開始':description}><i style={{transform:`scaleX(${fraction??0})`}}/></span>
    </li>)}</ul>
    <div className="import-verification" data-active={checking}><Check size={14} aria-hidden="true"/><span>金額確認</span><small>{checking?'照合中':'読み取り・仕分けの完了後'}</small></div>
    <div className="import-live-status"><ImportThinking text={detail}/><ImportElapsed/></div>
    {(!reading||progress.entries.length>0)&&<div className="import-phase-summary"><span>{reading?'読み取り済み':checking?'金額確認済み':'仕分け済み'} <b>{reading?progress.entries.length:checking?(progress.checkedCount??0):classified}</b>{progress.count===null?'件':` / ${progress.count}件`}</span><span className="import-phase-total"><small>利用合計</small><strong>¥{(checking?(progress.checkedTotal??0):progress.entries.reduce((sum,entry)=>sum+entry.amount,0)).toLocaleString('ja-JP')}</strong></span></div>}
  </section>;
}

function ImportElapsed() {
  const [started]=useState(()=>Date.now());
  const [seconds,setSeconds]=useState(0);
  useEffect(()=>{
    const timer=window.setInterval(()=>setSeconds(Math.max(0,Math.floor((Date.now()-started)/1000))),1000);
    return()=>window.clearInterval(timer);
  },[started]);
  return <span className="import-elapsed" aria-label={`経過時間 ${seconds}秒`}>{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</span>;
}

export function ImportProcessing({progress,settings}:{progress:ImportProgress;settings:CategoryAppearance[]}) {
  const reading=progress.phase==='reading';
  return <div className="import-processing">
    <div className="import-sorting-list" aria-label="仕分け結果">
      {reading&&!progress.entries.length?<div className="import-skeleton" aria-hidden="true">{[0,1,2].map(index=><div key={index}><i/><span/><b/></div>)}</div>:progress.entries.map((entry,index)=>{
        return <div className="import-sorted-entry" data-import-entry="" data-classification={entry.import_meta?.status} key={entry.import_meta?.id??index}><ImportEntryLine entry={entry} settings={settings}/></div>;
      })}
    </div>
  </div>;
}
