import { useState } from 'react';
import { UsersRound } from 'lucide-react';
import type { Member } from './spaces';
import type { PanelOrigin } from './use-panel-morph';
import { SpacePanel, type SpaceDockChange } from './space-panel';
import { MemberAvatar } from './member-avatar';

type Props={month:string;members:Member[];allocations:Record<string,number>;adjustments:Record<string,number>;userId:string};
const yen=(amount:number)=>`¥${amount.toLocaleString('ja-JP')}`;

export function AllocationBreakdown({month,members,allocations,adjustments,userId}:Props) {
 const participants=members.filter(m=>allocations[m.user_id]!==undefined).sort((a,b)=>Number(b.user_id===userId)-Number(a.user_id===userId));
 return <><div className="allocation-breakdown-summary"><span>{Number(month.slice(0,4))}年{Number(month.slice(5))}月 · {participants.length}人</span><strong>{yen(Object.values(allocations).reduce((sum,amount)=>sum+amount,0))}</strong></div>
 <ul className="allocation-member-list" aria-label="メンバーごとの負担額">{participants.map(member=><li className="space-member" key={member.user_id} data-self={member.user_id===userId||undefined}><MemberAvatar member={member}/><span className="allocation-member-name">{member.name}{member.user_id===userId&&<small>あなた</small>}{!member.active&&<small>現在は参加していません</small>}</span><div className="allocation-member-amount"><strong>{yen(allocations[member.user_id])}</strong>{!!adjustments[member.user_id]&&<small>端数調整 {adjustments[member.user_id]>0?'+':'−'}{Math.abs(adjustments[member.user_id]).toLocaleString('ja-JP')}円を含む</small>}</div></li>)}</ul>{Object.values(adjustments).some(Boolean)&&<p className="allocation-rounding-note">合計に合わせて1円未満の端数を配分しています。調整した分は上の負担額に含まれています。</p>}</>;
}

export function AllocationBreakdownPanel({origin,onClose,onDockChange,...props}:Props&{origin?:PanelOrigin;onClose:()=>void;onDockChange:SpaceDockChange}) {
 const [closing,setClosing]=useState(false);
 const dismiss=()=>setClosing(true);
 return <SpacePanel title="負担の内訳" icon={UsersRound} origin={origin} closing={closing} onExited={onClose} onDockChange={onDockChange} context={{label:'負担の内訳',backOnly:true,actionLabel:'閉じる',onAction:dismiss,onBack:dismiss}}><AllocationBreakdown {...props}/></SpacePanel>;
}
