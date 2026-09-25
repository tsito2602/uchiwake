import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { summary, categoryTotals } from '../src/domain.ts';

test('引落額だけを合計し、端数1円はふたりの間で分ける',()=>{
  assert.deepEqual(summary([{amount:41001},{amount:5000}]),{total:46001,perPerson:23001,remainder:1});
});
test('購入明細は費目別に集計でき、引落額に混ぜない',()=>{
  assert.deepEqual(categoryTotals([{category:'食費',amount:1200},{category:'食費',amount:800},{category:'交通費',amount:400}]),[{category:'食費',amount:2000},{category:'交通費',amount:400}]);
});
