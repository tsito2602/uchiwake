import test from 'node:test';
import assert from 'node:assert/strict';
import { finishSpaceSwitch } from '../src/space-switch-motion.ts';
import { build } from 'esbuild';

function fixture(t,{elapsed=0,reduced=false}={}) {
  t.mock.timers.enable({apis:['setTimeout']});
  let now=elapsed,serial=0;
  t.mock.method(performance,'now',()=>now);
  const frames=new Map(),events=[];
  const root={style:{visibility:''},getBoundingClientRect(){events.push('layout');return {};}};
  globalThis.window={
    matchMedia:()=>({matches:reduced}),setTimeout,clearTimeout,
    requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},
    cancelAnimationFrame:id=>frames.delete(id),
    scrollTo:value=>{assert.equal(value.top,0);events.push('scroll');}
  };
  const start=()=>finishSpaceSwitch(root,0,()=>events.push('fade'),()=>events.push('exit'));
  const advance=ms=>{now+=ms;t.mock.timers.tick(ms);};
  const paint=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(now));};
  return {root,events,frames,start,advance,paint};
}

test('短い読み込みでも点滅させず、切り替え先を描画してから全画面をフェードする',t=>{
  const f=fixture(t);const cancel=f.start();
  f.advance(299);assert.deepEqual(f.events,[]);
  f.advance(1);assert.deepEqual(f.events,['layout','scroll']);
  assert.equal(f.root.style.visibility,'');
  f.paint();assert.ok(!f.events.includes('fade'));
  f.paint();assert.equal(f.events.at(-1),'fade');
  f.advance(179);assert.ok(!f.events.includes('exit'));
  f.advance(1);assert.equal(f.events.at(-1),'exit');
  cancel();f.advance(1000);assert.equal(f.events.filter(x=>x==='exit').length,1);
});

test('長い読み込みの完了後は呼吸のループ終了を待たずに画面へ進む',t=>{
  const f=fixture(t,{elapsed:1930});f.start();f.advance(0);
  f.paint();f.paint();assert.equal(f.events.at(-1),'fade');
  f.advance(180);assert.equal(f.events.at(-1),'exit');
});

test('読み込み先が変わって前の画面を破棄しても、古い完了処理が新しい画面を閉じない',t=>{
  const f=fixture(t);const first=f.start();f.advance(300);first();
  const second=f.start();f.advance(0);f.paint();f.paint();second();
  f.advance(1000);f.paint();
  assert.equal(f.events.filter(x=>x==='fade').length,1);
  assert.ok(!f.events.includes('exit'));assert.equal(f.frames.size,0);
  assert.equal(f.root.style.visibility,'');
});

test('バックグラウンドで描画フレームが停止しても、読み込み済みの画面をロックしない',t=>{
  const f=fixture(t);f.start();f.advance(300);f.advance(250);f.advance(180);
  assert.equal(f.events.at(-1),'exit');assert.equal(f.frames.size,0);
});

test('動きを減らす設定では最小表示時間とフェードを省略する',t=>{
  const f=fixture(t,{reduced:true});f.start();f.advance(0);f.paint();f.paint();f.advance(0);
  assert.deepEqual(f.events,['layout','scroll','fade','exit']);
});

test('個人・共有のアイコンだけを表示し、スペース名や読み込みテキストを描画しない',async()=>{
  const {outputFiles}=await build({stdin:{contents:`
    import {createElement} from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import {SpaceSwitchScreen} from './src/space-switch-screen';
    export const render=kind=>renderToStaticMarkup(createElement(SpaceSwitchScreen,{space:{id:kind,name:'表示しないスペース名',kind},ready:false,onExited:()=>{}}));
  `,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',packages:'external',loader:{'.css':'empty'},plugins:[{name:'portal',setup(builder){
    builder.onResolve({filter:/^react-dom$/},()=>({path:'portal',namespace:'test'}));
    builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const createPortal=children=>children;'}));
  }}]});
  const bundle=outputFiles[0].text.replace(/from "([^"]+)"/g,(_,name)=>`from ${JSON.stringify(import.meta.resolve(name))}`);
  const {render}=await import('data:text/javascript;base64,'+Buffer.from(bundle).toString('base64'));
  globalThis.document={body:{}};
  for(const kind of ['personal','shared']){
    const html=render(kind);
    assert.match(html,new RegExp(kind==='personal'?'lucide-user-round':'lucide-users-round'));
    assert.doesNotMatch(html,/表示しないスペース名/);
    assert.equal(html.replace(/<[^>]*>/g,''),'');
    assert.match(html,/role="status"/);
  }
});
