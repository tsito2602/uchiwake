import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const module = await build({entryPoints:['src/brand-motion.ts'], bundle:true, platform:'node', format:'esm', write:false});
const { pathData, BRAND_THEMES } = await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`);
function svg(theme, adaptive = false, logo = false, maskable = false) {
  const colors = BRAND_THEMES[theme];
  const dark = BRAND_THEMES.dark;
  const style = adaptive ? `<style>@media(prefers-color-scheme:dark){.ink{fill:${dark.ink}}.mid{fill:${dark.mid}}.pale{fill:${dark.pale}}}</style>` : '';
  // Export the vector directly onto alpha, never cut a mark out of a white plate.
  // Home-screen mark is 14% larger; maskable keeps the original safe-circle size.
  const transform = logo || maskable ? '' : ' transform="translate(627 627) scale(1.14) translate(-627 -627)"';
  const paths = pathData.map((d, i) => { const part = i === 2 ? 'mid' : i === 3 ? 'pale' : 'ink'; return `<path class="${part}" fill="${colors[part]}" d="${d}"/>`; }).join('');
  // Match Kondo: every installation candidate, including maskable, keeps alpha.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo ? '-248 -240 1750 1385' : '0 0 1254 1254'}" role="img" aria-label="uchiwake">${style}${logo ? paths : `<g${transform}>${paths}</g>`}</svg>\n`;
}
await mkdir('public/brand-icons', {recursive:true});
const png = (source, size, path) => sharp(Buffer.from(source), {density:384})
  .resize(size, size).png({compressionLevel:9, palette:false}).toFile(path);
for (const theme of ['light', 'dark']) {
  await writeFile(`public/icon-${theme}.svg`, svg(theme));
  await writeFile(`public/logo-${theme}.svg`, svg(theme, false, true));
}
// Kondo assets/brand/README.md: one unchanged transparent image in both
// appearances. Only the in-app logo changes color; iOS handles the home tile.
const icons = [];
for (const size of [192, 512]) {
  const src = `/brand-icons/uchiwake-v4-${size}.png`;
  await png(svg('light'), size, `public${src}`);
  icons.push({src, sizes:`${size}x${size}`, type:'image/png', purpose:'any'});
}
await png(svg('light'), 180, 'public/brand-icons/apple-touch-v4.png');
const maskSrc = '/brand-icons/uchiwake-v4-maskable-512.png';
await png(svg('light', false, false, true), 512, `public${maskSrc}`);
icons.push({src:maskSrc, sizes:'512x512', type:'image/png', purpose:'maskable'});
const manifest = {id:'/', name:'uchiwake', short_name:'uchiwake', lang:'ja', start_url:'/', scope:'/', display:'standalone', background_color:'#FFFFFF', theme_color:'#FFFFFF', icons};
// Keep old manifest URLs coherent for existing installations, too.
for (const name of ['manifest-v4', 'manifest', 'manifest-light', 'manifest-dark']) {
  await writeFile(`public/${name}.webmanifest`, JSON.stringify(manifest, null, 2)+'\n');
}
await writeFile('public/icon.svg', svg('light', true));
await build({entryPoints:['src/boot.ts'], outfile:'public/boot.js', bundle:true, minify:true, format:'iife', target:'es2022'});
