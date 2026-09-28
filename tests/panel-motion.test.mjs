import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { animatePanel, animatePanelBackground, animatePanelSurroundings, reversePanel } from '../src/kondo-panel-motion.ts';

// Web Animations API double: verify geometry and interruption without a browser.
const bounds={left:12,top:12,right:378,bottom:740,width:366,height:728};
function opening(origin){
  let recorded;
  globalThis.window={getComputedStyle:()=>({borderRadius:'28px'})};
  const panel={getBoundingClientRect:()=>bounds,animate:(frames,timing)=>{recorded={frames,timing,finished:new Promise(()=>{})};return recorded;}};
  animatePanel(panel,origin);
  return recorded;
}
test('カード位置から全面パネルをクリップで開く（文字や金額を拡大しない）',()=>{
  const {frames,timing}=opening({left:20,top:400,width:350,height:115});
  assert.deepEqual(frames[0],{clipPath:'inset(388px 8px 225px 8px round 16px)',transform:'translateY(0px)',opacity:0});
  assert.equal(frames[1].clipPath,'inset(0px 0px 0px 0px round 28px)');
  assert.deepEqual(timing,{duration:320,easing:'cubic-bezier(.32, 0, .2, 1)',fill:'backwards'});
});
test('初回の設定入口・小ボタン・領域外からはスクロール内容を切り抜かず48pxの動きで開く',()=>{
  for(const origin of [undefined,{left:310,top:18,width:44,height:44},{left:20,top:180,width:350,height:62},{left:310,top:800,width:56,height:56},{left:20,top:900,width:350,height:115}]){
    const {frames}=opening(origin);
    assert.equal(frames[0].transform,'translateY(48px)');
    assert.equal(frames[1].transform,'translateY(0px)');
    assert.equal(frames[0].opacity,0);
    assert.equal(frames[1].opacity,1);
    assert.ok(frames.every(frame=>!('clipPath' in frame)));
  }
});
test('画面端のカードでもクリップの余白が負にならない',()=>{
  const {frames}=opening({left:0,top:0,width:390,height:800});
  assert.equal(frames[0].clipPath,'inset(0px 0px 0px 0px round 16px)');
});
test('開き終えたパネルはクリップを残さず、閉じる直前だけ終端の保持を戻す',()=>{
  const {timing}=opening({left:20,top:400,width:350,height:115});
  const phases=[];
  const panel={currentTime:timing.duration,playbackRate:1,
    effect:{updateTiming:next=>{phases.push('hold');Object.assign(timing,next);}},
    play:()=>{phases.push('reverse');assert.equal(timing.fill,'both');}
  };
  // No forwards fill: the open panel uses CSS overflow/border-radius, with no
  // animated clip/transform applied to its long scrolling settings contents.
  assert.equal(timing.fill,'backwards');
  reversePanel(panel,[]);
  assert.deepEqual(phases,['hold','reverse']);
  assert.equal(panel.currentTime,320);
  assert.equal(panel.playbackRate,-1.15);
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

test('子パネルの背後で親を保持して縮小・ぼかしを同期し、共通の背景は維持する',()=>{
  globalThis.window={innerWidth:390,innerHeight:844};
  const calls=[];
  const target=name=>({getBoundingClientRect:()=>bounds,animate:(frames,timing)=>{
    const animation={name,frames,timing,currentTime:320,playbackRate:1,plays:0,play(){this.plays++;}};
    calls.push(animation);return animation;
  }});
  const page=target('page'),scrim=target('scrim'),parent=target('parent'),childScrim=target('child scrim');
  const outer=animatePanelSurroundings({parentElement:{querySelector:()=>scrim}},page,[]);
  assert.deepEqual(outer.map(a=>a.name),['scrim','page']);
  const nested=animatePanelSurroundings({parentElement:{querySelector:()=>childScrim}},page,[parent]);
  assert.deepEqual(calls.map(a=>a.name),['scrim','page','parent']);
  assert.equal(nested[0].frames[0].scale,'1');
  assert.equal(nested[0].frames[1].scale,'.94');
  assert.equal(nested[0].frames[0].filter,'blur(0px)');
  assert.equal(nested[0].frames[1].filter,'blur(6px)');
  assert.ok(nested[0].frames.every(frame=>!('opacity' in frame)&&!('display' in frame)&&!('visibility' in frame)));
  assert.equal(nested[0].timing.fill,'both');
  for(const time of [96,320]){
    const child={currentTime:time,playbackRate:1,play(){}};
    reversePanel(child,nested);
    assert.equal(nested[0].currentTime,time);
    assert.equal(nested[0].playbackRate,child.playbackRate);
    // Returning to the parent never reverses the still-open outer backdrop.
    assert.ok(outer.every(a=>a.playbackRate===1&&a.plays===0));
  }
  // A third panel recedes only its immediate parent, preserving all earlier
  // layers and their scroll/content rather than replaying or hiding them.
  const middle=target('middle');
  const deep=animatePanelSurroundings({},page,[parent,middle]);
  assert.deepEqual(deep.map(a=>a.name),['middle']);
  assert.deepEqual(calls.map(a=>a.name),['scrim','page','parent','middle']);
});

test('追加メニューとパネルの背景はスクロール位置に関わらず画面中央へ同じ縮尺で縮む',()=>{
  globalThis.window={innerWidth:390,innerHeight:844,visualViewport:{offsetTop:20,height:700}};
  const capture=blur=>{
    let recorded;
    animatePanelBackground({getBoundingClientRect:()=>({left:0,top:-600}),animate:(frames,timing)=>(recorded={frames,timing})},blur);
    return recorded;
  };
  const panel=capture(true),menu=capture(false);
  assert.deepEqual(menu.timing,panel.timing);
  for(let index=0;index<2;index++){
    assert.equal(menu.frames[index].scale,panel.frames[index].scale);
    assert.equal(menu.frames[index].transformOrigin,'195px 970px');
    assert.equal(menu.frames[index].filter,undefined);
  }
  assert.equal(menu.frames[1].scale,'.94');
});


test('開き終わったクリップを完全に解除し、同じ終端から閉じる動きを再開する',async()=>{
 let resolveFinished;
 const animation={currentTime:0,playbackRate:1,playState:'running',cancels:0,plays:0,
  finished:new Promise(resolve=>{resolveFinished=resolve;}),
  effect:{updateTiming(){}},
  cancel(){this.cancels++;this.currentTime=null;this.playState='idle';},
  play(){this.plays++;this.playState='running';}
 };
 globalThis.window={getComputedStyle:()=>({borderRadius:'28px'})};
 animatePanel({getBoundingClientRect:()=>bounds,animate:()=>animation});
 animation.currentTime=320;animation.playState='finished';resolveFinished();await Promise.resolve();
 assert.equal(animation.cancels,1);
 assert.equal(animation.playState,'idle');
 assert.equal(animation.currentTime,null);
 const parent={currentTime:10,playbackRate:1,play(){}};
 reversePanel(animation,[parent]);
 assert.equal(animation.currentTime,320);
 assert.equal(parent.currentTime,320);
 assert.equal(animation.playbackRate,-1.15);
 assert.equal(parent.playbackRate,-1.15);
 assert.equal(animation.plays,1);
});

test('開く途中の取消しやアンマウントでは、古い完了処理が閉じる動きを消さない',async()=>{
 for(const unmount of [false,true]){
  let resolveFinished,rejectFinished;
  const animation={currentTime:96,playbackRate:1,playState:'running',cancels:0,
   finished:new Promise((resolve,reject)=>{resolveFinished=resolve;rejectFinished=reject;}),
   effect:{updateTiming(){}},play(){},cancel(){this.cancels++;this.currentTime=null;this.playState='idle';}
  };
  globalThis.window={getComputedStyle:()=>({borderRadius:'28px'})};
  animatePanel({getBoundingClientRect:()=>bounds,animate:()=>animation});
  if(unmount){animation.cancel();rejectFinished(new Error('unmounted'));}
  else {reversePanel(animation,[]);assert.equal(animation.currentTime,96);animation.currentTime=0;animation.playState='finished';resolveFinished();}
  await Promise.resolve();
  assert.equal(animation.cancels,unmount?1:0);
 }
});
