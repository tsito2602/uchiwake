import { rentForMonth, statementSettlementAmount, type State } from './domain';
export type Space = {id:string;name:string;kind:'personal'|'shared';owner_id:string};
export type Member = {user_id:string;name:string;active:boolean;avatarUrl?:string};
export type Split = {mode:'equal'|'percent';shares:{user_id:string;weight:number}[]};
export type SettlementConfig = {uniform:boolean;common:Split;items:Record<string,Split>};
export type SettlementSettings = {config:SettlementConfig;revision:number;scope:'default'|'month';month:string};
export type SpaceData = {space:Space;members:Member[];settlement:SettlementSettings};
export function defaultSplit(members:Member[]):Split {
 return {mode:'equal',shares:members.filter(m=>m.active).map(m=>({user_id:m.user_id,weight:1}))};
}
export function defaultConfig(members:Member[]):SettlementConfig {return {uniform:true,common:defaultSplit(members),items:{}};}
export function validateConfig(value:unknown,memberIds:Set<string>):value is SettlementConfig {
 if(!value||typeof value!=='object')return false;
 const config=value as SettlementConfig;
 if(typeof config.uniform!=='boolean'||!config.items||typeof config.items!=='object'||Array.isArray(config.items))return false;
 const valid=(split:Split)=>!!split&&['equal','percent'].includes(split.mode)&&Array.isArray(split.shares)&&split.shares.length>0
  &&new Set(split.shares.map(s=>s?.user_id)).size===split.shares.length
  &&split.shares.every(s=>s&&memberIds.has(s.user_id)&&Number.isSafeInteger(s.weight)&&s.weight>0&&s.weight<=10000)
  &&(split.mode==='equal'?split.shares.every(s=>s.weight===1):split.shares.reduce((n,s)=>n+s.weight,0)===10000);
 return valid(config.common)&&Object.entries(config.items).every(([key,split])=>/^(card|statement|bill):[^\s]{1,100}$|^rent$/.test(key)&&valid(split));
}
// Integer arithmetic using BigInt avoids floating-point rounding and supports refunds.
export function allocate(amount:number,split:Split):Record<string,number> {
 if(!Number.isSafeInteger(amount)||!split.shares.length)throw new Error('負担の対象者と金額を確認してください');
 const weights=split.shares.map(s=>split.mode==='equal'?1:s.weight);
 const sum=weights.reduce((n,w)=>n+w,0);
 if(!sum||weights.some(w=>!Number.isSafeInteger(w)||w<=0))throw new Error('負担割合を確認してください');
 const sign=amount<0?-1:1, total=BigInt(Math.abs(amount)), denominator=BigInt(sum);
 const rows=split.shares.map((s,i)=>({id:s.user_id,amount:Number(total*BigInt(weights[i])/denominator),remainder:total*BigInt(weights[i])%denominator}));
 const remainder=Math.abs(amount)-rows.reduce((n,r)=>n+r.amount,0);
 [...rows].sort((a,b)=>a.remainder===b.remainder?a.id.localeCompare(b.id):a.remainder>b.remainder?-1:1).slice(0,remainder).forEach(r=>r.amount++);
 return Object.fromEntries(rows.map(r=>[r.id,sign*r.amount]));
}
export function settlementItems(state:Pick<State,'month'|'cards'|'statements'|'entries'|'bills'|'rent_rules'|'category_settings'>,personal=false) {
 const items=new Map<string,{key:string;label:string;amount:number}>();
 for(const card of state.cards)items.set(`card:${card.id}`,{key:`card:${card.id}`,label:card.name,amount:0});
 for(const s of state.statements){
  const key=s.card_id?`card:${s.card_id}`:`statement:${s.id}`;
  const item=items.get(key)??{key,label:s.title,amount:0};
  item.amount+=personal?s.confirmed_total:statementSettlementAmount(s,state.entries,state.category_settings);items.set(key,item);
 }
 items.set('rent',{key:'rent',label:'家賃',amount:rentForMonth(state.month,state.bills,state.rent_rules).amount});
 for(const b of state.bills.filter(b=>b.kind!=='card'&&b.kind!=='rent'))items.set(`bill:${b.id}`,{key:`bill:${b.id}`,label:b.title,amount:b.amount});
 return [...items.values()];
}
export function settlementAmounts(items:{key:string;amount:number}[],config:SettlementConfig) {
 const result:Record<string,number>={};
 const add=(values:Record<string,number>)=>Object.entries(values).forEach(([id,amount])=>{result[id]=(result[id]??0)+amount;});
 if(config.uniform)add(allocate(items.reduce((n,i)=>n+i.amount,0),config.common));
 else for(const item of items)add(allocate(item.amount,config.items[item.key]??config.common));
 return result;
}
