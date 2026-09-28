import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const module = await build({entryPoints:['src/brand-motion.ts'], bundle:true, platform:'node', format:'esm', write:false});
const { pathData, BRAND_THEMES } = await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`);
function svg(theme, adaptive = false, logo = false) {
  // Home-screen artwork stays dark with a deliberate white edge in both themes.
  // In-app logos keep their own light/dark palettes, with no edge.
  const colors = BRAND_THEMES[logo ? theme : 'light'];
  const dark = BRAND_THEMES.dark;
  const style = adaptive ? `<style>@media(prefers-color-scheme:dark){.background{fill:${dark.background}}}</style>` : '';
  const paths = pathData.map((d, i) => { const part = i === 2 ? 'mid' : i === 3 ? 'pale' : 'ink'; return `<path class="${part}" fill="${colors[part]}" d="${d}"/>`; }).join('');
  const background = logo ? '' : `<rect class="background" width="1254" height="1254" rx="250" fill="${BRAND_THEMES[theme].background}"/>`;
  // Kondo's edge is ~1.4px per side at 180px; ours is ~1.47px after scaling.
  const edge = `<g data-appearance="edge" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="18" stroke-linejoin="round">${pathData.map(d => `<path d="${d}"/>`).join('')}</g>`;
  const artwork = logo ? paths : `<g transform="translate(627 627) scale(1.14) translate(-627 -627)">${edge}${paths}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo ? '-248 -240 1750 1385' : '0 0 1254 1254'}" role="img" aria-label="uchiwake">${style}${background}${artwork}</svg>\n`;
}
// Match Kondo's explicit Apple Touch Icon: transparent RGBA, no tile baked in.
// A versioned URL separates this asset from previously installed icon candidates.
const touchSource = svg('light').replace(/<rect\b[^>]*\/>/, '');
for (const size of [180, 192, 512]) {
  const png = await sharp(Buffer.from(touchSource), { density: 384 })
    .resize(size, size).png({ compressionLevel: 9, palette: false }).toBuffer();
  await writeFile(size === 180 ? 'public/apple-touch-icon-v5.png' : `public/icon-v5-${size}.png`, png);
  if (size === 180) await writeFile('public/apple-touch-icon.png', png);
}
for (const theme of ['light', 'dark']) {
  await writeFile(`public/icon-${theme}.svg`, svg(theme));
  await writeFile(`public/logo-${theme}.svg`, svg(theme, false, true));
  const icons = [192, 512].map(size => ({src:`/icon-v5-${size}.png`, sizes:`${size}x${size}`, type:'image/png', purpose:'any'}));
  icons.push({src:`/icon-${theme}.svg`, sizes:'any', type:'image/svg+xml', purpose:'maskable'});
  const manifest = {id:'/', name:'uchiwake', short_name:'uchiwake', start_url:'/', scope:'/', display:'standalone', background_color:BRAND_THEMES[theme].background, theme_color:BRAND_THEMES[theme].background, icons};
  await writeFile(`public/manifest-${theme}.webmanifest`, JSON.stringify(manifest, null, 2)+'\n');
  if (theme === 'light') {
    await writeFile('public/manifest.webmanifest', JSON.stringify(manifest, null, 2)+'\n');
    // Preserve the old manifest URL and installed app identity.
    await writeFile('public/manifest-v4.webmanifest', JSON.stringify(manifest, null, 2)+'\n');
  }
}
await writeFile('public/icon.svg', svg('light', true));
await build({entryPoints:['src/boot.ts'], outfile:'public/boot.js', bundle:true, minify:true, format:'iife', target:'es2022'});
