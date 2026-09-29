import { ClassificationSettings } from './classification-settings';
import { ImportDiagnostics } from './import-diagnostics';
import { spaceApi, type Api } from './space-api';
import { SpaceControls } from './space-controls';
import { SpaceSwitchScreen } from './space-switch-screen';
import { SpacePanel } from './space-panel';
import { AllocationBreakdownPanel } from './allocation-breakdown';
import { SpaceManagementSettings, SpaceSettingsLinks } from './space-settings';
import type { NameSaveAction } from './name-settings-form';
import { SettingsToggle } from './settings-toggle';
import { SettlementSettingsPanel } from './settlement-settings';
import { defaultConfig, settlementItems, settlementDetails, type Space, type SpaceData } from './spaces';
import './spaces.css';
import type { EntrySort } from './entry-sort';
import { CategoryEntriesPanel } from './category-entries-panel';
import { displayColor } from './display-color';
import { AppUpdateSettings, AppInfo } from './app-update-settings';
import { AppearanceSettings } from './appearance-settings';
import { AuthGate, AccountSettings, type AccountProps } from './auth';
import { streamStatement } from './statement-import-stream';
import { readStatementFile, mergeStatementFiles, type StatementFile } from './statement-files';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDownLeft, ArrowRight, LogOut, Calculator, ArrowLeftRight, UserRound, UsersRound, ReceiptText, Settings, Tags, Camera, Check, ChevronLeft, ChevronRight, CreditCard, Home, Plus, Trash2, X, Sparkles, Database } from 'lucide-react';
import { billKinds, statementSettlementAmount, categoryTotals, rentForMonth, type Bill, type Category, type CategoryAppearance, type EntryDraft, type SharedCard, type State } from './domain';
import { FloatingDock, dockTabs, type DockContext, type DockTab } from './floating-dock';
import { CardStatementPanel } from './card-statement-panel';
import { prepareStatementEdits, applyStatementEdit } from './statement-edit';
import { defaultCardColor } from './card-colors';
import { StatementImportPanel } from './statement-import-panel';
import { ImportConfirmationPanel } from './import-confirmation-panel';
import { ImportSetup, ImportProcessing } from './statement-import-content';
import { ImportReview, type ImportDraft } from './statement-import-review';
import { demoImportResult, runStatementImport, type ImportProgress } from './statement-import-flow';
import { BillPanel } from './bill-panel';
import { CardSettingsPanel } from './card-settings-panel';
import { CategorySettingsPanel } from './category-settings-panel';
import { allCategoryAppearances, isReviewCategory, fallbackCategory, normalizeCategoryName, validCategoryName } from './category-appearance';
import { CategoryIcon } from './category-icon';
import { SettlementChart, CategoryChart, type HistoryPoint } from './spending-charts';
import { historyEndMonth } from './chart-interaction';
import { NumberTicker } from './number-ticker';
import { useRouteTransition } from './kondo-route-motion';
import { panelOrigin, type PanelOrigin } from './use-panel-morph';
import './styles.css';
import './kondo-style.css';
import './kondo-route-motion.css';
import './statement-import.css';
import './studio-action.css';
import './theme.css';
import './palette.css';
import './settings.css';
import './entry-sort-controls.css';
import './entry-dock.css';

