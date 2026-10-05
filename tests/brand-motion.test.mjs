import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';

const compiled = await build({entryPoints:['src/brand-motion.ts'], bundle:true, platform:'node', format:'esm', write:false});
const {geometry, BOOT_HOLD_END} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const boot = await readFile('public/boot.js', 'utf8');
const init = await readFile('public/theme-init.js', 'utf8');
const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function inside(p, poly) {
  let yes=false;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++) {
    const a=poly[i],b=poly[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0]) yes=!yes;
  }
  return yes;
}
function overlap(a,b) {
  for(let i=0;i<a.length;i++) for(let j=0;j<b.length;j++) {
    const p=a[i],q=a[(i+1)%a.length],r=b[j],s=b[(j+1)%b.length];
    if(cross(p,q,r)*cross(p,q,s)<0 && cross(r,s,p)*cross(r,s,q)<0) return true;
  }
  return inside(a[0],b)||inside(b[0],a);
}
test('一画目は一続きの軌道で移動し、二画目と重ならず表示領域に収まる',()=>{
  for(let t=1100;t<=2250;t+=10) {
    const {head,body}=geometry(t);
    assert.ok(!body.some(part=>overlap(head,part)),`overlap at ${t}ms`);
    assert.ok(head.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&x>=-248&&x<=1502&&y>=-240&&y<=1145),`clipped at ${t}ms`);
  }
});
test('アニメーションの1画目はホーム図柄と同じ位置へ収まる',()=>{
  const {head}=geometry(2250);
  assert.ok(Math.abs(head[0][0]-451)<1e-8);
  assert.ok(Math.abs(head[0][1]-222)<1e-8);
});
function launch({dark=false,reduced=false,alreadyReady=false,canvas=true,scrollY=0,dock=false}={}) {
  let now=0,id=0;
  const timers=new Map(),frames=new Map(),events=new Map(),dispatched=[];
  const context=new Proxy({}, {get:(obj,key)=>obj[key] ?? (()=>{}),set:(obj,key,value)=>(obj[key]=value,true)});
  const element=()=>({dataset:{},style:{visibility:''},attrs:{},isConnected:true,classList:new Set(),animations:[],children:[],animate(frames,timing){this.animations.push({frames,timing});return {}},querySelector(){return null},appendChild(child){this.children.push(child)},getBoundingClientRect(){return {top:-sandbox.scrollY}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},remove(){this.isConnected=false}});
  const ids=Object.fromEntries(['initial-boot','root','boot-canvas','boot-still','app-icon','app-manifest','app-theme-color'].map(k=>[k,element()]));
  ids['boot-canvas'].getContext=()=>canvas?context:null;
  if(alreadyReady) ids.root.dataset.bootReady='true';
  const dockElement={...element(),getBoundingClientRect:()=>({left:16,top:780,width:358,height:56})};
  const symbol={...element(),getBoundingClientRect:()=>({left:107,top:350,width:176,height:142})};
  ids['initial-boot'].querySelector=selector=>selector==='.boot-symbol'?symbol:null;
  const media=matches=>({matches,addEventListener(_,fn){this.listener=fn},removeEventListener(){this.listener=null}});
  const darkMedia=media(dark),reducedMedia=media(reduced);
  const document={querySelector:selector=>dock&&selector==='.kondo-floating-dock'?dockElement:null,createElement:()=>element(),dispatchEvent:e=>{dispatched.push({type:e.type,bootVisible:ids['initial-boot'].isConnected,inert:ids.root.attrs.inert});events.get(e.type)?.(e)},documentElement:element(),getElementById:k=>ids[k],addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
  const sandbox={document,Event,addEventListener:(k,f)=>events.set(k,f),dispatchEvent:e=>events.get(e.type)?.(e),matchMedia:q=>q.includes('color-scheme')?darkMedia:reducedMedia,getComputedStyle:()=>({color:'#30302f',backgroundColor:'#ffffff'}),performance:{now:()=>now},devicePixelRatio:1,
    history:{scrollRestoration:'auto'},scrollY,scrollTo:({top})=>{sandbox.scrollY=top},
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id},clearTimeout:k=>timers.delete(k),requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:k=>frames.delete(k)};
  sandbox.window=sandbox;
  vm.runInNewContext(init,sandbox);
  vm.runInNewContext(boot,sandbox);
  function advance(ms) {
    now+=ms;
    const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));
    for(const [key,timer] of [...timers]) if(timer.at<=now){timers.delete(key);timer.fn()}
  }
  const reveal=()=>{advance(16);advance(16);advance(240)};
  return {dockElement,symbol,ids,advance,reveal,sandbox,dispatched,ready:()=>events.get('uchiwake:ready')?.(),darkMedia,reducedMedia};
}
test('準備済みでも8文字の出現が終わるまで待ってから操作を解放する',()=>{
  const app=launch({alreadyReady:true});
  app.advance(BOOT_HOLD_END-1);
  assert.equal(app.ids['initial-boot'].isConnected,true);
  assert.equal(app.ids.root.attrs.inert,'');
  assert.deepEqual(app.dispatched,[]);
  app.advance(1);app.reveal();
  assert.equal(app.ids['initial-boot'].isConnected,false);
  assert.equal(app.ids.root.attrs.inert,undefined);
  assert.deepEqual(app.dispatched,[{type:'uchiwake:boot-complete',bootVisible:false,inert:undefined}]);
});
test('読み込み完了を待ち、失敗や応答停止でも画面をロックし続けない',()=>{
  const app=launch();app.advance(BOOT_HOLD_END+500);
  assert.equal(app.ids['initial-boot'].isConnected,true);
  app.ready();app.reveal();
  assert.equal(app.ids['initial-boot'].isConnected,false);
  const stalled=launch();stalled.advance(8000);
  assert.equal(stalled.ids.root.attrs.inert,undefined);
  assert.equal(stalled.ids['initial-boot'].isConnected,false);
  assert.deepEqual(stalled.dispatched,[{type:'uchiwake:boot-complete',bootVisible:false,inert:undefined}]);
});
test('動きを減らす設定・Canvas非対応では静止表示から安全に進む',()=>{
  for(const options of [{reduced:true},{canvas:false}]) {
    const app=launch(options);app.ready();app.reveal();
    assert.equal(app.ids['initial-boot'].isConnected,false);
    assert.equal(app.ids.root.attrs.inert,undefined);
  }
  const changed=launch();changed.reducedMedia.matches=true;changed.reducedMedia.listener();changed.ready();changed.reveal();
  assert.equal(changed.ids['initial-boot'].isConnected,false);
});
test('OSテーマ変更はアプリ内だけに適用し、ホーム用アイコンとmanifestを差し替えない',()=>{
  const app=launch({dark:true,alreadyReady:true});
  assert.equal(app.ids['app-icon'].attrs.href,undefined);
  assert.equal(app.ids['app-manifest'].attrs.href,undefined);
  assert.equal(app.ids['boot-still'].src,'/logo-dark.svg');
  app.advance(BOOT_HOLD_END);app.reveal();
  app.darkMedia.matches=false;app.darkMedia.listener();
  assert.equal(app.ids['app-icon'].attrs.href,undefined);
  assert.equal(app.ids['app-manifest'].attrs.href,undefined);
  assert.equal(app.ids['boot-still'].src,'/logo-light.svg');
  assert.equal(app.ids['app-theme-color'].attrs.content,'#ffffff');
});

