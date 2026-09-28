import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @ts-expect-error Build-only Node module, shared with release tests.
import { appVersion } from './scripts/app-version.mjs';

const release = appVersion(new URL('.', import.meta.url).pathname);
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(release.version),
    'import.meta.env.VITE_APP_BUILD': JSON.stringify(release.build),
  },
  plugins: [react(), {
    name: 'app-version',
    generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify(release) }); },
    configureServer(server) {
      server.middlewares.use('/version.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(release));
      });
    },
  }],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
});
