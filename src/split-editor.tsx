import { useEffect, useId, useState } from 'react';
import { Check, ChevronDown, CircleAlert, CreditCard, Home, ListFilter, ReceiptText, RotateCcw, UsersRound } from 'lucide-react';
import { MemberAvatar } from './member-avatar';
import { equalPercent, percentWeight, splitStatus } from './split-input';
import type { Member, SettlementConfig, Split } from './spaces';

function PercentInput({label,value,onChange}:{label:string;value:number;onChange:(weight:number)=>void}) {
  const [text,setText]=useState(value>0?String(value/100):'');
  useEffect(()=>{setText(current=>percentWeight(current)===value?current:value>0?String(value/100):'');},[value]);
  return <span className="split-percent"><input type="text" inputMode="decimal" autoComplete="off" aria-label={label} aria-invalid={value<=0||value>10000} placeholder="0" value={text}
    onFocus={event=>event.currentTarget.select()} onBlur={()=>{if(value>0)setText(String(value/100));}}
    onChange={event=>{setText(event.target.value);onChange(percentWeight(event.target.value));}}/><span aria-hidden="true">%</span></span>;
}

export function SplitEditor({label,value,members,onChange,compact=false}:{label:string;value:Split;members:Member[];onChange:(split:Split)=>void;compact?:boolean}) {
  const status=splitStatus(value);
  const heading=useId();
  return <section className={`split-editor${compact?' split-editor-compact':''}`} aria-labelledby={heading}>
    <div className="split-editor-heading"><h3 id={heading}>{label}</h3><span>{value.shares.length}人</span></div>
    <div className="split-segments" role="group" aria-label={`${label}の分け方`}>
      <button type="button" aria-pressed={value.mode==='equal'} onClick={()=>{if(value.mode!=='equal')onChange({mode:'equal',shares:value.shares.map(share=>({...share,weight:1}))});}}>均等に分ける</button>
      <button type="button" aria-pressed={value.mode==='percent'} onClick={()=>{if(value.mode!=='percent')onChange(equalPercent(value.shares));}}>割合で指定</button>
    </div>
    <div className="split-members">{members.map(member=>{
      const share=value.shares.find(share=>share.user_id===member.user_id);
      return <div className="split-member" data-selected={!!share} key={member.user_id}>
        <label className="split-person"><input type="checkbox" checked={!!share} aria-label={`${label}の対象者：${member.name}`} onChange={event=>onChange({...value,shares:event.target.checked?[...value.shares,{user_id:member.user_id,weight:value.mode==='equal'?1:0}]:value.shares.filter(share=>share.user_id!==member.user_id)})}/><span className="split-person-check" aria-hidden="true"><Check size={13}/></span><MemberAvatar member={member}/><span className="split-person-name">{member.name}{!member.active&&<small>現在は参加していません</small>}</span></label>
        {share?value.mode==='percent'?<PercentInput label={`${label}・${member.name}の負担割合`} value={share.weight} onChange={weight=>onChange({...value,shares:value.shares.map(share=>share.user_id===member.user_id?{...share,weight}:share)})}/>:<span className="split-equal-share">{10000%value.shares.length!==0?'約':''}{(100/value.shares.length).toLocaleString('ja-JP',{maximumFractionDigits:2})}%</span>:<span className="split-equal-share" aria-hidden="true">—</span>}
      </div>;
    })}</div>
    <div className="split-editor-footer"><span className="split-status" data-valid={status.valid} role="status">{status.valid?<Check size={15}/>:<CircleAlert size={15}/>} {status.label}</span>{value.mode==='percent'&&<button type="button" className="split-reset" disabled={!value.shares.length} onClick={()=>onChange(equalPercent(value.shares))}><RotateCcw size={14}/>均等に配分</button>}</div>
  </section>;
}

function splitSummary(value:Split,members:Member[]) {
  const selected=value.shares.map(share=>({name:members.find(member=>member.user_id===share.user_id)?.name??'メンバー',weight:share.weight}));
  if(!selected.length)return '対象者なし';
  if(value.mode==='equal')return `${selected.slice(0,2).map(share=>share.name).join('・')}${selected.length>2?` ほか${selected.length-2}人`:''} · 均等`;
  return selected.slice(0,2).map(share=>`${share.name} ${share.weight/100}%`).join(' / ')+(selected.length>2?` ほか${selected.length-2}人`:'');
}

function ItemSplit({item,value,common,members,onChange,onReset}:{item:{key:string;label:string};value?:Split;common:Split;members:Member[];onChange:(value:Split)=>void;onReset:()=>void}) {
  const [open,setOpen]=useState(false);
  const bodyId=useId();
  const split=value??common;
  const status=splitStatus(split);
  const Icon=item.key==='rent'?Home:item.key.startsWith('card:')?CreditCard:ReceiptText;
  return <div className="split-item" data-open={open}>
    <button type="button" className="split-item-heading" aria-expanded={open} aria-controls={bodyId} onClick={()=>setOpen(!open)}><Icon size={20}/><span><strong>{item.label}</strong><small>{splitSummary(split,members)}</small></span><span className="split-item-badge" data-invalid={!status.valid}>{status.valid?(value?'個別':'共通'):status.label}</span><ChevronDown size={17}/></button>
    <div className="split-item-body" id={bodyId} inert={!open} aria-hidden={!open}><div>
      <SplitEditor compact label={`${item.label}の負担`} value={split} members={members} onChange={onChange}/>
      {value&&<button type="button" className="split-use-common" onClick={onReset}><RotateCcw size={14}/>共通の設定に戻す</button>}
    </div></div>
  </div>;
}

export function SettlementConfigEditor({config,members,items,onChange}:{config:SettlementConfig;members:Member[];items:{key:string;label:string;amount:number}[];onChange:(config:SettlementConfig)=>void}) {
  // Include saved overrides absent from this month's costs so they remain editable.
  const allItems=[...items,...Object.keys(config.items).filter(key=>!items.some(item=>item.key===key)).map(key=>({key,label:key==='rent'?'家賃':'この月の利用がない費用',amount:0}))];
  const hiddenInvalid=config.uniform&&Object.values(config.items).some(split=>!splitStatus(split).valid);
  return <div className="settlement-config-editor">
    <div className="split-section-heading"><h3>負担の決め方</h3></div>
    <div className="split-segments split-strategy" role="group" aria-label="設定の単位"><button type="button" aria-pressed={config.uniform} onClick={()=>onChange({...config,uniform:true})}><UsersRound size={18}/>まとめて設定</button><button type="button" aria-pressed={!config.uniform} onClick={()=>onChange({...config,uniform:false})}><ListFilter size={18}/>費用ごとに設定</button></div>
    <SplitEditor label={config.uniform?'全体の負担':'共通の負担'} value={config.common} members={members} onChange={common=>onChange({...config,common})}/>
    {hiddenInvalid&&<button type="button" className="split-hidden-error" onClick={()=>onChange({...config,uniform:false})}><CircleAlert size={16}/>費用ごとの未入力を確認<ChevronDown size={16}/></button>}
    {!config.uniform&&<section className="split-items"><div className="split-section-heading"><h3>費用ごとの負担</h3></div>{allItems.length?allItems.map(item=><ItemSplit key={item.key} item={item} value={config.items[item.key]} common={config.common} members={members} onChange={split=>onChange({...config,items:{...config.items,[item.key]:split}})} onReset={()=>{const next={...config.items};delete next[item.key];onChange({...config,items:next});}}/>):<p className="split-empty">費用を登録すると表示されます</p>}</section>}
  </div>;
}
