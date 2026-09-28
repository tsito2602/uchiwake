import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';

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
  // Separate edge layer, as in Kondo. At 180px the one-sided edge is about 1px.
  const edge = `<g data-appearance="edge" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="12" stroke-linejoin="round">${pathData.map(d => `<path d="${d}"/>`).join('')}</g>`;
  const artwork = logo ? paths : `<g transform="translate(627 627) scale(1.14) translate(-627 -627)">${edge}${paths}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo ? '-248 -240 1750 1385' : '0 0 1254 1254'}" role="img" aria-label="uchiwake">${style}${background}${artwork}</svg>\n`;
}
for (const theme of ['light', 'dark']) {
  await writeFile(`public/icon-${theme}.svg`, svg(theme));
  await writeFile(`public/logo-${theme}.svg`, svg(theme, false, true));
  const manifest = {id:'/', name:'uchiwake', short_name:'uchiwake', start_url:'/', scope:'/', display:'standalone', background_color:BRAND_THEMES[theme].background, theme_color:BRAND_THEMES[theme].background, icons:[{src:`/icon-${theme}.svg`, sizes:'any', type:'image/svg+xml', purpose:'any maskable'}]};
  await writeFile(`public/manifest-${theme}.webmanifest`, JSON.stringify(manifest, null, 2)+'\n');
  if (theme === 'light') {
    await writeFile('public/manifest.webmanifest', JSON.stringify(manifest, null, 2)+'\n');
    // Existing v4 installs also receive the restored SVG candidates.
    await writeFile('public/manifest-v4.webmanifest', JSON.stringify(manifest, null, 2)+'\n');
  }
}
await writeFile('public/icon.svg', svg('light', true));
await build({entryPoints:['src/boot.ts'], outfile:'public/boot.js', bundle:true, minify:true, format:'iife', target:'es2022'});
