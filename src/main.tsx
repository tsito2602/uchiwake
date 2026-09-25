import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowLeft, ArrowRight, Camera, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, CreditCard, Home, ListFilter, Plus, ReceiptText, Settings, Trash2, X } from 'lucide-react';
import { billKinds, categories, categoryTotals, summary, type Bill, type BillKind, type Category, type Expense, type State } from './domain';
import './styles.css';

type Tab = 'home'|'ledger'|'import'|'report'|'settings';
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
  async function load() { try { setState(await api<State>(`/state?month=${month}`)); setNotice(''); } catch(e) { setNotice(String(e instanceof Error?e.message:e)); } }
  useEffect(()=>{ setState(null); setComment(''); void load(); },[month]);
  const totals=useMemo(()=>summary(state?.bills||[]),[state]);
  const breakdown=useMemo(()=>categoryTotals(state?.expenses||[]),[state]);
  const spending=(state?.expenses||[]).reduce((a,b)=>a+b.amount,0);
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
  const addBill=()=>setEditing({type:'bill',data:{due_month:month,kind:'card',title:'',amount:0,note:''}});
  const addExpense=()=>setEditing({type:'expense',data:{spent_on:today(),category:'その他・要確認',title:'',amount:0,note:''}});
  return <>
    <header className="topbar"><div className="topbar-inner"><div className="brand"><span className="brand-mark">u.</span><span>uchiwake</span></div><span className="topbar-right"><span className="online-dot"/> ふたりの家計</span></div></header>
    <main className="shell">
      <div className="page-top"><div><div className="eyebrow">SHARED HOUSEHOLD / 家計の内訳</div><h1>{({home:'ホーム',ledger:'家計簿',import:'取り込み',report:'レポート',settings:'設定'} as const)[tab]}</h1></div><div className="month-switch"><button aria-label="前月" onClick={()=>setMonth(bump(month,-1))}><ChevronLeft size={18}/></button><span>{monthText(month)}</span><button aria-label="翌月" onClick={()=>setMonth(bump(month,1))}><ChevronRight size={18}/></button></div></div>
      {notice&&<div className="notice" role="alert"><span>{notice}</span><button aria-label="閉じる" onClick={()=>setNotice('')}><X size={16}/></button></div>}
      {!state?<div className="empty loading">{notice?'データを表示できませんでした。':'データを読み込んでいます…'}{notice&&<div><button className="secondary" onClick={()=>void load()}>再読み込み</button></div>}</div>:<>
      {tab==='home'&&<>
        <section className="hero"><div className="eyebrow light">TRANSFER GUIDE / 今月の入金額</div><div className="hero-main"><span className="hero-prefix">ひとりあたり</span><div className="hero-money">{yen(Math.floor(totals.total/2))}<span>{totals.remainder?` 〜 ${yen(totals.perPerson)}`:''}</span></div><p>共有口座へ入金する目安</p></div><div className="hero-foot"><span>引落予定の合計 <strong>{yen(totals.total)}</strong></span><span>{totals.remainder?'端数の1円はどちらかが多く入金':'ふたりで半分ずつ'}</span></div></section>
        <section className="section"><div className="section-head"><div><div className="eyebrow">WITHDRAWALS</div><h2>今月の引落予定</h2></div><button className="text-action" onClick={addBill}><Plus size={16}/> 追加</button></div>
          {state.bills.length? <div className="list">{state.bills.map(b=><BillRow key={b.id} bill={b} onEdit={()=>setEditing({type:'bill',data:b})}/>)}</div>:<Empty text="引落予定を追加すると、入金額が計算されます。" onClick={addBill} label="引落予定を追加"/>}
          {state.bills.length>0&&<div className="list-total"><span>必要額合計</span><strong>{yen(totals.total)}</strong></div>}
        </section>
        <section className="section"><div className="section-head"><div><div className="eyebrow">SPENDING</div><h2>使ったお金</h2></div><button className="text-action" onClick={()=>setTab('ledger')}>家計簿を見る <ArrowRight size={16}/></button></div><div className="mini-summary"><div><span>利用月の支出</span><strong>{yen(spending)}</strong></div><p>利用月の支出は上の入金額に足しません。カード請求の引落予定を登録して計算します。</p></div></section>
      </>}
      {tab==='ledger'&&<><div className="callout"><ReceiptText size={20}/><div><strong>{monthText(month)}の支出 {yen(spending)}</strong><p>買い物の日付で記録。引落予定とは別に集計します。</p></div></div><section className="section"><div className="section-head"><div><div className="eyebrow">TRANSACTIONS</div><h2>利用明細</h2></div><button className="primary small" onClick={addExpense}><Plus size={17}/> 手入力</button></div>{state.expenses.length?<div className="list">{state.expenses.map(e=><div className="row" key={e.id}><div className="row-symbol"><ListFilter size={19}/></div><div className="row-content"><strong>{e.title}</strong><small>{e.spent_on.replaceAll('-',' / ')} · {e.category}{e.receipt_key?' · 画像あり':''}</small></div><strong className="row-money">{yen(e.amount)}</strong><button className="row-edit" aria-label={`${e.title}を編集`} onClick={()=>setEditing({type:'expense',data:e})}>編集</button></div>)}</div>:<Empty text="支出はまだありません。レシートからも登録できます。" onClick={addExpense} label="支出を追加"/>}</section></>}
      {tab==='import'&&<>
        <div className="callout"><Camera size={21}/><div><strong>レシートを読み取る</strong><p>画像から日付・金額・費目の候補を作ります。保存前に確認できます。</p></div></div>
        <ModeSwitch mode={aiMode} demoEnabled={state.demo_enabled} liveEnabled={state.ai_enabled} onChange={value=>{setAiMode(value);setComment('');setNotice('');}}/>
        <section className="section"><div className="eyebrow">SCAN A RECEIPT</div><h2>画像を選ぶ</h2>
          {aiMode==='demo'&&<Field label="デモの例"><select value={scenario} onChange={e=>setScenario(e.target.value as typeof scenario)}><option value="supermarket">スーパー · ¥1,980</option><option value="restaurant">カフェ · ¥1,240</option><option value="unclear">読み取り不鮮明 · 要修正</option></select></Field>}
          <label className="upload"><Camera size={30}/><strong>{fileName||'撮影または画像を選択'}</strong><span>JPEG / PNG / WebP · 4MB以下</span><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={e=>readFile(e.target.files?.[0])}/></label>
          {aiMode==='demo'&&<button className="sample-button" onClick={useSampleImage}>画像を用意せずサンプルで試す <ArrowRight size={15}/></button>}
          {image&&<div className="upload-actions"><img className="image-thumb" src={image} alt="選んだレシート"/><div><button className="primary" disabled={busy||(aiMode==='live'&&!state.ai_enabled)||(aiMode==='demo'&&!state.demo_enabled)} onClick={()=>void analyze()}>{busy?'処理中…':aiMode==='demo'?'無料でデモ読取':'実際のAIで読み取る'} <ArrowRight size={16}/></button><button className="secondary" onClick={()=>setEditing({type:'expense',data:{spent_on:today(),title:'',amount:0,category:'その他・要確認',note:''},image})}>自分で入力</button></div></div>}
          {aiMode==='demo'&&<p className="subtle">画像の内容は解析しません。選んだ例の結果で、確認・編集・保存まで試せます。</p>}
        </section>
      </>}
      {tab==='report'&&<>
        <div className="report-total"><span>利用月の支出</span><strong>{yen(spending)}</strong><p>{monthText(month)}の明細から集計</p></div>
        <section className="section"><div className="section-head"><div><div className="eyebrow">CATEGORIES</div><h2>費目別の内訳</h2></div><ChartNoAxesCombined size={21} color="#777"/></div>{breakdown.length?<div className="bars">{breakdown.sort((a,b)=>b.amount-a.amount).map(item=><div className="bar-row" key={item.category}><div className="bar-label"><span>{item.category}</span><strong>{yen(item.amount)}</strong></div><div className="bar-track"><span style={{width:`${spending?item.amount/spending*100:0}%`}}/></div></div>)}</div>:<div className="empty">この月の支出を登録すると内訳が表示されます。</div>}</section>
        <section className="section"><div className="section-head"><div><div className="eyebrow">MONTHLY NOTE</div><h2>今月のひとこと</h2></div></div>
          <ModeSwitch mode={aiMode} demoEnabled={state.demo_enabled} liveEnabled={state.ai_enabled} onChange={value=>{setAiMode(value);setComment('');}}/>
          <div className="comment"><p>{comment||'費目別の金額から、今月の傾向を短くまとめます。'}</p><button className="secondary" disabled={busy||(aiMode==='live'&&!state.ai_enabled)||(aiMode==='demo'&&!state.demo_enabled)||!breakdown.length} onClick={()=>void makeComment()}>{busy?'作成中…':aiMode==='demo'?'無料でデモコメントを作成':'実際のAIでコメントを作成'} <ArrowRight size={15}/></button></div>
        </section>
      </>}
      {tab==='settings'&&<><section className="section"><div className="eyebrow">HOW IT WORKS</div><h2>入金額の考え方</h2><div className="steps"><div><span>01</span><p>カード請求、家賃など<strong>今月引き落とされる金額</strong>を登録</p></div><div><span>02</span><p>合計を2人で折半し、共有口座への入金目安を表示</p></div><div><span>03</span><p>レシートは<strong>使った月</strong>の費目別集計に記録。入金額には重ねて足さない</p></div></div></section><section className="section"><div className="eyebrow">ABOUT</div><h2>uchiwake</h2><p className="subtle">MVP / ステージング環境。レシートのAI結果は必ず確認してから保存してください。</p></section></>}
      </>}
    </main>
    <nav className="dock" aria-label="メインメニュー">{([['home',Home,'ホーム'],['ledger',ReceiptText,'家計簿'],['import',Camera,'取り込み'],['report',ChartNoAxesCombined,'レポート'],['settings',Settings,'設定']] as const).map(([key,Icon,label])=><button key={key} className={tab===key?'active':''} onClick={()=>{setTab(key);setNotice('');window.scrollTo(0,0);}}><Icon size={20} strokeWidth={tab===key?2.3:1.8}/><span>{label}</span></button>)}</nav>
    {editing&&<div className="modal-backdrop" onClick={()=>setEditing(null)}><div className="modal" role="dialog" aria-modal="true" aria-label={editing.type==='bill'?'引落予定の編集':'支出の編集'} onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">{editing.type==='bill'?'WITHDRAWAL':'TRANSACTION'}</div><h2>{editing.data.id?'編集する':editing.type==='bill'?'引落予定を追加':'支出を追加'}</h2></div><button className="icon-button" aria-label="閉じる" onClick={()=>setEditing(null)}><X size={20}/></button></div><div className="form">
      {editing.type==='bill'?<>
        <Field label="引落月"><input type="month" value={editing.data.due_month||month} onChange={e=>setEditing({...editing,data:{...editing.data,due_month:e.target.value}})}/></Field>
        <Field label="種類"><select value={editing.data.kind||'card'} onChange={e=>setEditing({...editing,data:{...editing.data,kind:e.target.value as BillKind}})}>{Object.entries(billKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>
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
createRoot(document.getElementById('root')!).render(<App/>);
