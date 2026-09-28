import type { CardEntry } from './domain';

export type EntrySort = {key:'date'|'amount';ascending:boolean};

export function sortEntries(entries:CardEntry[],sort:EntrySort):CardEntry[] {
  return [...entries].sort((a,b)=>{
    if(sort.key==='amount')return (sort.ascending?1:-1)*(a.amount-b.amount)||a.id.localeCompare(b.id);
    if(!a.spent_on||!b.spent_on)return Number(!a.spent_on)-Number(!b.spent_on)||a.id.localeCompare(b.id);
    return (sort.ascending?1:-1)*a.spent_on.localeCompare(b.spent_on)||a.id.localeCompare(b.id);
  });
}
