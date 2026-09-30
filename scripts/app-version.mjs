import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function appVersion(root) {
  const files = ['index.html', 'package.json', 'package-lock.json', 'vite.config.ts'];
  function collect(dir) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) collect(path);
      else if (!['worker/generated-assets.ts', 'public/boot.js', 'public/theme-init.js'].includes(path)) files.push(path);
    }
  }
  for (const dir of ['src', 'worker', 'public', 'scripts']) collect(dir);
  const hash = createHash('sha256');
  for (const file of files.sort()) hash.update(file).update('\0').update(readFileSync(join(root, file))).update('\0');
  return { version: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version, build: hash.digest('hex').slice(0, 16) };
}
