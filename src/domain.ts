export const categories = ['食費','外食費','日用品費','水道光熱費','通信費','交通費','住居費','医療費','娯楽費','その他','要確認'] as const;
export const billKinds = { card: 'カード請求', rent: '家賃', utilities: '公共料金', other: 'その他の引落' } as const;
// Retain built-in identity through renames, including the unresolved category.
export type Category = string;
export type CategoryAppearance = {category:Category;icon:string;color:string;original_category?:string;include_in_settlement?:boolean};
export type BillKind = keyof typeof billKinds;
export type Bill = { id: string; due_month: string; title: string; kind: BillKind; amount: number; note: string };
export type CardEntry = { id: string; statement_id: string; spent_on: string; title: string; category: Category; amount: number };
export type SharedCard = { id: string; name: string; active: boolean; color: string };
export type RentRule = { effective_month: string; amount: number };
export type CardStatement = { id: string; card_id: string | null; due_month: string; title: string; confirmed_total: number; created_at: string };
export type EntryDraft = Pick<CardEntry, 'spent_on' | 'title' | 'category' | 'amount'>;
export type State = { bills: Bill[]; statements: CardStatement[]; entries: CardEntry[]; cards: SharedCard[]; category_settings:CategoryAppearance[]; rent_rules: RentRule[]; ai_enabled: boolean; demo_enabled: boolean; month: string };
export function rentForMonth(month: string, bills: Pick<Bill,'kind'|'amount'>[], rules: RentRule[]) {
  const overrides = bills.filter(bill => bill.kind === 'rent');
  if (overrides.length) return { amount: overrides.reduce((sum,bill)=>sum+bill.amount,0), overridden: true };
  const rule = rules.filter(item=>item.effective_month<=month).sort((a,b)=>b.effective_month.localeCompare(a.effective_month))[0];
  return { amount: rule?.amount ?? 0, overridden: false };
}
export function summary(bills: Pick<Bill,'amount'>[]) {
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0);
  return { total, perPerson: Math.ceil(total / 2), remainder: total % 2 };
}
export function categoryTotals(entries: Pick<CardEntry,'category' | 'amount'>[]) {
  const names=[...new Set<string>([...categories,...entries.map(item=>item.category)])];
  return names.map(category => ({ category, amount: entries.filter(item => item.category === category).reduce((sum, item) => sum + item.amount, 0) })).filter(item => item.amount !== 0);
}

export function statementSettlementAmount(statement:Pick<CardStatement,'id'|'confirmed_total'>,entries:Pick<CardEntry,'statement_id'|'category'|'amount'>[],settings:CategoryAppearance[]=[]):number {
  const excluded=new Set(settings.filter(item=>item.include_in_settlement===false).map(item=>item.category));
  return statement.confirmed_total-entries.filter(entry=>entry.statement_id===statement.id&&excluded.has(entry.category)).reduce((sum,entry)=>sum+entry.amount,0);
}
