import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { historyIndexAt, historyLabelLeft, pieIndexAt, pieSlice } from '../src/chart-interaction.ts';
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

test('円グラフは12時から時計回りにカテゴリを選び、長押し中の移動先を判定する',()=>{
  const ends=[.25,.5,.75,1];
  assert.deepEqual([[140,60],[140,140],[60,140],[60,60]].map(([x,y])=>pieIndexAt(x,y,ends)),[0,1,2,3]);
  assert.equal(pieIndexAt(100,12,ends),0);
  assert.equal(pieIndexAt(188,100,ends),1);
  assert.equal(pieIndexAt(100,188,ends),2);
  assert.equal(pieIndexAt(12,100,ends),3);
  assert.equal(pieIndexAt(140,60,[1]),0);
});

test('中心・範囲外・空の円グラフではカテゴリを誤選択しない',()=>{
  for(const [x,y] of [[100,100],[0,0],[200,100],[100,-10]])assert.equal(pieIndexAt(x,y,[.3,1]),null);
  assert.equal(pieIndexAt(150,150,[]),null);
  // Expanded sectors remain reachable while scrubbing near the rim.
  assert.equal(pieIndexAt(197,100,[.3,1]),0);
});

test('時計回りの扇形は開始位置を固定し、一周や単一カテゴリも二つの円弧で描く',()=>{
  assert.ok(pieSlice(0,.25).startsWith('M 100 100 L 100 12 A 88 88 0 0 1'));
  assert.equal((pieSlice(0,1).match(/ A /g)||[]).length,2);
  assert.ok(!/NaN|Infinity/.test(pieSlice(0,1)));
  assert.ok(pieSlice(0,.5,104).startsWith('M 100 100 L 100 -4'));
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