type Tab = DockTab;
type Editing = { type:'bill'; data:Partial<Bill>; view:'summary'|'edit'|'fixed'; initialView:'summary'|'fixed'; rentRuleMonth?:string; origin?:PanelOrigin; closing?:boolean };
type OpenCard = {type:'card'|'statement';id:string;view:'summary'|'details'|'edit';returnView?:'summary'|'details';origin?:PanelOrigin;closing?:boolean};
type OpenSettings = {card?:SharedCard;view:'summary'|'edit';name:string;active:boolean;color:string;origin?:PanelOrigin;closing?:boolean};
type AiMode = 'demo'|'live';
const yen = (amount:number) => `¥${amount.toLocaleString('ja-JP')}`;
const monthText = (month:string) => `${Number(month.slice(0,4))}年${Number(month.slice(5))}月`;
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const bump = (month:string,diff:number) => { const [year,m]=month.split('-').map(Number); const date=new Date(Date.UTC(year,m-1+diff,1)); return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`; };
type SpaceAppProps=AccountProps&{space:Space;spaces:Space[];onSelectSpace:(id:string,settingsOrigin?:PanelOrigin)=>void;onReady:(id:string)=>void;initialSettingsOrigin?:PanelOrigin;refreshSpaces:()=>Promise<void>;month:string;setMonth:(month:string)=>void;tab:Tab;setTab:(tab:Tab)=>void};
function SpaceApp(account:AccountProps) {
 const [spaces,setSpaces]=useState<Space[]>([]),[selected,setSelected]=useState(()=>localStorage.getItem(`uchiwake-space:${account.user.id}`)||''),[error,setError]=useState('');
 const [month,setMonth]=useState(today().slice(0,7)),[tab,setTab]=useState<Tab>('home');
 const [settingsTarget,setSettingsTarget]=useState<{spaceId:string;origin:PanelOrigin}|null>(null);
 const previousSpace=useRef<string|null>(null),switchSequence=useRef(0);
 const [switching,setSwitching]=useState<{space:Space;sequence:number;ready:boolean}|null>(null);
 const api=useMemo(()=>spaceApi(),[]);
 async function refreshSpaces(){const result=await api<{spaces:Space[]}>('/spaces');setSpaces(result.spaces);setError('');}
 useEffect(()=>{void refreshSpaces().catch(e=>{setError(e.message);document.dispatchEvent(new Event('uchiwake:ready'));});},[]);
 const space=spaces.find(s=>s.id===selected)??(!selected?spaces.find(s=>s.id==='legacy'):undefined)??spaces.find(s=>s.kind==='personal')??spaces[0];
 useLayoutEffect(()=>{
  if(!space)return;
  if(previousSpace.current&&previousSpace.current!==space.id)setSwitching({space,sequence:++switchSequence.current,ready:false});
  previousSpace.current=space.id;
 },[space]);
 const ready=useCallback((id:string)=>setSwitching(current=>current?.space.id===id&&!current.ready?{...current,ready:true}:current),[]);
 const select=(id:string,origin?:PanelOrigin)=>{localStorage.setItem(`uchiwake-space:${account.user.id}`,id);setSettingsTarget(origin?{spaceId:id,origin}:null);setSelected(id);};
 return <>{space?<App key={space.id} {...account} space={space} spaces={spaces} onSelectSpace={select} onReady={ready} initialSettingsOrigin={settingsTarget?.spaceId===space.id?settingsTarget.origin:undefined} refreshSpaces={refreshSpaces} month={month} setMonth={setMonth} tab={tab} setTab={setTab}/>:<main className="shell"><div className="empty">{error||'スペースを読み込んでいます…'}{error&&<button className="secondary" onClick={()=>void refreshSpaces().catch(e=>setError(e.message))}>再読み込み</button>}</div></main>}
 {switching&&<SpaceSwitchScreen key={switching.sequence} space={switching.space} ready={switching.ready} onExited={()=>setSwitching(current=>current?.sequence===switching.sequence?null:current)}/>}</>;
}
function App({user,logout,signingOut,updateProfile,space,spaces,onSelectSpace,onReady,initialSettingsOrigin,refreshSpaces,month,setMonth,tab,setTab}:SpaceAppProps) {
  const api:Api=useMemo(()=>spaceApi(space.id),[space.id]);
  const personal=space.kind==='personal';
  const [allocationOpen,setAllocationOpen]=useState<'month'|'default'|null>(null);
  const [spaceDock,setSpaceDock]=useState<DockContext>();
  const [spaceSettings,setSpaceSettings]=useState<{origin?:PanelOrigin;closing?:boolean}|null>(()=>initialSettingsOrigin?{origin:initialSettingsOrigin}:null);
  const [settingsDock,setSettingsDock]=useState<DockContext>();
  const [spaceNameAction,setSpaceNameAction]=useState<NameSaveAction>();
  const [allocationBreakdown,setAllocationBreakdown]=useState<{origin:PanelOrigin}|null>(null);
  const [breakdownDock,setBreakdownDock]=useState<DockContext>();
  const [allocationDock,setAllocationDock]=useState<DockContext>();
  const [savingProfile,setSavingProfile]=useState(false);
  async function saveProfile(name:string) {
    setSavingProfile(true);
    try { await updateProfile(name); } finally { setSavingProfile(false); }
  }
  const transitionPage=useRouteTransition();
  // Reset after the new page is committed, before the browser paints it.
  useLayoutEffect(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});},[tab]);
  const [showTotalFirst,setShowTotalFirst]=useState(false);
  const [demoView,setDemoView]=useState(()=>window.sessionStorage.getItem('uchiwake-demo-view')==='1');
  const requestId=useRef(0);
  const loadRequest=useRef<AbortController|null>(null);
  const loadedMode=useRef(demoView);
  const cardDestination=useRef<Tab|null>(null);
  const [state,setState]=useState<(State&Partial<SpaceData>)|null>(null);
  const [editing,setEditing]=useState<Editing|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [importDiagnostic,setImportDiagnostic]=useState('');
  useEffect(()=>{
    if (!state && !notice) return;
    onReady(space.id);
    const root=document.getElementById('root');
    if(root) root.dataset.bootReady='true';
    document.dispatchEvent(new Event('uchiwake:ready'));
  },[state,notice,onReady,space.id]);
  const [aiMode,setAiMode]=useState<AiMode>('demo');
  const [importMonth,setImportMonth]=useState(month);
  const [importFiles,setImportFiles]=useState<StatementFile[]>([]);
  const [readingFiles,setReadingFiles]=useState(false);
  const [selectedCardId,setSelectedCardId]=useState('');
  const [importPanel,setImportPanel]=useState<{origin?:PanelOrigin;closing?:boolean}|null>(null);
  const [importConfirmation,setImportConfirmation]=useState<{origin?:PanelOrigin;card:SharedCard}|null>(null);
  const [importConfirmationDock,setImportConfirmationDock]=useState<DockContext>();
  const importDestination=useRef<Tab|null>(null);
  const importRequest=useRef<AbortController|null>(null);
  const [importProgress,setImportProgress]=useState<ImportProgress|null>(null);
  useEffect(()=>()=>{importRequest.current?.abort();},[]);
  const [categoryDraft,setCategoryDraft]=useState<Record<string,Category>>({});
  const [amountDraft,setAmountDraft]=useState<Record<string,string>>({});
  const [deletedEntryIds,setDeletedEntryIds]=useState<string[]>([]);
  const [openCard,setOpenCard]=useState<OpenCard|null>(null);
  const [categoryDetails,setCategoryDetails]=useState<{category:Category;origin?:PanelOrigin;closing?:boolean}|null>(null);
  const [categorySort,setCategorySort]=useState<EntrySort>({key:'date',dateAscending:false,amountAscending:false});
  const [cardSort,setCardSort]=useState<EntrySort>({key:'date',dateAscending:false,amountAscending:false});
  const [groupByCard,setGroupByCard]=useState(false);
  useEffect(()=>{setCategorySort({key:'date',dateAscending:false,amountAscending:false});setGroupByCard(false);},[categoryDetails?.category]);
  useEffect(()=>{setCardSort({key:'date',dateAscending:false,amountAscending:false});},[openCard?.id,openCard?.type]);
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
    loadRequest.current?.abort();
    const controller=new AbortController();loadRequest.current=controller;
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]);
    const query=`?month=${month}${demoView?'&demo=1':''}`;
    const historyQuery=`?month=${historyEndMonth(month,history.at(-1)?.month)}&months=120${demoView?'&demo=1':''}`;
    try {
      // Commit the month and its graph together, retaining the previous render
      // until both requests finish so existing animation nodes stay mounted.
      const [result,resultHistory]=await Promise.all([
        api<State&Partial<SpaceData>>(`/state${query}`,{signal}),
        api<{months:HistoryPoint[]}>(`/settlement-history${historyQuery}`,{signal}).catch(()=>({months:[]}))
      ]);
      if(request===requestId.current){setState(result);setHistory(resultHistory.months);setNotice('');}
    }
    catch(e) { if(request===requestId.current&&!controller.signal.aborted){if(demoView){window.sessionStorage.removeItem('uchiwake-demo-view');setDemoView(false);}else {setNotice(signal.aborted?'データの読み込みがタイムアウトしました。もう一度お試しください。':String(e instanceof Error?e.message:e));if((e as {status?:number}).status===404){setState(null);void refreshSpaces();}}} }
    finally {controller.abort();if(loadRequest.current===controller)loadRequest.current=null;}
  }
  useEffect(()=>{
    requestId.current++;
    if(loadedMode.current!==demoView){loadedMode.current=demoView;setState(null);setHistory([]);}
    void load();
  },[month,demoView,user.name]);
  useEffect(()=>{cardDestination.current=null;setCategoryDetails(null);setOpenCard(null);setCategoryDraft({});setAmountDraft({});setDeletedEntryIds([]);},[month,demoView]);
  useEffect(()=>{setRentStartMonth(month);},[month]);
  useEffect(()=>{const active=state?.cards.filter(card=>card.active)||[];if(active.length&&!active.some(card=>card.id===selectedCardId))setSelectedCardId(active[0].id);},[state?.cards,selectedCardId]);
  useEffect(()=>()=>{requestId.current++;loadRequest.current?.abort();},[]);
  useEffect(()=>{
    const refresh=()=>{if(document.visibilityState==='visible'&&!loadRequest.current&&!busy&&!openCard&&!editing&&!cardSettings&&!categorySettings&&!importPanel&&!allocationOpen&&!allocationBreakdown&&!spaceSettings&&!spaceDock)void load();};
    const timer=window.setInterval(refresh,15000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{clearInterval(timer);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[month,demoView,busy,openCard,editing,cardSettings,categorySettings,importPanel,allocationOpen,allocationBreakdown,spaceSettings,spaceDock]);
  const displayedMonth=state?.month??month;
  const rentEnabled=state?.space_preferences?.rent_enabled===true;
  const rent=useMemo(()=>rentForMonth(displayedMonth,state?.bills||[],state?.rent_rules||[]),[displayedMonth,state]);
  const splitItems=useMemo(()=>state?settlementItems(state,personal):[],[state,personal]);
  const allocationConfig=state?.settlement?.config??defaultConfig([{user_id:user.id,name:user.name||'あなた',active:true}]);
  const {amounts:allocations,adjustments:roundingAdjustments}=useMemo(()=>settlementDetails(splitItems,allocationConfig),[splitItems,allocationConfig]);
  const totals={total:splitItems.reduce((n,i)=>n+i.amount,0),perPerson:allocations[user.id]??0};

  const breakdown=useMemo(()=>categoryTotals(state?.entries||[]),[state]);
  const cardTotal=(state?.statements||[]).reduce((sum,item)=>sum+item.confirmed_total,0);
  const otherBills=(state?.bills||[]).filter(item=>item.kind==='utilities'||item.kind==='other');
  const hasSettlementData=!!(state?.statements.length||otherBills.length||(rentEnabled&&rent.amount));
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
  async function chooseImportFiles(files:FileList|null) {
    if (!files?.length||busy||readingFiles) return;
    const selected=Array.from(files);
    setReadingFiles(true);setNotice('');
    try {
      const results=await Promise.allSettled(selected.map(readStatementFile));
      const loaded=results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
      const errors=results.flatMap(result=>result.status==='rejected'?[result.reason instanceof Error?result.reason.message:'ファイルを読み込めませんでした']:[]);
      if(loaded.length){setImportFiles(current=>mergeStatementFiles(current,loaded));setDraft(null);setTotalChecked(false);}
      if(errors.length)setNotice(errors.join('\n'));
    } finally {setReadingFiles(false);}
  }
  const selectedImportCard=state?.cards.find(card=>card.id===selectedCardId);
  const canStartImport=!!importPanel&&!importPanel.closing&&!busy&&!readingFiles&&!draft&&!!selectedImportCard?.active&&(!importConfirmation||importConfirmation.card.id===selectedCardId)&&(aiMode==='demo'?!!state?.demo_enabled:!!importFiles.length&&!!state?.ai_enabled);
  function openImportConfirmation() {
    if(!canStartImport||importConfirmation||!selectedImportCard)return;
    const focused=document.activeElement;
    const source=focused instanceof HTMLElement&&focused.matches('button')?focused:document.querySelector<HTMLElement>('.context-primary button');
    setNotice('');setImportConfirmation({origin:source?panelOrigin(source):undefined,card:selectedImportCard});
  }
  async function analyzeStatement() {
    const isDemo=aiMode==='demo';
    if(!canStartImport||importRequest.current)return;
    const controller=new AbortController();
    importRequest.current=controller;
    setBusy(true);setNotice('');setImportDiagnostic('');
    try {
      const result=await runStatementImport({demo:isDemo,signal:controller.signal,onProgress:setImportProgress,reducedMotion:window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        analyze:(onEntry,onReasoning,onEvent)=>isDemo?Promise.resolve(demoImportResult(importMonth)):streamStatement(importFiles,controller.signal,onEntry,onReasoning,space.id,onEvent)});
      if(result.diagnostics)setImportDiagnostic(JSON.stringify({ok:true,diagnostics:result.diagnostics},null,2));
      const sum=result.entries.reduce((a,b)=>a+b.amount,0);
      const card=state?.cards.find(item=>item.id===selectedCardId);
      setDraft({due_month:importMonth,card_id:selectedCardId,title:`${monthText(importMonth)}の${card?.name||'共有カード'}`,confirmed_total:result.confirmed_total||sum,entries:result.entries,source_total:result.source_total,total_alternative:result.total_alternative,demo:!!result.demo});setTotalChecked(false);
      if(!result.entries.length)setNotice('利用行を読み取れませんでした。明細行を手入力してください。');
    }catch(e){if(!controller.signal.aborted){setNotice(String(e instanceof Error?e.message:e));const diagnostics=(e as {diagnostics?:unknown})?.diagnostics;if(diagnostics)setImportDiagnostic(JSON.stringify({ok:false,code:(e as {code?:string})?.code,diagnostics},null,2));}}
    finally{if(importRequest.current===controller){importRequest.current=null;setImportProgress(null);setBusy(false);}}
  }
  function cancelImport() {
    importRequest.current?.abort();importRequest.current=null;
    setImportProgress(null);setBusy(false);
  }
  async function saveStatement() {
    if(demoView||busy||!draft||draft.demo || !totalChecked || draft.confirmed_total!==rowsTotal||draft.entries.some(entry=>isReviewCategory(entry.category,state?.category_settings)))return;
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
  const {editedEntries,changes:entryChanges,valid:validEntryChanges}=prepareStatementEdits(state?.statements||[],state?.entries||[],{categories:categoryDraft,amounts:amountDraft,deletedIds:deletedEntryIds});
  async function saveStatementEdits() {
    if(demoView||busy||!entryChanges.length||!validEntryChanges)return;
    setBusy(true);setNotice('');
    try{
      for(const change of entryChanges){
        await api(`/statements/${change.id}/entries`,{method:'PUT',body:JSON.stringify({revision:change.revision,entries:change.entries.map(({id,category,amount})=>({id,category,amount})),deleted_ids:change.deleted_ids})});
        setState(current=>current?applyStatementEdit(current,change):current);
        const savedIds=new Set([...change.entries.map(entry=>entry.id),...change.deleted_ids]);
        setCategoryDraft(current=>Object.fromEntries(Object.entries(current).filter(([id])=>!savedIds.has(id))));
        setAmountDraft(current=>Object.fromEntries(Object.entries(current).filter(([id])=>!savedIds.has(id))));
        setDeletedEntryIds(current=>current.filter(id=>!savedIds.has(id)));
      }
      await load();setCategoryDraft({});setAmountDraft({});setDeletedEntryIds([]);
      setOpenCard(current=>!current||current.type==='statement'&&entryChanges.some(change=>change.id===current.id&&!change.entries.length)?null:{...current,view:current.returnView||'details'});
    }catch(e){setNotice(`変更をすべて保存できませんでした。${e instanceof Error?e.message:String(e)}`);}finally{setBusy(false);}
  }
  const addBill=(source?:HTMLElement)=>setEditing({type:'bill',view:'summary',initialView:'summary',origin:source?panelOrigin(source):undefined,data:state?.bills.find(b=>b.kind==='rent')||{due_month:month,kind:'rent',title:'家賃',amount:rent.amount,note:''}});
  const dismissCategoryDetails=()=>setCategoryDetails(current=>current?{...current,closing:true}:null);
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
      await api<CategoryAppearance>(categorySettings.isNew?'/category-settings':`/category-settings/${encodeURIComponent(categorySettings.saved.category)}`,{method:categorySettings.isNew?'POST':'PUT',body:JSON.stringify({...draft,category:normalizeCategoryName(draft.category)})});
      await load();
      setCategoryDraft({});
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
  async function saveRentEnabled(enabled:boolean) {
    if(demoView||busy||!state)return;
    setBusy(true);setNotice('');
    try{await api(`/spaces/${space.id}/preferences`,{method:'PUT',body:JSON.stringify({rent_enabled:enabled,revision:state.space_preferences?.revision??0})});await load();}
    catch(e){await load();setNotice(String(e instanceof Error?e.message:e));}finally{setBusy(false);}
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
    void load(); // Refresh AI availability after a deployment or secret update.
    setAiMode(state?.demo_enabled&&(demoView||!state?.ai_enabled)?'demo':'live');
    const source=document.querySelector<HTMLElement>('.dock-add')??document.activeElement;
    setNotice('');setDraft(null);setImportFiles([]);setTotalChecked(false);
    importDestination.current=null;setImportMonth(month);
    setImportPanel({origin:source instanceof HTMLElement?panelOrigin(source):undefined});
  };
  const selectTab=(value:Tab)=>{
    if(importConfirmation||readingFiles)return;
    setCategoryDetails(null);
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
  const openSpaceSettings=(source?:HTMLElement)=>{setNotice('');setSpaceSettings({origin:source?panelOrigin(source):undefined});};
  const dismissSpaceSettings=()=>{
    if(busy||spaceNameAction?.saving||spaceDock||allocationOpen||openCard||editing||cardSettings||importPanel||categorySettings||categoryDetails)return;
    setSpaceSettings(current=>current?{...current,closing:true}:null);
  };
  const removeSpace=async()=>{
    const fallback=spaces.find(candidate=>candidate.kind==='personal');
    if(demoView||busy||spaceNameAction?.saving||personal||space.owner_id!==user.id||!fallback||!spaceSettings||spaceSettings.closing||settingsSuspended)return;
    if(!confirm(`「${space.name}」を削除しますか？ メンバー全員がアクセスできなくなります。`))return;
    setBusy(true);setNotice('');
    try{await api(`/spaces/${space.id}/space`,{method:'DELETE'});await refreshSpaces();onSelectSpace(fallback.id);}
    catch(error){setNotice(error instanceof Error?error.message:String(error));}
    finally{setBusy(false);}
  };
  const switchDemo=(enabled:boolean)=>{setCategoryDetails(null);window.sessionStorage.setItem('uchiwake-demo-view',enabled?'1':'0');setOpenCard(null);setImportPanel(null);setImportConfirmation(null);setCardSettings(null);setCategorySettings(null);setDraft(null);setImportFiles([]);setEditing(null);setDemoView(enabled);};
  const canSaveDraft=!!draft&&totalChecked&&draft.entries.length>0&&rowsTotal===draft.confirmed_total&&rowsTotal>0&&!!draft.title.trim()&&!!draft.card_id&&draft.entries.every(e=>!!e.title.trim()&&!!e.amount&&!isReviewCategory(e.category,state?.category_settings));
  const chartEnd=historyEndMonth(displayedMonth);
  const chart=history.length?history:Array.from({length:120},(_,index)=>({month:bump(chartEnd,index-119),amount:0,total:0}));
  const panelStatements=(state?.statements||[]).filter(item=>openCard?.type==='card'?item.card_id===openCard.id:openCard?.type==='statement'&&item.id===openCard.id);
  const panelTitle=state?.cards.find(card=>card.id===(openCard?.type==='card'?openCard.id:panelStatements[0]?.card_id))?.name||panelStatements[0]?.title;
  const cardContext:DockContext|undefined=openCard?{
    label:'カードの明細',
    detailAction:openCard.view==='summary'&&panelStatements.length?{label:'明細画面へ',onAction:()=>{cardDestination.current='ledger';dismissCard();}}:undefined,
    entryControls:openCard.view!=='edit'&&panelStatements.length?{sort:cardSort,onSort:setCardSort}:undefined,
    onBack:()=>{if(busy)return;if(openCard.view==='edit'){setCategoryDraft({});setAmountDraft({});setDeletedEntryIds([]);setOpenCard({...openCard,view:openCard.returnView||'details'});}else dismissCard();},
    actionLabel:openCard.view==='edit'?(busy?'保存中…':'変更を保存する'):!panelStatements.length?'明細を取り込む':'明細を編集',
    compact:openCard.view==='details'||(openCard.view==='summary'&&!!panelStatements.length),
    commit:openCard.view==='edit',
    actionIcon:openCard.view!=='edit'&&panelStatements.length?'edit':undefined,
    disabled:busy||(openCard.view==='edit'&&(demoView||!entryChanges.length||!validEntryChanges)),
    secondaryAction:openCard.view==='edit'&&panelStatements.length===1?{label:'明細全体を削除',disabled:demoView||busy,onAction:()=>void removeStatement(panelStatements[0].id)}:undefined,
    onAction:()=>{
      if(busy)return;
      if(openCard.view==='edit'){void saveStatementEdits();return;}
      if(!panelStatements.length){
        if(openCard.type==='card')setSelectedCardId(openCard.id);selectTab('import');
      }else{setOpenCard({...openCard,view:'edit',returnView:openCard.view});}
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
    commit:editing.view!=='summary',secondaryAction:editing.view!=='summary'?deleteBillAction:undefined,
    auxiliaryAction:editing.data.kind==='rent'&&editing.view==='summary'?{label:'基本家賃を設定',onAction:openFixedRent,disabled:busy}:undefined,
    onAction:()=>{if(busy)return;if(editing.view==='summary')setEditing({...editing,view:'edit'});else if(editing.view==='fixed')void saveRentRule();else void save();},
    disabled:busy||(demoView&&editing.view!=='summary')||(editing.view==='edit'&&(!editing.data.title||!Number(editing.data.amount)))||(editing.view==='fixed'&&(!rentStartMonth||!Number.isSafeInteger(Number(rentAmount))||Number(rentAmount)<=0))
  }:undefined;
  const settingsContext:DockContext|undefined=cardSettings?{
    commit:cardSettings.view==='edit',compact:cardSettings.view==='summary',actionIcon:cardSettings.view==='summary'?'edit':undefined,label:personal?'カード':'共有カード',
    secondaryAction:cardSettings.view==='edit'&&cardSettings.card?{label:'カードを削除',disabled:demoView||busy,onAction:()=>void removeCard(cardSettings.card!)}:undefined,
    onBack:()=>{if(busy)return;setNotice('');dismissSettings();},
    actionLabel:cardSettings.view==='summary'?'カードを編集':busy?'保存中…':cardSettings.card?'変更を保存する':'カードを追加',
    onAction:()=>{if(cardSettings.view==='summary'){setCardSettings({...cardSettings,view:'edit'});return;}if(cardSettings.card)void updateCard(cardSettings.card,cardSettings.name.trim(),cardSettings.active,cardSettings.color);else void createCard(cardSettings.name,cardSettings.color);},
    disabled:busy||(cardSettings.view==='edit'&&(demoView||!cardSettings.name.trim()||(!!cardSettings.card&&cardSettings.name.trim()===cardSettings.card.name&&cardSettings.active===cardSettings.card.active&&cardSettings.color===(cardSettings.card.color??defaultCardColor))))
  }:undefined;
  const importContext:DockContext|undefined=importPanel?{
    label:draft?'カード明細の確認':'明細の取り込み',commit:true,
    actionAppearance:importProgress?'breathing':undefined,
    onBack:()=>{if(importConfirmation)return;if(importRequest.current){cancelImport();return;}if(busy||readingFiles)return;if(draft){setImportMonth(draft.due_month);setSelectedCardId(draft.card_id);setDraft(null);setNotice('');}else setImportPanel({...importPanel,closing:true});},
    actionLabel:draft?((demoView||draft.demo)?'デモ・保存されません':busy?'保存中…':'保存して計算'):readingFiles?'ファイルを準備中…':!state?.cards.some(card=>card.active)?'共有カードを設定':importProgress?'Thinking...':'確認へ',
    onAction:()=>{if(busy||readingFiles)return;if(draft)void saveStatement();else if(!state?.cards.some(card=>card.active))selectTab('settings');else openImportConfirmation();},
    disabled:busy||readingFiles||!!((demoView||draft?.demo)&&draft)||(!!state?.cards.some(card=>card.active)&&(draft?!canSaveDraft:!canStartImport))
  }:undefined;
  const categoryOptions=allCategoryAppearances(state?.category_settings);
  const categoryNameDuplicate=!!categorySettings&&categoryOptions.some(item=>item.category===normalizeCategoryName(categorySettings.draft.category)&&(categorySettings.isNew||item.category!==categorySettings.saved.category));
  const categorySettingsContext:DockContext|undefined=categorySettings?{
    label:'費目の設定',commit:true,
    actionLabel:busy?'保存中…':categorySettings.isNew?'費目を追加':'変更を保存する',
    onBack:()=>{if(busy)return;setNotice('');dismissCategorySettings();},
    onAction:()=>{if(busy)return;void saveCategorySettings();},
    disabled:busy||demoView||!validCategoryName(categorySettings.draft.category)||categoryNameDuplicate||(!categorySettings.isNew&&categorySettings.saved.icon===categorySettings.draft.icon&&categorySettings.saved.color===categorySettings.draft.color&&categorySettings.saved.category===normalizeCategoryName(categorySettings.draft.category)&&(categorySettings.saved.include_in_settlement!==false)===(categorySettings.draft.include_in_settlement!==false))
  }:undefined;
  const PageIcon=({home:Calculator,ledger:ReceiptText,settings:Settings,import:Camera} as const)[tab];
  const settingsPanelContext:DockContext={label:'スペース設定',contentKey:`space-settings:${spaceNameAction?'save':'idle'}`,backOnly:!spaceNameAction,commit:!!spaceNameAction,onBack:dismissSpaceSettings,
    actionLabel:spaceNameAction?.label??'閉じる',onAction:()=>{if(!busy&&!spaceSettings?.closing)spaceNameAction?.onAction();},disabled:!spaceNameAction||spaceNameAction.disabled||busy||!!spaceSettings?.closing,
    secondaryAction:!personal&&space.owner_id===user.id?{label:'このスペースを削除',disabled:demoView||busy||spaceNameAction?.saving||!!spaceSettings?.closing,onAction:()=>void removeSpace()}:undefined
  };
  const settingsSuspended=!!(spaceDock||allocationOpen||openCard||editing||cardSettings||importPanel||categorySettings||categoryDetails);
  const categoryDetailsContext:DockContext|undefined=categoryDetails?{label:`${categoryDetails.category}の明細`,entryControls:{sort:categorySort,onSort:setCategorySort,groupByCard,onGroupByCard:setGroupByCard},backOnly:true,onBack:dismissCategoryDetails,actionLabel:'閉じる',onAction:dismissCategoryDetails}:undefined;
  const dockContext=importConfirmationDock||spaceDock||allocationDock||(!categoryDetails?.closing&&categoryDetailsContext)||(!openCard?.closing&&cardContext)||(!editing?.closing&&billContext)||(!cardSettings?.closing&&settingsContext)||(!importPanel?.closing&&importContext)||(!categorySettings?.closing&&categorySettingsContext)||breakdownDock||settingsDock||undefined;
  return <>
    <SpaceControls space={space} spaces={spaces} disabled={busy||!!(spaceSettings||allocationBreakdown||spaceDock||openCard||editing||cardSettings||importPanel||categorySettings||categoryDetails||allocationOpen)} api={api} onSelect={onSelectSpace} onSettings={()=>openSpaceSettings(document.querySelector<HTMLElement>('.space-switcher')??undefined)} onRefresh={refreshSpaces} onDockChange={setSpaceDock}/>
    <main className="shell" aria-busy={!state||state.month!==month} inert={!!state&&state.month!==month}>
      <nav className="desktop-tabs" aria-label="メインメニュー">{dockTabs.map(item=><button key={item.key} aria-current={tab===item.key?'page':undefined} onClick={()=>selectTab(item.key)}><item.icon size={18}/>{item.label}</button>)}<button onClick={()=>selectTab('import')}><Plus size={18}/>追加</button></nav>
      <div id="main-content">
      <div className={`page-top ${tab==='import'?'':'screen-page-top'}`}><h1 className="page-heading"><PageIcon aria-hidden="true"/>{draft&&tab==='import'?'明細を確認':({home:personal?'支出':'精算',ledger:'明細',import:'明細を取り込む',settings:'設定'} as const)[tab]}</h1>{!draft&&tab!=='ledger'&&tab!=='settings'&&<div className="month-switch"><button aria-label="前月" onClick={()=>setMonth(bump(month,-1))}><ChevronLeft size={18}/></button><span>{monthText(month)}</span><button aria-label="翌月" onClick={()=>setMonth(bump(month,1))}><ChevronRight size={18}/></button></div>}</div>
      {notice&&!importPanel&&<div className="notice" role="alert"><span>{notice}</span><button aria-label="閉じる" onClick={()=>setNotice('')}><X size={16}/></button></div>}
      {demoView&&<div className="demo-view-banner" role="status">デモ表示中 · サンプルデータ</div>}
      {!state?<div className="empty loading">{notice?'データを表示できませんでした。':'読み込んでいます…'}{notice&&<div><button className="secondary" onClick={()=>void load()}>再読み込み</button></div>}</div>:<>
      {tab==='home'&&<>
        <p className="space-current-name">{space.name}</p>
        <section className="hero settlement-hero">
          <button type="button" className="settlement-amount-toggle" aria-label={personal?'今月の支出合計':`現在は${showTotalFirst?'支払い合計':'あなたの負担額'}を大きく表示。タップして切り替え`} aria-pressed={showTotalFirst} onClick={()=>{if(!personal)setShowTotalFirst(value=>!value);}}>
            <span className="hero-label">{showTotalFirst?<UsersRound size={18} aria-hidden="true"/>:<UserRound size={18} aria-hidden="true"/>}{personal?'支出合計':showTotalFirst?'支払い合計':'あなたの負担額'}{!personal&&<><span className="hero-basis">{allocationConfig.uniform?`${allocationConfig.common.shares.length}人で分担`:'費用別に分担'}</span><span className="hero-switch-hint"><ArrowLeftRight size={14} aria-hidden="true"/></span></>}</span>
            <span className="hero-money">{hasSettlementData?<NumberTicker value={personal||showTotalFirst?totals.total:totals.perPerson}/>: '—'}</span>
            <span className="hero-secondary" hidden={personal}><span>{showTotalFirst?'あなたの負担額':'支払い合計'}</span><strong>{hasSettlementData?<NumberTicker value={showTotalFirst?totals.perPerson:totals.total}/>: '—'}</strong></span>
          </button>
          {!personal&&!demoView&&hasSettlementData&&<button className="allocation-breakdown-trigger" onClick={event=>setAllocationBreakdown({origin:panelOrigin(event.currentTarget)})}><UsersRound size={16}/><span>負担の内訳</span><small>{Object.keys(allocations).length}人{Object.values(roundingAdjustments).some(Boolean)&&' · 端数調整あり'}</small><ChevronRight size={15}/></button>}
          <SettlementChart data={chart} month={displayedMonth} visibleMonths={chartMonths} onSelectMonth={setMonth}/>
          <div className="chart-ranges" role="group" aria-label="表示期間">{([[6,'6M'],[12,'1Y'],[36,'3Y'],[60,'5Y']] as const).map(([count,label])=><button key={count} aria-pressed={chartMonths===count} onClick={()=>setChartMonths(count)}>{label}</button>)}</div>
        </section>
        <section className="section settlement-section"><div className="settlement-list">
          {state.cards.filter(card=>card.active||state.statements.some(item=>item.card_id===card.id)).map(card=>{const items=state.statements.filter(item=>item.card_id===card.id);return <button className="settlement-item panel-source" data-panel-source={openCard?.type==='card'&&openCard.id===card.id?'true':undefined} key={card.id} onClick={event=>{setSelectedCardId(card.id);setOpenCard({type:'card',id:card.id,view:'summary',origin:panelOrigin(event.currentTarget)});}}><span className="settlement-item-icon"><CreditCard size={22} color={displayColor(card.color)}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{card.name}</span>{items.length>0&&<small>{items.length}件の明細</small>}<strong className="settlement-item-amount">{items.length?yen(items.reduce((sum,item)=>sum+(personal?item.confirmed_total:statementSettlementAmount(item,state.entries,state.category_settings)),0)):'—'}</strong></span><ChevronRight size={17}/></button>})}
          {state.statements.filter(item=>!item.card_id||!state.cards.some(card=>card.id===item.card_id)).map(item=><button className="settlement-item panel-source" data-panel-source={openCard?.type==='statement'&&openCard.id===item.id?'true':undefined} key={item.id} onClick={event=>setOpenCard({type:'statement',id:item.id,view:'summary',origin:panelOrigin(event.currentTarget)})}><span className="settlement-item-icon"><CreditCard size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{item.title}</span><strong className="settlement-item-amount">{yen((personal?item.confirmed_total:statementSettlementAmount(item,state.entries,state.category_settings)))}</strong></span><ChevronRight size={17}/></button>)}
          {!state.cards.length&&<button className="settlement-item panel-source" data-panel-source={cardSettings&&!cardSettings.card?'true':undefined} onClick={event=>openSettings(undefined,event.currentTarget)}><span className="settlement-item-icon"><CreditCard size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{personal?'カード':'共有カード'}</span><strong className="settlement-item-amount">—</strong></span><ChevronRight size={17}/></button>}
          {rentEnabled&&<button className="settlement-item panel-source" data-panel-source={editing?.data.kind==='rent'?'true':undefined} onClick={event=>addBill(event.currentTarget)}><span className="settlement-item-icon"><Home size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">家賃</span><strong className="settlement-item-amount">{rent.amount?yen(rent.amount):'—'}</strong></span><ChevronRight size={17}/></button>}
          {otherBills.map(b=><button className="settlement-item panel-source" data-panel-source={editing?.data.id===b.id?'true':undefined} key={b.id} onClick={event=>setEditing({type:'bill',data:b,view:'summary',initialView:'summary',origin:panelOrigin(event.currentTarget)})}><span className="settlement-item-icon"><ArrowDownLeft size={22}/></span><span className="settlement-item-copy"><span className="settlement-item-label">{b.title}</span><strong className="settlement-item-amount">{yen(b.amount)}</strong></span><ChevronRight size={17}/></button>)}
        </div></section>
        {state.bills.some(b=>b.kind==='card')&&<details className="legacy-details"><summary>以前のカード請求の入力を確認</summary>{state.bills.filter(b=>b.kind==='card').map(b=><BillRow key={b.id} bill={b} onEdit={()=>setEditing({type:'bill',data:b,view:'summary',initialView:'summary'})}/>)}</details>}
      </>}
      {tab==='ledger'&&<>{state.statements.length? <>
        <div className="ledger-overview"><span>{monthText(displayedMonth)}のカード合計</span><strong><NumberTicker value={cardTotal}/></strong></div>
        {!!breakdown.length&&<CategoryChart data={breakdown} settings={state.category_settings} onSelectCategory={(category,source)=>setCategoryDetails({category,origin:panelOrigin(source)})}/>}
        <h2 className="ledger-cards-heading">カード別</h2>
        {state.statements.map(s=><button className="statement-preview panel-source" data-panel-source={openCard?.type==='statement'&&openCard.id===s.id?'true':undefined} key={s.id} onClick={event=>setOpenCard({type:'statement',id:s.id,view:'details',origin:panelOrigin(event.currentTarget)})}><span className="statement-preview-heading"><CreditCard size={22} color={displayColor(state.cards.find(card=>card.id===s.card_id)?.color)}/><span><strong>{state.cards.find(card=>card.id===s.card_id)?.name||s.title}</strong><small>{state.entries.filter(e=>e.statement_id===s.id).length}件の明細</small></span><ChevronRight size={18}/></span><strong className="statement-preview-amount">{yen(s.confirmed_total)}</strong></button>)}

      </>:demoView?<div className="empty">この月のデモ明細はありません。</div>:<Empty text="この月のカード明細はまだありません。" onClick={()=>selectTab('import')} label="カード明細を取り込む"/>}</>}
      {tab==='settings'&&<div className="settings-page">
        <SpaceSettingsLinks spaces={spaces} disabled={busy} onOpen={(target,source)=>{if(target.id===space.id)openSpaceSettings(source);else onSelectSpace(target.id,panelOrigin(source));}}/>
        <div className="settings-group-heading settings-common-heading"><small>アプリ共通</small><h2>アカウント・表示</h2></div>
        <AccountSettings user={user} signingOut={signingOut} updateProfile={saveProfile}/>
        <AppearanceSettings/>
        {state.demo_enabled&&<section className="section settings-section demo-settings"><h2 className="section-heading"><Database size={20} aria-hidden="true"/>表示するデータ</h2><p className="subtle">デモには直近6か月のカード2枚と家賃を用意しています。実データの保存内容は変わりません。</p><div className="mode-options" role="group" aria-label="表示するデータ"><button className={!demoView?'selected':''} aria-pressed={!demoView} onClick={()=>switchDemo(false)}>実データ</button><button className={demoView?'selected':''} aria-pressed={demoView} onClick={()=>switchDemo(true)}>デモデータ</button></div></section>}
        <AppUpdateSettings/>
        <button type="button" className="settings-add-card settings-logout" disabled={signingOut || savingProfile} onClick={() => void logout()}><LogOut size={17}/>{signingOut ? 'ログアウト中…' : 'ログアウト'}</button>
        <AppInfo/>
      </div>}
      </>}
      </div>
    </main>
    {spaceSettings&&state&&<SpacePanel title="スペース設定" icon={personal?UserRound:UsersRound} context={settingsPanelContext} origin={spaceSettings.origin} closing={spaceSettings.closing} suspended={settingsSuspended} onExited={()=>{setSpaceSettings(null);setNotice('');}} onDockChange={setSettingsDock}><div className="settings-page space-settings-content">
      {notice&&<p className="notice" role="alert">{notice}</p>}
        <div className="settings-group-heading"><small>{personal?'個人スペース':'共有スペース'}</small><h2>{personal?<UserRound size={22}/>:<UsersRound size={22}/>}<span>{space.name}</span></h2></div>
        <SpaceManagementSettings space={space} userId={user.id} members={state.members??[]} disabled={demoView||busy||!!spaceSettings.closing} api={api} onRefresh={refreshSpaces} onReload={load} onDockChange={setSpaceDock} onNameActionChange={setSpaceNameAction}/>
        <section className="section settings-section"><h2 className="section-heading"><CreditCard size={20} aria-hidden="true"/>{personal?'カード':'共有カード'}</h2><p className="subtle">カードを登録すると、明細を取り込む際に選べます。</p><div className="card-settings-list">{state.cards.map(card=><button type="button" className="settings-card-button panel-source" data-panel-source={cardSettings?.card?.id===card.id?'true':undefined} key={card.id} onClick={event=>openSettings(card,event.currentTarget)}><CreditCard size={21} color={displayColor(card.color)}/><span><strong>{card.name}</strong><small>{card.active?'使用中':'使用停止中'}</small></span><ChevronRight size={18}/></button>)}</div><button type="button" className="settings-add-card" onClick={event=>openSettings(undefined,event.currentTarget)}><Plus size={17}/> カードを追加</button></section>
        <section className="section settings-section"><h2 className="section-heading"><Tags size={20} aria-hidden="true"/>費目</h2><p className="subtle">費目名・アイコン・色と、精算に含めるかを設定できます。</p><div className="card-settings-list category-settings-list">{categoryOptions.map(value=><button type="button" className="settings-card-button panel-source" data-panel-source={categorySettings?.saved.category===value.category?'true':undefined} key={value.category} onClick={event=>{setNotice('');setCategorySettings({saved:value,draft:value,view:'edit',origin:panelOrigin(event.currentTarget)});}}><CategoryIcon name={value.icon} color={value.color} size={21}/><span><strong>{value.category}</strong>{value.include_in_settlement===false&&<small>精算対象外</small>}</span><ChevronRight size={18}/></button>)}</div><button type="button" className="settings-add-card" onClick={event=>{const value={category:'',icon:'tag',color:defaultCardColor};setNotice('');setCategorySettings({saved:value,draft:value,isNew:true,view:'edit',origin:panelOrigin(event.currentTarget)});}}><Plus size={17}/> 費目を追加</button></section>
        <ClassificationSettings api={api} disabled={demoView||busy}/>
        {!personal&&<section className="section settings-section"><h2 className="section-heading"><UsersRound size={20} aria-hidden="true"/>負担</h2><button className="settings-card-button" type="button" disabled={demoView||busy} onClick={()=>setAllocationOpen('default')}><UsersRound size={21}/><span><strong>負担の設定</strong><small>対象者・均等割り・割合指定</small></span><ChevronRight size={18}/></button></section>}
        <section className="section settings-section"><h2 className="section-heading"><Home size={20} aria-hidden="true"/>家賃</h2><SettingsToggle label="家賃を集計に含める" checked={rentEnabled} disabled={demoView||busy} onChange={enabled=>void saveRentEnabled(enabled)}/><p className="subtle">オフにすると家賃の表示と全期間の集計を無効にします。登録済みの金額は保持されます。</p>{rentEnabled&&<><p className="subtle">指定した月から毎月の精算に使います。金額が変わったら、新しい開始月を指定してください。</p><div className="rule-list">{state.rent_rules.map(rule=><button type="button" className="settings-rent-button" key={rule.effective_month} onClick={event=>{setRentStartMonth(rule.effective_month);setRentAmount(String(rule.amount));setEditing({type:'bill',data:{kind:'rent',title:'家賃',due_month:month,amount:rule.amount},view:'fixed',initialView:'fixed',rentRuleMonth:rule.effective_month,origin:panelOrigin(event.currentTarget)});}}><Home size={21}/><span><strong>{yen(rule.amount)}</strong><small>{monthText(rule.effective_month)}から</small></span><ChevronRight size={18}/></button>)}</div><button type="button" className="settings-add-card" onClick={event=>{setRentStartMonth(month);setRentAmount('');setEditing({type:'bill',data:{kind:'rent',title:'家賃',due_month:month,amount:rent.amount},view:'fixed',initialView:'fixed',origin:panelOrigin(event.currentTarget)});}}><Plus size={17}/> 基本家賃を設定</button><p className="subtle">一時的な変更は精算画面の家賃から入力できます。</p></>}</section>
    </div></SpacePanel>}
    {allocationBreakdown&&state&&<AllocationBreakdownPanel month={displayedMonth} members={state.members??[]} allocations={allocations} adjustments={roundingAdjustments} userId={user.id} origin={allocationBreakdown.origin} onClose={()=>setAllocationBreakdown(null)} onDockChange={setBreakdownDock}/>}
    <FloatingDock personal={personal} tab={tab} onSelect={selectTab} context={dockContext} panelActive={!!(spaceSettings||allocationBreakdown||spaceDock||allocationDock||openCard||editing||cardSettings||importPanel||categorySettings||categoryDetails)} month={month} onMonthChange={setMonth} onPrevMonth={()=>setMonth(bump(month,-1))} onNextMonth={()=>setMonth(bump(month,1))} add={{label:'追加',disabled:!state||state.month!==month,options:[...((state?.cards||[]).filter(card=>card.active).map(card=>({id:card.id,label:card.name,color:card.color,kind:'card' as const,onClick:()=>{setSelectedCardId(card.id);setDraft(null);setImportFiles([]);selectTab('import');}}))),...(!state?.cards.some(card=>card.active)?[{id:'new-card',label:'カードを追加',kind:'card' as const,onClick:()=>openSettings()}]:[])]}}/>
    {allocationOpen&&state?.settlement&&<SettlementSettingsPanel initialScope={allocationOpen} spaceId={space.id} month={month} members={state.members??[]} settings={state.settlement} items={splitItems} api={api} onClose={()=>setAllocationOpen(null)} onSaved={load} onDockChange={setAllocationDock}/>}
    {categoryDetails&&state&&<CategoryEntriesPanel sort={categorySort} groupByCard={groupByCard} category={categoryDetails.category} origin={categoryDetails.origin} closing={categoryDetails.closing} month={displayedMonth} entries={state.entries} statements={state.statements} cards={state.cards} category_settings={state.category_settings} onClose={dismissCategoryDetails} onExited={()=>setCategoryDetails(null)}/>}
    {openCard&&state&&panelTitle&&<CardStatementPanel sort={cardSort} key={`${openCard.type}-${openCard.id}`} title={panelTitle} color={state.cards.find(card=>card.id===(openCard.type==='card'?openCard.id:panelStatements[0]?.card_id))?.color} month={month} statements={panelStatements} entries={editedEntries} categorySettings={state.category_settings} amountDraft={amountDraft} deletedEntryIds={deletedEntryIds} onToggleDeleteEntry={id=>{if(!busy&&!demoView)setDeletedEntryIds(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);}} onChangeAmount={(id,amount)=>{if(!busy)setAmountDraft(current=>({...current,[id]:amount}));}} demo={demoView} view={openCard.view} origin={openCard.origin} closing={openCard.closing} onClose={cardContext!.onBack} onExited={()=>{const destination=cardDestination.current;cardDestination.current=null;setOpenCard(null);setCategoryDraft({});setAmountDraft({});setDeletedEntryIds([]);if(destination==='import')openImport();else if(destination)selectTab(destination);}} actionLabel={cardContext!.actionLabel} actionDisabled={cardContext!.disabled} busy={busy} error={notice} onAction={cardContext!.onAction} onChangeCategory={(id,category)=>{void changeCategory(id,category);}} onDeleteStatement={id=>{void removeStatement(id);}}/>}
    {categorySettings&&categorySettingsContext&&<CategorySettingsPanel value={categorySettings.draft} isNew={categorySettings.isNew} view={categorySettings.view} origin={categorySettings.origin} closing={categorySettings.closing} busy={busy} error={notice||(categoryNameDuplicate?'同じ名前の費目があります':undefined)} actionLabel={categorySettingsContext.actionLabel} actionDisabled={categorySettingsContext.disabled} onChange={value=>setCategorySettings(current=>current?{...current,draft:value}:null)} onAction={categorySettingsContext.onAction} onClose={categorySettingsContext.onBack} onExited={()=>setCategorySettings(null)}/>}
    {importPanel&&state&&importContext&&<StatementImportPanel reviewing={!!draft} processing={!!importProgress} suspended={!!importConfirmation} progress={importProgress} origin={importPanel.origin} closing={importPanel.closing} context={importContext} onExited={()=>{const destination=importDestination.current;importDestination.current=null;setImportPanel(null);setImportConfirmation(null);setDraft(null);setImportFiles([]);setTotalChecked(false);setNotice('');if(destination){setTab(destination);}}}>
      <p className="space-import-target">登録先：{space.name}</p>
      {notice&&<div className="notice" role="alert">{notice}</div>}
      {!importProgress&&state.demo_enabled&&aiMode==='live'&&<ImportDiagnostics result={importDiagnostic}/>}
{(importProgress?<ImportProcessing progress={importProgress} settings={state.category_settings}/>:!draft?<>
        {!state.cards.some(card=>card.active)?<Empty text="先に共有カードを設定してください。" onClick={()=>selectTab('settings')} label="設定を開く"/>:<ImportSetup cards={state.cards.filter(card=>card.active)} cardId={selectedCardId} month={importMonth} onMonth={setImportMonth} files={importFiles} loading={readingFiles} disabled={busy||readingFiles} mode={aiMode} demoEnabled={state.demo_enabled} liveEnabled={state.ai_enabled} demoView={demoView} onCard={id=>{setSelectedCardId(id);setImportFiles([]);}} onMode={value=>{setAiMode(value);setNotice('');}} onFiles={files=>{void chooseImportFiles(files);}} onRemove={index=>setImportFiles(current=>current.filter((_,i)=>i!==index))} onManual={()=>{setDraft({due_month:importMonth,card_id:selectedCardId,title:`${monthText(importMonth)}の${state.cards.find(item=>item.id===selectedCardId)?.name||'共有カード'}`,confirmed_total:0,entries:[{spent_on:'',title:'',amount:0,category:fallbackCategory(state.category_settings)}],demo:demoView});setTotalChecked(false);}}/>}
      </>:<ImportReview files={importFiles} draft={draft} cards={state.cards} settings={state.category_settings} busy={busy} checked={totalChecked} onChange={value=>{setDraft(value);setTotalChecked(false);}} onChecked={setTotalChecked}/>)}
    </StatementImportPanel>}
    {importConfirmation&&importPanel&&<ImportConfirmationPanel spaceName={space.name} card={importConfirmation.card} month={importMonth} files={importFiles} mode={aiMode} demoView={demoView} disabled={!canStartImport} origin={importConfirmation.origin} onClose={()=>setImportConfirmation(null)} onStart={()=>void analyzeStatement()} onDockChange={setImportConfirmationDock}/>}
    {editing&&<BillPanel bill={editing.data} view={editing.view} onView={openFixedRent} deleteAction={billContext!.secondaryAction} origin={editing.origin} closing={editing.closing} onExited={()=>setEditing(null)} actionLabel={billContext!.actionLabel} onAction={billContext!.onAction} actionDisabled={billContext!.disabled} month={month} demo={demoView} busy={busy} rentStartMonth={rentStartMonth} rentAmount={rentAmount} onRentStartMonth={setRentStartMonth} onRentAmount={setRentAmount} onChange={data=>setEditing({...editing,data})} onClose={billContext!.onBack}/>}
    {cardSettings&&<CardSettingsPanel key={cardSettings.card?.id||'new'} card={cardSettings.card} view={cardSettings.view} origin={cardSettings.origin} closing={cardSettings.closing} busy={busy} name={cardSettings.name} active={cardSettings.active} color={cardSettings.color} onColor={color=>setCardSettings({...cardSettings,color})} deleteAction={settingsContext!.secondaryAction} error={notice} actionLabel={settingsContext!.actionLabel} actionDisabled={settingsContext!.disabled} onName={name=>setCardSettings({...cardSettings,name})} onActive={active=>setCardSettings({...cardSettings,active})} onClose={settingsContext!.onBack} onExited={()=>setCardSettings(null)} onSave={()=>settingsContext!.onAction()}/>}
  </>;
}
function Field({label,children}:{label:string;children:React.ReactNode}) {return <label className="field"><span>{label}</span>{children}</label>}
function Empty({text,onClick,label}:{text:string;onClick:()=>void;label:string}) {return <div className="empty"><p>{text}</p><button className="secondary" onClick={onClick}><Plus size={16}/>{label}</button></div>}
function BillRow({bill,onEdit}:{bill:Bill;onEdit:()=>void}) {return <div className="row"><div className="row-symbol">{bill.kind==='card'?<CreditCard size={19}/>:bill.kind==='rent'?<Home size={19}/>:<ArrowDownLeft size={19}/>}</div><div className="row-content"><strong>{bill.title}</strong><small>{billKinds[bill.kind]}{bill.note?` · ${bill.note}`:''}</small></div><strong className="row-money">{yen(bill.amount)}</strong><button className="row-edit" onClick={onEdit} aria-label={`${bill.title}を編集`}>編集</button></div>}
createRoot(document.getElementById('root')!).render(<AuthGate>{(user,logout,signingOut,updateProfile)=><SpaceApp key={user.id} user={user} logout={logout} signingOut={signingOut} updateProfile={updateProfile}/>}</AuthGate>);
