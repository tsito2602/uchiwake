import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { startRouteTransition } from '../src/kondo-route-motion.ts';

function fixture() {
  const animations=[];
  const element=name=>({
    style:{},classList:{add(){}},removeAttribute(){},querySelectorAll:()=>[],
    animate(frames,timing){
      let resolve;
      const animation={name,frames,timing,cancels:0,finished:new Promise(done=>{resolve=done;}),finish:()=>resolve(),cancel(){this.cancels++;resolve();}};
      animations.push(animation);return animation;
    }
  });
  const copy=element('outgoing');
  const old={...element('old'),getBoundingClientRect:()=>({top:-640,left:16,width:358,height:1500}),cloneNode:()=>copy};
  const next=element('incoming');
  let current=old;
  const layer={style:{},removes:0,setAttribute(){},appendChild(node){assert.equal(node,copy);},remove(){this.removes++;}};
  globalThis.window={matchMedia:()=>({matches:false})};
  globalThis.document={
    getElementById:id=>{assert.equal(id,'main-content');return current;},
    querySelector:selector=>{assert.equal(selector,'.desktop-tabs');return {getBoundingClientRect:()=>({bottom:0})};},
    createElement:()=>layer,body:{appendChild(node){assert.equal(node,layer);}},
    startViewTransition:()=>assert.fail('native snapshots must not rebuild the dock backdrop')
  };
  return {copy,layer,animations,update:()=>{current=next;}};
}

test('旧ページはスクロール位置のまま固定し、本文だけをkondoの移動量・240msで切り替える',()=>{
  const {copy,layer,animations,update}=fixture();
  const transition=startRouteTransition(-1,update);
  assert.equal(copy.style.top,'-640px');
  assert.equal(copy.style.height,'1500px');
  assert.equal(layer.inert,true);
  assert.deepEqual(animations.map(a=>[a.name,a.frames]),[
    ['outgoing',[{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(12px)'}]],
    ['incoming',[{opacity:0,transform:'translateX(-16px)'},{opacity:1,transform:'translateX(0)'}]]
  ]);
  for(const animation of animations)assert.deepEqual(animation.timing,{duration:240,easing:'cubic-bezier(.22, 1, .36, 1)',fill:'both'});
  transition.skipTransition();transition.skipTransition();
  assert.equal(layer.removes,1);
  assert.ok(animations.every(a=>a.cancels===1));
});

test('遷移終了時には旧ページのコピーとアニメーションを片付ける',async()=>{
  const {layer,animations,update}=fixture();
  const transition=startRouteTransition(1,update);
  animations.forEach(animation=>animation.finish());
  await transition.finished;
  assert.equal(layer.removes,1);
  assert.ok(animations.every(a=>a.cancels===1));
});

test('動きを減らす設定や非対応ブラウザーでは待たずにページを切り替える',()=>{
  for(const reduced of [true,false]) {
    let updates=0;
    globalThis.window={matchMedia:()=>({matches:reduced})};
    globalThis.document={getElementById:()=>({animate:reduced?()=>assert.fail('should not animate'):undefined})};
    assert.equal(startRouteTransition(1,()=>updates++),undefined);
    assert.equal(updates,1);
  }
});
