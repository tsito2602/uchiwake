import type { CardEntry } from './domain';

export type EntrySort = {key:'date'|'amount';dateAscending:boolean;amountAscending:boolean};
// The import list starts in the order its rows were read; no key is chosen yet.
export type ListSort = Omit<EntrySort,'key'>&{key:EntrySort['key']|null};

export function sortByEntrySort<T extends {spent_on:string;amount:number}>(items:T[],sort:ListSort,tie:(a:T,b:T)=>number):T[] {
  if(!sort.key)return items;
  return [...items].sort((a,b)=>{
    const dateOrder=!a.spent_on||!b.spent_on
      ?Number(!a.spent_on)-Number(!b.spent_on)
      :(sort.dateAscending?1:-1)*a.spent_on.localeCompare(b.spent_on);
    const amountOrder=(sort.amountAscending?1:-1)*(a.amount-b.amount);
    return (sort.key==='amount'?amountOrder||dateOrder:dateOrder||amountOrder)||tie(a,b);
  });
}

export function sortEntries(entries:CardEntry[],sort:EntrySort):CardEntry[] {
  return sortByEntrySort(entries,sort,(a,b)=>a.id.localeCompare(b.id));
}