test('更新前のスクロール位置を引き継がず、準備した画面を描画してから起動画面を閉じる',()=>{
  for(const delayed of [false,true]) {
    const app=launch({alreadyReady:!delayed,scrollY:720});
    assert.equal(app.sandbox.history.scrollRestoration,'manual');
    app.advance(BOOT_HOLD_END);
    if(delayed) {app.advance(500);app.ready();}
    assert.equal(app.sandbox.scrollY,0);
    assert.equal(app.ids.root.style.visibility,'');
    assert.equal(app.ids.root.attrs.inert,'');
    assert.equal(app.ids['initial-boot'].classList.has('boot-leaving'),false);
    app.advance(16);
    assert.equal(app.ids['initial-boot'].classList.has('boot-leaving'),false);
    app.advance(16);
    assert.equal(app.ids['initial-boot'].classList.has('boot-leaving'),true);
    app.advance(240);
    assert.equal(app.ids['initial-boot'].isConnected,false);
    assert.equal(app.ids.root.attrs.inert,undefined);
    app.sandbox.scrollY=160;app.ready();app.advance(100);
    assert.equal(app.sandbox.scrollY,160);
    assert.equal(app.dispatched.length,1);
  }
});

test('描画待機中にタイムアウトしても操作を解放し、後から起動画面を再表示しない',()=>{
  const app=launch();app.advance(7990);app.ready();app.advance(10);
  assert.equal(app.ids['initial-boot'].isConnected,false);
  assert.equal(app.ids.root.attrs.inert,undefined);
  assert.equal(app.ids.root.style.visibility,'');
  app.reveal();
  assert.equal(app.ids['initial-boot'].classList.has('boot-leaving'),false);
  assert.equal(app.dispatched.length,1);
});

test('ドックがあれば、ロゴそのものが玉になってボトムナビへ落ちてから操作を解放する',()=>{
  const app=launch({alreadyReady:true,dock:true});
  app.advance(BOOT_HOLD_END);app.advance(16);app.advance(16);
  const cover=app.ids['initial-boot'];
  assert.equal(cover.classList.has('boot-leaving'),false);
  const drop=cover.children[0];
  const frames=drop.animations[0].frames,last=frames.at(-1);
  // It takes over from the melted mark as a disc and ends as the dock itself.
  assert.equal(frames[0].width,frames[0].height);
  assert.equal(drop.animations[0].timing.delay,300);
  assert.deepEqual([last.left,last.top,last.width,last.height,last.opacity],['16px','780px','358px','56px',0]);
  assert.equal(app.symbol.animations[0].frames.at(-1).opacity,0);
  assert.equal(app.dockElement.animations.length,1);
  app.advance(1060);
  assert.equal(cover.isConnected,true);
  assert.equal(app.ids.root.attrs.inert,'');
  app.advance(40);
  assert.equal(cover.isConnected,false);
  assert.equal(app.ids.root.attrs.inert,undefined);
});
