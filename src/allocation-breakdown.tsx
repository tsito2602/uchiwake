import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check, CircleHelp, Shuffle, UsersRound } from 'lucide-react';
import { settlementDetails, type Member, type SettlementItem, type SettlementSettings } from './spaces';
import type { Api } from './space-api';
import type { DockContext } from './floating-dock';
import type { PanelOrigin } from './use-panel-morph';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import { MemberAvatar } from './member-avatar';
import { randomMemberIndex } from './rounding-draw';

type Props={month:string;members:Member[];allocations:Record<string,number>;adjustments:Record<string,number>;unassigned?:number;userId:string};
const yen=(amount:number)=>`¥${amount.toLocaleString('ja-JP')}`;
const roundingLabel=(amount:number)=>`${amount<0?'−':''}${Math.abs(amount).toLocaleString('ja-JP')}円`;

export function AllocationBreakdown({month,members,allocations,adjustments,unassigned=0,userId}:Props) {
 const participants=members.filter(m=>Object.hasOwn(allocations,m.user_id)).sort((a,b)=>Number(b.user_id===userId)-Number(a.user_id===userId));
 return <><div className="allocation-breakdown-summary"><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月 · {participants.length}人</span><strong>{yen(Object.values(allocations).reduce((sum,amount)=>sum+amount,unassigned))}</strong></div>
 <ul className="allocation-member-list" aria-label="メンバーごとの負担額">{participants.map(member=><li className="space-member" key={member.user_id} data-self={member.user_id===userId||undefined}><MemberAvatar member={member}/><span className="allocation-member-name">{member.name}{member.user_id===userId&&<small>あなた</small>}{!member.active&&<small>現在は参加していません</small>}</span><div className="allocation-member-amount"><strong>{yen(allocations[member.user_id])}</strong>{!!adjustments[member.user_id]&&<small>端数 {adjustments[member.user_id]>0?'+':'−'}{Math.abs(adjustments[member.user_id]).toLocaleString('ja-JP')}円を含む</small>}</div></li>)}</ul>
 {!!unassigned&&<p className="allocation-rounding-note">端数 {roundingLabel(unassigned)} · 未選択</p>}</>;
}

