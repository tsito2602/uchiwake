import { useState } from 'react';
import { MemberAvatar } from './member-avatar';
import { ChevronRight, Pencil, Trash2, UserRoundPlus, UsersRound } from 'lucide-react';
import type { Member, Space } from './spaces';
import type { Api } from './space-api';
import type { DockContext } from './floating-dock';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import { panelOrigin, type PanelOrigin } from './use-panel-morph';


type Props={space:Space;spaces:Space[];userId:string;members:Member[];disabled:boolean;api:Api;onSelect:(id:string)=>void;onRefresh:()=>Promise<void>;onReload:()=>Promise<void>;onDockChange:SpaceDockChange};
export function SpaceManagementSettings({space,spaces,userId,members,disabled,api,onSelect,onRefresh,onReload,onDockChange}:Props){
 const [view,setView]=useState<'name'|'invite'|null>(null),[name,setName]=useState(space.name),[origin,setOrigin]=useState<PanelOrigin>();
 const [invite,setInvite]=useState<{code:string;expires_at:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false),[closing,setClosing]=useState(false);
 const owner=space.owner_id===userId,shared=space.kind==='shared',blocked=disabled||busy||closing;
 const canShare=typeof navigator.share==='function';
 const dismiss=()=>{if(!blocked)setClosing(true);};
 const run=async(action:()=>Promise<void>)=>{if(blocked)return;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const inviteText=invite?`「うちわけ」の「${space.name}」に招待します。\n招待コード：${invite.code}\nアプリを開き、右上のスペースアイコン →「招待コードで参加」で入力してください。\n48時間以内・1人用です。`:'';
 const copy=()=>void run(async()=>{await navigator.clipboard.writeText(inviteText);setCopied(true);});
 const issueInvite=()=>void run(async()=>{setInvite(await api(`/spaces/${space.id}/invites`,{method:'POST',body:'{}'}));setCopied(false);setView('invite');setClosing(false);});
 const saveName=()=>void run(async()=>{await api(`/spaces/${space.id}/name`,{method:'PUT',body:JSON.stringify({name})});await onRefresh();setClosing(true);});
 const removeSpace=()=>{if(!blocked&&confirm(`「${space.name}」を削除しますか？ メンバー全員がアクセスできなくなります。`))void run(async()=>{await api(`/spaces/${space.id}/space`,{method:'DELETE'});await onRefresh();onSelect(spaces.find(s=>s.kind==='personal')!.id);});};
 const context:DockContext={label:view==='name'?'スペース名':'メンバーを招待',commit:true,onBack:dismiss,
  actionLabel:view==='name'?(busy?'保存中…':'保存'):canShare?'共有':copied?'コピーしました':'招待文をコピー',
  disabled:blocked||(view==='name'?!name.trim()||name.trim()===space.name:!invite),
  onAction:()=>{if(blocked)return;if(view==='name')saveName();else if(invite){if(canShare)void navigator.share({text:inviteText}).catch(e=>{if(e.name!=='AbortError')setError('共有できませんでした。招待文をコピーしてください');});else copy();}},
  ...(view==='invite'?{detailAction:{label:'別の招待コードを作る',icon:'refresh' as const,disabled:blocked,onAction:issueInvite},...(canShare?{auxiliaryAction:{label:copied?'コピーしました':'招待文をコピー',icon:'copy' as const,disabled:blocked||!invite,onAction:copy}}:{})}:{})
 };
 return <><section className="section settings-section space-management-settings">
  <h2 className="section-heading"><UsersRound size={20} aria-hidden="true"/>スペース名・メンバー</h2>
  {error&&!view&&<p className="notice" role="alert">{error}</p>}
  <button className="settings-card-button" type="button" disabled={blocked||!owner} onClick={event=>{setName(space.name);setOrigin(panelOrigin(event.currentTarget));setError('');setClosing(false);setView('name');}}><Pencil size={21}/><span><strong>{space.name}</strong><small>スペース名{!owner?' · 変更は作成者のみ':''}</small></span>{owner&&<ChevronRight size={18}/>}</button>
  <div className="space-members" aria-label="メンバー">{members.filter(m=>m.active).map(m=><div className="space-member" key={m.user_id}><MemberAvatar member={m}/><span>{m.name}{m.user_id===userId?'（あなた）':''}<small>{m.user_id===space.owner_id?'作成者':'メンバー'}</small></span>{shared&&owner&&m.user_id!==userId&&<button aria-label={`${m.name}をメンバーから外す`} disabled={blocked} onClick={()=>{if(confirm(`${m.name}さんを外しますか？ 過去の負担額は保持されます。未使用の招待コードは無効になります。`))void run(async()=>{await api(`/spaces/${space.id}/members/${encodeURIComponent(m.user_id)}`,{method:'DELETE'});await onReload();});}}><Trash2 size={18}/></button>}</div>)}</div>
  {shared&&owner&&<><button className="settings-add-card" disabled={blocked} onClick={event=>{setOrigin(panelOrigin(event.currentTarget));issueInvite();}}><UserRoundPlus size={17}/>メンバーを招待</button><button className="settings-add-card settings-space-delete" disabled={blocked} onClick={removeSpace}><Trash2 size={17}/>スペースを削除</button></>}
 </section>
 {view&&<SpacePanel title={view==='name'?'スペース名':'メンバーを招待'} icon={view==='name'?Pencil:UsersRound} context={context} origin={origin} closing={closing} onExited={()=>{setView(null);setClosing(false);setError('');}} onDockChange={onDockChange}>
  {error&&<p className="notice" role="alert">{error}</p>}
  {view==='name'?<form onSubmit={e=>{e.preventDefault();if(!context.disabled)saveName();}}><label className="field"><span>スペース名</span><input value={name} maxLength={40} disabled={blocked} onChange={e=>setName(e.target.value)}/></label></form>:invite&&<div className="space-invite"><strong>{invite.code}</strong><small>1人用 · {new Date(invite.expires_at).toLocaleString('ja-JP')}まで</small><p className="subtle">招待文をLINEなどで相手に送ってください。</p>{copied&&<p role="status" className="subtle">招待文をコピーしました。</p>}</div>}
 </SpacePanel>}</>;
}
