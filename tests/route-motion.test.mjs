import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { startRouteTransition } from '../src/kondo-route-motion.ts';

function fixture(t) {
  t.mock.method(performance,'now',()=>0);
  const frames=new Map();let serial=0;
  const element=()=>({style:{},classList:{add(){}},removeAttribute(){},querySelectorAll:()=>[],animate:()=>assert.fail('must not depend on the native animation timeline')});
  const copy=element();
  const old={...element(),getBoundingClientRect:()=>({top:-640,left:16,width:358,height:1500}),cloneNode:()=>copy};
  const next=element();let current=old;
  const layer={style:{},removes:0,setAttribute(){},appendChild(node){assert.equal(node,copy);},remove(){this.removes++;}};
  globalThis.window={matchMedia:()=>({matches:false}),requestAnimationFrame:callback=>{frames.set(++serial,callback);return serial;},cancelAnimationFrame:id=>frames.delete(id)};
  globalThis.document={getElementById:()=>current,querySelector:()=>({getBoundingClientRect:()=>({bottom:0})}),createElement:()=>layer,body:{appendChild(node){assert.equal(node,layer);}}};
  return {copy,next,layer,frames,update:()=>{current=next;},tick:now=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(now));}};
}

test('旧ページだけを動かし、切り替え先の本文を一度も透明にしない',t=>{
  const {copy,next,layer,update,tick}=fixture(t);
  const transition=startRouteTransition(-1,update);
  assert.equal(copy.style.top,'-640px');assert.equal(copy.style.height,'1500px');assert.equal(layer.inert,true);
  assert.deepEqual(next.style,{});
  tick(120);assert.ok(Number(copy.style.opacity)>0&&Number(copy.style.opacity)<1);assert.ok(parseFloat(copy.style.left)>16);
  assert.deepEqual(next.style,{});
  transition.skipTransition();transition.skipTransition();assert.equal(layer.removes,1);
});

test('240msで旧ページを取り除き、切り替え先の内容をそのまま表示する',async t=>{
  const {next,layer,frames,update,tick}=fixture(t);const transition=startRouteTransition(1,update);
  tick(240);await transition.finished;assert.equal(layer.removes,1);assert.equal(frames.size,0);assert.deepEqual(next.style,{});
});

test('動きを減らす設定や描画フレーム非対応時は待たずに切り替える',()=>{
  for(const reduced of [true,false]){
    let updates=0;globalThis.window={matchMedia:()=>({matches:reduced}),requestAnimationFrame:reduced?()=>assert.fail('should not animate'):undefined};
    globalThis.document={getElementById:()=>({})};assert.equal(startRouteTransition(1,()=>updates++),undefined);assert.equal(updates,1);
  }
});

test('描画フレームが停止しても期限内に古い表示を除き、本文を隠さない',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const {next,layer,frames,update}=fixture(t);const transition=startRouteTransition(1,update);
  t.mock.timers.tick(401);await transition.finished;assert.equal(layer.removes,1);assert.equal(frames.size,0);assert.deepEqual(next.style,{});
});

test('フレーム開始の失敗でも更新内容を表示し、残ったコピーを除去する',async t=>{
  const {next,layer,update}=fixture(t);window.requestAnimationFrame=()=>{throw new Error('Frame unavailable');};
  const transition=startRouteTransition(1,update);await transition.finished;assert.equal(layer.removes,1);assert.deepEqual(next.style,{});
});
