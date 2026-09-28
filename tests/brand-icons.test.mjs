import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import app from '../dist/worker.mjs';

// In-app artwork stays identical to the accepted baseline.
const originals = {
  'logo-light.svg':'67ca2bcb04ca3b40d08c7fbeb674ddfa310a3d217bfae8a1e6ba9e8c2ccc2966',
  'logo-dark.svg':'e9bfae5e7be5ff27a78f6dffc5f856e50e25f9551a264802ec046cd6213266ef',
};
test('アプリ内ロゴはバイト単位で維持する',async()=>{
  for(const [name,hash] of Object.entries(originals)) {
    assert.equal(createHash('sha256').update(await readFile(`public/${name}`)).digest('hex'),hash,name);
  }
});
test('背景は成功版と同一に保ち、白い下地のない図柄だけ14%拡大する',async()=>{
  const hashes={
    light:'91f15cc5fccb26018703411ffad309995ace578b51c3286c747fe48303ca5cc1',
    dark:'c949755a8e2d41322f3ddd71d21e9b3607ac0fc92e3c4a93db2c77ae38e4c990',
  };
  const palettes={light:[[48,48,47],[156,151,143],[203,197,187]],dark:[[245,241,233],[182,176,166],[129,123,114]]};
  const render=svg=>sharp(Buffer.from(svg)).resize(512,512).ensureAlpha().raw().toBuffer();
  const height=data=>{
    const rows=[];for(let i=3;i<data.length;i+=4)if(data[i]>127)rows.push(Math.floor((i/4)/512));
    return rows.at(-1)-rows[0]+1;
  };
  for(const theme of ['light','dark']) {
    const svg=await readFile(`public/icon-${theme}.svg`,'utf8');
    // Removing ONLY the scale group must exactly recover the original asset.
    const unscaled=svg.replace('<g transform="translate(627 627) scale(1.14) translate(-627 -627)">','').replace('</g>','');
    assert.equal(createHash('sha256').update(unscaled).digest('hex'),hashes[theme]);
    assert.equal((svg.match(/<rect\b/g)||[]).length,1);
    assert.doesNotMatch(svg,/stroke=/);
    const foreground=svg.replace(/<rect\b[^>]*\/>/,'');
    const data=await render(foreground),before=await render(foreground.replace('scale(1.14)','scale(1)'));
    assert.ok(Math.abs(height(data)/height(before)-1.14)<.015);
    assert.equal(data[3],0);
    assert.equal(data[(Math.round(512*671.46/1254)*512+256)*4+3],0);
    const composed=await render(svg),hole=(Math.round(512*671.46/1254)*512+256)*4;
    assert.deepEqual([...composed.subarray(hole,hole+4)],theme==='light'?[251,248,242,255]:[25,25,25,255]);
    for(let i=0;i<data.length;i+=4)if(data[i+3]>=32){
      const delta=Math.min(...palettes[theme].map(color=>Math.max(...color.map((v,c)=>Math.abs(v-data[i+c])))));
      assert.ok(delta<=9,'No white matte or extra outline at partially transparent edges');
    }
  }
});
test('PNG用の追加指定を外して元のSVG・manifest参照へ戻す',async()=>{
  const html=await readFile('index.html','utf8');
  assert.match(html,/rel="icon" href="\/icon\.svg" type="image\/svg\+xml"/);
  assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.doesNotMatch(html,/apple-touch-icon|brand-icons/);
  for(const theme of ['light','dark']) {
    const manifest=JSON.parse(await readFile(`public/manifest-${theme}.webmanifest`,'utf8'));
    assert.equal(manifest.id,'/');
    assert.deepEqual(manifest.icons,[{src:`/icon-${theme}.svg`,sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]);
  }
  assert.equal(await readFile('public/manifest-v4.webmanifest','utf8'),await readFile('public/manifest.webmanifest','utf8'));
});
test('SVGはWorker経由でも生成画像と同じバイト列で配信する',async()=>{
  for(const name of ['icon.svg','icon-light.svg','icon-dark.svg',...Object.keys(originals)]) {
    const response=await app.fetch(new Request(`https://example.test/${name}`),{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/svg+xml');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(`public/${name}`));
  }
});
