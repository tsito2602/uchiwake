import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import app from '../dist/worker.mjs';

const base='/__icon-check/light-v7';
const get=(path,APP_ENV='staging')=>app.fetch(new Request(`https://example.test${path}`),{APP_ENV});
test('比較ページはstagingだけで配信し、未知のURLを通常アプリに転送しない',async()=>{
  for(const path of [`${base}/`,`${base}/a/`,`${base}/a/icon.png`,`${base}/a/manifest.webmanifest`]) {
    assert.equal((await get(path)).status,200);
    assert.equal((await get(path,'production')).status,404);
  }
  assert.equal((await get(`${base}/missing/`)).status,404);
  const main=await(await get('/')).text();
  assert.match(main,/apple-touch-icon-v8\.png/);
  assert.doesNotMatch(main,/__icon-check/);
});
test('A/Bは実機で比較した画像そのものを配信し、全案で登録条件を揃える',async()=>{
  const hashes={a:'a6034d27c9a37409c3011eeec5eeb642718e1638fbee307d7000e01bcbbcc670',b:'f7016460d416935f13d5df3995f5885de93bad2c349132e931b5466b6d054525'};
  for(const key of ['a','b','c','d']) {
    const scope=`${base}/${key}/`;
    const html=await(await get(scope)).text();
    assert.ok(html.includes(`rel="apple-touch-icon" sizes="180x180" href="${scope}icon.png"`));
    assert.doesNotMatch(html,/<script|boot\.js/);
    const manifest=await(await get(`${scope}manifest.webmanifest`)).json();
    for(const prop of ['id','start_url','scope'])assert.equal(manifest[prop],scope);
    assert.equal(manifest.background_color,'#FFFFFF');
    assert.deepEqual(manifest.icons,[{src:`${scope}icon.png`,sizes:'180x180',type:'image/png',purpose:'any'}]);
    const png=Buffer.from(await(await get(`${scope}icon.png`)).arrayBuffer());
    if(hashes[key])assert.equal(createHash('sha256').update(png).digest('hex'),hashes[key]);
  }
});
test('C/Dは透明度と白縁を保ち、黒い塗り部分だけを増やす',async()=>{
  const images=await Promise.all(['b','c','d'].map(async key=>sharp(await readFile(`dist${base}/${key}/icon.png`)).ensureAlpha().raw().toBuffer()));
  const blacks=[0,0,0];
  for(let i=0;i<images[0].length;i+=4) {
    for(let n=0;n<images.length;n++) {
      assert.equal(images[n][i+3],images[0][i+3]);
      // Changing adjacent ink can shift a downsampled edge channel by one level.
      if(images[0][i]===255&&images[0][i+1]===255&&images[0][i+2]===255&&images[0][i+3]===255)assert.ok([...images[n].subarray(i,i+3)].every(value=>value>=253));
      if(images[n][i]===0&&images[n][i+1]===0&&images[n][i+2]===0&&images[n][i+3]===255)blacks[n]++;
    }
  }
  assert.equal(blacks[0],0);
  assert.ok(blacks[1]>0&&blacks[2]>blacks[1]);
});
