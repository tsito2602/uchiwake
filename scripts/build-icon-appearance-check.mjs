import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Isolated device comparison. No main-app asset, identity, or household data changes.
const base = '/__icon-check/light-v7';
const source = await readFile('scripts/fixtures/uchiwake-v7.svg', 'utf8');
const render = svg => sharp(Buffer.from(svg), { density: 384 }).resize(180, 180)
  .png({ compressionLevel: 9, palette: false }).toBuffer();
const variants = [
  { key: 'a', name: '比較A kondo', title: 'A · Kondoそのもの', description: '白背景に切り替わるKondoの配信画像を、そのまま使用。', image: await readFile('scripts/fixtures/kondo-v13-touch.png') },
  { key: 'b', name: '比較B うちわけ', title: 'B · 現在のうちわけ', description: 'いまホーム画面で黒背景になる画像を、そのまま使用。', image: await readFile('public/apple-touch-icon-v7.png') },
  { key: 'c', name: '比較C 黒い図柄', title: 'C · 濃い部分だけ純黒', description: '濃いグレーだけをKondoと同じ黒へ変更。右側のグレーは維持。', image: await render(source.replaceAll('#30302f', '#000000')) },
  { key: 'd', name: '比較D 白黒', title: 'D · 図柄全体を純黒', description: '3色の図柄をすべて黒へ変更。白フチと白い仕切りは維持。', image: await render(source.replace(/#30302f|#9c978f|#cbc5bb/g, '#000000')) },
];
const style = `<style>:root{font-family:system-ui,-apple-system,sans-serif;color:#292928;background:#f5f3ee;line-height:1.65}*{box-sizing:border-box}body{max-width:560px;margin:auto;padding:28px 20px 48px}h1{font-size:26px;line-height:1.35;margin:0 0 12px}h2{font-size:18px;line-height:1.4;margin:0}p{margin:10px 0 18px}article{padding:18px;background:#fff;border-radius:20px;margin:16px 0}a{color:inherit}a.button{display:block;text-align:center;background:#292928;color:white;padding:12px 14px;border-radius:24px;text-decoration:none;font-weight:600}figure{display:flex;gap:12px;margin:14px 0}figure>div{flex:1;text-align:center;font-size:12px}img{display:block;width:100%;max-width:150px;margin:auto;border-radius:28px}.light{background:#fff}.dark{background:#191919}small{display:block;color:#666}details{margin-top:28px}summary{font-weight:650;cursor:pointer}ol{padding-left:22px}.back{display:inline-block;margin-top:20px}@media(prefers-color-scheme:dark){:root{background:#171717;color:#f5f3ee}article{background:#252525}small{color:#b8b8b8}a.button{background:#f5f3ee;color:#292928}}</style>`;
const document = (title, head, content) => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title>${head}${style}</head><body>${content}</body></html>`;
const preview = v => `<figure><div><img class="light" src="${base}/${v.key}/icon.png" alt="${v.title}の白背景プレビュー">白背景での原画</div><div><img class="dark" src="${base}/${v.key}/icon.png" alt="${v.title}の黒背景プレビュー">黒背景での原画</div></figure>`;
const card = v => `<article><h2>${v.title}</h2><p>${v.description}</p>${preview(v)}<a class="button" href="${base}/${v.key}/">${v.key.toUpperCase()}を追加するページへ</a></article>`;
await mkdir(`dist${base}`, { recursive: true });
await writeFile(`dist${base}/index.html`, document('ライト背景の比較', '', `<h1>ライト背景の比較</h1><p>まずAとBをホーム画面に追加し、ライト表示で背景を比べてください。</p><p>現在のアプリは残したままで大丈夫です。</p>${variants.slice(0, 2).map(card).join('')}<details><summary>Aが白・Bが黒だった場合</summary><p>CとDも追加して、白背景になるものがあるか確認してください。</p>${variants.slice(2).map(card).join('')}</details><small>ここに表示する原画プレビューは、iPhoneによる加工を再現したものではありません。</small>`));
for (const v of variants) {
  const scope = `${base}/${v.key}/`;
  const folder = `dist${scope}`;
  await mkdir(folder, { recursive: true });
  await writeFile(`${folder}icon.png`, v.image);
  await writeFile(`${folder}manifest.webmanifest`, JSON.stringify({ id: scope, name: v.name, short_name: v.name, start_url: scope, scope, display: 'standalone', background_color: '#FFFFFF', theme_color: '#FFFFFF', icons: [{ src: `${scope}icon.png`, sizes: '180x180', type: 'image/png', purpose: 'any' }] }, null, 2));
  const head = `<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="${v.name}"><link rel="apple-touch-icon" sizes="180x180" href="${scope}icon.png"><link rel="icon" type="image/png" href="${scope}icon.png"><link rel="manifest" href="${scope}manifest.webmanifest">`;
  await writeFile(`${folder}index.html`, document(v.name, head, `<h1>${v.title}</h1><p>${v.description}</p><article>${preview(v)}<ol><li>Safariの共有メニューから「ホーム画面に追加」。</li><li>名前を「${v.name}」のまま追加。</li><li>ホーム画面をライト表示にして、背景が白くなるか確認。</li></ol></article><p>この比較アイコンは家計データを扱いません。</p><a class="back" href="${base}/">比較一覧に戻る</a>`));
}
console.log(`Prepared isolated icon comparison at ${base}/ (served only in staging)`);
