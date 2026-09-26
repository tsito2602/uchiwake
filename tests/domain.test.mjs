import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { summary, categoryTotals, rentForMonth } from '../src/domain.ts';

test('引落額だけを合計し、端数1円はふたりの間で分ける',()=>{
  assert.deepEqual(summary([{amount:41001},{amount:5000}]),{total:46001,perPerson:23001,remainder:1});
});
test('購入明細は費目別に集計でき、引落額に混ぜない',()=>{
  assert.deepEqual(categoryTotals([{category:'食費',amount:1200},{category:'食費',amount:800},{category:'交通費',amount:400}]),[{category:'食費',amount:2000},{category:'交通費',amount:400}]);
});
test('返金で差し引かれた費目も内訳に表示する',()=>{
  assert.deepEqual(categoryTotals([{category:'日用品費',amount:800},{category:'日用品費',amount:-1000}]),[{category:'日用品費',amount:-200}]);
});
test('追加した費目も既存費目と一緒に集計し、返金を差し引く',()=>{
  const totals=categoryTotals([{category:'旅行費',amount:5000},{category:'食費',amount:1000},{category:'旅行費',amount:-500},{category:'ペット',amount:2000}]);
  assert.deepEqual(totals,[{category:'食費',amount:1000},{category:'旅行費',amount:4500},{category:'ペット',amount:2000}]);
  assert.equal(totals.reduce((sum,row)=>sum+row.amount,0),7500);
});
test('基本家賃は開始月以降に引き継ぎ、その月の入力があれば置き換える',()=>{
  const rules=[{effective_month:'2026-09',amount:100000},{effective_month:'2027-01',amount:105000}];
  assert.deepEqual(rentForMonth('2026-08',[],rules),{amount:0,overridden:false});
  assert.deepEqual(rentForMonth('2026-12',[],rules),{amount:100000,overridden:false});
  assert.deepEqual(rentForMonth('2027-02',[],rules),{amount:105000,overridden:false});
  const rent=rentForMonth('2027-02',[{kind:'rent',amount:102000}],rules);
  assert.deepEqual(rent,{amount:102000,overridden:true});
  assert.equal(summary([{amount:6840},{amount:rent.amount}]).total,108840);
});
