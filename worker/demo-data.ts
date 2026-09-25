import type { Bill, CardEntry, CardStatement, SharedCard, State } from '../src/domain';

export function shiftMonth(month:string, offset:number) {
  const [year,value]=month.split('-').map(Number);
  const date=new Date(Date.UTC(year,value-1+offset,1));
  return date.toISOString().slice(0,7);
}

export function demoAnchor() {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
}

const cards:SharedCard[]=[
  {id:'demo-card-life',name:'生活費カード',active:true},
  {id:'demo-card-shared',name:'共有カード',active:true}
];

export function demoMonths(anchor:string) {
  return Array.from({length:6},(_,index)=>shiftMonth(anchor,index-5));
}

export function demoState(month:string,anchor=demoAnchor()):State {
  const index=demoMonths(anchor).indexOf(month);
  const bills:Bill[]=index===3?[{id:'demo-rent-override',due_month:month,title:'家賃',kind:'rent',amount:128000,note:''}]:[];
  const entries:CardEntry[]=[];
  const statements:CardStatement[]=[];
  if(index>=0) {
    const rows=[
      [
        {title:'スーパー',category:'食費',amount:29600+index*1850},
        {title:'日用品',category:'日用品費',amount:7200+index*430},
        {title:'外食',category:'外食費',amount:8900+index*610}
      ],[
        {title:'電気・ガス',category:'水道光熱費',amount:11800+index*360},
        {title:'通信費',category:'通信費',amount:6300},
        {title:'交通費',category:'交通費',amount:5400+index*690}
      ]
    ] as const;
    rows.forEach((cardRows,cardIndex)=>{
      const statementId=`demo-${month}-${cardIndex}`;
      statements.push({id:statementId,card_id:cards[cardIndex].id,due_month:month,title:`${month} ${cards[cardIndex].name}`,confirmed_total:cardRows.reduce((sum,row)=>sum+row.amount,0),created_at:`${month}-01 00:00:00`});
      cardRows.forEach((row,rowIndex)=>entries.push({id:`${statementId}-${rowIndex}`,statement_id:statementId,spent_on:`${month}-${String(5+rowIndex*8).padStart(2,'0')}`,title:row.title,category:row.category,amount:row.amount}));
    });
  }
  return {month,bills,statements,entries,cards,rent_rules:[{effective_month:demoMonths(anchor)[0],amount:126000}],ai_enabled:false,demo_enabled:true};
}

export function demoHistory(month:string,anchor=demoAnchor()) {
  const available=new Set(demoMonths(anchor));
  return Array.from({length:60},(_,index)=>{
    const key=shiftMonth(month,index-59);
    if(!available.has(key))return {month:key,amount:0};
    const state=demoState(key,anchor);
    const total=state.statements.reduce((sum,item)=>sum+item.confirmed_total,0)+(state.bills[0]?.amount??126000);
    return {month:key,amount:Math.ceil(total/2)};
  });
}
