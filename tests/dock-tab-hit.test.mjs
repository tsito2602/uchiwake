import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dockTabAt} from '../src/dock-tab-hit.ts';
import {build} from 'esbuild';

const bounds=[0,1,2].map(index=>({left:20+index*46,right:66+index*46,top:880,bottom:936}));

test('動画のように3アイコンからカレンダーへ指を移してもピルの位置は0〜2に収まる',()=>{
  for(const selected of [0,1,2])for(const scale of [1,1.06]) {
    const expanded=bounds.map(rect=>({...rect,left:89+(rect.left-89)*scale,right:89+(rect.right-89)*scale}));
    for(const [x,y] of [[40,900],[90,900],[135,900],[162,900],[220,900],[310,900],[360,900],[0,900],[90,860],[90,960]]) {
      const preview=dockTabAt(x,y,expanded);
      const pill=preview??selected;
      assert.ok(pill>=0&&pill<=2);
      if(x>=220)assert.equal(preview,null);
    }
  }
  assert.equal(dockTabAt(40,900,[]),null);
});

// Exercise the real dock's event handlers while keeping its animated surface
// outside the test boundary. The captured nav supplies pointer-capture geometry.
const {outputFiles}=await build({stdin:{contents:`
  import {createElement} from 'react';
  import {renderToStaticMarkup} from 'react-dom/server';
  import {FloatingDock} from './src/floating-dock';
  import {getContent} from './src/kondo-dock-content';
  export function render(props){renderToStaticMarkup(createElement(FloatingDock,props));return getContent();}
`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'capture-dock',setup(builder){
  builder.onLoad({filter:/\/kondo-dock-content\.tsx$/},()=>({contents:'let content; export const getContent=()=>content; export function DockContent({children}){content=children;return children;}',loader:'tsx'}));
}}]});
const bundle=outputFiles[0].text.replace(/from "([^"]+)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
const {render}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));

function fixture(t,tab='home') {
  globalThis.window={setTimeout};
  const selected=[],capture=new Set();
  const content=render({tab,onSelect:value=>selected.push(value),month:'2026-09',onMonthChange:()=>assert.fail('must not change month'),onPrevMonth(){},onNextMonth(){}});
  const nav=content.props.children.find(child=>child?.type==='nav').props;
  const target={querySelectorAll:()=>bounds.map(rect=>({getBoundingClientRect:()=>rect})),setPointerCapture:id=>capture.add(id),hasPointerCapture:id=>capture.has(id),releasePointerCapture:id=>capture.delete(id)};
  const event=(x,y=900,id=1)=>({button:0,isPrimary:true,pointerId:id,clientX:x,clientY:y,currentTarget:target});
  return {nav,event,selected,capture};
}

test('カレンダー上や領域外で指を離すと選択せず、互換クリックも抑止する',t=>{
  for(const x of [0,162,220,360]) {
    const f=fixture(t);f.nav.onPointerDown(f.event(40));f.nav.onPointerMove(f.event(x));f.nav.onPointerUp(f.event(x));
    assert.deepEqual(f.selected,[]);assert.equal(f.capture.size,0);
    let prevented=false,stopped=false;
    f.nav.onClickCapture({target:{classList:{contains:()=>false}},preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
    assert.ok(prevented&&stopped);
  }
});

test('iPhoneの触覚スイッチへのクリックは止めるが、切り替え自体は妨げない',t=>{
  const f=fixture(t);f.nav.onPointerDown(f.event(40));f.nav.onPointerUp(f.event(40));
  // A plain tap never captures the pointer, so it can reach the tab's switch.
  assert.equal(f.capture.size,0);
  let prevented=false,stopped=false;
  f.nav.onClickCapture({target:{classList:{contains:name=>name==='haptic-touch'}},preventDefault(){prevented=true;},stopPropagation(){stopped=true;}});
  assert.ok(!prevented&&stopped);assert.deepEqual(f.selected,['home']);
});

test('領域外からアイコンへ戻って離すと、そのタブを一度だけ選ぶ',t=>{
  const f=fixture(t);f.nav.onPointerDown(f.event(40));f.nav.onPointerMove(f.event(220));f.nav.onPointerMove(f.event(90));
  f.nav.onPointerUp(f.event(90));f.nav.onPointerUp(f.event(90));
  assert.deepEqual(f.selected,['ledger']);assert.equal(f.capture.size,0);
});

test('キャンセルやポインター捕捉の解除後には、移動先を選択しない',t=>{
  for(const handler of ['onPointerCancel','onLostPointerCapture']) {
    const f=fixture(t);f.nav.onPointerDown(f.event(40));f.nav.onPointerMove(f.event(135));
    f.nav[handler](f.event(135));f.nav.onPointerUp(f.event(135));
    assert.deepEqual(f.selected,[]);assert.equal(f.capture.size,0);
  }
});
