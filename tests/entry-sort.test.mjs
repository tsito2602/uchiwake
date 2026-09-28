import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { sortEntries } from '../src/entry-sort.ts';

const row=(id,spent_on,amount)=>({id,spent_on,amount,title:id,statement_id:'card',category:'食費'});
const entries=[row('a','2026-09-02',100),row('b','2026-09-01',200),row('c','2026-09-01',200),row('d','2026-09-01',100),row('e','2026-09-02',150),row('r','2026-09-01',-50)];
for(const [key,dateAscending,amountAscending,expected] of [
  ['date',true,true,'r d b c a e'],
  ['date',true,false,'b c d r e a'],
  ['date',false,true,'a e r d b c'],
  ['date',false,false,'e a b c d r'],
  ['amount',true,true,'r d a e b c'],
  ['amount',false,true,'r a d e b c'],
  ['amount',true,false,'b c e d a r'],
  ['amount',false,false,'b c e a d r'],
])test(`${key}優先・日付${dateAscending?'昇順':'降順'}・金額${amountAscending?'昇順':'降順'}を同時に適用する`,()=>{
  const original=structuredClone(entries);
  assert.deepEqual(sortEntries(entries,{key,dateAscending,amountAscending}).map(e=>e.id),expected.split(' '));
  assert.deepEqual(entries,original);
});
test('日付不明は日付順の末尾に置き、その中も金額順で並べる',()=>{
  const rows=[row('x','',400),row('y','',-10),row('z','2026-09-01',100)];
  for(const dateAscending of [true,false]){
    assert.deepEqual(sortEntries(rows,{key:'date',dateAscending,amountAscending:true}).map(e=>e.id),['z','y','x']);
    assert.deepEqual(sortEntries(rows,{key:'date',dateAscending,amountAscending:false}).map(e=>e.id),['z','x','y']);
  }
});
