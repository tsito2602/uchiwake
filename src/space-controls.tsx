import { useRef, useState } from 'react';
import { Check, UserRound, UsersRound, Plus, KeyRound, Settings, Trash2 } from 'lucide-react';
import type { Space, Member } from './spaces';
import type { Api } from './space-api';
import type { DockContext } from './floating-dock';
import { SpaceDialog } from './space-dialog';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import { panelOrigin, type PanelOrigin } from './use-panel-morph';

type View='menu'|'create'|'join'|'manage'|'invite';
type Props={space:Space;spaces:Space[];userId:string;members:Member[];disabled:boolean;api:Api;onSelect:(id:string)=>void;onRefresh:()=>Promise<void>;onReload:()=>Promise<void>;onDockChange:SpaceDockChange};
function MemberAvatar({member}:{member:Member}){
 const [failedUrl,setFailedUrl]=useState<string>();
 return <span className="space-member-avatar" aria-hidden="true">{member.avatarUrl&&member.avatarUrl!==failedUrl
  ?<img src={member.avatarUrl} alt="" referrerPolicy="no-referrer" onError={()=>setFailedUrl(member.avatarUrl)}/>
  :Array.from(member.name.trim())[0]||<UserRound size={19}/>}</span>;
}
export function SpaceControls({space,spaces,userId,members,disabled,api,onSelect,onRefresh,onReload,onDockChange}:Props){
 const [view,setView]=useState<View|null>(null),[name,setName]=useState(''),[code,setCode]=useState(()=>sessionStorage.getItem('uchiwake-invite-code')||''),[preview,setPreview]=useState<{space_id:string;name:string;inviter:string}|null>(null);
 const [invite,setInvite]=useState<{code:string;expires_at:number}|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
 const [origin,setOrigin]=useState<PanelOrigin>(),[closing,setClosing]=useState(false);
 const exitAction=useRef<()=>void>(()=>setView('menu'));
 const owner=space.owner_id===userId;
 const canShare=typeof navigator.share==='function';
 const change=(next:View|null,source?:HTMLElement)=>{setError('');setClosing(false);if(source)setOrigin(panelOrigin(source));setView(next);};
 const dismiss=(after:()=>void=()=>change('menu'))=>{exitAction.current=after;setClosing(true);};
 const enter=(next:View,source:HTMLElement)=>{setOrigin(panelOrigin(source));dismiss(()=>change(next));};
 const run=async(action:()=>Promise<void>)=>{if(busy||closing)return;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 const inviteText=invite?`「うちわけ」の「${space.name}」に招待します。\n招待コード：${invite.code}\nアプリを開き、右上のスペースアイコン →「招待コードで参加」で入力してください。\n48時間以内・1人用です。`:'';
 const copy=()=>void run(async()=>{await navigator.clipboard.writeText(inviteText);setCopied(true);});
 const issueInvite=()=>void run(async()=>{setInvite(await api(`/spaces/${space.id}/invites`,{method:'POST',body:'{}'}));setCopied(false);change('invite');});
 async function create(){if(!name.trim())return;await run(async()=>{const {space:created}=await api<{space:Space}>('/spaces',{method:'POST',body:JSON.stringify({name})});await onRefresh();dismiss(()=>{change(null);onSelect(created.id);});});}
 async function join(){if(!code.trim())return;await run(async()=>{if(!preview){setPreview(await api('/spaces/invite-preview',{method:'POST',body:JSON.stringify({code})}));return;}const {space:joined}=await api<{space:Space}>('/spaces/join',{method:'POST',body:JSON.stringify({code,space_id:preview.space_id})});sessionStorage.removeItem('uchiwake-invite-code');await onRefresh();dismiss(()=>{change(null);onSelect(joined.id);});});}
 const saveName=()=>void run(async()=>{await api(`/spaces/${space.id}/name`,{method:'PUT',body:JSON.stringify({name})});await onRefresh();dismiss();});
 const removeSpace=()=>{if(!busy&&!closing&&confirm(`「${space.name}」を削除しますか？ メンバー全員がアクセスできなくなります。`))void run(async()=>{await api(`/spaces/${space.id}/space`,{method:'DELETE'});await onRefresh();onSelect(spaces.find(s=>s.kind==='personal')!.id);});};
 const back=()=>{if(busy||closing)return;if(view==='invite'){change('manage');return;}if(view==='join'&&preview){setPreview(null);return;}dismiss();};
 const blocked=busy||closing;
 const context:DockContext={label:view==='create'?'スペースを作成':view==='join'?'招待コードで参加':view==='invite'?'メンバーを招待':'スペースの設定',commit:true,onBack:back,
  actionLabel:view==='create'?(busy?'作成中…':'作成する'):view==='join'?(busy?'確認中…':preview?'参加する':'参加先を確認'):view==='invite'?(canShare?'共有':copied?'コピーしました':'招待文をコピー'):(busy?'保存中…':'保存'),
  disabled:blocked||(view==='create'?!name.trim():view==='join'?!code.trim():view==='manage'?!owner||!name.trim()||name.trim()===space.name:!invite),
  backOnly:view==='manage'&&!owner,
  onAction:()=>{if(blocked)return;if(view==='create')void create();else if(view==='join')void join();else if(view==='manage')saveName();else if(view==='invite'&&invite){if(canShare)void navigator.share({text:inviteText}).catch(e=>{if(e.name!=='AbortError')setError('共有できませんでした。招待文をコピーしてください');});else copy();}},
  ...(view==='manage'&&owner?{auxiliaryAction:{label:'メンバーを招待',icon:'invite' as const,disabled:blocked,onAction:issueInvite},secondaryAction:{label:'スペースを削除',disabled:blocked,onAction:removeSpace}}:{}),
  ...(view==='invite'?{detailAction:{label:'別の招待コードを作る',icon:'refresh' as const,disabled:blocked,onAction:issueInvite},...(canShare?{auxiliaryAction:{label:copied?'コピーしました':'招待文をコピー',icon:'copy' as const,disabled:blocked||!invite,onAction:copy}}:{})}:{})
 };
 return <><button type="button" className="space-switcher" disabled={disabled||!!view} aria-label={`スペースを切り替え：${space.name}`} title={space.name} aria-haspopup="dialog" aria-expanded={view!==null} style={{transform:view?'scale(.5)':undefined}} onClick={()=>change('menu')}>{space.kind==='personal'?<UserRound size={23}/>:<UsersRound size={23}/>}</button>
 {view==='menu'&&<SpaceDialog title="スペース" closing={closing} onExited={()=>exitAction.current()} onClose={()=>dismiss(()=>change(null))}><div className="space-options">{spaces.map(s=><button key={s.id} aria-current={s.id===space.id?'true':undefined} onClick={()=>dismiss(()=>{change(null);onSelect(s.id);})}><span className="space-option-name">{s.name}<small>{s.kind==='personal'?'自分だけ':'共有'}</small></span>{s.id===space.id&&<Check size={17}/>} {s.kind==='personal'?<UserRound size={24}/>:<UsersRound size={24}/>}</button>)}<hr/><button onClick={event=>{setName('');enter('create',event.currentTarget);}}><span>スペースを作成</span><Plus size={24}/></button><button onClick={event=>{setPreview(null);enter('join',event.currentTarget);}}><span>招待コードで参加</span><KeyRound size={23}/></button>{space.kind==='shared'&&<button onClick={event=>{setName(space.name);enter('manage',event.currentTarget);}}><span>このスペースの設定</span><Settings size={23}/></button>}</div></SpaceDialog>}
 {view&&view!=='menu'&&<SpacePanel title={view==='create'?'スペースを作成':view==='join'?'招待コードで参加':view==='invite'?'メンバーを招待':space.name} icon={view==='create'?Plus:view==='join'?KeyRound:UsersRound} context={context} origin={origin} closing={closing} onExited={()=>exitAction.current()} onDockChange={onDockChange}>
 {error&&<p className="notice" role="alert">{error}</p>}
 {view==='create'&&<form onSubmit={e=>{e.preventDefault();if(!context.disabled)void create();}}><label className="field"><span>スペース名</span><input maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="うちの家計" disabled={blocked}/></label><p className="subtle">作成後、招待コードでメンバーを追加できます。</p></form>}
 {view==='join'&&<form onSubmit={e=>{e.preventDefault();if(!context.disabled)void join();}}><label className="field"><span>招待コード</span><input autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code} disabled={blocked} onChange={e=>{setCode(e.target.value);setPreview(null);sessionStorage.setItem('uchiwake-invite-code',e.target.value);}} placeholder="XXXX-XXXX-XXXX"/></label>{preview&&<div className="space-join-preview"><strong>{preview.name}</strong><p>{preview.inviter}さんからの招待</p><p className="subtle">このスペースの家計を一緒に閲覧・編集できます。</p></div>}</form>}
 {view==='manage'&&<div className="space-manage">{owner&&<form onSubmit={e=>{e.preventDefault();if(!context.disabled)saveName();}}><label className="field"><span>スペース名</span><input value={name} maxLength={40} disabled={blocked} onChange={e=>setName(e.target.value)}/></label></form>}
 <h3>メンバー</h3>{members.filter(m=>m.active).map(m=><div className="space-member" key={m.user_id}><MemberAvatar member={m}/><span>{m.name}{m.user_id===userId?'（あなた）':''}<small>{m.user_id===space.owner_id?'作成者':'メンバー'}</small></span>{owner&&m.user_id!==userId&&<button aria-label={`${m.name}をメンバーから外す`} disabled={blocked} onClick={()=>{if(confirm(`${m.name}さんを外しますか？ 過去の負担額は保持されます。未使用の招待コードは無効になります。`))void run(async()=>{await api(`/spaces/${space.id}/members/${encodeURIComponent(m.user_id)}`,{method:'DELETE'});await onReload();});}}><Trash2 size={18}/></button>}</div>)}
 {owner&&<p className="subtle">下の招待ボタンからメンバーを追加できます。</p>}
 </div>}
 {view==='invite'&&invite&&<div className="space-invite"><strong>{invite.code}</strong><small>1人用 · {new Date(invite.expires_at).toLocaleString('ja-JP')}まで</small><p className="subtle">招待文をLINEなどで相手に送ってください。</p>{copied&&<p role="status" className="subtle">招待文をコピーしました。</p>}</div>}
 </SpacePanel>}</>;
}
