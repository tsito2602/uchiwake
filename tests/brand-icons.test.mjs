import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import app from '../dist/worker.mjs';

const palettes = {light:[[48,48,47],[156,151,143],[203,197,187]], dark:[[245,241,233],[182,176,166],[129,123,114]]};
const pixels = source => sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
function bounds({data,info}) {
  let top=info.height,bottom=0,left=info.width,right=0;
  for(let y=0;y<info.height;y++) for(let x=0;x<info.width;x++) if(data[(y*info.width+x)*4+3]>127) {
    top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);
  }
  return {height:bottom-top+1,width:right-left+1};
}
test('透過PNGは背景・中央の穴が透明で、半透明の輪郭にも白い下地を含まない',async()=>{
  for(const theme of ['light','dark']) for(const size of [180,192,512]) {
    const path=size===180?`public/brand-icons/apple-touch-v2-${theme}.png`:`public/brand-icons/uchiwake-v2-${theme}-${size}.png`;
    const {data,info}=await pixels(path);
    assert.equal(info.width,size);assert.equal(info.height,size);
    assert.equal(data[3],0);
    assert.equal(data[((size-1)*size+size-1)*4+3],0);
    assert.equal(data[(Math.round(size*671.46/1254)*size+Math.round(size/2))*4+3],0);
    let edgePixels=0;
    for(let i=0;i<data.length;i+=4) {
      const a=data[i+3];
      if(a<32) continue;
      if(a<255) edgePixels++;
      const distance=Math.min(...palettes[theme].map(color=>Math.max(...color.map((v,c)=>Math.abs(v-data[i+c])))));
      assert.ok(distance<=9,`${path}: unexpected matte at pixel ${i/4}: ${[...data.subarray(i,i+4)]}`);
    }
    assert.ok(edgePixels>30,'Antialiasing must remain smooth, not hard-thresholded');
  }
});
test('ホーム画面のマークを約14%拡大し、maskableは不透明の安全領域を維持する',async()=>{
  const svg=await readFile('public/icon-light.svg','utf8');
  const original=await sharp(Buffer.from(svg.replace('scale(1.14)','scale(1)'))).resize(512,512).png().toBuffer();
  const before=bounds(await pixels(original));
  const after=bounds(await pixels('public/brand-icons/uchiwake-v2-light-512.png'));
  for(const axis of ['width','height']) assert.ok(Math.abs(after[axis]/before[axis]-1.14)<.015);
  for(const theme of ['light','dark']) {
    const {data}=await pixels(`public/brand-icons/uchiwake-v2-${theme}-maskable-512.png`);
    for(let i=3;i<data.length;i+=4) assert.equal(data[i],255);
  }
});
test('ホーム画面用PNGは認証なしで取得でき、Worker経由でもバイト列が壊れない',async()=>{
  const html=await readFile('index.html','utf8');
  assert.match(html,/rel="apple-touch-icon"[^>]*href="\/brand-icons\/apple-touch-v2-light\.png"/);
  for(const theme of ['light','dark']) {
    const manifest=JSON.parse(await readFile(`public/manifest-${theme}.webmanifest`,'utf8'));
    assert.equal(manifest.icons.filter(icon=>icon.purpose==='any').length,2);
    assert.equal(manifest.icons.filter(icon=>icon.purpose==='maskable').length,1);
    for(const path of [...manifest.icons.map(icon=>icon.src),`/brand-icons/apple-touch-v2-${theme}.png`]) {
      const response=await app.fetch(new Request(`https://example.test${path}`),{});
      assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
      assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(`public${path}`));
    }
  }
});
