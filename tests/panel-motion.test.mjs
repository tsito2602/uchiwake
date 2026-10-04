import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { animatePanel, animatePanelBackground, animatePanelSurroundings, cancelPanel, morphTiming, reversePanel } from '../src/kondo-panel-motion.ts';

// Web Animations API double: verify geometry and interruption without a browser.
const bounds={left:12,top:12,right:378,bottom:740,width:366,height:728};
function opening(origin){
  let recorded,surface,content;
  globalThis.window={getComputedStyle:()=>({borderRadius:'28px'})};
  const glass={animate:(frames,timing)=>(surface={frames,timing})};
  const body={animate:(frames,timing)=>(content={frames,timing})};
  const panel={getBoundingClientRect:()=>bounds,querySelector:selector=>selector.endsWith('.card-panel-glass')?glass:body,animate:(frames,timing)=>{recorded={frames,timing,finished:new Promise(()=>{})};return recorded;}};
  animatePanel(panel,origin);
  return {...recorded,surface,content};
}
test('カード位置から背景だけを展開し、スクロール内容は切り抜かない',()=>{
  const {frames,timing,surface}=opening({left:20,top:400,width:350,height:115});
  assert.deepEqual(frames[0],{transform:'translateY(0px)'});
  assert.ok(frames.every(frame=>!('clipPath' in frame)));
  assert.equal(surface.frames[0].clipPath,'inset(388px 8px 225px 8px round 16px)');
  assert.equal(surface.frames[1].clipPath,'inset(0px 0px 0px 0px round 28px)');
  assert.deepEqual(timing,{...morphTiming,fill:'backwards'});
  assert.equal(timing.duration,320);
});
test('小ボタン・領域外からはスクロール内容を切り抜かず48pxの動きで開く',()=>{
  for(const origin of [undefined,{left:310,top:18,width:44,height:44},{left:20,top:180,width:350,height:62},{left:310,top:800,width:56,height:56},{left:20,top:900,width:350,height:115}]){
    const {frames}=opening(origin);
    assert.equal(frames[0].transform,'translateY(48px)');
    assert.equal(frames[1].transform,'translateY(0px)');
    assert.ok(frames.every(frame=>!('opacity' in frame)));
    assert.ok(frames.every(frame=>!('clipPath' in frame)));
  }
});
test('背景の透過度・ブラーは開閉中も一定で、文字だけを兄弟要素として背景と同じ境界でフェードする',()=>{
  for(const origin of [undefined,{left:20,top:400,width:350,height:115}]){
    const {frames,timing,surface,content}=opening(origin);
    for(const frame of [...frames,...surface.frames]){
      for(const property of ['opacity','filter','backdropFilter','backgroundColor'])assert.equal(frame[property],undefined);
    }
    assert.ok(frames.every(frame=>!('clipPath' in frame)));
    // Text shares the glass's reveal boundary, so it never shows outside the unfolding panel.
    assert.deepEqual(content.frames.map(frame=>frame.opacity),[0,1]);
    assert.equal(content.frames[0].clipPath,surface.frames[0].clipPath);
    assert.equal(content.frames[1].clipPath,'inset(0px 0px 0px 0px round 28px)');
    assert.deepEqual(content.timing,timing);
    assert.deepEqual(surface.timing,timing);
    if(!origin)assert.equal(surface.frames[0].clipPath,'inset(100% 0px 0px 0px round 28px)');
  }
});
test('スペース設定の入口カード全体を起点にすると明細カードと同じ展開になる',()=>{
  // The 62px label row sits inside 24px padding and a 1px border on each side.
  const {frames,timing,surface}=opening({left:20,top:136,width:350,height:112});
  assert.equal(surface.frames[0].clipPath,'inset(124px 8px 492px 8px round 16px)');
  assert.equal(frames[0].transform,'translateY(0px)');
  assert.equal(surface.frames[1].clipPath,'inset(0px 0px 0px 0px round 28px)');
  assert.deepEqual(timing,opening({left:20,top:400,width:350,height:115}).timing);
});
test('画面端のカードでもクリップの余白が負にならない',()=>{
  const {surface}=opening({left:0,top:0,width:390,height:800});
  assert.equal(surface.frames[0].clipPath,'inset(0px 0px 0px 0px round 16px)');
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
  const target=name=>({getBoundingClientRect:()=>bounds,querySelector:()=>target(name+' content'),animate:(frames,timing)=>{
    const animation={name,frames,timing,currentTime:320,playbackRate:1,plays:0,play(){this.plays++;}};
    calls.push(animation);return animation;
  }});
  const page=target('page'),scrim=target('scrim'),parent=target('parent'),childScrim=target('child scrim');
  const outer=animatePanelSurroundings({parentElement:{querySelector:()=>scrim}},page,[]);
  assert.deepEqual(outer.map(a=>a.name),['scrim','page']);
  const nested=animatePanelSurroundings({parentElement:{querySelector:()=>childScrim}},page,[parent]);
  assert.deepEqual(calls.map(a=>a.name),['scrim','page','parent','parent content']);
  assert.equal(nested[0].frames[0].scale,'1');
  assert.equal(nested[0].frames[1].scale,'.94');
  assert.ok(nested[0].frames.every(frame=>!('filter' in frame)));
  assert.deepEqual(nested[1].frames,[{filter:'blur(0px)'},{filter:'blur(6px)'}]);
  assert.ok(nested[0].frames.every(frame=>!('opacity' in frame)&&!('display' in frame)&&!('visibility' in frame)));
  assert.equal(nested[0].timing.fill,'both');
  for(const time of [96,320]){
    const child={currentTime:time,playbackRate:1,play(){}};
    reversePanel(child,nested);
    assert.equal(nested[0].currentTime,time);
    assert.equal(nested[0].playbackRate,child.playbackRate);
    assert.equal(nested[1].currentTime,time);
    assert.equal(nested[1].playbackRate,child.playbackRate);
    // Returning to the parent never reverses the still-open outer backdrop.
    assert.ok(outer.every(a=>a.playbackRate===1&&a.plays===0));
  }
  // A third panel recedes only its immediate parent, preserving all earlier
  // layers and their scroll/content rather than replaying or hiding them.
  const middle=target('middle');
  const deep=animatePanelSurroundings({},page,[parent,middle]);
  assert.deepEqual(deep.map(a=>a.name),['middle','middle content']);
  assert.deepEqual(calls.map(a=>a.name),['scrim','page','parent','parent content','middle','middle content']);
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
 animatePanel({getBoundingClientRect:()=>bounds,querySelector:()=>null,animate:()=>animation});
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
  animatePanel({getBoundingClientRect:()=>bounds,querySelector:()=>null,animate:()=>animation});
  if(unmount){animation.cancel();rejectFinished(new Error('unmounted'));}
  else {reversePanel(animation,[]);assert.equal(animation.currentTime,96);animation.currentTime=0;animation.playState='finished';resolveFinished();}
  await Promise.resolve();
  assert.equal(animation.cancels,unmount?1:0);
 }
});


