import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerPanel } from '../src/panel-stack.ts';
import { lockOverlayBackground, overlayPage } from './overlay-lock-fixture.mjs';

test('スペース設定と子編集の間を繰り返し戻っても、最前面と背景ロックを正しく維持する',()=>{
 const {body,main}=overlayPage('auto'),parent={inert:false};
 const outer=registerPanel(parent),unlock=lockOverlayBackground([main,...outer.parents],body);
 try {
  assert.equal(outer.ownsBackground,true);
  for(let i=0;i<5;i++){
   const child={inert:false},inner=registerPanel(child);
   const release=lockOverlayBackground([main,...inner.parents],body);
   assert.equal(inner.ownsBackground,false);
   assert.equal(outer.isTop(),false);
   assert.equal(inner.isTop(),true);
   assert.equal(parent.inert,true);
   release();inner.release();inner.release();
   assert.equal(outer.isTop(),true);
   assert.equal(parent.inert,false);
   assert.equal(main.inert,true);
   assert.equal(body.style.overflow,'hidden');
  }
 }finally{unlock();outer.release();}
 assert.equal(body.style.overflow,'auto');
 assert.equal(main.inert,false);
 const next=registerPanel({});assert.equal(next.ownsBackground,true);next.release();
});

test('親が先に破棄されても、子のキー操作と全終了時の復帰を妨げない',()=>{
 const outer=registerPanel({}),inner=registerPanel({});
 outer.release();assert.equal(outer.isTop(),false);assert.equal(inner.isTop(),true);
 inner.release();
 const next=registerPanel({});assert.equal(next.ownsBackground,true);next.release();
});
