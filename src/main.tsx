import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowRight, Camera, Check, ChevronLeft, ChevronRight, CreditCard, Home, ListFilter, Plus, Trash2, X } from 'lucide-react';
import { billKinds, categories, categoryTotals, rentForMonth, summary, type Bill, type BillKind, type Category, type EntryDraft, type SharedCard, type State } from './domain';
import { FloatingDock, dockTabs, type DockTab } from './floating-dock';
import { CardStatementPanel } from './card-statement-panel';
import './styles.css';
import './kondo-style.css';

type Tab = DockTab;
type Editing = { type:'bill'; data:Partial<Bill> };
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
  const [showTotalFirst,setShowTotalFirst]=useState(false);
  const [demoView,setDemoView]=useState(()=>window.sessionStorage.getItem('uchiwake-demo-view')==='1');
  const requestId=useRef(0);
  const [state,setState]=useState<State|null>(null);
  const [editing,setEditing]=useState<Editing|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [aiMode,setAiMode]=useState<AiMode>('demo');
  const [screenshots,setScreenshots]=useState<{name:string;image:string}[]>([]);
  const [selectedCardId,setSelectedCardId]=useState('');
  const [openCard,setOpenCard]=useState<{type:'card'|'statement';id:string}|null>(null);
  const [cardName,setCardName]=useState('');
  const [rentAmount,setRentAmount]=useState('');
  const [rentStartMonth,setRentStartMonth]=useState(month);
  const [draft,setDraft]=useState<{due_month:string;card_id:string;title:string;confirmed_total:number;entries:EntryDraft[];demo:boolean}|null>(null);
  const [totalChecked,setTotalChecked]=useState(false);
  const [history,setHistory]=useState<{month:string;amount:number}[]>([]);
  const [chartMonths,setChartMonths]=useState<6|12|36|60>(6);
  async function load() {
    const request=++requestId.current;
    const query=`?month=${month}${demoView?'&demo=1':''}`;
    try { const result=await api<State>(`/state${query}`);if(request===requestId.current){setState(result);setNotice('');} }
    catch(e) { if(request===requestId.current){if(demoView){window.sessionStorage.removeItem('uchiwake-demo-view');setDemoView(false);}else setNotice(String(e instanceof Error?e.message:e));} }
    try { const result=await api<{months:{month:string;amount:number}[]}>(`/settlement-history${query}`);if(request===requestId.current)setHistory(result.months); }
    catch { if(request===requestId.current)setHistory([]); }
  }
  useEffect(()=>{ requestId.current++;setState(null);setHistory([]);void load(); },[month,demoView]);
  useEffect(()=>setOpenCard(null),[month]);
  useEffect(()=>{setRentStartMonth(month);},[month]);
  useEffect(()=>{const active=state?.cards.filter(card=>card.active)||[];if(active.length&&!active.some(card=>card.id===selectedCardId))setSelectedCardId(active[0].id);},[state?.cards,selectedCardId]);
  const rent=useMemo(()=>rentForMonth(month,state?.bills||[],state?.rent_rules||[]),[month,state]);
  const totals=useMemo(()=>summary([...(state?.bills||[]).filter(b=>b.kind!=='card'&&b.kind!=='rent'),...(state?.statements||[]).map(s=>({amount:s.confirmed_total})),{amount:rent.amount}]),[state,rent]);
  const breakdown=useMemo(()=>categoryTotals(state?.entries||[]),[state]);
  const categoryMagnitude=breakdown.reduce((sum,item)=>sum+Math.abs(item.amount),0);
  const cardTotal=(state?.statements||[]).reduce((sum,item)=>sum+item.confirmed_total,0);
  const otherBills=(state?.bills||[]).filter(item=>item.kind==='utilities'||item.kind==='other');
  const hasSettlementData=!!(state?.statements.length||otherBills.length||rent.amount);
  const settlementAmount=(amount:number)=>hasSettlementData?yen(amount):'—';
  const rowsTotal=draft?.entries.reduce((sum,row)=>sum+Number(row.amount||0),0)||0;
  async function save() {
    if (!editing) return;
    setBusy(true);setNotice('');
    try {
      const id=editing.data.id;
      const targetMonth=editing.data.due_month;
      await api('/bills'+(id?`/${id}`:''),{method:id?'PUT':'POST',body:JSON.stringify(editing.data)});
      setEditing(null);
      if (targetMonth && targetMonth!==month) setMonth(targetMonth);
      else await load();
    } catch(e) {setNotice(String(e instanceof Error?e.message:e));}
    finally {setBusy(false);}
  }
  async function remove(id:string) {
    if (!window.confirm('この項目を削除しますか？')) return;
    try { await api(`/bills/${id}`,{method:'DELETE'}); await load(); } catch(e) {setNotice(String(e instanceof Error?e.message:e));}
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
      const card=state?.cards.find(item=>item.id===selectedCardId);
      setDraft({due_month:month,card_id:selectedCardId,title:`${monthText(month)}の${card?.name||'共有カード'}`,confirmed_total:result.confirmed_total||sum,entries:result.entries,demo:!!result.demo});setTotalChecked(false);
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
      await api('/statements',{method:'POST',body:JSON.stringify({due_month:draft.due_month,card_id:draft.card_id,title:draft.title,confirmed_total:draft.confirmed_total,entries:draft.entries})});
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
  const addBill=()=>setEditing({type:'bill',data:state?.bills.find(b=>b.kind==='rent')||{due_month:month,kind:'rent',title:'家賃',amount:rent.amount,note:''}});
  async function createCard() {
    if(!cardName.trim())return;
    setBusy(true);setNotice('');
    try{await api('/cards',{method:'POST',body:JSON.stringify({name:cardName})});setCardName('');await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function updateCard(card:SharedCard,name:string,active:boolean) {
    setBusy(true);setNotice('');
    try{await api(`/cards/${card.id}`,{method:'PUT',body:JSON.stringify({name,active})});await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function saveRentRule() {
    if(!rentStartMonth||!Number.isSafeInteger(Number(rentAmount))||Number(rentAmount)<=0)return;
    setBusy(true);setNotice('');
    try{await api(`/rent-rules/${rentStartMonth}`,{method:'PUT',body:JSON.stringify({amount:Number(rentAmount)})});setRentAmount('');await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function removeRentRule(effectiveMonth:string) {
    if(!window.confirm(`${monthText(effectiveMonth)}からの基本家賃を削除しますか？`))return;
    setBusy(true);setNotice('');
    try{await api(`/rent-rules/${effectiveMonth}`,{method:'DELETE'});await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  const selectTab=(value:Tab)=>{setOpenCard(null);setTab(value);setNotice('');window.scrollTo({top:0,behavior:'smooth'});};
  const switchDemo=(enabled:boolean)=>{window.sessionStorage.setItem('uchiwake-demo-view',enabled?'1':'0');setOpenCard(null);setDraft(null);setScreenshots([]);setEditing(null);setDemoView(enabled);};
  const canSaveDraft=!!draft&&totalChecked&&draft.entries.length>0&&rowsTotal===draft.confirmed_total&&rowsTotal>0&&!!draft.title.trim()&&!!draft.card_id&&draft.entries.every(e=>!!e.title.trim()&&!!e.amount);
  const chart=history.length?history.slice(-chartMonths):Array.from({length:chartMonths},(_,index)=>({month:bump(month,index-chartMonths+1),amount:0}));
  const chartMax=Math.max(1,...chart.map(item=>item.amount));
  const panelStatements=(state?.statements||[]).filter(item=>openCard?.type==='card'?item.card_id===openCard.id:openCard?.type==='statement'&&item.id===openCard.id);
  const panelTitle=openCard?.type==='card'?state?.cards.find(card=>card.id===openCard.id)?.name:panelStatements[0]?.title;
  const dockContext=editing?{label:'項目の編集',onBack:()=>setEditing(null),actionLabel:busy?'保存中…':'保存する',onAction:()=>void save(),disabled:busy||!editing.data.title||!editing.data.amount}:tab==='import'&&draft?{label:'カード明細の確認',onBack:()=>setDraft(null),actionLabel:busy?'保存中…':'保存して計算',onAction:()=>void saveStatement(),disabled:busy||!canSaveDraft}:undefined;
  return <>
    <main className="shell">
      <nav className="desktop-tabs" aria-label="メインメニュー">{dockTabs.map(item=><button key={item.key} aria-current={tab===item.key?'page':undefined} onClick={()=>selectTab(item.key)}><item.icon size={18}/>{item.label}</button>)}{!demoView&&<button onClick={()=>selectTab('import')}><Plus size={18}/>追加</button>}</nav>
      <div className={`page-top ${tab==='home'?'home-page-top':''}`}><h1>{draft&&tab==='import'?'明細を確認':({home:'精算',ledger:'カードの明細',import:'明細を取り込む',settings:'設定'} as const)[tab]}</h1>{!draft&&tab!=='ledger'&&tab!=='settings'&&<div className="month-switch"><button aria-label="前月" onClick={()=>setMonth(bump(month,-1))}><ChevronLeft size={18}/></button><span>{monthText(month)}</span><button aria-label="翌月" onClick={()=>setMonth(bump(month,1))}><ChevronRight size={18}/></button></div>}</div>
      {notice&&<div className="notice" role="alert"><span>{notice}</span><button aria-label="閉じる" onClick={()=>setNotice('')}><X size={16}/></button></div>}
      {demoView&&<div className="demo-view-banner" role="status">デモ表示中 · サンプルデータ</div>}
      {!state?<div className="empty loading">{notice?'データを表示できませんでした。':'読み込んでいます…'}{notice&&<div><button className="secondary" onClick={()=>void load()}>再読み込み</button></div>}</div>:<>
      {tab==='home'&&<>
        <section className="hero settlement-hero"><h2>精算</h2>
          <button type="button" className="settlement-amount-toggle" aria-label="ひとりあたりと支払い合計の表示を切り替える" aria-pressed={showTotalFirst} onClick={()=>setShowTotalFirst(value=>!value)}>
            <span className="hero-money">{settlementAmount(showTotalFirst?totals.total:totals.perPerson)}</span>
            <span className="hero-label">{showTotalFirst?'支払い合計':'ひとりあたり'}</span>
            <span className="hero-secondary"><span>{showTotalFirst?'ひとりあたり':'支払い合計'}</span><strong>{settlementAmount(showTotalFirst?totals.perPerson:totals.total)}</strong></span>
          </button>
          <div className="settlement-chart" role="group" aria-label="月別のひとりあたりの精算額"><div className="chart-bars">{chart.map(item=><button key={item.month} className={`chart-bar ${item.month===month?'current':''} ${item.amount?'':'no-data'}`} style={{'--bar-height':`${item.amount?Math.max(8,item.amount/chartMax*100):3}%`} as React.CSSProperties} aria-label={`${monthText(item.month)} ${yen(item.amount)}`} title={`${monthText(item.month)} ${yen(item.amount)}`} onClick={()=>setMonth(item.month)}><span/></button>)}</div></div>
          <div className="chart-ranges" role="group" aria-label="表示期間">{([[6,'6M'],[12,'1Y'],[36,'3Y'],[60,'5Y']] as const).map(([count,label])=><button key={count} aria-pressed={chartMonths===count} onClick={()=>setChartMonths(count)}>{label}</button>)}</div>
        </section>
        <section className="section settlement-section"><div className="settlement-list">
          {state.cards.filter(card=>card.active||state.statements.some(item=>item.card_id===card.id)).map(card=>{const items=state.statements.filter(item=>item.card_id===card.id);return <button className="settlement-item" key={card.id} onClick={()=>{setSelectedCardId(card.id);setOpenCard({type:'card',id:card.id});}}><span className="settlement-item-icon"><CreditCard size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{card.name}</span>{items.length>0&&<small>{items.length}件の明細</small>}<strong className="settlement-item-amount">{items.length?yen(items.reduce((sum,item)=>sum+item.confirmed_total,0)):'—'}</strong></span><ChevronRight size={17}/></button>})}
          {state.statements.filter(item=>!item.card_id||!state.cards.some(card=>card.id===item.card_id)).map(item=><button className="settlement-item" key={item.id} onClick={()=>setOpenCard({type:'statement',id:item.id})}><span className="settlement-item-icon"><CreditCard size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{item.title}</span><strong className="settlement-item-amount">{yen(item.confirmed_total)}</strong></span><ChevronRight size={17}/></button>)}
          {!state.cards.length&&<button className="settlement-item" onClick={()=>selectTab('settings')}><span className="settlement-item-icon"><CreditCard size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">共有カード</span><strong className="settlement-item-amount">—</strong></span><ChevronRight size={17}/></button>}
          <button className="settlement-item" onClick={demoView?()=>selectTab('settings'):addBill}><span className="settlement-item-icon"><Home size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">家賃</span><strong className="settlement-item-amount">{rent.amount?yen(rent.amount):'—'}</strong></span><ChevronRight size={17}/></button>
          {otherBills.map(b=><button className="settlement-item" key={b.id} onClick={demoView?()=>selectTab('settings'):()=>setEditing({type:'bill',data:b})}><span className="settlement-item-icon"><ArrowDownLeft size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{b.title}</span><strong className="settlement-item-amount">{yen(b.amount)}</strong></span><ChevronRight size={17}/></button>)}
        </div></section>
        {state.bills.some(b=>b.kind==='card')&&<details className="legacy-details"><summary>以前のカード請求の入力を確認</summary>{state.bills.filter(b=>b.kind==='card').map(b=><BillRow key={b.id} bill={b} onEdit={()=>setEditing({type:'bill',data:b})}/>)}</details>}
      </>}
      {tab==='ledger'&&<>{state.statements.length? <>
        <div className="ledger-overview"><span>{monthText(month)}のカード合計</span><strong>{yen(cardTotal)}</strong><small>引落月で表示 · 費目は後から変更できます</small></div>
        {state.statements.map(s=><section className="section statement-section" key={s.id}><div className="section-head"><div><h2>{state.cards.find(card=>card.id===s.card_id)?.name||s.title}</h2><p className="subtle">引落額 {yen(s.confirmed_total)}</p></div>{!demoView&&<button className="delete" aria-label={`${s.title}を削除`} onClick={()=>void removeStatement(s.id)}><Trash2 size={18}/></button>}</div><div className="list">{state.entries.filter(e=>e.statement_id===s.id).map(e=><div className="row entry-row" key={e.id}><div className="row-content"><strong>{e.title}</strong><small>{e.spent_on||'利用日不明'}</small>{demoView?<small>{e.category}</small>:<select aria-label={`${e.title}の費目`} value={e.category} onChange={event=>void changeCategory(e.id,event.target.value as Category)}>{categories.map(category=><option key={category}>{category}</option>)}</select>}</div><strong className="row-money">{yen(e.amount)}</strong></div>)}</div></section>)}
        {!!breakdown.length&&<details className="breakdown-details"><summary>費目別の合計を見る</summary><div className="bars">{[...breakdown].sort((a,b)=>b.amount-a.amount).map(item=><div className="bar-row" key={item.category}><div className="bar-label"><span>{item.category}</span><strong>{yen(item.amount)}</strong></div><div className="bar-track"><span style={{width:`${categoryMagnitude?Math.abs(item.amount)/categoryMagnitude*100:0}%`}}/></div></div>)}</div></details>}
      </>:demoView?<div className="empty">この月のデモ明細はありません。</div>:<Empty text="この月のカード明細はまだありません。" onClick={()=>selectTab('import')} label="カード明細を取り込む"/>}</>}
      {tab==='import'&&(demoView?<div className="empty">デモ表示中は明細を追加できません。設定から実データに戻せます。</div>:!draft?<>
        {!state.cards.some(card=>card.active)?<Empty text="先に共有カードを設定してください。" onClick={()=>selectTab('settings')} label="設定を開く"/>:<><Field label="取り込むカード"><select value={selectedCardId} onChange={e=>{setSelectedCardId(e.target.value);setScreenshots([]);}}>{state.cards.filter(card=>card.active).map(card=><option key={card.id} value={card.id}>{card.name}</option>)}</select></Field>
        <p className="intro">上の月に引き落とされるカード明細を選びます。同じ請求のスクリーンショットを最大3枚まで追加できます。</p>
        <section className="section import-section"><label className="upload"><Camera size={30}/><strong>{screenshots.length?`${screenshots.length}枚を選択中`:'スクリーンショットを選ぶ'}</strong><span>JPEG・PNG・WebP／1枚4MB以下</span><input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={e=>{void chooseScreenshots(e.target.files);e.target.value='';}}/></label>{screenshots.length>0&&<><p className="selected-files">{screenshots.map(item=>item.name).join('、')}</p><div className="statement-images">{screenshots.map((item,i)=><img className="image-thumb" src={item.image} alt={`明細画像 ${i+1}`} key={i}/>)}</div></>}</section>
        <div className="import-actions"><button className="primary" disabled={busy||!screenshots.length||(aiMode==='live'&&!state.ai_enabled)||(aiMode==='demo'&&!state.demo_enabled)} onClick={()=>void analyzeStatement()}>{busy?'読取中…':aiMode==='demo'?'デモで仕分ける':'AIで仕分ける'} <ArrowRight size={17}/></button><button className="text-action" onClick={()=>{setDraft({due_month:month,card_id:selectedCardId,title:`${monthText(month)}の${state.cards.find(item=>item.id===selectedCardId)?.name||'共有カード'}`,confirmed_total:0,entries:[{spent_on:'',title:'',amount:0,category:'その他・要確認'}],demo:false});setTotalChecked(false);}}>画像なしで手入力</button></div>
        <details className="mode-details"><summary>読み取りモード：{aiMode==='demo'?'デモ（無料）':'実際のAI（料金あり）'}</summary><ModeSwitch mode={aiMode} demoEnabled={state.demo_enabled} liveEnabled={state.ai_enabled} onChange={value=>{setAiMode(value);setNotice('');}}/>{aiMode==='demo'&&<button className="sample-button" onClick={sampleStatement}>サンプル画像で試す <ArrowRight size={15}/></button>}</details>
        {aiMode==='demo'&&<p className="demo-caption">デモは画像を読み取らず、固定の例で仕分けを試せます。OpenAIの利用料金はかかりません。</p>}</>}
      </>:<>
        {draft.demo&&<p className="demo-warning">デモの固定値です。選んだ画像は読み取っていません。</p>}
        <div className="review-summary"><Field label="カード"><select value={draft.card_id} onChange={e=>{setDraft({...draft,card_id:e.target.value});setTotalChecked(false);}}>{state.cards.filter(card=>card.active).map(card=><option key={card.id} value={card.id}>{card.name}</option>)}</select></Field><Field label="引落月"><input type="month" value={draft.due_month} onChange={e=>{setDraft({...draft,due_month:e.target.value});setTotalChecked(false);}}/></Field><Field label="明細の名前"><input value={draft.title} maxLength={100} onChange={e=>setDraft({...draft,title:e.target.value})}/></Field></div>
        <section className="section review-section"><div className="section-head"><h2>利用行を確認</h2><span className="subtle">{draft.entries.length}件</span></div><p className="subtle">読み違いや重複を修正してください。返金はマイナス額で入力できます。</p>
        <div className="draft-entries">{draft.entries.map((entry,i)=><div className="draft-entry" key={i}><div className="draft-entry-heading"><strong>{i+1}件目</strong><button className="delete" aria-label={`${i+1}件目を削除`} onClick={()=>{setDraft({...draft,entries:draft.entries.filter((_,j)=>j!==i)});setTotalChecked(false);}}><Trash2 size={17}/></button></div><Field label="店名・内容"><input value={entry.title} maxLength={100} onChange={e=>updateDraftRow(i,{title:e.target.value})}/></Field><div className="draft-pair"><Field label="利用日（任意）"><input type="date" value={entry.spent_on} onChange={e=>updateDraftRow(i,{spent_on:e.target.value})}/></Field><Field label="金額（円）"><input type="number" inputMode="numeric" step="1" value={entry.amount||''} onChange={e=>updateDraftRow(i,{amount:Number(e.target.value)})}/></Field></div><Field label="費目"><select value={entry.category} onChange={e=>updateDraftRow(i,{category:e.target.value as Category})}>{categories.map(category=><option key={category}>{category}</option>)}</select></Field></div>)}</div>
        <button className="secondary" disabled={draft.entries.length>=50} onClick={()=>{setDraft({...draft,entries:[...draft.entries,{spent_on:'',title:'',amount:0,category:'その他・要確認'}]});setTotalChecked(false);}}><Plus size={16}/> 行を追加</button></section>
        <section className="section reconcile-section"><h2>カードの引落額と照合</h2><div className="reconcile-row"><span>利用行の合計</span><strong>{yen(rowsTotal)}</strong></div><Field label="実際のカード引落額（円）"><input type="number" min="1" step="1" inputMode="numeric" value={draft.confirmed_total||''} onChange={e=>{setDraft({...draft,confirmed_total:Number(e.target.value)});setTotalChecked(false);}}/></Field>{rowsTotal!==draft.confirmed_total&&<p className="reconcile-error" role="status">金額が一致しません。未入力・重複・返金を確認してください。</p>}<label className="confirm-line"><input type="checkbox" checked={totalChecked} onChange={e=>setTotalChecked(e.target.checked)}/>元の明細と金額・利用行を照合した</label><button className="primary draft-save" disabled={busy||!canSaveDraft} onClick={()=>void saveStatement()}>{busy?'保存中…':'保存して精算を見る'} <Check size={17}/></button></section>
      </>)}
      {tab==='settings'&&<>
        {state.demo_enabled&&<section className="section settings-section demo-settings"><h2>表示するデータ</h2><p className="subtle">デモには直近6か月のカード2枚と家賃を用意しています。実データの保存内容は変わりません。</p><div className="mode-options" role="group" aria-label="表示するデータ"><button className={!demoView?'selected':''} aria-pressed={!demoView} onClick={()=>switchDemo(false)}>実データ</button><button className={demoView?'selected':''} aria-pressed={demoView} onClick={()=>switchDemo(true)}>デモデータ</button></div></section>}
        {demoView?<section className="section settings-section"><h2>デモの設定</h2><p className="subtle">{state.cards.map(card=>card.name).join('・')} ／ 基本家賃 {yen(state.rent_rules[0]?.amount||0)}</p><p className="subtle">デモ表示中は編集できません。実データに切り替えると設定を変更できます。</p></section>:<>
        <section className="section settings-section"><h2>共有カード</h2><p className="subtle">カードを登録すると、明細を取り込む際に選べます。</p><div className="card-settings-list">{state.cards.map(card=><CardSettingsRow key={card.id} card={card} busy={busy} onSave={(name,active)=>void updateCard(card,name,active)}/>)}</div><div className="settings-form"><Field label="カードを追加"><input value={cardName} placeholder="例：生活費カード" maxLength={40} onChange={e=>setCardName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void createCard();}}/></Field><button className="primary" disabled={busy||!cardName.trim()} onClick={()=>void createCard()}><Plus size={17}/> 追加する</button></div></section>
        <section className="section settings-section"><h2>基本家賃</h2><p className="subtle">指定した月から毎月の精算に使います。金額が変わったら、新しい開始月を指定してください。</p><div className="settings-form"><Field label="適用開始月"><input type="month" value={rentStartMonth} onChange={e=>setRentStartMonth(e.target.value)}/></Field><Field label="家賃（円）"><input type="number" inputMode="numeric" min="1" step="1" value={rentAmount} onChange={e=>setRentAmount(e.target.value)} placeholder={rent.amount?String(rent.amount):'例：120000'}/></Field><button className="primary" disabled={busy||!rentAmount||Number(rentAmount)<=0} onClick={()=>void saveRentRule()}><Check size={17}/> 基本家賃を保存</button></div>
        {!!state.rent_rules.length&&<div className="rule-list">{state.rent_rules.map(rule=><div className="rule-row" key={rule.effective_month}><div><strong>{yen(rule.amount)}</strong><small>{monthText(rule.effective_month)}から</small></div><button className="delete" disabled={busy} aria-label={`${monthText(rule.effective_month)}からの基本家賃を削除`} onClick={()=>void removeRentRule(rule.effective_month)}><Trash2 size={18}/></button></div>)}</div>}<p className="subtle">一時的な変更は精算画面の「今月だけ家賃を変更」から入力できます。</p></section>
        </>}
      </>}
      </>}
    </main>
    <FloatingDock tab={tab} onSelect={selectTab} context={dockContext} month={month} onPrevMonth={()=>setMonth(bump(month,-1))} onNextMonth={()=>setMonth(bump(month,1))} add={demoView?undefined:{label:'追加',options:[{label:'カード明細を取り込む',onClick:()=>selectTab('import')},{label:'今月の家賃を変更',onClick:addBill}]}}/>
    {openCard&&state&&panelTitle&&<CardStatementPanel title={panelTitle} month={month} statements={panelStatements} entries={state.entries} demo={demoView} onClose={()=>setOpenCard(null)} onImport={()=>{if(openCard.type==='card')setSelectedCardId(openCard.id);selectTab('import');}} onOpenLedger={()=>selectTab('ledger')}/>}
    {editing&&<div className="modal-backdrop" onClick={()=>setEditing(null)}><div className="modal" role="dialog" aria-modal="true" aria-label="引落予定の編集" onClick={e=>e.stopPropagation()}><div className="modal-head"><div><div className="eyebrow">WITHDRAWAL</div><h2>{editing.data.id?'編集する':'引落予定を追加'}</h2></div><button className="icon-button" aria-label="閉じる" onClick={()=>setEditing(null)}><X size={20}/></button></div><div className="form">
        <Field label="引落月"><input type="month" value={editing.data.due_month||month} onChange={e=>setEditing({...editing,data:{...editing.data,due_month:e.target.value}})}/></Field>
        {editing.data.id&&editing.data.kind!=='rent'&&<Field label="種類"><select value={editing.data.kind||'rent'} onChange={e=>setEditing({...editing,data:{...editing.data,kind:e.target.value as BillKind}})}>{Object.entries(billKinds).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></Field>}
        {editing.data.kind!=='rent'&&<Field label="名称"><input placeholder="引落の名前" value={editing.data.title||''} maxLength={100} onChange={e=>setEditing({...editing,data:{...editing.data,title:e.target.value}})}/></Field>}
        <Field label="引落額（円）"><input type="number" inputMode="numeric" min="1" step="1" value={editing.data.amount||''} onChange={e=>setEditing({...editing,data:{...editing.data,amount:Number(e.target.value)}})}/></Field>
        {editing.data.kind!=='rent'&&<Field label="メモ（任意）"><input value={editing.data.note||''} maxLength={500} onChange={e=>setEditing({...editing,data:{...editing.data,note:e.target.value}})}/></Field>}
      <div className="form-actions">{editing.data.id&&<button className="delete" onClick={()=>{const {data}=editing;setEditing(null);void remove(data.id!);}}><Trash2 size={17}/> 削除</button>}<button className="primary" disabled={busy||!editing.data.title||!editing.data.amount} onClick={()=>void save()}>{busy?'保存中…':'保存する'} <Check size={17}/></button></div>
    </div></div></div>}
  </>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>}
function ModeSwitch({mode,demoEnabled,liveEnabled,onChange}:{mode:AiMode;demoEnabled:boolean;liveEnabled:boolean;onChange:(value:AiMode)=>void}) {
  return <div className="mode-panel"><div className="eyebrow">読み取り方法</div><div className="mode-options" role="group" aria-label="AIの動作モード"><button className={mode==='demo'?'selected':''} disabled={!demoEnabled} aria-pressed={mode==='demo'} onClick={()=>onChange('demo')}>デモ・無料</button><button className={mode==='live'?'selected':''} disabled={!liveEnabled} aria-pressed={mode==='live'} onClick={()=>onChange('live')}>実際のAI・料金あり</button></div><p>{mode==='demo'?'サンプル結果を返します。OpenAI APIを呼びません。':liveEnabled?'OpenAI APIに送信します。利用料金が発生します。':'APIキーの設定後に選択できます。'}</p></div>;
}
function CardSettingsRow({card,busy,onSave}:{card:SharedCard;busy:boolean;onSave:(name:string,active:boolean)=>void}) {
  const [name,setName]=useState(card.name);
  useEffect(()=>setName(card.name),[card.name]);
  return <div className="card-settings-row"><Field label={card.active?'カード名':'カード名（使用停止中）'}><input value={name} maxLength={40} onChange={e=>setName(e.target.value)}/></Field><div className="settings-row-actions"><button className="secondary" disabled={busy||!name.trim()||name.trim()===card.name} onClick={()=>onSave(name,card.active)}>名前を保存</button><button className="text-action" disabled={busy} onClick={()=>onSave(name.trim()||card.name,!card.active)}>{card.active?'使用を停止':'再開する'}</button></div></div>;
}
function Empty({text,onClick,label}:{text:string;onClick:()=>void;label:string}) {return <div className="empty"><p>{text}</p><button className="secondary" onClick={onClick}><Plus size={16}/>{label}</button></div>}
function BillRow({bill,onEdit}:{bill:Bill;onEdit:()=>void}) {return <div className="row"><div className="row-symbol">{bill.kind==='card'?<CreditCard size={19}/>:bill.kind==='rent'?<Home size={19}/>:<ArrowDownLeft size={19}/>}</div><div className="row-content"><strong>{bill.title}</strong><small>{billKinds[bill.kind]}{bill.note?` · ${bill.note}`:''}</small></div><strong className="row-money">{yen(bill.amount)}</strong><button className="row-edit" onClick={onEdit} aria-label={`${bill.title}を編集`}>編集</button></div>}
createRoot(document.getElementById('root')!).render(<App/>);
