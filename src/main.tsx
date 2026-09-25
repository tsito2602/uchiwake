import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowLeft, ArrowRight, Camera, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, CreditCard, Home, ListFilter, Plus, ReceiptText, Settings, Trash2, X } from 'lucide-react';
import { billKinds, categories, categoryTotals, summary, type Bill, type BillKind, type Category, type Expense, type EntryDraft, type CardStatement, type State } from './domain';
import { FloatingDock, dockTabs, type DockTab } from './floating-dock';
import './styles.css';
import './kondo-style.css';

type Tab = DockTab;
type Editing = { type:'bill'; data:Partial<Bill> } | { type:'expense'; data:Partial<Expense>; image?:string; demo?:boolean };
type AiMode = 'demo'|'live';
const yen = (amount:number) => `¥${amount.toLocaleString('ja-JP')}`;
const monthText = (month:string) => `${Number(month.slice(0,4))}年${Number(month.slice(5))}月`;
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const bump = (month:string,diff:number) => { const [year,m]=month.split('-').map(Number); const date=new Date(Date.UTC(year,m-1+diff,1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`; };
async function api<T>(path:string,options?:RequestInit):Promise<T> {
  const response=await fetch(`/api${path}`,{...options,headers:{'Content-Type':'application/json',...options?.headers},cache:'no-store'});
  if (!response.ok) { const data=await response.json().catch(()=>({error:'通信に失敗しました'})) as {error?:string}; throw new Error(data.error||'通信に失敗しました'); }
  return response.json();
}
function App() {
  const [month,setMonth]=useState(today().slice(0,7));
  const [tab,setTab]=useState<Tab>('home');
  const [state,setState]=useState<State|null>(null);
  const [editing,setEditing]=useState<Editing|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [comment,setComment]=useState('');
  const [image,setImage]=useState('');
  const [fileName,setFileName]=useState('');
  const [preview,setPreview]=useState<string|null>(null);
  const [aiMode,setAiMode]=useState<AiMode>('demo');
  const [scenario,setScenario]=useState<'supermarket'|'restaurant'|'unclear'>('supermarket');
  const [screenshots,setScreenshots]=useState<{name:string;image:string}[]>([]);
  const [draft,setDraft]=useState<{due_month:string;title:string;confirmed_total:number;entries:EntryDraft[];demo:boolean}|null>(null);
  const [totalChecked,setTotalChecked]=useState(false);
  async function load() { try { setState(await api<State>(`/state?month=${month}`)); setNotice(''); } catch(e) { setNotice(String(e instanceof Error?e.message:e)); } }
  useEffect(()=>{ setState(null); setComment(''); void load(); },[month]);
  const totals=useMemo(()=>summary([...(state?.bills||[]).filter(b=>b.kind!=='card'),...(state?.statements||[]).map(s=>({amount:s.confirmed_total}))]),[state]);
  const breakdown=useMemo(()=>categoryTotals(state?.entries||[]),[state]);
  const spending=(state?.entries||[]).reduce((a,b)=>a+b.amount,0);
  const categoryMagnitude=breakdown.reduce((sum,item)=>sum+Math.abs(item.amount),0);
  const rowsTotal=draft?.entries.reduce((sum,row)=>sum+Number(row.amount||0),0)||0;
  async function save() {
    if (!editing) return;
    setBusy(true);setNotice('');
    try {
      const isBill=editing.type==='bill';
      const path=isBill?'/bills':'/expenses';
      const id=editing.data.id;
      const targetMonth=isBill?editing.data.due_month:editing.data.spent_on?.slice(0,7);
      await api(path+(id?`/${id}`:''),{method:id?'PUT':'POST',body:JSON.stringify(isBill?editing.data:{...editing.data,image:editing.image})});
      setEditing(null);setImage('');setFileName('');
      if (targetMonth && targetMonth!==month) setMonth(targetMonth);
      else await load();
    } catch(e) {setNotice(String(e instanceof Error?e.message:e));}
    finally {setBusy(false);}
  }
  async function remove(type:'bills'|'expenses',id:string) {
    if (!window.confirm('この項目を削除しますか？')) return;
    try { await api(`/${type}/${id}`,{method:'DELETE'}); await load(); } catch(e) {setNotice(String(e instanceof Error?e.message:e));}
  }
  function readFile(file?:File) {
    if (!file) return;
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4_000_000) {setNotice('JPEG・PNG・WebPの4MB以下の画像を選んでください');return;}
    setFileName(file.name);setNotice('');
    const reader=new FileReader();reader.onload=()=>setImage(String(reader.result));reader.readAsDataURL(file);
  }
  function useSampleImage() {
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=800;
    const ctx=canvas.getContext('2d');if (!ctx) return;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,640,800);
    ctx.fillStyle='#222';ctx.font='bold 38px sans-serif';ctx.fillText('uchiwake DEMO',70,125);
    ctx.font='24px sans-serif';ctx.fillText('サンプル画像 / SAMPLE RECEIPT',70,195);
    ctx.fillText('画像の文字はAIで読み取りません',70,280);
    ctx.fillText('日付・金額・費目は選んだ例から返します',70,330);
    ctx.fillText('--------------------------------',70,430);
    ctx.font='bold 28px sans-serif';ctx.fillText('TEST ONLY',70,510);
    setImage(canvas.toDataURL('image/png'));setFileName('サンプル画像');setNotice('');
  }
  async function analyze() {
    if (!image) return;
    setBusy(true);setNotice('');
    try {
      const result=await api<{title:string;amount:number;spent_on:string;category:Category;note?:string;demo?:boolean}>('/receipt/analyze',{method:'POST',body:JSON.stringify({image,mode:aiMode,scenario})});
      setEditing({type:'expense',data:{...result,spent_on:result.spent_on||today(),note:result.note||''},image,demo:result.demo});
    } catch(e) {setNotice(String(e instanceof Error?e.message:e));}
    finally {setBusy(false);}
  }
  async function makeComment() {
    setBusy(true);try {const response=await api<{comment:string}>('/report/comment',{method:'POST',body:JSON.stringify({month,mode:aiMode})});setComment(response.comment);}catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function chooseScreenshots(files:FileList|null) {
    if (!files?.length) return;
    const selected=Array.from(files);
    if (selected.length>3 || selected.some(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>4_000_000)) {setNotice('JPEG・PNG・WebPの4MB以下の画像を最大3枚選んでください');return;}
    try {
      const loaded=await Promise.all(selected.map(file=>new Promise<{name:string;image:string}>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,image:String(reader.result)});reader.onerror=()=>reject(new Error('画像を読み込めませんでした'));reader.readAsDataURL(file);}))); 
      setScreenshots(loaded);setDraft(null);setTotalChecked(false);setNotice('');
    } catch(e){setNotice(String(e instanceof Error?e.message:e));}
  }
  function sampleStatement() {
    const canvas=document.createElement('canvas');canvas.width=700;canvas.height=480;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,700,480);ctx.fillStyle='#222';ctx.font='bold 34px sans-serif';ctx.fillText('uchiwake DEMO',50,90);
    ctx.font='24px sans-serif';ctx.fillText('共有カード明細のサンプル',50,160);ctx.fillText('画像は実際には解析されません',50,230);
    setScreenshots([{name:'サンプル明細',image:canvas.toDataURL('image/png')}]);setDraft(null);setTotalChecked(false);setNotice('');
  }
  async function analyzeStatement() {
    if(!screenshots.length)return;
    setBusy(true);setNotice('');
    try {
      const result=await api<{confirmed_total:number;entries:EntryDraft[];demo?:boolean}>('/statement/analyze',{method:'POST',body:JSON.stringify({images:screenshots.map(item=>item.image),mode:aiMode})});
      const sum=result.entries.reduce((a,b)=>a+b.amount,0);
      setDraft({due_month:month,title:`${monthText(month)}の共有カード`,confirmed_total:result.confirmed_total||sum,entries:result.entries,demo:!!result.demo});setTotalChecked(false);
      if(!result.entries.length)setNotice('利用行を読み取れませんでした。明細行を手入力してください。');
    }catch(e){setNotice(String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  }
  function updateDraftRow(index:number,change:Partial<EntryDraft>) {
    setDraft(current=>current?{...current,entries:current.entries.map((row,i)=>i===index?{...row,...change}:row)}:current);setTotalChecked(false);
  }
  async function saveStatement() {
    if(!draft || !totalChecked || draft.confirmed_total!==rowsTotal)return;
    setBusy(true);setNotice('');
    try {
      await api('/statements',{method:'POST',body:JSON.stringify({due_month:draft.due_month,title:draft.title,confirmed_total:draft.confirmed_total,entries:draft.entries})});
      const targetMonth=draft.due_month;setDraft(null);setScreenshots([]);setTotalChecked(false);setTab('home');
      if(targetMonth!==month)setMonth(targetMonth);else await load();
    }catch(e){setNotice(String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  }
  async function removeStatement(id:string) {
    if(!window.confirm('このカード明細と全ての利用行を削除しますか？'))return;
    try{await api(`/statements/${id}`,{method:'DELETE'});await load();}catch(e){setNotice(String(e instanceof Error?e.message:e));}
  }
  async function changeCategory(id:string,category:Category) {
    try{await api(`/card-entries/${id}/category`,{method:'PUT',body:JSON.stringify({category})});await load();}catch(e){setNotice(String(e instanceof Error?e.message:e));}
  }
  const addBill=()=>setEditing({type:'bill',data:{due_month:month,kind:'rent',title:'家賃',amount:0,note:''}});
  const addExpense=()=>setEditing({type:'expense',data:{spent_on:today(),category:'その他・要確認',title:'',amount:0,note:''}});
  const selectTab=(value:Tab)=>{setTab(value);setNotice('');window.scrollTo({top:0,behavior:'smooth'});};
  const canSaveDraft=!!draft&&totalChecked&&draft.entries.length>0&&rowsTotal===draft.confirmed_total&&rowsTotal>0&&!!draft.title.trim()&&draft.entries.every(e=>!!e.title.trim()&&!!e.amount);
  const dockContext=editing?{label:'項目の編集',onBack:()=>setEditing(null),actionLabel:busy?'保存中…':'保存する',onAction:()=>void save(),disabled:busy||!editing.data.title||!editing.data.amount}:tab==='import'&&draft?{label:'カード明細の確認',onBack:()=>setDraft(null),actionLabel:busy?'保存中…':'保存して計算',onAction:()=>void saveStatement(),disabled:busy||!canSaveDraft}:undefined;
  const dockAdd=!dockContext&&tab==='home'?{label:'家賃を追加',onClick:addBill}:!dockContext&&tab==='ledger'?{label:'カード明細を取り込む',onClick:()=>selectTab('import')}:undefined;
  return <>
    <header className="topbar"><div className="topbar-inner"><div className="brand"><span className="brand-mark">u.</span><span>uchiwake</span></div><span className="topbar-right"><span className="online-dot"/> ふたりの家計</span></div><nav className="desktop-tabs" aria-label="メインメニュー">{dockTabs.map(item=><button key={item.key} aria-current={tab===item.key?'page':undefined} onClick={()=>selectTab(item.key)}><item.icon size={18} strokeWidth={1.7}/>{item.label}</button>)}</nav></header>
    <main className="shell">
      <div className="page-top"><div><div className="eyebrow">SHARED HOUSEHOLD / 家計の内訳</div><h1>{({home:'ホーム',ledger:'家計簿',import:'取り込み',report:'レポート',settings:'設定'} as const)[tab]}</h1></div><div className="month-switch"><button aria-label="前月" onClick={()=>setMonth(bump(month,-1))}><ChevronLeft size={18}/></button><span>{monthText(month)}</span><button aria-label="翌月" onClick={()=>setMonth(bump(month,1))}><ChevronRight size={18}/></button></div></div>
      {notice&&<div className="notice" role="alert"><span>{notice}</span><button aria-label="閉じる" onClick={()=>setNotice('')}><X size={16}/></button></div>}
      {!state?<div className="empty loading">{notice?'データを表示できませんでした。':'データを読み込んでいます…'}{notice&&<div><button className="secondary" onClick={()=>void load()}>再読み込み</button></div>}</div>:<>
      {tab==='home'&&<>
        <section className="hero"><div className="eyebrow light">TRANSFER GUIDE / 今月の入金額</div><div className="hero-main"><span className="hero-prefix">ひとりあたり</span><div className="hero-money">{yen(Math.floor(totals.total/2))}<span>{totals.remainder?` 〜 ${yen(totals.perPerson)}`:''}</span></div><p>共有口座へ入金する目安</p></div><div className="hero-foot"><span>引落予定の合計 <strong>{yen(totals.total)}</strong></span><span>{totals.remainder?'端数の1円はどちらかが多く入金':'ふたりで半分ずつ'}</span></div></section>
        <section className="section"><div className="section-head"><div><div className="eyebrow">WITHDRAWALS</div><h2>今月の引落予定</h2></div><button className="text-action" onClick={addBill}><Plus size={16}/> 家賃を追加</button></div>
          {state.statements.length||state.bills.some(b=>b.kind!=='card')?<div className="list">{state.statements.map(s=><StatementRow key={s.id} statement={s} onOpen={()=>setTab('ledger')}/>)}{state.bills.filter(b=>b.kind!=='card').map(b=><BillRow key={b.id} bill={b} onEdit={()=>setEditing({type:'bill',data:b})}/>)}</div>:<Empty text="共有カードの明細を取り込み、家賃を追加すると入金額が計算されます。" onClick={()=>setTab('import')} label="カード明細を取り込む"/>}
          {(state.statements.length>0||state.bills.some(b=>b.kind!=='card'))&&<div className="list-total"><span>カード明細＋家賃など</span><strong>{yen(totals.total)}</strong></div>}
          {state.bills.filter(b=>b.kind==='card').map(b=><div className="legacy-bill" key={b.id}>以前の手入力カード請求「{b.title}」は二重計上を避けるため除外中 <button className="text-action" onClick={()=>setEditing({type:'bill',data:b})}>編集・削除</button></div>)}
        </section>
        <section className="section"><div className="section-head"><div><div className="eyebrow">CARD DETAILS</div><h2>共有カードの内訳</h2></div><button className="text-action" onClick={()=>setTab('ledger')}>明細を見る <ArrowRight size={16}/></button></div><div className="mini-summary"><div><span>引落月のカード利用額</span><strong>{yen(spending)}</strong></div><p>カード明細の各行を仕分けた合計です。上の入金額には一度だけ計上しています。</p></div></section>
      </>}
      {tab==='ledger'&&<><div className="callout"><ReceiptText size={20}/><div><strong>{monthText(month)}の共有カード {yen(spending)}</strong><p>カード引落月に紐づく明細です。費目は保存後も変更できます。</p></div></div>{state.statements.length?state.statements.map(s=><section className="section" key={s.id}><div className="section-head"><div><div className="eyebrow">CARD STATEMENT</div><h2>{s.title}</h2><p className="subtle">引落額 {yen(s.confirmed_total)}</p></div><button className="delete" onClick={()=>void removeStatement(s.id)}><Trash2 size={16}/> 明細ごと削除</button></div><div className="list">{state.entries.filter(e=>e.statement_id===s.id).map(e=><div className="row" key={e.id}><div className="row-symbol"><ListFilter size={19}/></div><div className="row-content"><strong>{e.title}</strong><small>{e.spent_on||'利用日不明'}</small><select aria-label={`${e.title}の費目`} value={e.category} onChange={event=>void changeCategory(e.id,event.target.value as Category)}>{categories.map(category=><option key={category}>{category}</option>)}</select></div><strong className="row-money">{yen(e.amount)}</strong></div>)}</div></section>):<Empty text="共有カードの明細はまだありません。スクリーンショットを取り込んでください。" onClick={()=>setTab('import')} label="明細を取り込む"/>}{state.expenses.length>0&&<section className="section"><h2>以前のレシート記録</h2><p className="subtle">カード明細との二重計上を避けるため、入金額と費目別集計には含めません。</p><div className="list">{state.expenses.map(e=><div className="row" key={e.id}><div className="row-content"><strong>{e.title}</strong><small>{e.spent_on} · {e.category}</small></div><strong className="row-money">{yen(e.amount)}</strong><button className="row-edit" onClick={()=>setEditing({type:'expense',data:e})}>編集</button></div>)}</div></section>}</>}
      {tab==='import'&&<>
        <div className="callout"><CreditCard size={21}/><div><strong>共有カードの明細を取り込む</strong><p>同じ請求のスクリーンショットを最大3枚まとめて読み込み、利用行を確認して引落額を確定します。</p></div></div>
        <ModeSwitch mode={aiMode} demoEnabled={state.demo_enabled} liveEnabled={state.ai_enabled} onChange={value=>{setAiMode(value);setComment('');setNotice('');}}/>
        <section className="section"><div className="eyebrow">SCAN A CARD STATEMENT</div><h2>明細画像を選ぶ</h2>
          <label className="upload"><Camera size={30}/><strong>{screenshots.length?screenshots.map(item=>item.name).join('・'):'スクリーンショットを選択'}</strong><span>JPEG / PNG / WebP · 1枚4MB以下 · 最大3枚</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>{void chooseScreenshots(e.target.files);e.target.value='';}}/></label>
          {aiMode==='demo'&&<button className="sample-button" onClick={sampleStatement}>画像を用意せずサンプル明細で試す <ArrowRight size={15}/></button>}
          {screenshots.length>0&&<div className="statement-images">{screenshots.map((item,i)=><img className="image-thumb" src={item.image} alt={`明細画像 ${i+1}`} key={i}/>)}</div>}
          <div className="form-actions"><button className="primary" disabled={busy||!screenshots.length||(aiMode==='live'&&!state.ai_enabled)||(aiMode==='demo'&&!state.demo_enabled)} onClick={()=>void analyzeStatement()}>{busy?'読取中…':aiMode==='demo'?'無料でデモ仕分け':'実際のAIで仕分ける'} <ArrowRight size={16}/></button><button className="secondary" onClick={()=>{setDraft({due_month:month,title:`${monthText(month)}の共有カード`,confirmed_total:0,entries:[{spent_on:'',title:'',amount:0,category:'その他・要確認'}],demo:false});setTotalChecked(false);}}>明細行を手入力</button></div>
          {aiMode==='demo'&&<p className="subtle">デモは画像を解析せず固定の明細行を返します。実際の画像は保存しません。</p>}
        </section>
        {draft&&<section className="section"><div className="eyebrow">REVIEW BEFORE SAVING</div><h2>仕分けと引落額を確認</h2>{draft.demo&&<p className="demo-warning">デモの固定値です。選んだ画像は読み取っていません。</p>}
          <div className="statement-fields"><Field label="引落月"><input type="month" value={draft.due_month} onChange={e=>{setDraft({...draft,due_month:e.target.value});setTotalChecked(false);}}/></Field><Field label="名称"><input value={draft.title} maxLength={100} onChange={e=>setDraft({...draft,title:e.target.value})}/></Field></div>
          <p className="subtle">AIが読み違えた行・重複行はここで修正または削除してください。返金はマイナス額で入力できます。</p>
          <div className="draft-entries">{draft.entries.map((entry,i)=><div className="draft-entry" key={i}><span className="entry-number">{i+1}</span><Field label="利用日（不明なら空欄）"><input type="date" value={entry.spent_on} onChange={e=>updateDraftRow(i,{spent_on:e.target.value})}/></Field><Field label="店名・内容"><input value={entry.title} maxLength={100} onChange={e=>updateDraftRow(i,{title:e.target.value})}/></Field><Field label="費目"><select value={entry.category} onChange={e=>updateDraftRow(i,{category:e.target.value as Category})}>{categories.map(category=><option key={category}>{category}</option>)}</select></Field><Field label="金額（円）"><input type="number" inputMode="numeric" step="1" value={entry.amount||''} onChange={e=>updateDraftRow(i,{amount:Number(e.target.value)})}/></Field><button className="delete" onClick={()=>{setDraft({...draft,entries:draft.entries.filter((_,j)=>j!==i)});setTotalChecked(false);}}><Trash2 size={16}/> 行を削除</button></div>)}</div>
          <button className="secondary" disabled={draft.entries.length>=50} onClick={()=>{setDraft({...draft,entries:[...draft.entries,{spent_on:'',title:'',amount:0,category:'その他・要確認'}]});setTotalChecked(false);}}><Plus size={16}/> 明細行を追加</button>
          <div className="statement-reconcile"><span>明細行の合計 <strong>{yen(rowsTotal)}</strong></span><Field label="実際のカード引落額（円）"><input type="number" min="1" step="1" inputMode="numeric" value={draft.confirmed_total||''} onChange={e=>{setDraft({...draft,confirmed_total:Number(e.target.value)});setTotalChecked(false);}}/></Field></div>
          {rowsTotal!==draft.confirmed_total&&<p className="notice">明細行の合計とカード引落額が一致しません。未入力・重複・返金を確認してください。</p>}
          <label className="confirm-line"><input type="checkbox" checked={totalChecked} onChange={e=>setTotalChecked(e.target.checked)}/> 元のカード明細と引落額・すべての行を照合した</label>
          <div className="form-actions draft-save"><button className="primary" disabled={busy||!canSaveDraft} onClick={()=>void saveStatement()}>{busy?'保存中…':'明細を保存して入金額を計算'} <Check size={17}/></button></div>
        </section>}
      </>}
      {tab==='report'&&<>
        <div className="report-total"><span>引落月の共有カード</span><strong>{yen(spending)}</strong><p>{monthText(month)}に引き落とすカード明細の内訳</p></div>
        <section className="section"><div className="section-head"><div><div className="eyebrow">CATEGORIES</div><h2>費目別の内訳</h2></div><ChartNoAxesCombined size={21} color="#777"/></div>{breakdown.length?<div className="bars">{breakdown.sort((a,b)=>b.amount-a.amount).map(item=><div className="bar-row" key={item.category}><div className="bar-label"><span>{item.category}</span><strong>{yen(item.amount)}</strong></div><div className="bar-track"><span style={{width:`${categoryMagnitude?Math.abs(item.amount)/categoryMagnitude*100:0}%`}}/></div></div>)}</div>:<div className="empty">この月の明細を登録すると内訳が表示されます。</div>}</section>
        <section className="section"><div className="section-head"><div><div className="eyebrow">MONTHLY NOTE</div><h2>今月のひとこと</h2></div></div>
          <ModeSwitch mode={aiMode} demoEnabled={state.demo_enabled} liveEnabled={state.ai_enabled} onChange={value=>{setAiMode(value);setComment('');}}/>
          <div className="comment"><p>{comment||'費目別の金額から、今月の傾向を短くまとめます。'}</p><button className="secondary" disabled={busy||(aiMode==='live'&&!state.ai_enabled)||(aiMode==='demo'&&!state.demo_enabled)||!breakdown.length} onClick={()=>void makeComment()}>{busy?'作成中…':aiMode==='demo'?'無料でデモコメントを作成':'実際のAIでコメントを作成'} <ArrowRight size={15}/></button></div>
        </section>
      </>}
      {tab==='settings'&&<><section className="section"><div className="eyebrow">HOW IT WORKS</div><h2>入金額の考え方</h2><div className="steps"><div><span>01</span><p>共有カードの明細画像をまとめて読み込み、行を仕分けて請求の引落額と照合</p></div><div><span>02</span><p>銀行引落の家賃を追加</p></div><div><span>03</span><p>カード引落額と家賃などを合計して2人で折半。カード明細は二重に加算しません</p></div></div></section><section className="section"><div className="eyebrow">ABOUT</div><h2>uchiwake</h2><p className="subtle">MVP / ステージング環境。画像から抽出した行・請求額は、元の明細と照合してから保存してください。画像自体は保存しません。</p></section></>}
      </>}
    </main>
    <FloatingDock tab={tab} onSelect={selectTab} add={dockAdd} context={dockContext}/>
    {editing&&<div className="modal-backdrop" onClick={()=>setEditing(null)}><div className="modal" role="dialog" aria-modal="true" aria-label={editing.type==='bill'?'引落予定の編集':'支出の編集'} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">{editing.type==='bill'?'WITHDRAWAL':'TRANSACTION'}</div><h2>{editing.data.id?'編集する':editing.type==='bill'?'引落予定を追加':'支出を追加'}</h2></div><button className="icon-button" aria-label="閉じる" onClick={()=>setEditing(null)}><X size={20}/></button></div><div className="form">
      {editing.type==='bill'?<>
        <Field label="引落月"><input type="month" value={editing.data.due_month||month} onChange={e=>setEditing({...editing,data:{...editing.data,due_month:e.target.value}})}/></Field>
        <Field label="種類"><select value={editing.data.kind||'rent'} onChange={e=>setEditing({...editing,data:{...editing.data,kind:e.target.value as BillKind}})}>{Object.entries(billKinds).filter(([key])=>key!=='card'||editing.data.kind==='card').map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
        <Field label="名称"><input placeholder="例：9月分のカード請求" value={editing.data.title||''} maxLength={100} onChange={e=>setEditing({...editing,data:{...editing.data,title:e.target.value}})}/></Field>
        <Field label="引落額（円）"><input type="number" inputMode="numeric" min="1" step="1" value={editing.data.amount||''} onChange={e=>setEditing({...editing,data:{...editing.data,amount:Number(e.target.value)}})}/></Field>
        <Field label="メモ（任意）"><input value={editing.data.note||''} maxLength={500} onChange={e=>setEditing({...editing,data:{...editing.data,note:e.target.value}})}/></Field>
      </>:<>
        <Field label="利用日"><input type="date" value={editing.data.spent_on||today()} onChange={e=>setEditing({...editing,data:{...editing.data,spent_on:e.target.value}})}/></Field>
        <Field label="お店・内容"><input placeholder="例：スーパー" value={editing.data.title||''} maxLength={100} onChange={e=>setEditing({...editing,data:{...editing.data,title:e.target.value}})}/></Field>
        <Field label="金額（円）"><input type="number" inputMode="numeric" min="1" step="1" value={editing.data.amount||''} onChange={e=>setEditing({...editing,data:{...editing.data,amount:Number(e.target.value)}})}/></Field>
        <Field label="費目"><select value={editing.data.category||'その他・要確認'} onChange={e=>setEditing({...editing,data:{...editing.data,category:e.target.value as Category}})}>{categories.map(category=><option key={category}>{category}</option>)}</select></Field>
        <Field label="メモ（任意）"><input value={editing.data.note||''} maxLength={500} onChange={e=>setEditing({...editing,data:{...editing.data,note:e.target.value}})}/></Field>
        {editing.data.receipt_key&&<button className="text-action" onClick={async()=>{const response=await fetch(`/api/expenses/${editing.data.id}/receipt`);if(response.ok){const url=URL.createObjectURL(await response.blob());setPreview(url);}else setNotice('画像を開けませんでした');}}>保存した画像を見る <ArrowRight size={15}/></button>}
        {editing.image&&<p className={editing.demo?'demo-warning':'subtle'}>{editing.demo?'デモの値です。画像の内容は読み取っていません。保存する前に内容を確認してください。':'画像も一緒に保存します。金額と日付を確認してください。'}</p>}
      </>}
      <div className="form-actions">{editing.data.id&&<button className="delete" onClick={()=>{const {type,data}=editing;setEditing(null);void remove(type==='bill'?'bills':'expenses',data.id!);}}><Trash2 size={17}/> 削除</button>}<button className="primary" disabled={busy||!editing.data.title||!editing.data.amount} onClick={()=>void save()}>{busy?'保存中…':'保存する'} <Check size={17}/></button></div>
    </div></div></div>}
    {preview&&<div className="preview" onClick={()=>{URL.revokeObjectURL(preview);setPreview(null);}}><button aria-label="閉じる"><X size={22}/></button><img src={preview} alt="保存したレシート"/></div>}
  </>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>}
function ModeSwitch({mode,demoEnabled,liveEnabled,onChange}:{mode:AiMode;demoEnabled:boolean;liveEnabled:boolean;onChange:(value:AiMode)=>void}) {
  return <div className="mode-panel"><div className="eyebrow">AI MODE / 動作確認</div><div className="mode-options" role="group" aria-label="AIの動作モード"><button className={mode==='demo'?'selected':''} disabled={!demoEnabled} aria-pressed={mode==='demo'} onClick={()=>onChange('demo')}>デモ・無料</button><button className={mode==='live'?'selected':''} disabled={!liveEnabled} aria-pressed={mode==='live'} onClick={()=>onChange('live')}>実際のAI・料金あり</button></div><p>{mode==='demo'?'サンプル結果を返します。OpenAI APIを呼びません。':liveEnabled?'OpenAI APIに送信します。利用料金が発生します。':'APIキーの設定後に選択できます。'}</p></div>;
}
function Empty({text,onClick,label}:{text:string;onClick:()=>void;label:string}) {return <div className="empty"><p>{text}</p><button className="secondary" onClick={onClick}><Plus size={16}/>{label}</button></div>}
function BillRow({bill,onEdit}:{bill:Bill;onEdit:()=>void}) {return <div className="row"><div className="row-symbol">{bill.kind==='card'?<CreditCard size={19}/>:bill.kind==='rent'?<Home size={19}/>:<ArrowDownLeft size={19}/>}</div><div className="row-content"><strong>{bill.title}</strong><small>{billKinds[bill.kind]}{bill.note?` · ${bill.note}`:''}</small></div><strong className="row-money">{yen(bill.amount)}</strong><button className="row-edit" onClick={onEdit} aria-label={`${bill.title}を編集`}>編集</button></div>}
function StatementRow({statement,onOpen}:{statement:CardStatement;onOpen:()=>void}) {return <div className="row"><div className="row-symbol"><CreditCard size={19}/></div><div className="row-content"><strong>{statement.title}</strong><small>共有カード明細 · {statement.due_month}</small></div><strong className="row-money">{yen(statement.confirmed_total)}</strong><button className="row-edit" onClick={onOpen}>内訳</button></div>}
createRoot(document.getElementById('root')!).render(<App/>);
