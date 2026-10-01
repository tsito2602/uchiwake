import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';

const {outputFiles}=await build({entryPoints:[new URL('../src/panel-viewport.ts',import.meta.url).pathname],bundle:true,write:false,format:'esm',platform:'node'});
const {trackPanelViewport}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));

function fixture(){
 const frames=new Map(),properties=new Map();let nextFrame=0;
 const view=Object.assign(new EventTarget(),{innerHeight:844,requestAnimationFrame(fn){frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame(id){frames.delete(id);}});
 const viewport=Object.assign(new EventTarget(),{height:844,offsetTop:0,scale:1});view.visualViewport=viewport;
 const panel=Object.assign(new EventTarget(),{ownerDocument:{defaultView:view,activeElement:null},contains:()=>false});
 const shell={style:{setProperty:(name,value)=>properties.set(name,value),removeProperty:name=>properties.delete(name)}};
 const stop=trackPanelViewport(panel,shell);
 const flush=()=>{while(frames.size){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}};
 return {view,viewport,panel,properties,frames,stop,flush};
}

test('キーボード開閉と高さの変化でパネルを縮めず、末尾の入力欄までスクロールできる余白を増やす',()=>{
 const f=fixture();
 try{
  assert.equal(f.properties.get('--panel-viewport-height'),'844px');
  for(const [height,inset] of [[470,374],[410,434],[844,0]]){
   f.viewport.height=height;f.viewport.dispatchEvent(new Event('resize'));f.flush();
   assert.equal(f.properties.get('--panel-viewport-height'),'844px');
   assert.equal(f.properties.get('--panel-keyboard-inset'),`${inset}px`);
  }
  f.viewport.offsetTop=45;f.viewport.dispatchEvent(new Event('scroll'));f.flush();
  assert.equal(f.properties.get('--panel-viewport-height'),'844px');
  assert.equal(f.properties.has('--panel-viewport-top'),false);
 }finally{f.stop();}
});

test('画面回転には追従し、ピンチやブラウザの小さな高さ変化をキーボードとして扱わない',()=>{
 const f=fixture();
 try{
  f.viewport.height=780;f.viewport.dispatchEvent(new Event('resize'));f.flush();
  assert.equal(f.properties.get('--panel-keyboard-inset'),'0px');
  f.viewport.scale=2;f.viewport.height=422;f.viewport.dispatchEvent(new Event('resize'));f.flush();
  assert.equal(f.properties.get('--panel-viewport-height'),'844px');
  assert.equal(f.properties.get('--panel-keyboard-inset'),'0px');
  f.viewport.scale=1;f.view.innerHeight=390;f.viewport.height=390;f.view.dispatchEvent(new Event('resize'));f.flush();
  assert.equal(f.properties.get('--panel-viewport-height'),'390px');
 }finally{f.stop();}
});

test('閉じたパネルは後から来るキーボードイベントや描画予約で更新されない',()=>{
 const f=fixture();
 f.viewport.dispatchEvent(new Event('resize'));f.panel.dispatchEvent(new Event('focusin'));
 f.stop();assert.equal(f.frames.size,0);assert.equal(f.properties.size,0);
 f.viewport.dispatchEvent(new Event('resize'));f.viewport.dispatchEvent(new Event('scroll'));
 f.view.dispatchEvent(new Event('resize'));f.panel.dispatchEvent(new Event('focusin'));
 f.flush();assert.equal(f.frames.size,0);assert.equal(f.properties.size,0);
});
