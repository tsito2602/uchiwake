import { useState } from 'react';
import { MemberAvatar } from './member-avatar';
import { ChevronRight, Pencil, Trash2, UserRound, UserRoundPlus, UsersRound } from 'lucide-react';
import type { Member, Space } from './spaces';
import type { Api } from './space-api';
import type { DockContext } from './floating-dock';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import { panelOrigin, type PanelOrigin } from './use-panel-morph';
import { NameSettingsForm, type NameSaveAction } from './name-settings-form';


export function SpaceSettingsLinks({spaces,disabled,onOpen}:{spaces:Space[];disabled:boolean;onOpen:(space:Space,source:HTMLElement)=>void}){
 const ordered=[...spaces.filter(space=>space.kind==='personal'),...spaces.filter(space=>space.kind==='shared')];
 return <>
  <div className="settings-group-heading"><small>スペースごと</small><h2>スペース設定</h2></div>
  {ordered.map(space=><section className="section settings-section" key={space.id}>
   <button type="button" className="settings-card-button" disabled={disabled} aria-label={`${space.name}の設定`} onClick={event=>onOpen(space,event.currentTarget.closest<HTMLElement>('.settings-section')??event.currentTarget)}>
    {space.kind==='personal'?<UserRound size={21}/>:<UsersRound size={21}/>}<span><strong>{space.name}</strong><small>{space.kind==='personal'?'個人スペース':'共有スペース'}</small></span><ChevronRight size={18}/>
   </button>
  </section>)}
 </>;
}

type Props={space:Space;userId:string;members:Member[];disabled:boolean;api:Api;onRefresh:()=>Promise<void>;onReload:()=>Promise<void>;onDockChange:SpaceDockChange;onNameActionChange:(action:NameSaveAction|undefined)=>void};
export function SpaceManagementSettings({space,userId,members,disabled,api,onRefresh,onReload,onDockChange,onNameActionChange}:Props){
 const [view,setView]=useState<'invite'|null>(null),[origin,setOrigin]=useState<PanelOrigin>();
 const [invite,setInvite]=useState<{code:string;expires_at:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[closing,setClosing]=useState(false);
 const owner=space.owner_id===userId,shared=space.kind==='shared',blocked=disabled||busy||closing;
 const canShare=typeof navigator.share==='function';
 const dismiss=()=>{if(!blocked)setClosing(true);};
 const run=async(action:()=>Promise<void>)=>{if(blocked)return;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const inviteText=invite?`「うちわけ」の「${space.name}」に招待します。\n招待コード：${invite.code}\nアプリを開き、右上のスペースアイコン →「招待コードで参加」で入力してください。\n48時間以内・1人用です。\n\n${window.location.origin}/`:'';
 const copy=()=>void run(async()=>{await navigator.clipboard.writeText(inviteText);setCopied(true);});
 const issueInvite=()=>void run(async()=>{setInvite(await api(`/spaces/${space.id}/invites`,{method:'POST',body:'{}'}));setCopied(false);setView('invite');setClosing(false);});
 const saveName=async(name:string)=>{setBusy(true);try{await api(`/spaces/${space.id}/name`,{method:'PUT',body:JSON.stringify({name})});await onRefresh();}finally{setBusy(false);}};
 const context:DockContext={label:'メンバーを招待',commit:true,onBack:dismiss,
  actionLabel:canShare?'共有':copied?'コピーしました':'招待文をコピー',
  disabled:blocked||!invite,
  onAction:()=>{if(blocked||!invite)return;if(canShare)void navigator.share({text:inviteText}).catch(e=>{if(e.name!=='AbortError')setError('共有できませんでした。招待文をコピーしてください');});else copy();},
  detailAction:{label:'別の招待コードを作る',icon:'refresh',disabled:blocked,onAction:issueInvite},
  ...(canShare?{auxiliaryAction:{label:copied?'コピーしました':'招待文をコピー',icon:'copy' as const,disabled:blocked||!invite,onAction:copy}}:{})
 };
 return <><section className="section settings-section space-management-settings">
  <h2 className="section-heading"><Pencil size={20} aria-hidden="true"/>スペース名</h2>
  <NameSettingsForm key={space.id} label="スペース名" showLabel={false} value={space.name} maxLength={40} disabled={blocked||!owner} onSave={saveName} onActionChange={onNameActionChange}/>
  {!owner&&<p className="subtle">変更は作成者のみ</p>}
 </section>
 {shared&&<section className="section settings-section space-management-settings">
  <h2 className="section-heading"><UsersRound size={20} aria-hidden="true"/>メンバー管理</h2>
  {error&&!view&&<p className="notice" role="alert">{error}</p>}
  <div className="space-members" aria-label="メンバー">{members.filter(m=>m.active).map(m=><div className="space-member" key={m.user_id}><MemberAvatar member={m}/><span>{m.name}{m.user_id===userId?'（あなた）':''}<small>{m.user_id===space.owner_id?'作成者':'メンバー'}</small></span>{shared&&owner&&m.user_id!==userId&&<button aria-label={`${m.name}をメンバーから外す`} disabled={blocked} onClick={()=>{if(confirm(`${m.name}さんを外しますか？ 過去の負担額は保持されます。未使用の招待コードは無効になります。`))void run(async()=>{await api(`/spaces/${space.id}/members/${encodeURIComponent(m.user_id)}`,{method:'DELETE'});await onReload();});}}><Trash2 size={18}/></button>}</div>)}</div>
  {shared&&owner&&<button className="settings-add-card" disabled={blocked} onClick={event=>{setOrigin(panelOrigin(event.currentTarget));issueInvite();}}><UserRoundPlus size={17}/>メンバーを招待</button>}
 </section>}
 {view&&<SpacePanel fit title="メンバーを招待" icon={UsersRound} context={context} origin={origin} closing={closing} onExited={()=>{setView(null);setClosing(false);setError('');}} onDockChange={onDockChange}>
  {error&&<p className="notice" role="alert">{error}</p>}
  {invite&&<div className="space-invite"><strong>{invite.code}</strong><small>1人用 · {new Date(invite.expires_at).toLocaleString('ja-JP')}まで</small><p className="subtle">招待文をLINEなどで相手に送ってください。</p>{copied&&<p role="status" className="subtle">招待文をコピーしました。</p>}</div>}
 </SpacePanel>}</>;
}