test('背景の展開と文字の出現も途中取消・完了後の逆再生・破棄を本体と同期する',async()=>{
 for(const early of [true,false]){
  let finish;
  const create=()=>({currentTime:96,playbackRate:1,playState:'running',cancels:0,plays:0,
   effect:{updateTiming(next){this.fill=next.fill;}},
   cancel(){this.cancels++;this.currentTime=null;this.playState='idle';},
   play(){this.plays++;this.playState='running';}
  });
  const panel=create(),glass=create(),content=create();
  panel.finished=new Promise(resolve=>finish=resolve);
  globalThis.window={getComputedStyle:()=>({borderRadius:'28px'})};
  animatePanel({getBoundingClientRect:()=>bounds,querySelector:selector=>({animate:()=>selector.endsWith('.card-panel-glass')?glass:content}),animate:()=>panel},{left:20,top:136,width:350,height:112});
  if(!early){panel.currentTime=320;panel.playState='finished';finish();await Promise.resolve();assert.equal(glass.cancels,1);}
  reversePanel(panel,[]);
  assert.equal(glass.currentTime,early?96:320);
  assert.equal(glass.currentTime,panel.currentTime);
  assert.equal(glass.playbackRate,panel.playbackRate);
  assert.equal(glass.effect.fill,'both');
  assert.equal(glass.plays,1);
  assert.equal(content.currentTime,glass.currentTime);
  assert.equal(content.playbackRate,glass.playbackRate);
  assert.equal(content.plays,1);
  cancelPanel(panel);
  assert.equal(glass.cancels,early?1:2);
  assert.equal(panel.cancels,glass.cancels);
  assert.equal(content.cancels,glass.cancels);
 }
});
