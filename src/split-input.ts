import type { Split } from './spaces';

// Keep percentage entry exact to two decimal places (one basis point).
export function percentWeight(text:string):number {
  const normalized=text.trim();
  if(!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(normalized))return 0;
  const weight=Math.round(Number(normalized)*100);
  return Number.isSafeInteger(weight)&&weight>0&&weight<=10000?weight:0;
}

export function equalPercent(shares:Split['shares']):Split {
  const count=shares.length;
  return {mode:'percent',shares:shares.map((share,index)=>({...share,weight:Math.floor(10000/count)+(index<10000%count?1:0)}))};
}

export function splitStatus(split:Split) {
  if(!split.shares.length)return {valid:false,label:'対象者を選択'};
  if(split.mode==='equal')return {valid:true,label:`${split.shares.length}人で均等`};
  const sum=split.shares.reduce((total,share)=>total+share.weight,0);
  if(split.shares.some(share=>!Number.isSafeInteger(share.weight)||share.weight<=0||share.weight>10000))return {valid:false,label:'割合を入力'};
  if(sum===10000)return {valid:true,label:'合計 100%'};
  const difference=(Math.abs(10000-sum)/100).toLocaleString('ja-JP');
  return {valid:false,label:sum<10000?`残り ${difference}%`:`${difference}% 超過`};
}
