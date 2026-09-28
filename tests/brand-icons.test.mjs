import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import app from '../dist/worker.mjs';

// Only the requested first-stroke thickness may differ from the in-app baseline.
const previousHead='M 451 254 Q 647 164 838 286 Q 856 298 848 315 L 819 365 Q 811 381 796 373 Q 642 289 482 350 Q 469 355 462 340 L 441 291 Q 434 266 451 254 Z';
const originals = {
  'logo-light.svg':'67ca2bcb04ca3b40d08c7fbeb674ddfa310a3d217bfae8a1e6ba9e8c2ccc2966',
  'logo-dark.svg':'e9bfae5e7be5ff27a78f6dffc5f856e50e25f9551a264802ec046cd6213266ef',
};
test('アプリ内ロゴは1画目だけ少し太くし、残りの図柄・配色は維持する',async()=>{
  for(const [name,hash] of Object.entries(originals)) {
    const svg=await readFile(`public/${name}`,'utf8');
    const head=svg.match(/<path[^>]* d="([^"]+)"/)[1];
    assert.match(head,/^M 451 250 Q 647 160/);
    assert.equal(createHash('sha256').update(svg.replace(head,previousHead)).digest('hex'),hash,name);
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
    assert.match(svg,/data-appearance="edge" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="50"/);
    assert.doesNotMatch(svg,/<rect\b|prefers-color-scheme/);
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
    for(const [x,y] of [[754.5,499],[831.25,768],[617,924.75]]) {
      const px=Math.round((627+(x-627)*1.14)*512/1254);
      const py=Math.round((627+(y-627)*1.14)*512/1254);
      assert.deepEqual([...data.subarray((py*512+px)*4,(py*512+px)*4+4)],[255,255,255,255],'chart gaps are solid white dividers');
    }
    let white=0;
    for(let i=0;i<data.length;i+=4)if(data[i]===255&&data[i+1]===255&&data[i+2]===255&&data[i+3]===255)white++;
    assert.ok(white>100&&white<512*512*.1,'The edge must exist without filling the entire tile');
    const composed=await render(svg);
    assert.equal(composed[hole+3],0,'all SVG candidates keep a transparent hole');
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
  assert.match(html,/rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon-v8\.png"/);
  assert.equal((html.match(/rel="apple-touch-icon"/g)||[]).length,1);
  for(const theme of ['light','dark']) {
    const manifest=JSON.parse(await readFile(`public/manifest-${theme}.webmanifest`,'utf8'));
    assert.equal(manifest.id,'/');
    assert.deepEqual(manifest.icons,[
      ...[192,512].map(size=>({src:`/icon-v8-${size}.png`,sizes:`${size}x${size}`,type:'image/png',purpose:'any'})),
      {src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'maskable'},
    ]);
    assert.equal(manifest.background_color,'#FFFFFF');
    assert.equal(manifest.theme_color,'#FFFFFF');
    assert.equal(await readFile(`public/manifest-${theme}.webmanifest`,'utf8'),await readFile('public/manifest.webmanifest','utf8'));
    assert.equal(await readFile(`public/icon-${theme}.svg`,'utf8'),await readFile('public/icon.svg','utf8'));
  }
  assert.equal(await readFile('public/manifest-v4.webmanifest','utf8'),await readFile('public/manifest.webmanifest','utf8'));
});
test('実際に登録するPNGはKondoと同じ書き出し条件で、180pxでも白縁が残る',async()=>{
  const source=(await readFile('public/icon-light.svg','utf8')).replace(/<rect\b[^>]*\/>/,'');
  for(const size of [180,192,512]) {
    const name=size===180?'apple-touch-icon-v8.png':`icon-v8-${size}.png`;
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
  assert.deepEqual(await readFile('public/apple-touch-icon.png'),await readFile('public/apple-touch-icon-v8.png'));
  const updatedHead=(await readFile('public/logo-light.svg','utf8')).match(/<path[^>]* d="([^"]+)"/)[1];
  const selectedC=(await readFile('scripts/fixtures/uchiwake-v7.svg','utf8')).replaceAll('#30302f','#000000');
  assert.equal(source,selectedC.replaceAll(previousHead,updatedHead),'only thicken C’s first stroke, using the same contour as the in-app logo');
  const response=await app.fetch(new Request('https://example.test/'),{});
  assert.match(await response.text(),/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon-v8\.png"/);
});
test('SVGはWorker経由でも生成画像と同じバイト列で配信する',async()=>{
  for(const name of ['icon.svg','icon-light.svg','icon-dark.svg',...Object.keys(originals)]) {
    const response=await app.fetch(new Request(`https://example.test/${name}`),{});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('content-type'),'image/svg+xml');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(`public/${name}`));
  }
});
