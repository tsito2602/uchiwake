import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const module = await build({entryPoints:['src/brand-motion.ts'], bundle:true, platform:'node', format:'esm', write:false});
const { pathData, BRAND_THEMES, FIRST_STROKE_OFFSET_Y } = await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`);
// Follow the four chart pieces' outer/inner curves and bridge their three gaps.
// One backing shape makes a continuous rim with solid white dividers.
const chartOutline = 'M 320 517 Q 531 293 796 415 L 817 430 C 944 504 997 657 929 808 L 922 835 Q 849 980 654 1024 L 628 1027 Q 457 1032 363 904 C 326 854 367 777 417 802 Q 489 836 581 827 L 605 821 Q 689 792 732 727 L 742 702 Q 764 635 712 584 L 693 567 Q 541 488 381 611 C 324 644 273 580 312 530 Z';
function svg(theme, logo = false) {
  // Home-screen artwork stays dark with a deliberate white edge in both themes.
  // In-app logos keep their own light/dark palettes, with no edge.
  const colors = BRAND_THEMES[logo ? theme : 'light'];
  // Preserve the gap between strokes after thickening both white rims.
  const headOffset = ` transform="translate(0 ${FIRST_STROKE_OFFSET_Y})"`;
  const paths = pathData.map((d, i) => { const part = i === 2 ? 'mid' : i === 3 ? 'pale' : 'ink'; return `<path class="${part}" fill="${colors[part]}" d="${d}"${i === 0 ? headOffset : ''}/>`; }).join('');
  // Visible half-stroke = 25 source units, matching the chart's ~25-unit dividers.
  // ~4.09px at 180px; applies equally to the outer/inner rim and first stroke.
  const edge = `<g data-appearance="edge" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="50" stroke-linejoin="round"><path d="${pathData[0]}"${headOffset}/><path d="${chartOutline}"/></g>`;
  const artwork = logo ? paths : `<g transform="translate(627 627) scale(1.14) translate(-627 -627)">${edge}${paths}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo ? '-248 -240 1750 1385' : '0 0 1254 1254'}" role="img" aria-label="uchiwake">${artwork}</svg>\n`;
}
// Match Kondo's explicit Apple Touch Icon: transparent RGBA, no tile baked in.
// A versioned URL separates this asset from previously installed icon candidates.
const touchSource = svg('light');
for (const size of [180, 192, 512]) {
  const png = await sharp(Buffer.from(touchSource), { density: 384 })
    .resize(size, size).png({ compressionLevel: 9, palette: false }).toBuffer();
  await writeFile(size === 180 ? 'public/apple-touch-icon-v8.png' : `public/icon-v8-${size}.png`, png);
  if (size === 180) await writeFile('public/apple-touch-icon.png', png);
}
for (const theme of ['light', 'dark']) {
  await writeFile(`public/icon-${theme}.svg`, svg(theme));
  await writeFile(`public/logo-${theme}.svg`, svg(theme, true));
  const icons = [192, 512].map(size => ({src:`/icon-v8-${size}.png`, sizes:`${size}x${size}`, type:'image/png', purpose:'any'}));
  icons.push({src:'/icon.svg', sizes:'any', type:'image/svg+xml', purpose:'maskable'});
  // Every home-screen candidate is transparent and theme-independent, like Kondo.
  // Manifest colors describe the app shell, not a PNG/SVG background layer.
  const manifest = {id:'/', name:'uchiwake', short_name:'uchiwake', start_url:'/', scope:'/', display:'standalone', background_color:'#FFFFFF', theme_color:'#FFFFFF', icons};
  await writeFile(`public/manifest-${theme}.webmanifest`, JSON.stringify(manifest, null, 2)+'\n');
  if (theme === 'light') {
    await writeFile('public/manifest.webmanifest', JSON.stringify(manifest, null, 2)+'\n');
    // Preserve the old manifest URL and installed app identity.
    await writeFile('public/manifest-v4.webmanifest', JSON.stringify(manifest, null, 2)+'\n');
  }
}
await writeFile('public/icon.svg', svg('light'));
await build({entryPoints:['src/boot.ts'], outfile:'public/boot.js', bundle:true, minify:true, format:'iife', target:'es2022'});
