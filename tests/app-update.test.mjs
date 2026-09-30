import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import app from '../dist/worker.mjs';
const release = JSON.parse(await readFile('dist/version.json','utf8'));
const compiled = await build({entryPoints:['src/app-update.ts'],bundle:true,platform:'node',format:'esm',write:false,
  define:{'import.meta.env.VITE_APP_VERSION':JSON.stringify(release.version),'import.meta.env.VITE_APP_BUILD':JSON.stringify(release.build)}});
const {checkAppUpdate,currentVersion}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
test('the deployed release manifest is public, uncached, and matches the running bundle',async()=>{
  const response=await app.fetch(new Request('https://example.test/version.json'),{});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/application\/json/);
  assert.match(response.headers.get('cache-control'),/no-store/);
  assert.deepEqual(await response.json(),currentVersion);
  const html=await readFile('dist/index.html','utf8');
  const path=html.match(/src="(\/assets\/[^\"]+\.js)"/)[1];
  assert.ok((await readFile(`dist${path}`,'utf8')).includes(release.build));
});
test('checking detects new builds even when the displayed version is unchanged',async()=>{
  const original=globalThis.fetch;
  try {
    let response=currentVersion;
    globalThis.fetch=async(url,options)=>{assert.equal(url,'/version.json');assert.equal(options.cache,'no-store');return Response.json(response);};
    assert.equal(await checkAppUpdate(currentVersion),null);
    response={...currentVersion,build:'fedcba9876543210'};
    assert.deepEqual(await checkAppUpdate(currentVersion),response);
  } finally {globalThis.fetch=original;}
});
test('network and invalid manifests never claim the app is up to date',async()=>{
  const original=globalThis.fetch;
  try {
    for(const reply of [()=>new Response('Offline',{status:503}),()=>Response.json({version:'0.1.1'}),()=>Response.json({version:'bad',build:'not-a-build'}),()=>{throw new Error('offline');}]) {
      globalThis.fetch=async()=>reply();
      await assert.rejects(checkAppUpdate(currentVersion));
    }
  } finally {globalThis.fetch=original;}
});
