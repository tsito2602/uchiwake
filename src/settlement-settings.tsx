import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import type { Api } from './space-api';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import type { DockContext } from './floating-dock';
import { prepareSettlementConfig, validateConfig, type Member, type SettlementConfig, type SettlementItem, type SettlementSettings } from './spaces';
import { SettlementConfigEditor } from './split-editor';
export function SettlementSettingsPanel({initialScope='month',spaceId,month,members,settings,items,api,onClose,onSaved,onDockChange}:{initialScope?:'month'|'default';spaceId:string;month:string;members:Member[];settings:SettlementSettings;items:SettlementItem[];api:Api;onClose:()=>void;onSaved:()=>Promise<void>;onDockChange:SpaceDockChange}){
 const [closing,setClosing]=useState(false);
 const [scope,setScope]=useState<'month'|'default'>(initialScope),[config,setConfig]=useState<SettlementConfig>(structuredClone(settings.config)),[revision,setRevision]=useState(settings.scope==='month'&&settings.month===month?settings.revision:0),[busy,setBusy]=useState(initialScope==='default'),[error,setError]=useState('');
 const [loadedScope,setLoadedScope]=useState<'month'|'default'|null>(initialScope==='month'?'month':null);
 useEffect(()=>{
  if(scope==='month'){setConfig(structuredClone(settings.config));setRevision(settings.scope==='month'&&settings.month===month?settings.revision:0);setLoadedScope('month');setError('');return;}
  let active=true;setBusy(true);setLoadedScope(null);setError('');
  api<SettlementSettings>(`/spaces/${spaceId}/defaults?month=${month}`).then(s=>{if(active){setConfig(s.config);setRevision(s.revision);setLoadedScope('default');}},e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[scope]);
 const available=members.filter(m=>m.active||scope==='month');
 const memberIds=new Set(available.map(m=>m.user_id));
 const saveConfig=prepareSettlementConfig(config,items,memberIds);
 const selectedIds=new Set([saveConfig.common,...Object.values(saveConfig.items)].flatMap(split=>split.shares.map(share=>share.user_id)));
 const editableMembers=members.filter(member=>member.active||scope==='month'||selectedIds.has(member.user_id));
 const hasFormerMembers=scope==='default'&&members.some(member=>!member.active&&selectedIds.has(member.user_id));
 const valid=loadedScope===scope&&validateConfig(saveConfig,memberIds);
 async function save(){if(busy||closing||!valid)return;setBusy(true);setError('');try{await api(`/spaces/${spaceId}/settlement`,{method:'PUT',body:JSON.stringify({month,scope,config:saveConfig,revision})});await onSaved();setClosing(true);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 const context:DockContext={label:'負担の設定',commit:true,actionLabel:busy?(loadedScope===scope?'保存中…':'読み込み中…'):'保存',disabled:busy||closing||!valid,onAction:()=>void save(),onBack:()=>{if(!busy&&!closing)setClosing(true);}};
 const monthLabel=`${Number(month.slice(0,4))}年${Number(month.slice(5))}月`;
 return <SpacePanel title="負担の設定" icon={UsersRound} context={context} closing={closing} onExited={onClose} onDockChange={onDockChange}>
  <div className="settlement-settings">
   <section className="split-scope"><div className="split-section-heading"><h3>適用範囲</h3><time dateTime={month}>{monthLabel}</time></div>
    <div className="split-segments" role="group" aria-label="適用範囲">
     <button type="button" disabled={busy||closing} aria-pressed={scope==='month'} onClick={()=>setScope('month')}>この月だけ</button>
     <button type="button" disabled={busy||closing} aria-pressed={scope==='default'} onClick={()=>setScope('default')}>この月以降</button>
    </div>
    {scope==='default'&&<p className="split-scope-note">月別に保存した設定を優先します</p>}
   </section>
   <form onSubmit={event=>{event.preventDefault();void save();}}><fieldset key={scope} disabled={busy||closing||loadedScope!==scope} className="split-form">
    <SettlementConfigEditor config={config} members={editableMembers} items={items} onChange={setConfig}/>
   </fieldset>{error&&<p className="notice" role="alert">{error}</p>}{!valid&&!busy&&loadedScope===scope&&hasFormerMembers&&<p className="split-invalid" role="status">参加していないメンバーを対象から外してください。</p>}</form>
  </div>
 </SpacePanel>;
}