// Who pays the rounding remainder. Everyone's share is read off the torn split
// bar, so this panel is only the remainder: pick a person, or draw one.
type PanelProps={month:string;spaceId:string;members:Member[];items:SettlementItem[];settings:SettlementSettings;userId:string;api:Api;onSaved:()=>Promise<void>;origin?:PanelOrigin;onClose:()=>void;onDockChange:SpaceDockChange};
export function AllocationBreakdownPanel({origin,onClose,onDockChange,month,spaceId,members,items,settings,userId,api,onSaved}:PanelProps) {
 const base=settlementDetails(items,{...settings.config,roundingUserId:null});
 const candidates=members.filter(member=>Object.hasOwn(base.amounts,member.user_id));
 const savedId=candidates.some(member=>member.user_id===settings.config.roundingUserId)?settings.config.roundingUserId!:null;
 const [selected,setSelected]=useState<string|null>(savedId);
 const [changed,setChanged]=useState(false),[busy,setBusy]=useState(false),[closing,setClosing]=useState(false),[error,setError]=useState('');
 const [draw,setDraw]=useState<{step:number;index:number;done:boolean}|null>(null);
 const drawing=!!draw&&!draw.done;
 const timer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const drawingLock=useRef(false),savingLock=useRef(false);
 const drawArea=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(draw)drawArea.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});},[!!draw,drawing]);
 useEffect(()=>()=>{if(timer.current)clearTimeout(timer.current);},[]);
 const detail=settlementDetails(items,{...settings.config,roundingUserId:selected});
 const dismiss=()=>{if(savingLock.current)return;if(timer.current)clearTimeout(timer.current);drawingLock.current=false;setClosing(true);};
 function choose(id:string|null){if(drawingLock.current||savingLock.current||closing)return;setSelected(id);setChanged(true);setDraw(null);setError('');}
 function startDraw(){
  if(drawingLock.current||savingLock.current||closing||!base.remainder||!candidates.length)return;
  drawingLock.current=true;setError('');
  // Choose once, uniformly; the animation only reveals this result.
  const winner=randomMemberIndex(candidates.length),reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const steps=reduce?0:18;
  const finish=()=>{setSelected(candidates[winner].user_id);setChanged(true);setDraw({step:steps,index:winner,done:true});drawingLock.current=false;timer.current=null;};
  if(reduce){finish();return;}
  const start=(winner-steps%candidates.length+candidates.length)%candidates.length;
  setDraw({step:0,index:start,done:false});
  const tick=(step:number)=>{
   if(step===steps){finish();return;}
   setDraw({step,index:(start+step)%candidates.length,done:false});
   timer.current=setTimeout(()=>tick(step+1),65+Math.pow(step/steps,3)*270);
  };
  timer.current=setTimeout(()=>tick(1),75);
 }
 async function save(){
  if(savingLock.current||drawingLock.current||closing||!changed)return;
  savingLock.current=true;setBusy(true);setError('');
  try{await api(`/spaces/${spaceId}/rounding`,{method:'PUT',body:JSON.stringify({month,user_id:selected,revision:settings.revision})});await onSaved();setClosing(true);}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{savingLock.current=false;setBusy(false);}
 }
 const editable=!!base.remainder;
 const disabled=busy||drawing||closing;
 const context:DockContext={label:'端数の負担',backOnly:!editable,commit:changed,actionLabel:busy?'保存中…':drawing?'抽選中…':changed?'保存':'ランダムで決める',actionIcon:changed?undefined:'shuffle',disabled,onAction:changed?()=>void save():startDraw,onBack:dismiss,
  auxiliaryAction:editable&&changed?{icon:'shuffle',label:'ランダムで決める',disabled,onAction:startDraw}:undefined};
 const winner=draw?candidates[draw.index]:undefined;
 return <SpacePanel fit title="端数の負担" icon={UsersRound} origin={origin} closing={closing} onExited={onClose} onDockChange={onDockChange} context={context}>
  {editable&&<section className="rounding-choice" aria-labelledby="rounding-title">
   <div className="rounding-heading"><h3 id="rounding-title">端数 <strong>{roundingLabel(base.remainder)}</strong></h3><span>{changed?'未保存':selected?'保存済み':'未選択'}</span></div>
   <p className="rounding-description">{base.remainder<0?'端数の返金を受け取る人を選べます。':'端数を払う人を選べます。'}未選択のままでも大丈夫です。</p>
   {draw&&winner&&<div className="rounding-draw" ref={drawArea} data-phase={draw.done?'result':'drawing'}>
    <div className="rounding-draw-stage" aria-hidden="true">
     {draw.done&&<div className="rounding-burst">{Array.from({length:8},(_,i)=><i key={i} style={{'--burst-angle':`${i*45}deg`} as CSSProperties}/>)}</div>}
     <div className="rounding-draw-person" key={`${draw.done}:${draw.step}`}><MemberAvatar member={winner}/><strong>{winner.name}</strong></div>
    </div>
    <p role="status" aria-live="polite">{draw.done?`${winner.name}さんに決まりました`:'抽選中…'}</p>
    {draw.done&&<small>「保存」で確定</small>}
   </div>}
   <fieldset className="rounding-options" disabled={disabled}><legend className="sr-only">端数を負担する人</legend>
    <label className="rounding-option" data-selected={selected===null}><input type="radio" name="rounding-member" aria-label="未選択" checked={selected===null} onChange={()=>choose(null)}/><CircleHelp size={22} aria-hidden="true"/><span>未選択</span>{selected===null&&<Check size={17} aria-hidden="true"/>}</label>
    {candidates.map(member=><label key={member.user_id} className="rounding-option" data-selected={selected===member.user_id}><input type="radio" name="rounding-member" aria-label={member.name} checked={selected===member.user_id} onChange={()=>choose(member.user_id)}/><MemberAvatar member={member}/><span>{member.name}{member.user_id===userId&&<small>あなた</small>}{!member.active&&<small>現在は参加していません</small>}</span><em className="rounding-option-amount">{yen(detail.amounts[member.user_id]??0)}</em>{selected===member.user_id&&<Check size={17} aria-hidden="true"/>}</label>)}
   </fieldset>
   {!draw&&<p className="rounding-draw-hint"><Shuffle size={13}/>ランダムでも決められます</p>}
  </section>}
  {error&&<p className="error" role="alert">{error}</p>}
 </SpacePanel>;
}
