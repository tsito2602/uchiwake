import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { build } from 'esbuild';

const compiled = await build({entryPoints:['src/brand-motion.ts'], bundle:true, platform:'node', format:'esm', write:false});
const {geometry, BOOT_HOLD_END} = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const boot = await readFile('public/boot.js', 'utf8');
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
function launch({dark=false,reduced=false,alreadyReady=false,canvas=true}={}) {
  let now=0,id=0;
  const timers=new Map(),frames=new Map(),events=new Map();
  const context=new Proxy({}, {get:(obj,key)=>obj[key] ?? (()=>{}),set:(obj,key,value)=>(obj[key]=value,true)});
  const element=()=>({dataset:{},attrs:{},isConnected:true,classList:{add(){}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},remove(){this.isConnected=false}});
  const ids=Object.fromEntries(['initial-boot','root','boot-canvas','boot-still','app-icon','app-touch-icon','app-manifest','app-theme-color'].map(k=>[k,element()]));
  ids['app-icon'].attrs.href='/brand-icons/apple-touch-v4.png';
  ids['app-touch-icon'].attrs.href='/brand-icons/apple-touch-v4.png';
  ids['app-manifest'].attrs.href='/manifest-v4.webmanifest';
  ids['boot-canvas'].getContext=()=>canvas?context:null;
  if(alreadyReady) ids.root.dataset.bootReady='true';
  const media=matches=>({matches,addEventListener(_,fn){this.listener=fn},removeEventListener(){this.listener=null}});
  const darkMedia=media(dark),reducedMedia=media(reduced);
  const document={documentElement:element(),getElementById:k=>ids[k],addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k)};
  const sandbox={document,matchMedia:q=>q.includes('color-scheme')?darkMedia:reducedMedia,performance:{now:()=>now},devicePixelRatio:1,
    setTimeout:(fn,ms)=>{timers.set(++id,{fn,at:now+ms});return id},clearTimeout:k=>timers.delete(k),requestAnimationFrame:fn=>{frames.set(++id,fn);return id},cancelAnimationFrame:k=>frames.delete(k)};
  sandbox.window=sandbox;
  vm.runInNewContext(boot,sandbox);
  function advance(ms) {
    now+=ms;
    const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));
    for(const [key,timer] of [...timers]) if(timer.at<=now){timers.delete(key);timer.fn()}
  }
  return {ids,advance,ready:()=>events.get('uchiwake:ready')?.(),darkMedia,reducedMedia};
}
test('準備済みでも8文字の出現が終わるまで待ってから操作を解放する',()=>{
  const app=launch({alreadyReady:true});
  app.advance(BOOT_HOLD_END-1);
  assert.equal(app.ids['initial-boot'].isConnected,true);
  assert.equal(app.ids.root.attrs.inert,'');
  app.advance(1);app.advance(240);
  assert.equal(app.ids['initial-boot'].isConnected,false);
  assert.equal(app.ids.root.attrs.inert,undefined);
});
test('読み込み完了を待ち、失敗や応答停止でも画面をロックし続けない',()=>{
  const app=launch();app.advance(BOOT_HOLD_END+500);
  assert.equal(app.ids['initial-boot'].isConnected,true);
  app.ready();app.advance(240);
  assert.equal(app.ids['initial-boot'].isConnected,false);
  const stalled=launch();stalled.advance(8000);
  assert.equal(stalled.ids.root.attrs.inert,undefined);
  assert.equal(stalled.ids['initial-boot'].isConnected,false);
});
test('動きを減らす設定・Canvas非対応では静止表示から安全に進む',()=>{
  for(const options of [{reduced:true},{canvas:false}]) {
    const app=launch(options);app.ready();app.advance(240);
    assert.equal(app.ids['initial-boot'].isConnected,false);
    assert.equal(app.ids.root.attrs.inert,undefined);
  }
  const changed=launch();changed.reducedMedia.matches=true;changed.reducedMedia.listener();changed.ready();
  assert.equal(changed.ids['initial-boot'].isConnected,false);
});
test('テーマ変更はアプリ内だけに反映し、ホーム画面用の画像とmanifestは固定する',()=>{
  const app=launch({dark:true,alreadyReady:true});
  assert.equal(app.ids['app-icon'].attrs.href,'/brand-icons/apple-touch-v4.png');
  assert.equal(app.ids['app-touch-icon'].attrs.href,'/brand-icons/apple-touch-v4.png');
  assert.equal(app.ids['app-manifest'].attrs.href,'/manifest-v4.webmanifest');
  assert.equal(app.ids['boot-still'].src,'/logo-dark.svg');
  app.advance(BOOT_HOLD_END);app.advance(240);
  app.darkMedia.matches=false;app.darkMedia.listener();
  assert.equal(app.ids['app-icon'].attrs.href,'/brand-icons/apple-touch-v4.png');
  assert.equal(app.ids['app-touch-icon'].attrs.href,'/brand-icons/apple-touch-v4.png');
  assert.equal(app.ids['app-manifest'].attrs.href,'/manifest-v4.webmanifest');
  assert.equal(app.ids['boot-still'].src,'/logo-light.svg');
  assert.equal(app.ids['app-theme-color'].attrs.content,'#fbf8f2');
});
