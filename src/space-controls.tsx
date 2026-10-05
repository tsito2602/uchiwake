import { useEffect, useRef, useState } from 'react';
import { UserRound, UsersRound, Plus, KeyRound, Settings, SlidersHorizontal, Check } from 'lucide-react';
import { DockFaces, type DockFace } from './dock-faces';
import { haptic } from './haptics';
import type { Space } from './spaces';
import type { Api } from './space-api';
import type { DockContext } from './floating-dock';
import { SpaceDialog } from './space-dialog';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import { panelOrigin, type PanelOrigin } from './use-panel-morph';

type View='menu'|'create'|'join';
export type SpaceMenuRequest={source:HTMLElement;at:number};
type Props={space:Space;spaces:Space[];disabled:boolean;api:Api;onSelect:(id:string)=>void;onSettings:()=>void;onRefresh:()=>Promise<void>;onDockChange:SpaceDockChange;dockRequest?:SpaceMenuRequest|null;faces?:DockFace[];onAppSettings?:()=>void;onMenuChange?:(open:boolean)=>void};
export function SpaceControls({space,spaces,disabled,api,onSelect,onSettings,onRefresh,onDockChange,dockRequest,faces=[],onAppSettings,onMenuChange}:Props){
 const [view,setView]=useState<View|null>(null),[name,setName]=useState(''),[code,setCode]=useState(()=>sessionStorage.getItem('uchiwake-invite-code')||''),[preview,setPreview]=useState<{space_id:string;name:string;inviter:string|null}|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [origin,setOrigin]=useState<PanelOrigin>(),[closing,setClosing]=useState(false);
 const exitAction=useRef<()=>void>(()=>setView(null));
 const change=(next:View|null,source?:HTMLElement)=>{setError('');setClosing(false);if(source)setOrigin(panelOrigin(source));setView(next);};
 const dismiss=(after:()=>void=()=>change('menu'))=>{exitAction.current=after;setClosing(true);};
 const enter=(next:View,source:HTMLElement)=>{setOrigin(panelOrigin(source));dismiss(()=>change(next));};
 const run=async(action:()=>Promise<void>)=>{if(busy||closing)return;setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}};
 async function create(){if(!name.trim())return;await run(async()=>{const {space:created}=await api<{space:Space}>('/spaces',{method:'POST',body:JSON.stringify({name})});await onRefresh();dismiss(()=>{change(null);onSelect(created.id);});});}
 async function join(){if(!code.trim())return;await run(async()=>{if(!preview){setPreview(await api('/spaces/invite-preview',{method:'POST',body:JSON.stringify({code})}));return;}const {space:joined}=await api<{space:Space}>('/spaces/join',{method:'POST',body:JSON.stringify({code,space_id:preview.space_id})});sessionStorage.removeItem('uchiwake-invite-code');await onRefresh();dismiss(()=>{change(null);onSelect(joined.id);});});}
 // Back from creating or joining folds the panel away; the space list stays closed.
 const back=()=>{if(busy||closing)return;if(view==='join'&&preview){setPreview(null);return;}dismiss(()=>change(null));};
 const blocked=busy||closing;
 // The dock's face tab asks for the list; it then grows out of the tab island.
 const [anchor,setAnchor]=useState<DOMRect|null>(null);
 useEffect(()=>{
  if(!dockRequest)return;
  // The face tab toggles: pressed again while the sheet is out, it folds it away.
  if(view==='menu'&&anchor){if(!closing)leaveMenu(()=>change(null));return;}
  if(disabled||view)return;setAnchor(dockRequest.source.getBoundingClientRect());change('menu');
 },[dockRequest?.at]);
 useEffect(()=>{onMenuChange?.(view==='menu');},[view==='menu']);
 const leaveMenu=(after:()=>void)=>dismiss(()=>{setAnchor(null);after();});
 const context:DockContext={label:view==='create'?'スペースを作成':'招待コードで参加',commit:true,onBack:back,
  actionLabel:view==='create'?(busy?'作成中…':'作成する'):(busy?'確認中…':preview?'参加する':'参加先を確認'),
  disabled:blocked||(view==='create'?!name.trim():!code.trim()),
  onAction:()=>{if(blocked)return;if(view==='create')void create();else if(view==='join')void join();}
 };
 return <><button type="button" className="space-switcher" disabled={disabled||!!view} aria-label={`スペースを切り替え：${space.name}`} title={space.name} aria-haspopup="dialog" aria-expanded={view!==null} style={{transform:view?'scale(.5)':undefined}} onClick={()=>change('menu')}>{space.kind==='personal'?<UserRound size={23}/>:<UsersRound size={23}/>}</button>
 {view==='menu'&&anchor&&<SpaceDialog title="スペース" anchor={anchor} closing={closing} onExited={()=>exitAction.current()} onClose={()=>leaveMenu(()=>change(null))}><div className="space-sheet-list">
 <p className="space-sheet-title">スペース</p>
 {spaces.map(s=><button key={s.id} className="space-sheet-row" aria-current={s.id===space.id?'true':undefined} onClick={()=>{haptic();leaveMenu(()=>{change(null);if(s.id!==space.id)onSelect(s.id);});}}><span className="space-sheet-mark">{s.id===space.id&&faces.length?<DockFaces faces={faces} spaceName={s.name}/>:s.kind==='personal'?<UserRound size={19}/>:<UsersRound size={19}/>}</span><span className="space-option-name">{s.name}<small>{s.kind==='personal'?'自分だけ':'共有'}</small></span>{s.id===space.id&&<Check className="space-sheet-check" size={19} aria-hidden="true"/>}</button>)}
 <hr/>
 <button className="space-sheet-row" onClick={event=>{setName('');setOrigin(panelOrigin(event.currentTarget));leaveMenu(()=>change('create'));}}><span className="space-sheet-mark is-quiet"><Plus size={19}/></span><span>スペースを作成</span></button>
 <button className="space-sheet-row" onClick={event=>{setPreview(null);setOrigin(panelOrigin(event.currentTarget));leaveMenu(()=>change('join'));}}><span className="space-sheet-mark is-quiet"><KeyRound size={18}/></span><span>招待コードで参加</span></button>
 <button className="space-sheet-row" onClick={()=>leaveMenu(()=>{change(null);onSettings();})}><span className="space-sheet-mark is-quiet"><SlidersHorizontal size={18}/></span><span>このスペースの設定</span></button>
 {onAppSettings&&<button className="space-sheet-row" onClick={()=>leaveMenu(()=>{change(null);onAppSettings();})}><span className="space-sheet-mark is-quiet"><Settings size={19}/></span><span>設定<small>アカウント・表示・データ</small></span></button>}
 </div></SpaceDialog>}
 {view==='menu'&&!anchor&&<SpaceDialog title="スペース" closing={closing} onExited={()=>exitAction.current()} onClose={()=>dismiss(()=>change(null))}><div className="space-options">
 {spaces.map(s=><button key={s.id} aria-current={s.id===space.id?'true':undefined} onClick={()=>dismiss(()=>{change(null);onSelect(s.id);})}><span className="space-option-name">{s.name}<small>{s.kind==='personal'?'自分だけ':'共有'}</small></span>{s.kind==='personal'?<UserRound size={24} fill={s.id===space.id?'currentColor':'none'}/>:<UsersRound size={24} fill={s.id===space.id?'currentColor':'none'}/>}</button>)}
 <hr/>
 <button onClick={event=>{setName('');enter('create',event.currentTarget);}}><span>スペースを作成</span><Plus size={24}/></button>
 <button onClick={event=>{setPreview(null);enter('join',event.currentTarget);}}><span>招待コードで参加</span><KeyRound size={23}/></button>
 <button onClick={()=>dismiss(()=>{change(null);onSettings();})}><span>このスペースの設定</span><Settings size={23}/></button>
 </div></SpaceDialog>}
 {view&&view!=='menu'&&<SpacePanel fit title={view==='create'?'スペースを作成':'招待コードで参加'} icon={view==='create'?Plus:KeyRound} context={context} origin={origin} closing={closing} onExited={()=>exitAction.current()} onDockChange={onDockChange}>
 {error&&<p className="notice" role="alert">{error}</p>}
 {view==='create'&&<form onSubmit={e=>{e.preventDefault();if(!context.disabled)void create();}}><label className="field"><span>スペース名</span><input maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="うちの家計" disabled={blocked}/></label><p className="subtle">作成後、招待コードでメンバーを追加できます。</p></form>}
 {view==='join'&&<form onSubmit={e=>{e.preventDefault();if(!context.disabled)void join();}}><label className="field"><span>招待コード</span><input autoCapitalize="characters" autoComplete="off" spellCheck={false} value={code} disabled={blocked} onChange={e=>{setCode(e.target.value);setPreview(null);sessionStorage.setItem('uchiwake-invite-code',e.target.value);}} placeholder="XXXX-XXXX-XXXX"/></label>{preview&&<div className="space-join-preview"><strong>{preview.name}</strong>{preview.inviter&&<p>{preview.inviter}さんからの招待</p>}<p className="subtle">このスペースの家計を一緒に閲覧・編集できます。</p></div>}</form>}
 </SpacePanel>}</>;
}
