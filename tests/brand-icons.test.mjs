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
test('ホーム画面だけ白い細縁を付け、明暗で同じ図柄と14%の大きさを維持する',async()=>{
  const render=svg=>sharp(Buffer.from(svg)).resize(512,512).ensureAlpha().raw().toBuffer();
  const height=data=>{
    const rows=[];for(let i=3;i<data.length;i+=4)if(data[i]>127)rows.push(Math.floor((i/4)/512));
    return rows.at(-1)-rows[0]+1;
  };
  let commonForeground;
  for(const theme of ['light','dark']) {
    const svg=await readFile(`public/icon-${theme}.svg`,'utf8');
    assert.match(svg,/data-appearance="edge" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="18"/);
    assert.equal((svg.match(/<rect\b/g)||[]).length,1);
    const foreground=svg.replace(/<rect\b[^>]*\/>/,'');
    if(commonForeground) assert.equal(foreground,commonForeground);
    commonForeground=foreground;
    const withoutEdge=foreground.replace(/<g data-appearance="edge"[^>]*>[\s\S]*?<\/g>/,'');
    const data=await render(foreground),ink=await render(withoutEdge);
    const before=await render(withoutEdge.replace('scale(1.14)','scale(1)'));
    assert.ok(Math.abs(height(ink)/height(before)-1.14)<.015);
    assert.equal(data[3],0);
    const hole=(Math.round(512*671.46/1254)*512+256)*4;
    assert.equal(data[hole+3],0);
    let white=0;
    for(let i=0;i<data.length;i+=4)if(data[i]===255&&data[i+1]===255&&data[i+2]===255&&data[i+3]===255)white++;
    assert.ok(white>100&&white<20000,'The edge must exist without filling the entire tile');
    const composed=await render(svg);
    assert.deepEqual([...composed.subarray(hole,hole+4)],theme==='light'?[251,248,242,255]:[25,25,25,255]);
  }
  for(const theme of ['light','dark']) {
    const logo=await readFile(`public/logo-${theme}.svg`,'utf8');
    assert.doesNotMatch(logo,/data-appearance="edge"|stroke=/);
    assert.match(logo,new RegExp(theme==='light'?'#30302f':'#f5f1e9'));
  }
});
test('iPhoneに白縁入り透過PNGを明示し、明暗で共通のPNG候補を使う',async()=>{
  const html=await readFile('index.html','utf8');
  assert.match(html,/rel="icon" href="\/icon\.svg" type="image\/svg\+xml"/);
  assert.match(html,/rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon-v5\.png"/);
  assert.equal((html.match(/rel="apple-touch-icon"/g)||[]).length,1);
  for(const theme of ['light','dark']) {
    const manifest=JSON.parse(await readFile(`public/manifest-${theme}.webmanifest`,'utf8'));
    assert.equal(manifest.id,'/');
    assert.deepEqual(manifest.icons,[
      ...[192,512].map(size=>({src:`/icon-v5-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'})),
      {src:`/icon-${theme}.svg`,sizes:'any',type:'image/svg+xml',purpose:'maskable'},
    ]);
  }
  assert.equal(await readFile('public/manifest-v4.webmanifest','utf8'),await readFile('public/manifest.webmanifest','utf8'));
});
test('実際に登録するPNGはKondoと同じ書き出し条件で、180pxでも白縁が残る',async()=>{
  const source=(await readFile('public/icon-light.svg','utf8')).replace(/<rect\b[^>]*\/>/,'');
  for(const size of [180,192,512]) {
    const name=size===180?'apple-touch-icon-v5.png':`icon-v5-${size}.png`;
    const file=await readFile(`public/${name}`);
    const expected=await sharp(Buffer.from(source),{density:384}).resize(size,size).png({compressionLevel:9,palette:false}).toBuffer();
    assert.deepEqual(file,expected);
    const {data,info}=await sharp(file).raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,size);assert.equal(info.height,size);assert.equal(info.channels,4);
    assert.equal(data[3],0,'no opaque tile');
    assert.equal(data[(Math.round(size*671.46/1254)*size+Math.floor(size/2))*4+3],0,'hole stays transparent');
    let white=0;
    for(let i=0;i<data.length;i+=4)if(data[i]>245&&data[i+1]>245&&data[i+2]>245&&data[i+3]>245)white++;
    assert.ok(white>size&&white<size*size*.1,`${name}: solid white edge, not a white plate`);
    const response=await app.fetch(new Request(`https://example.test/${name}`),{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),file);
  }
  assert.deepEqual(await readFile('public/apple-touch-icon.png'),await readFile('public/apple-touch-icon-v5.png'));
  const response=await app.fetch(new Request('https://example.test/'),{});
  assert.match(await response.text(),/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon-v5\.png"/);
});
test('SVGはWorker経由でも生成画像と同じバイト列で配信する',async()=>{
  for(const name of ['icon.svg','icon-light.svg','icon-dark.svg',...Object.keys(originals)]) {
    const response=await app.fetch(new Request(`https://example.test/${name}`),{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/svg+xml');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(`public/${name}`));
  }
});
