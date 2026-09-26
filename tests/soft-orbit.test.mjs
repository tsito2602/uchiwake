import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { startSoftOrbit } from '../src/soft-orbit.ts';

test('Soft Orbit animates continuous colors, respects reduced motion and cleans up when closed',()=>{
  const originals=new Map(['window','document','ResizeObserver','requestAnimationFrame','cancelAnimationFrame'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  const callbacks=new Map();let nextId=0,resize,draws=0;
  const preference={matches:false,addEventListener(_type,fn){this.listener=fn;},removeEventListener(){this.listener=null;}};
  const page={hidden:false,addEventListener(_type,fn){this.listener=fn;},removeEventListener(){this.listener=null;}};
  const contexts=Array.from({length:3},()=>({
    colors:[],setTransform(){},clearRect(){this.colors=[];},beginPath(){},moveTo(){},lineTo(){},
    createLinearGradient(...coords){assert.ok(coords.every(Number.isFinite));const colors=[];return {colors,addColorStop(_offset,color){colors.push(color);}};},
    stroke(){assert.ok(this.lineWidth>0);this.colors.push(...this.strokeStyle.colors);draws++;}
  }));
  const canvases=contexts.map(context=>({style:{},getContext:()=>context}));
  const container={clientWidth:320,clientHeight:600};
  let stop;
  try {
    globalThis.window={devicePixelRatio:2,matchMedia:()=>preference};
    globalThis.document=page;
    globalThis.ResizeObserver=class {constructor(fn){this.callback=fn;resize=this;}observe(){}disconnect(){this.disconnected=true;}};
    globalThis.requestAnimationFrame=fn=>{callbacks.set(++nextId,fn);return nextId;};
    globalThis.cancelAnimationFrame=id=>callbacks.delete(id);
    const advance=time=>{const [id,callback]=callbacks.entries().next().value;callbacks.delete(id);callback(time);};
    stop=startSoftOrbit(container,canvases);
    assert.equal(callbacks.size,1);
    assert.equal(canvases[0].width,760);
    const initial=contexts[2].colors.slice();
    assert.ok(new Set(initial).size>100,'Colors must vary continuously along the edge');
    advance(0);advance(50);
    assert.notDeepEqual(contexts[2].colors,initial,'The gradient moves around the panel');
    assert.equal(contexts[2].colors[0],contexts[2].colors.at(-1),'The gradient joins without a color seam');
    page.hidden=true;page.listener();assert.equal(callbacks.size,0);
    page.hidden=false;page.listener();assert.equal(callbacks.size,1);
    preference.matches=true;preference.listener();assert.equal(callbacks.size,0);
    const still=contexts[2].colors.slice();resize.callback();assert.deepEqual(contexts[2].colors,still);
    container.clientWidth=280;resize.callback();assert.equal(canvases[0].width,680);
    preference.matches=false;preference.listener();assert.equal(callbacks.size,1);
    stop();assert.equal(callbacks.size,0);assert.ok(resize.disconnected);
    assert.equal(preference.listener,null);assert.equal(page.listener,null);
    const finalDraws=draws;resize.callback();assert.equal(draws,finalDraws);
  } finally {
    stop?.();
    for(const [key,descriptor] of originals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
  }
});
