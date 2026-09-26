import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { historyIndexAt, historyLabelLeft } from '../src/chart-interaction.ts';
import { demoHistory } from '../worker/demo-data.ts';

test('狭い画面の1Y・3Y・5Yでも隣の月へドラッグするとその月の合計を選択する',()=>{
  for(const count of [6,12,36,60]) {
    const data=demoHistory('2026-07','2026-09').slice(-count);
    const observed=[];
    for(let i=count-4;i<count;i++) {
      const index=historyIndexAt(20+(i+.5)/count*280,20,280,count);
      observed.push([data[index].month,data[index].total]);
    }
    assert.deepEqual(observed,[['2026-04',195200],['2026-05',199140],['2026-06',203080],['2026-07',209020]]);
  }
});

test('左右の端や指がグラフの外に出ても金額ラベルが表示領域からはみ出さない',()=>{
  for(const width of [140,280,350,472])for(const count of [6,12,36,60]) {
    const labelWidth=Math.min(184,width);
    for(const x of [-100,0,1,width/2,width-1,width,width+100]) {
      const index=historyIndexAt(x,0,width,count);
      const left=historyLabelLeft(index,count,width,labelWidth);
      assert.ok(index>=0&&index<count);
      assert.ok(left>=0&&left+labelWidth<=width);
    }
    assert.equal(historyIndexAt(-100,0,width,count),0);
    assert.equal(historyIndexAt(width+100,0,width,count),count-1);
  }
  assert.equal(historyIndexAt(0,0,0,60),null);
  assert.equal(historyIndexAt(0,0,280,0),null);
});
