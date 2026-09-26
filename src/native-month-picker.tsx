import { useState } from 'react';

export function NativeMonthPicker({value,onChange}:{value:string;onChange:(month:string)=>void}) {
  const [nativeMonth]=useState(()=>{
    const input=document.createElement('input');
    input.type='month';
    return input.type==='month';
  });
  const [year,month]=value.split('-');
  if(!nativeMonth)return <div className="dock-month-picker dock-month-fallback">
    <label><span aria-hidden="true">{year}</span><select aria-label="表示年" value={year} onChange={event=>onChange(`${event.target.value}-${month}`)}>{Array.from({length:Math.max(2100,Number(year))-Math.min(1900,Number(year))+1},(_,i)=>String(Math.min(1900,Number(year))+i)).map(item=><option key={item} value={item}>{item}年</option>)}</select></label>
    <span aria-hidden="true">-</span>
    <label><span aria-hidden="true">{month}</span><select aria-label="表示月" value={month} onChange={event=>onChange(`${year}-${event.target.value}`)}>{Array.from({length:12},(_,i)=>String(i+1).padStart(2,'0')).map(item=><option key={item} value={item}>{Number(item)}月</option>)}</select></label>
  </div>;
  return <label className="dock-month-picker">
    <span aria-hidden="true">{value}</span>
    <input type="month" aria-label="表示年月を選択" value={value} onClick={event=>{
      // Keep the real input tappable: iOS opens its native picker on focus.
      try { event.currentTarget.showPicker?.(); } catch { /* Native focus remains available. */ }
    }} onChange={event=>{if(/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))onChange(event.target.value);}}/>
  </label>;
}
