import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockOverlayBackground } from '../src/overlay-lock.ts';

function page(overflow='') {
 return {body:{style:{overflow}},main:{inert:false},dock:{inert:false},switcher:{inert:false}};
}

test('パネルからメニューへ戻るとき、後片付けの順番に関係なくスクロールが復帰する',()=>{
 for(const order of [[0,1],[1,0]]){
  const {body,main,dock,switcher}=page();
  const release=[lockOverlayBackground([main],body),lockOverlayBackground([main,dock,switcher],body)];
  release[order[0]]();
  assert.equal(body.style.overflow,'hidden');
  assert.equal(main.inert,true);
  assert.equal(dock.inert,order[0]===0);
  release[order[1]]();
  assert.equal(body.style.overflow,'');
  assert.deepEqual([main.inert,dock.inert,switcher.inert],[false,false,false]);
 }
});

test('スペース・追加メニューとパネルが重なっても、最後を閉じるまで背景を操作させない',()=>{
 for(const order of [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]]){
  const {body,main,dock,switcher}=page();
  const release=[lockOverlayBackground([main,dock,switcher],body),lockOverlayBackground([main,dock],body),lockOverlayBackground([main],body)];
  for(const index of order.slice(0,2)){
   release[index]();
   assert.equal(body.style.overflow,'hidden');
   assert.equal(main.inert,true);
  }
  release[order[2]]();
  assert.equal(body.style.overflow,'');
  assert.deepEqual([main.inert,dock.inert,switcher.inert],[false,false,false]);
 }
});

test('再マウントや二重の後片付けでもロックが残らず、元の状態を保つ',()=>{
 const {body,main,dock}=page('auto');main.inert=true;
 for(let count=0;count<20;count++){
  const first=lockOverlayBackground([main,dock,dock],body);
  first();
  const next=lockOverlayBackground([main,dock],body);
  first();
  assert.equal(body.style.overflow,'hidden');
  assert.equal(dock.inert,true);
  next();next();
  assert.equal(body.style.overflow,'auto');
  assert.equal(main.inert,true);
  assert.equal(dock.inert,false);
 }
});
