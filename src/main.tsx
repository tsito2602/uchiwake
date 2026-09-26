import { isImportModel, type ImportModel } from './import-model';
import { streamStatement } from './statement-import-stream';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowRight, Calculator, ArrowLeftRight, UserRound, UsersRound, ReceiptText, Settings, Tags, Camera, Check, ChevronLeft, ChevronRight, CreditCard, Home, Plus, Trash2, X, Sparkles } from 'lucide-react';
import { billKinds, categoryTotals, rentForMonth, summary, type Bill, type Category, type CategoryAppearance, type EntryDraft, type SharedCard, type State } from './domain';
import { FloatingDock, dockTabs, type DockContext, type DockTab } from './floating-dock';
import { CardStatementPanel } from './card-statement-panel';
import { defaultCardColor } from './card-colors';
import { StatementImportPanel } from './statement-import-panel';
import { ImportSetup, ImportProcessing } from './statement-import-content';
import { ImportReview, type ImportDraft } from './statement-import-review';
import { demoImportResult, runStatementImport, type ImportProgress } from './statement-import-flow';
import { BillPanel } from './bill-panel';
import { CardSettingsPanel } from './card-settings-panel';
import { CategorySettingsPanel } from './category-settings-panel';
import { allCategoryAppearances, normalizeCategoryName, validCategoryName } from './category-appearance';
import { CategoryIcon } from './category-icon';
import { SettlementChart, CategoryChart, type HistoryPoint } from './spending-charts';
import { NumberTicker } from './number-ticker';
import { useRouteTransition } from './kondo-route-motion';
import { panelOrigin, type PanelOrigin } from './use-panel-morph';
import './styles.css';
import './kondo-style.css';
import './kondo-route-motion.css';
import './statement-import.css';
import './studio-action.css';

