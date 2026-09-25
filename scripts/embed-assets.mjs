import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const out = new URL('../worker/generated-assets.ts', import.meta.url).pathname;
const files = [];
async function collect(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (entry.isFile()) files.push(path);
  }
}
await collect(root);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json' };
const map = {};
for (const path of files) {
  const ext = extname(path);
  if (!types[ext]) throw new Error(`Unsupported asset: ${path}`);
  map['/'+relative(root,path).replaceAll('\\','/')] = {body:await readFile(path,'utf8'),mime:types[ext]};
}
await writeFile(out, `// Generated from dist by scripts/embed-assets.mjs.\nexport const embeddedAssets: Record<string, { body: string; mime: string }> = ${JSON.stringify(map)};\n`);
console.log(`Embedded ${files.length} assets for authenticated cloud deployment`);
