import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import app from '../dist/worker.mjs';

// Freeze the pre-resize SVG bytes, not another approximation of the design.
// Baseline: ff254711030539af11f111fa540f61dbe63e60dd.
const originals = {
  'icon.svg':'aa62157249bd46cdc349fad12e610fbe1edff9a301401e02a40ccd9c8df7ce1f',
  'icon-light.svg':'91f15cc5fccb26018703411ffad309995ace578b51c3286c747fe48303ca5cc1',
  'icon-dark.svg':'c949755a8e2d41322f3ddd71d21e9b3607ac0fc92e3c4a93db2c77ae38e4c990',
  'logo-light.svg':'67ca2bcb04ca3b40d08c7fbeb674ddfa310a3d217bfae8a1e6ba9e8c2ccc2966',
  'logo-dark.svg':'e9bfae5e7be5ff27a78f6dffc5f856e50e25f9551a264802ec046cd6213266ef',
};
test('サイズ変更前のSVGを配色・余白・形状も含めバイト単位で復元する',async()=>{
  for(const [name,hash] of Object.entries(originals)) {
    assert.equal(createHash('sha256').update(await readFile(`public/${name}`)).digest('hex'),hash,name);
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
test('復元したSVGはWorker経由でも元画像と同じバイト列で配信する',async()=>{
  for(const name of Object.keys(originals)) {
    const response=await app.fetch(new Request(`https://example.test/${name}`),{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/svg+xml');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(`public/${name}`));
  }
});
