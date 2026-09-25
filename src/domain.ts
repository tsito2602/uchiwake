export const categories = ['食費','外食費','日用品費','水道光熱費','通信費','交通費','住居費','医療費','娯楽費','その他・要確認'] as const;
export const billKinds = { card: 'カード請求', rent: '家賃', utilities: '公共料金', other: 'その他の引落' } as const;
export type Category = typeof categories[number];
export type BillKind = keyof typeof billKinds;
export type Bill = { id: string; due_month: string; title: string; kind: BillKind; amount: number; note: string };
export type Expense = { id: string; spent_on: string; title: string; category: Category; amount: number; note: string; receipt_key: string | null };
export type State = { bills: Bill[]; expenses: Expense[]; ai_enabled: boolean; month: string };
export function summary(bills: Pick<Bill,'amount'>[]) {
  const total = bills.reduce((sum, bill) => sum + bill.amount, 0);
  return { total, perPerson: Math.ceil(total / 2), remainder: total % 2 };
}
export function categoryTotals(expenses: Pick<Expense,'category' | 'amount'>[]) {
  return categories.map(category => ({ category, amount: expenses.filter(item => item.category === category).reduce((sum, item) => sum + item.amount, 0) })).filter(item => item.amount > 0);
}
