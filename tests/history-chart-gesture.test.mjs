import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const {outputFiles}=await build({entryPoints:['src/history-chart-gesture.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {createHistoryGesture}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

function fixture({scrollLeft=1500,visibleMonths=6,count=60}={}) {
  const viewport={left:20,width:300,count,visibleMonths,scrollLeft};
  const frames=new Map(),selected=[],previews=[];
  let serial=0,time=0;
  const gesture=createHistoryGesture({
    viewport:()=>viewport,scrollTo:left=>{viewport.scrollLeft=left;},
    onPreview:index=>previews.push(index),onSelect:index=>selected.push(index),
    requestFrame:callback=>{frames.set(++serial,callback);return serial;},cancelFrame:id=>frames.delete(id)
  });
  const pointer=(x,y=100,pointerId=1)=>({pointerId,clientX:x,clientY:y,timeStamp:time});
  const advance=(duration,step=16)=>{for(let ms=0;ms<duration;ms+=step){time+=step;const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(time));}};
  return {gesture,viewport,frames,selected,previews,pointer,advance};
}

test('タップだけがその月を一度選択し、長押しでは切り替えない',()=>{
  const f=fixture();f.gesture.start(f.pointer(95));f.advance(96);f.gesture.end(f.pointer(98));f.gesture.end(f.pointer(98));
  assert.deepEqual(f.selected,[31]);assert.equal(f.previews.at(-1),null);assert.equal(f.frames.size,0);
  const held=fixture();held.gesture.start(held.pointer(95));held.advance(400);held.gesture.end(held.pointer(95));
  assert.deepEqual(held.selected,[]);
});

test('端をタップ・長押ししただけではスクロールを始めない',()=>{
  for(const x of [20,320]) {
    const f=fixture();f.gesture.start(f.pointer(x));f.advance(1000);
    assert.equal(f.viewport.scrollLeft,1500);assert.equal(f.frames.size,0);
    f.gesture.end(f.pointer(x));assert.deepEqual(f.selected,[]);
  }
});

test('左右の端で指が静止していてもスクロールし、指の下の月の金額を追従させる',()=>{
  for(const [x,direction] of [[20,-1],[320,1]]) {
    const f=fixture();f.gesture.start(f.pointer(170));f.gesture.move(f.pointer(x));
    const before=f.previews.at(-1);f.advance(1024);
    assert.ok((f.viewport.scrollLeft-1500)*direction>200);
    assert.ok((f.previews.at(-1)-before)*direction>0);
    f.gesture.end(f.pointer(x));const stopped=f.viewport.scrollLeft;f.advance(500);
    assert.equal(f.viewport.scrollLeft,stopped);assert.equal(f.frames.size,0);assert.deepEqual(f.selected,[]);
  }
});

test('一度ドラッグして元の位置へ戻ってもタップにはならず、中央ではスクロールを止める',()=>{
  const f=fixture();f.gesture.start(f.pointer(170));f.gesture.move(f.pointer(20));f.advance(64);
  f.gesture.move(f.pointer(170));const stopped=f.viewport.scrollLeft;f.advance(64);f.gesture.end(f.pointer(170));
  assert.equal(f.viewport.scrollLeft,stopped);assert.equal(f.frames.size,0);assert.deepEqual(f.selected,[]);
  const vertical=fixture();vertical.gesture.start(vertical.pointer(170));vertical.gesture.move(vertical.pointer(170,115));vertical.gesture.end(vertical.pointer(170));
  assert.deepEqual(vertical.selected,[]);
});

test('フレームレートで速度を変えず、復帰直後の長いフレームでも飛びすぎない',()=>{
  const results=[8,16].map(step=>{
    const f=fixture();f.gesture.start(f.pointer(170));f.gesture.move(f.pointer(20));
    f.advance(step,step);f.advance(960,step);return f.viewport.scrollLeft;
  });
  assert.ok(Math.abs(results[0]-results[1])<.001);
  const f=fixture();f.gesture.start(f.pointer(170));f.gesture.move(f.pointer(20));f.advance(16);
  const before=f.viewport.scrollLeft;f.advance(1000,1000);
  assert.ok(before-f.viewport.scrollLeft<=220*.032+.001);
});

test('端まで到達したらフレームを止め、反対へドラッグすれば再開する',()=>{
  for(const [scrollLeft,x,expected,opposite] of [[2,20,0,320],[2698,320,2700,20]]) {
    const f=fixture({scrollLeft});f.gesture.start(f.pointer(170));f.gesture.move(f.pointer(x));f.advance(96);
    assert.equal(f.viewport.scrollLeft,expected);assert.equal(f.frames.size,0);
    f.gesture.move(f.pointer(opposite));f.advance(64);assert.notEqual(f.viewport.scrollLeft,expected);
    f.gesture.cancel();assert.equal(f.frames.size,0);
  }
  const all=fixture({scrollLeft:0,visibleMonths:60});all.gesture.start(all.pointer(170));all.gesture.move(all.pointer(20));
  assert.equal(all.frames.size,0);
});

test('キャンセル・画面離脱後には動きも月の切り替えも残らない',()=>{
  for(const cancel of [f=>f.gesture.cancel(1),f=>f.gesture.cancel()]) {
    const f=fixture();f.gesture.start(f.pointer(170));f.gesture.move(f.pointer(20));f.advance(64);cancel(f);
    const stopped=f.viewport.scrollLeft;f.advance(1000);f.gesture.end(f.pointer(20));
    assert.equal(f.viewport.scrollLeft,stopped);assert.equal(f.frames.size,0);assert.deepEqual(f.selected,[]);assert.equal(f.previews.at(-1),null);
  }
});

test('別の指の移動・終了・キャンセルで操作中の指を置き換えない',()=>{
  const f=fixture();f.gesture.start(f.pointer(95));assert.equal(f.gesture.start(f.pointer(20,100,2)),false);
  f.gesture.move(f.pointer(20,100,2));f.gesture.end(f.pointer(20,100,2));f.gesture.cancel(2);
  f.advance(96);f.gesture.end(f.pointer(95));assert.deepEqual(f.selected,[31]);
});

test('6M・1Y・3Y・5Yのすべてで現在の月を越えて未来へスクロールし、タップでその月を選ぶ',()=>{
  for(const visibleMonths of [6,12,36,60]) {
    const slot=300/visibleMonths;
    const f=fixture({count:120,visibleMonths,scrollLeft:(60-visibleMonths)*slot});
    f.gesture.start(f.pointer(170));f.gesture.move(f.pointer(320));f.advance(1024);
    assert.ok(f.previews.at(-1)>59);
    f.gesture.end(f.pointer(320));assert.deepEqual(f.selected,[]);
    f.gesture.start(f.pointer(315));const future=f.previews.at(-1);f.advance(80);f.gesture.end(f.pointer(315));
    assert.deepEqual(f.selected,[future]);assert.ok(future>59);
    f.gesture.start(f.pointer(170));f.gesture.move(f.pointer(20));const before=f.viewport.scrollLeft;f.advance(1024);
    assert.ok(f.viewport.scrollLeft<before);f.gesture.cancel();
  }
});
