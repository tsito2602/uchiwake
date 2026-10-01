import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockOverlayBackground, overlayPage as page } from './overlay-lock-fixture.mjs';

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

test('iPhoneのページ移動を固定し、最後のパネルを閉じたときだけ元のスクロールとスタイルを復元する',()=>{
 const {body,root,view,main}=page('auto',true);
 body.style.setProperty('position','relative','important');
 root.style.setProperty('overflow','scroll');
 const outer=lockOverlayBackground([main],body);
 assert.equal(body.style.position,'fixed');assert.equal(body.style.top,'-240px');
 assert.equal(view.scrollY,0);assert.equal(root.style.overflow,'hidden');
 const inner=lockOverlayBackground([main],body);
 view.scrollY=180;view.dispatchEvent(new Event('scroll'));
 assert.equal(view.scrollY,0,'native focus pan is reset while the body is fixed');
 outer();assert.equal(body.style.position,'fixed');assert.equal(view.scrollY,0);
 inner();assert.equal(body.style.position,'relative');assert.equal(body.style.getPropertyPriority('position'),'important');
 assert.equal(body.style.overflow,'auto');assert.equal(body.style.getPropertyValue('top'),'');
 assert.equal(root.style.overflow,'scroll');assert.equal(view.scrollY,240);
 view.scrollY=300;view.dispatchEvent(new Event('scroll'));assert.equal(view.scrollY,300,'no scroll guard remains after closing');
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
