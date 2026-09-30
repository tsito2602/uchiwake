import type { CardEntry } from './domain';

export type EntrySort = {key:'date'|'amount';dateAscending:boolean;amountAscending:boolean};

export function sortEntries(entries:CardEntry[],sort:EntrySort):CardEntry[] {
  return [...entries].sort((a,b)=>{
    const dateOrder=!a.spent_on||!b.spent_on
      ?Number(!a.spent_on)-Number(!b.spent_on)
      :(sort.dateAscending?1:-1)*a.spent_on.localeCompare(b.spent_on);
    const amountOrder=(sort.amountAscending?1:-1)*(a.amount-b.amount);
    return (sort.key==='amount'?amountOrder||dateOrder:dateOrder||amountOrder)||a.id.localeCompare(b.id);
  });
}
