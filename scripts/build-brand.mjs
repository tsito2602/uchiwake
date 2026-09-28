import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';

const module = await build({entryPoints:['src/brand-motion.ts'], bundle:true, platform:'node', format:'esm', write:false});
const { pathData, BRAND_THEMES } = await import(`data:text/javascript;base64,${Buffer.from(module.outputFiles[0].text).toString('base64')}`);
function svg(theme, adaptive = false, logo = false) {
  const colors = BRAND_THEMES[theme];
  const dark = BRAND_THEMES.dark;
  const style = adaptive ? `<style>@media(prefers-color-scheme:dark){.background{fill:${dark.background}}.ink{fill:${dark.ink}}.mid{fill:${dark.mid}}.pale{fill:${dark.pale}}}</style>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${logo ? '-248 -240 1750 1385' : '0 0 1254 1254'}" role="img" aria-label="uchiwake">${style}${logo ? '' : `<rect class="background" width="1254" height="1254" rx="250" fill="${colors.background}"/>`}${pathData.map((d, i) => { const part = i === 2 ? 'mid' : i === 3 ? 'pale' : 'ink'; return `<path class="${part}" fill="${colors[part]}" d="${d}"/>`; }).join('')}</svg>\n`;
}
for (const theme of ['light', 'dark']) {
  await writeFile(`public/icon-${theme}.svg`, svg(theme));
  await writeFile(`public/logo-${theme}.svg`, svg(theme, false, true));
  const manifest = {id:'/', name:'uchiwake', short_name:'uchiwake', start_url:'/', scope:'/', display:'standalone', background_color:BRAND_THEMES[theme].background, theme_color:BRAND_THEMES[theme].background, icons:[{src:`/icon-${theme}.svg`, sizes:'any', type:'image/svg+xml', purpose:'any maskable'}]};
  await writeFile(`public/manifest-${theme}.webmanifest`, JSON.stringify(manifest, null, 2)+'\n');
  if (theme === 'light') await writeFile('public/manifest.webmanifest', JSON.stringify(manifest, null, 2)+'\n');
}
await writeFile('public/icon.svg', svg('light', true));
await build({entryPoints:['src/boot.ts'], outfile:'public/boot.js', bundle:true, minify:true, format:'iife', target:'es2022'});
