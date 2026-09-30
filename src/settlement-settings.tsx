import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import type { State } from './domain';
import type { Api } from './space-api';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import type { DockContext } from './floating-dock';
import { prepareSettlementConfig, settlementItems, validateConfig, type Member, type SettlementConfig, type SettlementItem, type SettlementSettings, type SpaceData } from './spaces';
import { SettlementConfigEditor } from './split-editor';
export function SettlementSettingsPanel({initialScope='month',spaceId,month,members,settings,items,api,onClose,onSaved,onDockChange}:{initialScope?:'month'|'default';spaceId:string;month:string;members:Member[];settings:SettlementSettings;items:SettlementItem[];api:Api;onClose:()=>void;onSaved:()=>Promise<void>;onDockChange:SpaceDockChange}){
 const [closing,setClosing]=useState(false);
 const [selectedMonth,setSelectedMonth]=useState(month);
 const [selectedItems,setSelectedItems]=useState(items);
 const [selectedMembers,setSelectedMembers]=useState(members);
 const [scope,setScope]=useState<'month'|'default'>(initialScope),[config,setConfig]=useState<SettlementConfig>(structuredClone(settings.config)),[revision,setRevision]=useState(0),[busy,setBusy]=useState(true),[error,setError]=useState('');
 const key=`${selectedMonth}:${scope}`;
 const [loadedKey,setLoadedKey]=useState<string|null>(null);
 useEffect(()=>{
  let active=true;setLoadedKey(null);setError('');
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)){setBusy(false);return;}
  setBusy(true);
  async function load(){
   try{
    const state=await api<State&SpaceData>(`/state?month=${selectedMonth}`);
    const s=scope==='default'?await api<SettlementSettings>(`/spaces/${spaceId}/defaults?month=${selectedMonth}`):state.settlement;
    if(active){setConfig(structuredClone(s.config));setRevision(s.scope===scope&&s.month===selectedMonth?s.revision:0);setSelectedItems(settlementItems(state));setSelectedMembers(state.members);setLoadedKey(key);}
   }catch(e){if(active)setError(e instanceof Error?e.message:String(e));}
   finally{if(active)setBusy(false);}
  }
  void load();
  return()=>{active=false;};
 },[selectedMonth,scope,spaceId,api]);
 const available=selectedMembers.filter(m=>m.active||scope==='month');
 const memberIds=new Set(available.map(m=>m.user_id));
 const saveConfig=prepareSettlementConfig(config,selectedItems,memberIds);
 const selectedIds=new Set([saveConfig.common,...Object.values(saveConfig.items)].flatMap(split=>split.shares.map(share=>share.user_id)));
 const editableMembers=selectedMembers.filter(member=>member.active||scope==='month'||selectedIds.has(member.user_id));
 const hasFormerMembers=scope==='default'&&selectedMembers.some(member=>!member.active&&selectedIds.has(member.user_id));
 const valid=loadedKey===key&&validateConfig(saveConfig,memberIds);
 async function save(){if(busy||closing||!valid)return;setBusy(true);setError('');try{await api(`/spaces/${spaceId}/settlement`,{method:'PUT',body:JSON.stringify({month:selectedMonth,scope,config:saveConfig,revision})});await onSaved();setClosing(true);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 const context:DockContext={label:'負担の設定',commit:true,actionLabel:busy?(loadedKey===key?'保存中…':'読み込み中…'):'保存',disabled:busy||closing||!valid,onAction:()=>void save(),onBack:()=>{if(!busy&&!closing)setClosing(true);}};
 return <SpacePanel title="負担の設定" icon={UsersRound} context={context} closing={closing} onExited={onClose} onDockChange={onDockChange}>
  <div className="settlement-settings">
   <section className="split-scope"><label className="split-month">適用月<input type="month" aria-label="適用月" value={selectedMonth} disabled={busy||closing} onChange={event=>setSelectedMonth(event.target.value)}/></label><div className="split-section-heading"><h3>適用範囲</h3></div>
    <div className="split-segments" role="group" aria-label="適用範囲">
     <button type="button" disabled={busy||closing} aria-pressed={scope==='month'} onClick={()=>setScope('month')}>この月だけ</button>
     <button type="button" disabled={busy||closing} aria-pressed={scope==='default'} onClick={()=>setScope('default')}>この月以降</button>
    </div>
    {scope==='default'&&<p className="split-scope-note">選んだ月以降の設定を更新します。月別に保存した割合にも反映されます。</p>}
   </section>
   <form onSubmit={event=>{event.preventDefault();void save();}}><fieldset key={key} disabled={busy||closing||loadedKey!==key} className="split-form">
    <SettlementConfigEditor config={config} members={editableMembers} items={selectedItems} onChange={setConfig}/>
   </fieldset>{error&&<p className="notice" role="alert">{error}</p>}{!valid&&!busy&&loadedKey===key&&hasFormerMembers&&<p className="split-invalid" role="status">参加していないメンバーを対象から外してください。</p>}</form>
  </div>
 </SpacePanel>;
}
