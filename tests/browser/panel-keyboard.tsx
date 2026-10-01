import {useState} from 'react';
import {Pencil} from 'lucide-react';
import {createRoot} from 'react-dom/client';
import {CardStatementPanel} from '../../src/card-statement-panel';
import {FloatingDock} from '../../src/floating-dock';
import {SpacePanel} from '../../src/space-panel';
import type {CardEntry} from '../../src/domain';
import '../../src/styles.css';
import '../../src/kondo-style.css';
import '../../src/spaces.css';
import '../../src/theme.css';
import '../../src/entry-sort-controls.css';
import '../../src/entry-dock.css';

const noop=()=>{};
function Fixture(){
 const [open,setOpen]=useState(false),[nested,setNested]=useState(false);
 const [entries,setEntries]=useState<CardEntry[]>(Array.from({length:18},(_,index)=>({id:String(index),statement_id:'s',spent_on:'2026-09-30',title:`明細${index+1}`,category:'食費',amount:1000+index})));
 const [draft,setDraft]=useState<Record<string,string>>({});
 const close=()=>setOpen(false);
 return <>
  <main className="shell" style={{minHeight:1600}}><button onClick={()=>setOpen(true)}>明細を開く</button></main>
  <FloatingDock tab="ledger" month="2026-10" onSelect={noop} onMonthChange={noop} onPrevMonth={noop} onNextMonth={noop} panelActive={open} context={open?{label:'編集',actionLabel:'変更を保存する',onAction:noop,onBack:close,commit:true}:undefined}/>
  {open&&<CardStatementPanel title="カード" sort={{key:'date',dateAscending:false,amountAscending:false}} month="2026-10" statements={[{id:'s',card_id:'c',due_month:'2026-10',title:'明細',confirmed_total:18000,created_at:''}]} entries={entries} demo={false} view="edit" onClose={close} onExited={close} actionLabel="保存" onAction={noop} onChangeCategory={noop} onChangeAmount={(id,value)=>{setDraft(old=>({...old,[id]:value}));setEntries(old=>old.map(entry=>entry.id===id?{...entry,amount:Number(value)}:entry));}} amountDraft={draft} deletedEntryIds={[]} onToggleDeleteEntry={noop} onDeleteStatement={noop}/>}
  {open&&<button style={{position:'fixed',top:0,right:0,zIndex:100}} onClick={()=>setNested(true)}>子パネル</button>}
  {nested&&<SpacePanel title="入力テスト" icon={Pencil} context={{label:"入力テスト",actionLabel:"保存",onAction:noop,onBack:()=>setNested(false)}} onExited={()=>setNested(false)} onDockChange={noop}>
   <label className="field"><span>テキスト</span><input aria-label="テキスト"/></label>
   <label className="field"><span>日付</span><input type="date" aria-label="日付"/></label>
   <div style={{height:750}}/>
   <label className="field"><span>メモ</span><textarea aria-label="メモ"/></label>
   <button onClick={()=>setNested(false)}>子を閉じる</button>
  </SpacePanel>}
 </>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
