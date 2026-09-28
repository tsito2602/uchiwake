import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import type { Api } from './space-api';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import type { DockContext } from './floating-dock';
import { validateConfig, type Member, type Split, type SettlementConfig, type SettlementSettings } from './spaces';
function SplitEditor({label,value,members,onChange}:{label:string;value:Split;members:Member[];onChange:(s:Split)=>void}) {
 const sum=value.shares.reduce((n,s)=>n+s.weight,0);
 return <fieldset className="split-editor"><legend>{label}</legend><div className="mode-options"><button type="button" aria-pressed={value.mode==='equal'} className={value.mode==='equal'?'selected':''} onClick={()=>onChange({mode:'equal',shares:value.shares.map(s=>({...s,weight:1}))})}>均等</button><button type="button" aria-pressed={value.mode==='percent'} className={value.mode==='percent'?'selected':''} onClick={()=>{const count=value.shares.length;onChange({mode:'percent',shares:value.shares.map((s,i)=>({...s,weight:Math.floor(10000/count)+(i<10000%count?1:0)}))});}}>割合指定</button></div>
 {members.map(m=>{const share=value.shares.find(s=>s.user_id===m.user_id);return <div className="split-member" key={m.user_id}><label><input type="checkbox" checked={!!share} onChange={e=>onChange({...value,shares:e.target.checked?[...value.shares,{user_id:m.user_id,weight:value.mode==='equal'?1:0}]:value.shares.filter(s=>s.user_id!==m.user_id)})}/><span>{m.name}{!m.active&&<small>現在は参加していません</small>}</span></label>{share&&value.mode==='percent'&&<span className="split-percent"><input type="number" aria-label={`${label}・${m.name}の負担割合`} min="0.01" max="100" step="0.01" inputMode="decimal" value={share.weight/100} onChange={e=>onChange({...value,shares:value.shares.map(s=>s.user_id===m.user_id?{...s,weight:Math.round(Number(e.target.value)*100)}:s)})}/>%</span>}</div>;})}
 <p className={value.mode==='percent'&&sum!==10000?'split-invalid':'subtle'}>{!value.shares.length?'精算の対象者を選んでください':value.mode==='equal'?`${value.shares.length}人で均等に分ける`:`合計 ${(sum/100).toLocaleString('ja-JP')}％`}</p></fieldset>;
}
export function SettlementSettingsPanel({spaceId,month,members,settings,items,api,onClose,onSaved,onDockChange}:{spaceId:string;month:string;members:Member[];settings:SettlementSettings;items:{key:string;label:string;amount:number}[];api:Api;onClose:()=>void;onSaved:()=>Promise<void>;onDockChange:SpaceDockChange}){
 const [closing,setClosing]=useState(false);
 const [scope,setScope]=useState<'month'|'default'>('month'),[config,setConfig]=useState<SettlementConfig>(structuredClone(settings.config)),[revision,setRevision]=useState(settings.scope==='month'&&settings.month===month?settings.revision:0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(scope==='month'){setConfig(structuredClone(settings.config));setRevision(settings.scope==='month'&&settings.month===month?settings.revision:0);return;}
  let active=true;setBusy(true);setError('');
  api<SettlementSettings>(`/spaces/${spaceId}/defaults?month=${month}`).then(s=>{if(active){setConfig(s.config);setRevision(s.revision);}},e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
  return()=>{active=false;};
 },[scope]);
 const available=members.filter(m=>m.active||scope==='month');
 const valid=validateConfig(config,new Set(available.map(m=>m.user_id)));
 async function save(){if(busy||closing||!valid)return;setBusy(true);setError('');try{await api(`/spaces/${spaceId}/settlement`,{method:'PUT',body:JSON.stringify({month,scope,config,revision})});await onSaved();setClosing(true);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
 const context:DockContext={label:'負担の設定',commit:true,actionLabel:busy?'保存中…':'保存',disabled:busy||closing||!valid,onAction:()=>void save(),onBack:()=>{if(!busy&&!closing)setClosing(true);}};
 return <SpacePanel title="負担の設定" icon={UsersRound} context={context} closing={closing} onExited={onClose} onDockChange={onDockChange}><p className="subtle">{month.replace('-','年')}月</p><div className="mode-options"><button disabled={busy} aria-pressed={scope==='month'} className={scope==='month'?'selected':''} onClick={()=>setScope('month')}>この月だけ</button><button disabled={busy} aria-pressed={scope==='default'} className={scope==='default'?'selected':''} onClick={()=>setScope('default')}>基本設定</button></div>{scope==='default'&&<p className="subtle">この月以降に使います。月別に保存済みの設定は保持されます。</p>}
 <form onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={busy} className="split-form">
 <label className="split-uniform"><span><UsersRound size={20}/>すべて同じ割合にする</span><input className="space-toggle" type="checkbox" role="switch" checked={config.uniform} onChange={e=>setConfig({...config,uniform:e.target.checked})}/></label>
 <SplitEditor label={config.uniform?'精算全体':'共通の設定'} value={config.common} members={available} onChange={common=>setConfig({...config,common})}/>
 {!config.uniform&&<><p className="subtle">設定していない費用には共通の設定を使います。</p>{items.map(item=><SplitEditor key={item.key} label={item.label} value={config.items[item.key]??config.common} members={available} onChange={split=>setConfig({...config,items:{...config.items,[item.key]:split}})}/>)}</>}
 </fieldset>{error&&<p className="notice" role="alert">{error}</p>}{!valid&&!busy&&<p className="split-invalid" role="status">対象者を選び、すべての割合を合計100％にしてください。</p>}</form></SpacePanel>;
}
