import { useRef, useState } from 'react';
import { UserRound, UsersRound, Plus, KeyRound, Settings } from 'lucide-react';
import type { Space } from './spaces';
import type { Api } from './space-api';
import type { DockContext } from './floating-dock';
import { SpaceDialog } from './space-dialog';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import { panelOrigin, type PanelOrigin } from './use-panel-morph';

type View='menu'|'create'|'join';
type Props={space:Space;spaces:Space[];disabled:boolean;api:Api;onSelect:(id:string)=>void;onSettings:()=>void;onRefresh:()=>Promise<void>;onDockChange:SpaceDockChange};
export function SpaceControls({space,spaces,disabled,api,onSelect,onSettings,onRefresh,onDockChange}:Props){
 const [view,setView]=useState<View|null>(null),[name,setName]=useState(''),[code,setCode]=useState(()=>sessionStorage.getItem('uchiwake-invite-code')||''),[preview,setPreview]=useState<{space_id:string;name:string;inviter:string|null}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [origin,setOrigin]=useState<PanelOrigin>(),[closing,setClosing]=useState(false);
 const exitAction=useRef<()=>void>(()=>setView('menu'));
 const change=(next:View|null,source?:HTMLElement)=>{setError('');setClosing(false);if(source)setOrigin(panelOrigin(source));setView(next);};
 const dismiss=(after:()=>void=()=>change('menu'))=>{exitAction.current=after;setClosing(true);};
 const enter=(next:View,source:HTMLElement)=>{setOrigin(panelOrigin(source));dismiss(()=>change(next));};
 const run=async(action:()=>Promise<void>)=>{if(busy||closing)return;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 async function create(){if(!name.trim())return;await run(async()=>{const {space:created}=await api<{space:Space}>('/spaces',{method:'POST',body:JSON.stringify({name})});await onRefresh();dismiss(()=>{change(null);onSelect(created.id);});});}
 async function join(){if(!code.trim())return;await run(async()=>{if(!preview){setPreview(await api('/spaces/invite-preview',{method:'POST',body:JSON.stringify({code})}));return;}const {space:joined}=await api<{space:Space}>('/spaces/join',{method:'POST',body:JSON.stringify({code,space_id:preview.space_id})});sessionStorage.removeItem('uchiwake-invite-code');await onRefresh();dismiss(()=>{change(null);onSelect(joined.id);});});}
 const back=()=>{if(busy||closing)return;if(view==='join'&&preview){setPreview(null);return;}dismiss();};
 const blocked=busy||closing;
 const context:DockContext={label:view==='create'?'スペースを作成':'招待コードで参加',commit:true,onBack:back,
  actionLabel:view==='create'?(busy?'作成中…':'作成する'):(busy?'確認中…':preview?'参加する':'参加先を確認'),
  disabled:blocked||(view==='create'?!name.trim():!code.trim()),
  onAction:()=>{if(blocked)return;if(view==='create')void create();else if(view==='join')void join();}
 };
 return <><button type="button" className="space-switcher" disabled={disabled||!!view} aria-label={`スペースを切り替え：${space.name}`} title={space.name} aria-haspopup="dialog" aria-expanded={view!==null} style={{transform:view?'scale(.5)':undefined}} onClick={()=>change('menu')}>{space.kind==='personal'?<UserRound size={23}/>:<UsersRound size={23}/>}</button>
 {view==='menu'&&<SpaceDialog title="スペース" closing={closing} onExited={()=>exitAction.current()} onClose={()=>dismiss(()=>change(null))}><div className="space-options">
 {spaces.map(s=><button key={s.id} aria-current={s.id===space.id?'true':undefined} onClick={()=>dismiss(()=>{change(null);onSelect(s.id);})}><span className="space-option-name">{s.name}<small>{s.kind==='personal'?'自分だけ':'共有'}</small></span>{s.kind==='personal'?<UserRound size={24} fill={s.id===space.id?'currentColor':'none'}/>:<UsersRound size={24} fill={s.id===space.id?'currentColor':'none'}/>}</button>)}
 <hr/>
 <button onClick={event=>{setName('');enter('create',event.currentTarget);}}><span>スペースを作成</span><Plus size={24}/></button>
 <button onClick={event=>{setPreview(null);enter('join',event.currentTarget);}}><span>招待コードで参加</span><KeyRound size={23}/></button>
 <button onClick={()=>dismiss(()=>{change(null);onSettings();})}><span>このスペースの設定</span><Settings size={23}/></button>
 </div></SpaceDialog>}
 {view&&view!=='menu'&&<SpacePanel title={view==='create'?'スペースを作成':'招待コードで参加'} icon={view==='create'?Plus:KeyRound} context={context} origin={origin} closing={closing} onExited={()=>exitAction.current()} onDockChange={onDockChange}>
 {error&&<p className="notice" role="alert">{error}</p>}
 {view==='create'&&<form onSubmit={e=>{e.preventDefault();if(!context.disabled)void create();}}><label className="field"><span>スペース名</span><input maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="うちの家計" disabled={blocked}/></label><p className="subtle">作成後、招待コードでメンバーを追加できます。</p></form>}
 {view==='join'&&<form onSubmit={e=>{e.preventDefault();if(!context.disabled)void join();}}><label className="field"><span>招待コード</span><input autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code} disabled={blocked} onChange={e=>{setCode(e.target.value);setPreview(null);sessionStorage.setItem('uchiwake-invite-code',e.target.value);}} placeholder="XXXX-XXXX-XXXX"/></label>{preview&&<div className="space-join-preview"><strong>{preview.name}</strong>{preview.inviter&&<p>{preview.inviter}さんからの招待</p>}<p className="subtle">このスペースの家計を一緒に閲覧・編集できます。</p></div>}</form>}
 </SpacePanel>}</>;
}
