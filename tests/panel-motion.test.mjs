import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { animatePanel, reversePanel } from '../src/kondo-panel-motion.ts';

// Web Animations API double: verify geometry and interruption without a browser.
const bounds={left:12,top:12,right:378,bottom:740,width:366,height:728};
function opening(origin){
  let recorded;
  globalThis.window={getComputedStyle:()=>({borderRadius:'28px'})};
  const panel={getBoundingClientRect:()=>bounds,animate:(frames,timing)=>{recorded={frames,timing};return recorded;}};
  animatePanel(panel,origin);
  return recorded;
}
test('カード位置から全面パネルをクリップで開く（文字や金額を拡大しない）',()=>{
  const {frames,timing}=opening({left:20,top:400,width:350,height:115});
  assert.deepEqual(frames[0],{clipPath:'inset(388px 8px 225px 8px round 16px)',transform:'translateY(0px)',opacity:0});
  assert.equal(frames[1].clipPath,'inset(0px 0px 0px 0px round 28px)');
  assert.deepEqual(timing,{duration:320,easing:'cubic-bezier(.32, 0, .2, 1)',fill:'both'});
});
test('小さなボタン・領域外の起点にはkondoの48pxフォールバックを使う',()=>{
  for(const origin of [undefined,{left:310,top:800,width:56,height:56},{left:20,top:900,width:350,height:115}]){
    assert.equal(opening(origin).frames[0].transform,'translateY(48px)');
  }
});
test('画面端のカードでもクリップの余白が負にならない',()=>{
  const {frames}=opening({left:0,top:0,width:390,height:800});
  assert.equal(frames[0].clipPath,'inset(0px 0px 0px 0px round 16px)');
});
test('途中で閉じても同じタイムラインを逆再生し、背景と暗幕を同期する',()=>{
  for(const currentTime of [96,320]){
    const makeAnimation=(time)=>({currentTime:time,playbackRate:1,plays:0,play(){this.plays++;}});
    const panel=makeAnimation(currentTime),depth=makeAnimation(10),scrim=makeAnimation(20);
    reversePanel(panel,[depth,scrim]);
    for(const animation of [panel,depth,scrim]){
      assert.equal(animation.currentTime,currentTime);
      assert.equal(animation.playbackRate,-1.15);
      assert.equal(animation.plays,1);
    }
  }
});