type Tab = DockTab;
type Editing = { type:'bill'; data:Partial<Bill>; view:'summary'|'edit'|'fixed'; initialView:'summary'|'fixed'; rentRuleMonth?:string; origin?:PanelOrigin; closing?:boolean };
type OpenCard = {type:'card'|'statement';id:string;view:'summary'|'details'|'edit';origin?:PanelOrigin;closing?:boolean};
type OpenSettings = {card?:SharedCard;view:'summary'|'edit';name:string;active:boolean;color:string;origin?:PanelOrigin;closing?:boolean};
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
  const transitionPage=useRouteTransition();
  // Reset after the new page is committed, before the browser paints it.
  useLayoutEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});},[tab]);
  const [showTotalFirst,setShowTotalFirst]=useState(false);
  const [demoView,setDemoView]=useState(()=>window.sessionStorage.getItem('uchiwake-demo-view')==='1');
  const requestId=useRef(0);
  const loadedMode=useRef(demoView);
  const cardDestination=useRef<Tab|null>(null);
  const [state,setState]=useState<State|null>(null);
  const [editing,setEditing]=useState<Editing|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [aiMode,setAiMode]=useState<AiMode>('demo');
  const [importModel,setImportModel]=useState<ImportModel>(()=>{
    const saved=window.sessionStorage.getItem('uchiwake-import-model');
    return isImportModel(saved)?saved:'gpt-6-luna';
  });
  const changeImportModel=(model:ImportModel)=>{setImportModel(model);window.sessionStorage.setItem('uchiwake-import-model',model);};
  const [screenshots,setScreenshots]=useState<{name:string;image:string}[]>([]);
  const [selectedCardId,setSelectedCardId]=useState('');
  const [importPanel,setImportPanel]=useState<{origin?:PanelOrigin;closing?:boolean}|null>(null);
  const importDestination=useRef<Tab|null>(null);
  const importRequest=useRef<AbortController|null>(null);
  const [importProgress,setImportProgress]=useState<ImportProgress|null>(null);
  useEffect(()=>()=>{importRequest.current?.abort();},[]);
  const [categoryDraft,setCategoryDraft]=useState<Record<string,Category>>({});
  const [amountDraft,setAmountDraft]=useState<Record<string,string>>({});
  const [openCard,setOpenCard]=useState<OpenCard|null>(null);
  const [cardSettings,setCardSettings]=useState<OpenSettings|null>(null);
  const [categorySettings,setCategorySettings]=useState<{saved:CategoryAppearance;draft:CategoryAppearance;isNew?:boolean;view:'summary'|'edit';origin?:PanelOrigin;closing?:boolean}|null>(null);
  const [rentAmount,setRentAmount]=useState('');
  const [rentStartMonth,setRentStartMonth]=useState(month);
  const [draft,setDraft]=useState<ImportDraft|null>(null);
  const [totalChecked,setTotalChecked]=useState(false);
  const [history,setHistory]=useState<HistoryPoint[]>([]);
  const [chartMonths,setChartMonths]=useState<6|12|36|60>(6);
  async function load() {
    const request=++requestId.current;
    const query=`?month=${month}${demoView?'&demo=1':''}`;
    try {
      // Commit the month and its graph together, retaining the previous render
      // until both requests finish so existing animation nodes stay mounted.
      const [result,resultHistory]=await Promise.all([
        api<State>(`/state${query}`),
        api<{months:HistoryPoint[]}>(`/settlement-history${query}`).catch(()=>({months:[]}))
      ]);
      if(request===requestId.current){setState(result);setHistory(resultHistory.months);setNotice('');}
    }
    catch(e) { if(request===requestId.current){if(demoView){window.sessionStorage.removeItem('uchiwake-demo-view');setDemoView(false);}else setNotice(String(e instanceof Error?e.message:e));} }
  }
  useEffect(()=>{
    requestId.current++;
    if(loadedMode.current!==demoView){loadedMode.current=demoView;setState(null);setHistory([]);}
    void load();
  },[month,demoView]);
  useEffect(()=>{cardDestination.current=null;setOpenCard(null);setCategoryDraft({});setAmountDraft({});},[month,demoView]);
  useEffect(()=>{setRentStartMonth(month);},[month]);
  useEffect(()=>{const active=state?.cards.filter(card=>card.active)||[];if(active.length&&!active.some(card=>card.id===selectedCardId))setSelectedCardId(active[0].id);},[state?.cards,selectedCardId]);
  const displayedMonth=state?.month??month;
  const rent=useMemo(()=>rentForMonth(displayedMonth,state?.bills||[],state?.rent_rules||[]),[displayedMonth,state]);
  const totals=useMemo(()=>summary([...(state?.bills||[]).filter(b=>b.kind!=='card'&&b.kind!=='rent'),...(state?.statements||[]).map(s=>({amount:s.confirmed_total})),{amount:rent.amount}]),[state,rent]);
  const breakdown=useMemo(()=>categoryTotals(state?.entries||[]),[state]);
  const cardTotal=(state?.statements||[]).reduce((sum,item)=>sum+item.confirmed_total,0);
  const otherBills=(state?.bills||[]).filter(item=>item.kind==='utilities'||item.kind==='other');
  const hasSettlementData=!!(state?.statements.length||otherBills.length||rent.amount);
  const rowsTotal=draft?.entries.reduce((sum,row)=>sum+Number(row.amount||0),0)||0;
  async function save() {
    if (!editing||demoView||busy) return;
    setBusy(true);setNotice('');
    try {
      const id=editing.data.id;
      const targetMonth=editing.data.due_month;
      await api('/bills'+(id?`/${id}`:''),{method:id?'PUT':'POST',body:JSON.stringify(editing.data)});
      setEditing(current=>current?{...current,closing:true}:null);
      if (targetMonth && targetMonth!==month) setMonth(targetMonth);
      else await load();
    } catch(e) {setNotice(String(e instanceof Error?e.message:e));}
    finally {setBusy(false);}
  }
  async function remove(id:string) {
    if(demoView||busy)return;
    const message=editing?.data.kind==='rent'?'この月の個別家賃を削除します。基本家賃が設定されている場合はその金額に戻ります。よろしいですか？':'この引落を削除しますか？';
    if (!window.confirm(message)) return;
    setBusy(true);setNotice('');
    try { await api(`/bills/${id}`,{method:'DELETE'});setEditing(current=>current?{...current,closing:true}:null);await load(); } catch(e) {setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
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
  async function analyzeStatement() {
    const isDemo=demoView||aiMode==='demo';
    if(busy||!selectedCardId||(isDemo?!state?.demo_enabled:!screenshots.length))return;
    const controller=new AbortController();
    importRequest.current=controller;
    setBusy(true);setNotice('');
    try {
      const result=await runStatementImport({demo:isDemo,signal:controller.signal,onProgress:setImportProgress,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        analyze:onEntry=>isDemo?Promise.resolve(demoImportResult(month)):streamStatement(screenshots.map(item=>item.image),controller.signal,onEntry,state?.demo_enabled?importModel:undefined)});
      const sum=result.entries.reduce((a,b)=>a+b.amount,0);
      const card=state?.cards.find(item=>item.id===selectedCardId);
      setDraft({due_month:month,card_id:selectedCardId,title:`${monthText(month)}の${card?.name||'共有カード'}`,confirmed_total:result.confirmed_total||sum,entries:result.entries,demo:!!result.demo,model:!isDemo&&state?.demo_enabled?importModel:undefined});setTotalChecked(false);
      if(!result.entries.length)setNotice('利用行を読み取れませんでした。明細行を手入力してください。');
    }catch(e){if(!controller.signal.aborted)setNotice(String(e instanceof Error?e.message:e));}
    finally{if(importRequest.current===controller){importRequest.current=null;setImportProgress(null);setBusy(false);}}
  }
  function cancelImport() {
    importRequest.current?.abort();importRequest.current=null;
    setImportProgress(null);setBusy(false);
  }
  async function saveStatement() {
    if(demoView||busy||!draft||draft.demo || !totalChecked || draft.confirmed_total!==rowsTotal)return;
    setBusy(true);setNotice('');
    try {
      await api('/statements',{method:'POST',body:JSON.stringify({due_month:draft.due_month,card_id:draft.card_id,title:draft.title,confirmed_total:draft.confirmed_total,entries:draft.entries})});
      const targetMonth=draft.due_month;setImportPanel(current=>current?{...current,closing:true}:null);
      if(targetMonth!==month)setMonth(targetMonth);else await load();
    }catch(e){setNotice(String(e instanceof Error?e.message:e));}
    finally{setBusy(false);}
  }
  async function removeStatement(id:string) {
    if(demoView||busy)return;
    if(!window.confirm('このカード明細と全ての利用行を削除しますか？'))return;
    setBusy(true);setNotice('');
    try{await api(`/statements/${id}`,{method:'DELETE'});if(openCard?.type==='statement'&&openCard.id===id)setOpenCard(null);await load();}catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function changeCategory(id:string,category:Category) {
    if(busy)return;
    setCategoryDraft(current=>({...current,[id]:category}));
  }
  const editedEntries=(state?.entries||[]).map(entry=>({...entry,category:categoryDraft[entry.id]??entry.category,amount:amountDraft[entry.id]===undefined?entry.amount:Number(amountDraft[entry.id])}));
  const entryChanges=editedEntries.filter(entry=>state?.entries.some(original=>original.id===entry.id&&(original.category!==entry.category||original.amount!==entry.amount)));
  const changedStatements=(state?.statements||[]).filter(statement=>entryChanges.some(entry=>entry.statement_id===statement.id));
  const validEntryChanges=entryChanges.every(entry=>Number.isSafeInteger(entry.amount)&&entry.amount!==0&&Math.abs(entry.amount)<=100_000_000)&&changedStatements.every(statement=>{const total=editedEntries.filter(entry=>entry.statement_id===statement.id).reduce((sum,entry)=>sum+entry.amount,0);return total>0&&total<=100_000_000;});
  async function saveCategories() {
    if(demoView||busy||!entryChanges.length||!validEntryChanges)return;
    setBusy(true);setNotice('');
    try{
      for(const statement of changedStatements)await api(`/statements/${statement.id}/entries`,{method:'PUT',body:JSON.stringify({entries:editedEntries.filter(entry=>entry.statement_id===statement.id).map(({id,category,amount})=>({id,category,amount}))})});
      await load();setCategoryDraft({});setAmountDraft({});setOpenCard(current=>current?{...current,view:'details'}:null);
    }catch(e){setNotice(`変更をすべて保存できませんでした。再度保存してください。${e instanceof Error?e.message:String(e)}`);}finally{setBusy(false);}
  }
  const addBill=(source?:HTMLElement)=>setEditing({type:'bill',view:'summary',initialView:'summary',origin:source?panelOrigin(source):undefined,data:state?.bills.find(b=>b.kind==='rent')||{due_month:month,kind:'rent',title:'家賃',amount:rent.amount,note:''}});
  const dismissCard=()=>setOpenCard(current=>current?{...current,closing:true}:null);
  const dismissBill=()=>setEditing(current=>current?{...current,closing:true}:null);
  const dismissSettings=()=>setCardSettings(current=>current?{...current,closing:true}:null);
  const openSettings=(card?:SharedCard,source?:HTMLElement)=>setCardSettings({card,view:'edit',name:card?.name||'',active:card?.active??true,color:card?.color??defaultCardColor,origin:source?panelOrigin(source):undefined});
  const dismissCategorySettings=()=>setCategorySettings(current=>current?{...current,closing:true}:null);
  async function saveCategorySettings() {
    if(!categorySettings||demoView||busy)return;
    setBusy(true);setNotice('');
    try{
      const draft=categorySettings.draft;
      const value=await api<CategoryAppearance>(categorySettings.isNew?'/category-settings':`/category-settings/${encodeURIComponent(draft.category)}`,{method:categorySettings.isNew?'POST':'PUT',body:JSON.stringify({...draft,category:normalizeCategoryName(draft.category)})});
      setState(current=>{
        if(!current)return current;
        const previous=allCategoryAppearances(current.category_settings);
        const updated=previous.some(item=>item.category===value.category)?previous.map(item=>item.category===value.category?value:item):[...previous,value];
        return {...current,category_settings:updated};
      });
      dismissCategorySettings();
    }catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function createCard(name:string,color:string) {
    if(demoView||busy||!name.trim())return;
    setBusy(true);setNotice('');
    try{await api('/cards',{method:'POST',body:JSON.stringify({name:name.trim(),color})});dismissSettings();await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function updateCard(card:SharedCard,name:string,active:boolean,color:string) {
    if(demoView||busy)return;
    setBusy(true);setNotice('');
    try{await api(`/cards/${card.id}`,{method:'PUT',body:JSON.stringify({name,active,color})});dismissSettings();await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function saveRentRule() {
    if(demoView||busy)return;
    if(!rentStartMonth||!Number.isSafeInteger(Number(rentAmount))||Number(rentAmount)<=0)return;
    setBusy(true);setNotice('');
    try{await api(`/rent-rules/${rentStartMonth}`,{method:'PUT',body:JSON.stringify({amount:Number(rentAmount)})});dismissBill();await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function removeCard(card:SharedCard) {
    if(demoView||busy)return;
    if(!window.confirm(`「${card.name}」を削除しますか？登録済みの明細と利用履歴は残ります。`))return;
    setBusy(true);setNotice('');
    try{await api(`/cards/${card.id}`,{method:'DELETE'});dismissSettings();await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  async function removeRentRule(effectiveMonth:string) {
    if(demoView||busy)return;
    if(!window.confirm(`${monthText(effectiveMonth)}からの基本家賃を削除しますか？`))return;
    setBusy(true);setNotice('');
    try{await api(`/rent-rules/${effectiveMonth}`,{method:'DELETE'});dismissBill();await load();}
    catch(e){setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
  }
  const openImport=()=>{
    setAiMode(state?.demo_enabled&&(demoView||!state?.ai_enabled)?'demo':'live');
    const source=document.querySelector<HTMLElement>('.dock-add')??document.activeElement;
    setNotice('');setDraft(null);setScreenshots([]);setTotalChecked(false);
    importDestination.current=null;
    setImportPanel({origin:source instanceof HTMLElement?panelOrigin(source):undefined});
  };
  const selectTab=(value:Tab)=>{
    if(value==='import'){
      if(openCard){cardDestination.current='import';dismissCard();return;}
      openImport();return;
    }
    if(importPanel){if(importRequest.current)cancelImport();else if(busy)return;importDestination.current=value;setImportPanel({...importPanel,closing:true});return;}

    const update=()=>{cardDestination.current=null;setOpenCard(null);setTab(value);setNotice('');};
    if(value===tab){update();return;}
    const order:Tab[]=['home','ledger','settings','import'];
    transitionPage(order.indexOf(value)<order.indexOf(tab)?-1:1,update);
  };
  const switchDemo=(enabled:boolean)=>{window.sessionStorage.setItem('uchiwake-demo-view',enabled?'1':'0');setOpenCard(null);setImportPanel(null);setCardSettings(null);setCategorySettings(null);setDraft(null);setScreenshots([]);setEditing(null);setDemoView(enabled);};
  const canSaveDraft=!!draft&&totalChecked&&draft.entries.length>0&&rowsTotal===draft.confirmed_total&&rowsTotal>0&&!!draft.title.trim()&&!!draft.card_id&&draft.entries.every(e=>!!e.title.trim()&&!!e.amount);
  const chart=history.length?history.slice(-chartMonths):Array.from({length:chartMonths},(_,index)=>({month:bump(month,index-chartMonths+1),amount:0,total:0}));
  const panelStatements=(state?.statements||[]).filter(item=>openCard?.type==='card'?item.card_id===openCard.id:openCard?.type==='statement'&&item.id===openCard.id);
  const panelTitle=state?.cards.find(card=>card.id===(openCard?.type==='card'?openCard.id:panelStatements[0]?.card_id))?.name||panelStatements[0]?.title;
  const cardContext:DockContext|undefined=openCard?{
    label:'カードの明細',
    onBack:()=>{if(busy)return;if(openCard.view==='edit'){setCategoryDraft({});setAmountDraft({});setOpenCard({...openCard,view:'details'});}else dismissCard();},
    actionLabel:openCard.view==='edit'?(busy?'保存中…':'変更を保存する'):openCard.view==='details'?'編集':!panelStatements.length?'明細を取り込む':'すべての明細を見る',
    compact:openCard.view==='details',
    commit:openCard.view==='edit',
    actionIcon:openCard.view==='details'?'edit':undefined,
    disabled:busy||(openCard.view==='edit'&&(demoView||!entryChanges.length||!validEntryChanges)),
    trailingEdit:openCard.view==='summary'?{label:'明細を編集',disabled:busy||!panelStatements.length,onAction:()=>setOpenCard({...openCard,view:'edit'})}:undefined,
    secondaryAction:openCard.view!=='summary'&&panelStatements.length===1?{label:'削除',disabled:demoView||busy,onAction:()=>void removeStatement(panelStatements[0].id)}:undefined,
    onAction:()=>{
      if(busy)return;
      if(openCard.view==='edit'){void saveCategories();return;}
      if(openCard.view==='details'){setOpenCard({...openCard,view:'edit'});return;}
      if(!panelStatements.length){
        if(openCard.type==='card')setSelectedCardId(openCard.id);selectTab('import');
      }else{cardDestination.current='ledger';dismissCard();}
    }
  }:undefined;
  const activeRentRule=state?.rent_rules.filter(rule=>rule.effective_month<=month).sort((a,b)=>b.effective_month.localeCompare(a.effective_month))[0];
  const openFixedRent=()=>{
    if(!editing||busy)return;
    setRentStartMonth(activeRentRule?.effective_month??month);
    setRentAmount(String(activeRentRule?.amount??editing.data.amount??''));
    setEditing({...editing,view:'fixed',rentRuleMonth:activeRentRule?.effective_month});
  };
  const deleteBillAction=editing?{
    label:editing.view==='fixed'||(!editing.data.id&&editing.data.kind==='rent')?'基本家賃を削除':'引落を削除',
    disabled:demoView||busy||(editing.view==='fixed'?!editing.rentRuleMonth:!editing.data.id&&!(editing.data.kind==='rent'&&activeRentRule)),
    onAction:()=>{
      if(editing.view==='fixed'){if(editing.rentRuleMonth)void removeRentRule(editing.rentRuleMonth);}
      else if(editing.data.id)void remove(editing.data.id);
      else if(editing.data.kind==='rent'&&activeRentRule)void removeRentRule(activeRentRule.effective_month);
    }
  }:undefined;
  const billContext:DockContext|undefined=editing?{
    label:'引落',
    onBack:()=>editing.view==='summary'||(editing.view==='fixed'&&editing.initialView==='fixed')?dismissBill():setEditing({...editing,view:'summary'}),
    actionLabel:editing.view==='summary'?(editing.data.kind==='rent'?'この月の家賃を編集':'編集'):busy?'保存中…':editing.view==='fixed'?'基本家賃を保存':'保存する',
    rentActions:editing.data.kind==='rent'&&editing.view==='summary',
    compact:editing.view==='summary',actionIcon:editing.view==='summary'?'edit':undefined,
    commit:editing.view!=='summary',secondaryAction:deleteBillAction,
    auxiliaryAction:editing.data.kind==='rent'&&editing.view==='summary'?{label:'基本家賃を設定',onAction:openFixedRent,disabled:busy}:undefined,
    onAction:()=>{if(busy)return;if(editing.view==='summary')setEditing({...editing,view:'edit'});else if(editing.view==='fixed')void saveRentRule();else void save();},
    disabled:busy||(demoView&&editing.view!=='summary')||(editing.view==='edit'&&(!editing.data.title||!Number(editing.data.amount)))||(editing.view==='fixed'&&(!rentStartMonth||!Number.isSafeInteger(Number(rentAmount))||Number(rentAmount)<=0))
  }:undefined;
  const settingsContext:DockContext|undefined=cardSettings?{
    commit:true,label:'共有カード',
    secondaryAction:cardSettings.card?{label:'カードを削除',disabled:demoView||busy,onAction:()=>void removeCard(cardSettings.card!)}:undefined,
    onBack:()=>{if(busy)return;setNotice('');dismissSettings();},
    actionLabel:busy?'保存中…':cardSettings.card?'変更を保存する':'カードを追加',
    onAction:()=>{if(cardSettings.card)void updateCard(cardSettings.card,cardSettings.name.trim(),cardSettings.active,cardSettings.color);else void createCard(cardSettings.name,cardSettings.color);},
    disabled:demoView||busy||!cardSettings.name.trim()||(!!cardSettings.card&&cardSettings.name.trim()===cardSettings.card.name&&cardSettings.active===cardSettings.card.active&&cardSettings.color===(cardSettings.card.color??defaultCardColor))
  }:undefined;
  const importContext:DockContext|undefined=importPanel?{
    label:draft?'カード明細の確認':'明細の取り込み',commit:true,
    actionAppearance:importProgress?'breathing':!draft&&state?.cards.some(card=>card.active)?'studio':undefined,
    onBack:()=>{if(importRequest.current){cancelImport();return;}if(busy)return;if(draft){setDraft(null);setNotice('');}else setImportPanel({...importPanel,closing:true});},
    actionLabel:draft?(draft.demo?'デモ・保存されません':busy?'保存中…':'保存して計算'):!state?.cards.some(card=>card.active)?'共有カードを設定':importProgress?'仕分け中...':aiMode==='demo'?'デモで仕分ける':'取り込みを始める',
    onAction:()=>{if(busy)return;if(draft)void saveStatement();else if(!state?.cards.some(card=>card.active))selectTab('settings');else void analyzeStatement();},
    disabled:busy||!!((demoView||draft?.demo)&&draft)||(!!state?.cards.some(card=>card.active)&&(draft?!canSaveDraft:(aiMode==='live'&&(!screenshots.length||!state.ai_enabled))||(aiMode==='demo'&&!state.demo_enabled)))
  }:undefined;
  const categoryOptions=allCategoryAppearances(state?.category_settings);
  const categoryNameDuplicate=!!categorySettings?.isNew&&categoryOptions.some(item=>item.category===normalizeCategoryName(categorySettings.draft.category));
  const categorySettingsContext:DockContext|undefined=categorySettings?{
    label:'費目の設定',commit:true,
    actionLabel:busy?'保存中…':categorySettings.isNew?'費目を追加':'変更を保存する',
    onBack:()=>{if(busy)return;setNotice('');dismissCategorySettings();},
    onAction:()=>{if(busy)return;void saveCategorySettings();},
    disabled:busy||demoView||!validCategoryName(categorySettings.draft.category)||categoryNameDuplicate||(!categorySettings.isNew&&categorySettings.saved.icon===categorySettings.draft.icon&&categorySettings.saved.color===categorySettings.draft.color)
  }:undefined;
  const PageIcon=({home:Calculator,ledger:ReceiptText,settings:Settings,import:Camera} as const)[tab];
  const dockContext=(!openCard?.closing&&cardContext)||(!editing?.closing&&billContext)||(!cardSettings?.closing&&settingsContext)||(!importPanel?.closing&&importContext)||(!categorySettings?.closing&&categorySettingsContext)||undefined;
  return <>
    <main className="shell" aria-busy={!state||state.month!==month} inert={!!state&&state.month!==month}>
      <nav className="desktop-tabs" aria-label="メインメニュー">{dockTabs.map(item=><button key={item.key} aria-current={tab===item.key?'page':undefined} onClick={()=>selectTab(item.key)}><item.icon size={18}/>{item.label}</button>)}<button onClick={()=>selectTab('import')}><Plus size={18}/>追加</button></nav>
      <div id="main-content">
      <div className={`page-top ${tab==='home'?'home-page-top':tab==='ledger'||tab==='settings'?'screen-page-top':''}`}><h1 className="page-heading"><PageIcon aria-hidden="true"/>{draft&&tab==='import'?'明細を確認':({home:'精算',ledger:'明細',import:'明細を取り込む',settings:'設定'} as const)[tab]}</h1>{!draft&&tab!=='ledger'&&tab!=='settings'&&<div className="month-switch"><button aria-label="前月" onClick={()=>setMonth(bump(month,-1))}><ChevronLeft size={18}/></button><span>{monthText(month)}</span><button aria-label="翌月" onClick={()=>setMonth(bump(month,1))}><ChevronRight size={18}/></button></div>}</div>
      {notice&&!importPanel&&<div className="notice" role="alert"><span>{notice}</span><button aria-label="閉じる" onClick={()=>setNotice('')}><X size={16}/></button></div>}
      {demoView&&<div className="demo-view-banner" role="status">デモ表示中 · サンプルデータ</div>}
      {!state?<div className="empty loading">{notice?'データを表示できませんでした。':'読み込んでいます…'}{notice&&<div><button className="secondary" onClick={()=>void load()}>再読み込み</button></div>}</div>:<>
      {tab==='home'&&<>
        <section className="hero settlement-hero"><h2 className="page-heading"><Calculator aria-hidden="true"/>精算</h2>
          <button type="button" className="settlement-amount-toggle" aria-label={`現在は${showTotalFirst?'支払い合計':'ひとりあたり'}を大きく表示。タップして切り替え`} aria-pressed={showTotalFirst} onClick={()=>setShowTotalFirst(value=>!value)}>
            <span className="hero-label">{showTotalFirst?<UsersRound size={18} aria-hidden="true"/>:<UserRound size={18} aria-hidden="true"/>}{showTotalFirst?'支払い合計':'ひとりあたり'}<span className="hero-basis">{showTotalFirst?'2人分':'2人で折半'}</span><span className="hero-switch-hint"><ArrowLeftRight size={14} aria-hidden="true"/></span></span>
            <span className="hero-money">{hasSettlementData?<NumberTicker value={showTotalFirst?totals.total:totals.perPerson}/>: '—'}</span>
            <span className="hero-secondary"><span>{showTotalFirst?'ひとりあたり':'支払い合計'}</span><strong>{hasSettlementData?<NumberTicker value={showTotalFirst?totals.perPerson:totals.total}/>: '—'}</strong></span>
          </button>
          <SettlementChart data={chart} month={displayedMonth}/>
          <div className="chart-ranges" role="group" aria-label="表示期間">{([[6,'6M'],[12,'1Y'],[36,'3Y'],[60,'5Y']] as const).map(([count,label])=><button key={count} aria-pressed={chartMonths===count} onClick={()=>setChartMonths(count)}>{label}</button>)}</div>
        </section>
        <section className="section settlement-section"><div className="settlement-list">
          {state.cards.filter(card=>card.active||state.statements.some(item=>item.card_id===card.id)).map(card=>{const items=state.statements.filter(item=>item.card_id===card.id);return <button className="settlement-item panel-source" data-panel-source={openCard?.type==='card'&&openCard.id===card.id?'true':undefined} key={card.id} onClick={event=>{setSelectedCardId(card.id);setOpenCard({type:'card',id:card.id,view:'summary',origin:panelOrigin(event.currentTarget)});}}><span className="settlement-item-icon"><CreditCard size={22} color={card.color}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{card.name}</span>{items.length>0&&<small>{items.length}件の明細</small>}<strong className="settlement-item-amount">{items.length?yen(items.reduce((sum,item)=>sum+item.confirmed_total,0)):'—'}</strong></span><ChevronRight size={17}/></button>})}
          {state.statements.filter(item=>!item.card_id||!state.cards.some(card=>card.id===item.card_id)).map(item=><button className="settlement-item panel-source" data-panel-source={openCard?.type==='statement'&&openCard.id===item.id?'true':undefined} key={item.id} onClick={event=>setOpenCard({type:'statement',id:item.id,view:'summary',origin:panelOrigin(event.currentTarget)})}><span className="settlement-item-icon"><CreditCard size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{item.title}</span><strong className="settlement-item-amount">{yen(item.confirmed_total)}</strong></span><ChevronRight size={17}/></button>)}
          {!state.cards.length&&<button className="settlement-item panel-source" data-panel-source={cardSettings&&!cardSettings.card?'true':undefined} onClick={event=>openSettings(undefined,event.currentTarget)}><span className="settlement-item-icon"><CreditCard size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">共有カード</span><strong className="settlement-item-amount">—</strong></span><ChevronRight size={17}/></button>}
          <button className="settlement-item panel-source" data-panel-source={editing?.data.kind==='rent'?'true':undefined} onClick={event=>addBill(event.currentTarget)}><span className="settlement-item-icon"><Home size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">家賃</span><strong className="settlement-item-amount">{rent.amount?yen(rent.amount):'—'}</strong></span><ChevronRight size={17}/></button>
          {otherBills.map(b=><button className="settlement-item panel-source" data-panel-source={editing?.data.id===b.id?'true':undefined} key={b.id} onClick={event=>setEditing({type:'bill',data:b,view:'summary',initialView:'summary',origin:panelOrigin(event.currentTarget)})}><span className="settlement-item-icon"><ArrowDownLeft size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{b.title}</span><strong className="settlement-item-amount">{yen(b.amount)}</strong></span><ChevronRight size={17}/></button>)}
        </div></section>
        {state.bills.some(b=>b.kind==='card')&&<details className="legacy-details"><summary>以前のカード請求の入力を確認</summary>{state.bills.filter(b=>b.kind==='card').map(b=><BillRow key={b.id} bill={b} onEdit={()=>setEditing({type:'bill',data:b,view:'summary',initialView:'summary'})}/>)}</details>}
      </>}
      {tab==='ledger'&&<>{state.statements.length? <>
        <div className="ledger-overview"><span>{monthText(displayedMonth)}のカード合計</span><strong><NumberTicker value={cardTotal}/></strong><small>引落月で表示 · 費目は後から変更できます</small></div>
        {!!breakdown.length&&<CategoryChart data={breakdown} settings={state.category_settings}/>}
        <h2 className="ledger-cards-heading">カード別</h2>
        {state.statements.map(s=><button className="statement-preview panel-source" data-panel-source={openCard?.type==='statement'&&openCard.id===s.id?'true':undefined} key={s.id} onClick={event=>setOpenCard({type:'statement',id:s.id,view:'details',origin:panelOrigin(event.currentTarget)})}><span className="statement-preview-heading"><CreditCard size={22} color={state.cards.find(card=>card.id===s.card_id)?.color}/><span><strong>{state.cards.find(card=>card.id===s.card_id)?.name||s.title}</strong><small>{state.entries.filter(e=>e.statement_id===s.id).length}件の明細</small></span><ChevronRight size={18}/></span><strong className="statement-preview-amount">{yen(s.confirmed_total)}</strong></button>)}

      </>:demoView?<div className="empty">この月のデモ明細はありません。</div>:<Empty text="この月のカード明細はまだありません。" onClick={()=>selectTab('import')} label="カード明細を取り込む"/>}</>}
      {tab==='settings'&&<>
        {state.demo_enabled&&<section className="section settings-section demo-settings"><h2>表示するデータ</h2><p className="subtle">デモには直近6か月のカード2枚と家賃を用意しています。実データの保存内容は変わりません。</p><div className="mode-options" role="group" aria-label="表示するデータ"><button className={!demoView?'selected':''} aria-pressed={!demoView} onClick={()=>switchDemo(false)}>実データ</button><button className={demoView?'selected':''} aria-pressed={demoView} onClick={()=>switchDemo(true)}>デモデータ</button></div></section>}

        <section className="section settings-section"><h2 className="section-heading"><CreditCard size={20} aria-hidden="true"/>共有カード</h2><p className="subtle">カードを登録すると、明細を取り込む際に選べます。</p><div className="card-settings-list">{state.cards.map(card=><button type="button" className="settings-card-button panel-source" data-panel-source={cardSettings?.card?.id===card.id?'true':undefined} key={card.id} onClick={event=>openSettings(card,event.currentTarget)}><CreditCard size={21} color={card.color}/><span><strong>{card.name}</strong><small>{card.active?'使用中':'使用停止中'}</small></span><ChevronRight size={18}/></button>)}</div><button type="button" className="settings-add-card" onClick={event=>openSettings(undefined,event.currentTarget)}><Plus size={17}/> カードを追加</button></section>
        <section className="section settings-section"><h2 className="section-heading"><Tags size={20} aria-hidden="true"/>費目</h2><p className="subtle">グラフや明細に表示するアイコンと色を変更できます。</p><div className="card-settings-list category-settings-list">{categoryOptions.map(value=><button type="button" className="settings-card-button panel-source" data-panel-source={categorySettings?.saved.category===value.category?'true':undefined} key={value.category} onClick={event=>{setNotice('');setCategorySettings({saved:value,draft:value,view:'edit',origin:panelOrigin(event.currentTarget)});}}><CategoryIcon name={value.icon} color={value.color} size={21}/><span><strong>{value.category}</strong></span><ChevronRight size={18}/></button>)}</div><button type="button" className="settings-add-card" onClick={event=>{const value={category:'',icon:'tag',color:defaultCardColor};setNotice('');setCategorySettings({saved:value,draft:value,isNew:true,view:'edit',origin:panelOrigin(event.currentTarget)});}}><Plus size={17}/> 費目を追加</button></section>
        <section className="section settings-section"><h2 className="section-heading"><Home size={20} aria-hidden="true"/>基本家賃</h2><p className="subtle">指定した月から毎月の精算に使います。金額が変わったら、新しい開始月を指定してください。</p><div className="rule-list">{state.rent_rules.map(rule=><button type="button" className="settings-rent-button" key={rule.effective_month} onClick={event=>{setRentStartMonth(rule.effective_month);setRentAmount(String(rule.amount));setEditing({type:'bill',data:{kind:'rent',title:'家賃',due_month:month,amount:rule.amount},view:'fixed',initialView:'fixed',rentRuleMonth:rule.effective_month,origin:panelOrigin(event.currentTarget)});}}><Home size={21}/><span><strong>{yen(rule.amount)}</strong><small>{monthText(rule.effective_month)}から</small></span><ChevronRight size={18}/></button>)}</div><button type="button" className="settings-add-card" onClick={event=>{setRentStartMonth(month);setRentAmount('');setEditing({type:'bill',data:{kind:'rent',title:'家賃',due_month:month,amount:rent.amount},view:'fixed',initialView:'fixed',origin:panelOrigin(event.currentTarget)});}}><Plus size={17}/> 基本家賃を設定</button><p className="subtle">一時的な変更は精算画面の家賃から入力できます。</p></section>
      </>}
      </>}
      </div>
    </main>
    <FloatingDock tab={tab} onSelect={selectTab} context={dockContext} panelActive={!!(openCard||editing||cardSettings||importPanel||categorySettings)} month={month} onMonthChange={setMonth} onPrevMonth={()=>setMonth(bump(month,-1))} onNextMonth={()=>setMonth(bump(month,1))} add={{label:'追加',disabled:!state||state.month!==month,options:[...((state?.cards||[]).filter(card=>card.active).map(card=>({id:card.id,label:card.name,color:card.color,kind:'card' as const,onClick:()=>{setSelectedCardId(card.id);setDraft(null);setScreenshots([]);selectTab('import');}}))),...(!state?.cards.some(card=>card.active)?[{id:'new-card',label:'カードを追加',kind:'card' as const,onClick:()=>openSettings()}]:[]),{id:'rent',label:'家賃',kind:'rent',onClick:()=>addBill()}]}}/>
    {openCard&&state&&panelTitle&&<CardStatementPanel key={`${openCard.type}-${openCard.id}`} title={panelTitle} color={state.cards.find(card=>card.id===(openCard.type==='card'?openCard.id:panelStatements[0]?.card_id))?.color} month={month} statements={panelStatements} entries={editedEntries} categorySettings={state.category_settings} amountDraft={amountDraft} onChangeAmount={(id,amount)=>{if(!busy)setAmountDraft(current=>({...current,[id]:amount}));}} demo={demoView} view={openCard.view} origin={openCard.origin} closing={openCard.closing} onClose={cardContext!.onBack} onExited={()=>{const destination=cardDestination.current;cardDestination.current=null;setOpenCard(null);setCategoryDraft({});setAmountDraft({});if(destination==='import')openImport();else if(destination)selectTab(destination);}} actionLabel={cardContext!.actionLabel} actionDisabled={cardContext!.disabled} busy={busy} error={notice} onAction={cardContext!.onAction} onChangeCategory={(id,category)=>{void changeCategory(id,category);}} onDeleteStatement={id=>{void removeStatement(id);}}/>}
    {categorySettings&&categorySettingsContext&&<CategorySettingsPanel value={categorySettings.draft} isNew={categorySettings.isNew} view={categorySettings.view} origin={categorySettings.origin} closing={categorySettings.closing} busy={busy} error={notice||(categoryNameDuplicate?'同じ名前の費目があります':undefined)} actionLabel={categorySettingsContext.actionLabel} actionDisabled={categorySettingsContext.disabled} onChange={value=>setCategorySettings(current=>current?{...current,draft:value}:null)} onAction={categorySettingsContext.onAction} onClose={categorySettingsContext.onBack} onExited={()=>setCategorySettings(null)}/>}
    {importPanel&&state&&importContext&&<StatementImportPanel reviewing={!!draft} processing={!!importProgress} progress={importProgress} origin={importPanel.origin} closing={importPanel.closing} context={importContext} onExited={()=>{const destination=importDestination.current;importDestination.current=null;setImportPanel(null);setDraft(null);setScreenshots([]);setTotalChecked(false);setNotice('');if(destination){setTab(destination);}}}>
      {notice&&<div className="notice" role="alert">{notice}</div>}
{(importProgress?<ImportProcessing progress={importProgress} settings={state.category_settings}/>:!draft?<>
        {!state.cards.some(card=>card.active)?<Empty text="先に共有カードを設定してください。" onClick={()=>selectTab('settings')} label="設定を開く"/>:<ImportSetup cards={state.cards.filter(card=>card.active)} cardId={selectedCardId} month={month} images={screenshots} mode={aiMode} model={importModel} onModel={changeImportModel} demoEnabled={state.demo_enabled} liveEnabled={!demoView&&state.ai_enabled} onCard={id=>{setSelectedCardId(id);setScreenshots([]);}} onMode={value=>{setAiMode(value);setNotice('');}} onFiles={files=>{void chooseScreenshots(files);}} onRemove={index=>setScreenshots(current=>current.filter((_,i)=>i!==index))} onManual={()=>{setDraft({due_month:month,card_id:selectedCardId,title:`${monthText(month)}の${state.cards.find(item=>item.id===selectedCardId)?.name||'共有カード'}`,confirmed_total:0,entries:[{spent_on:'',title:'',amount:0,category:'その他・要確認'}],demo:demoView});setTotalChecked(false);}}/>}
      </>:<ImportReview draft={draft} cards={state.cards} settings={state.category_settings} busy={busy} checked={totalChecked} onChange={value=>{setDraft(value);setTotalChecked(false);}} onChecked={setTotalChecked}/>)}
    </StatementImportPanel>}
    {editing&&<BillPanel bill={editing.data} view={editing.view} onView={openFixedRent} deleteAction={deleteBillAction} origin={editing.origin} closing={editing.closing} onExited={()=>setEditing(null)} actionLabel={billContext!.actionLabel} onAction={billContext!.onAction} actionDisabled={billContext!.disabled} month={month} demo={demoView} busy={busy} rentStartMonth={rentStartMonth} rentAmount={rentAmount} onRentStartMonth={setRentStartMonth} onRentAmount={setRentAmount} onChange={data=>setEditing({...editing,data})} onClose={billContext!.onBack}/>}
    {cardSettings&&<CardSettingsPanel key={cardSettings.card?.id||'new'} card={cardSettings.card} view={cardSettings.view} origin={cardSettings.origin} closing={cardSettings.closing} busy={busy} name={cardSettings.name} active={cardSettings.active} color={cardSettings.color} onColor={color=>setCardSettings({...cardSettings,color})} deleteAction={settingsContext!.secondaryAction} error={notice} actionLabel={settingsContext!.actionLabel} actionDisabled={settingsContext!.disabled} onName={name=>setCardSettings({...cardSettings,name})} onActive={active=>setCardSettings({...cardSettings,active})} onClose={settingsContext!.onBack} onExited={()=>setCardSettings(null)} onSave={()=>settingsContext!.onAction()}/>}
  </>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>}
function Empty({text,onClick,label}:{text:string;onClick:()=>void;label:string}) {return <div className="empty"><p>{text}</p><button className="secondary" onClick={onClick}><Plus size={16}/>{label}</button></div>}
function BillRow({bill,onEdit}:{bill:Bill;onEdit:()=>void}) {return <div className="row"><div className="row-symbol">{bill.kind==='card'?<CreditCard size={19}/>:bill.kind==='rent'?<Home size={19}/>:<ArrowDownLeft size={19}/>}</div><div className="row-content"><strong>{bill.title}</strong><small>{billKinds[bill.kind]}{bill.note?` · ${bill.note}`:''}</small></div><strong className="row-money">{yen(bill.amount)}</strong><button className="row-edit" onClick={onEdit} aria-label={`${bill.title}を編集`}>編集</button></div>}
createRoot(document.getElementById('root')!).render(<App/>);
