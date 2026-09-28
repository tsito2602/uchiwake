import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const init = await readFile('public/theme-init.js', 'utf8');
function browser({ saved = null, dark = false, blocked = false } = {}) {
  const events = new Map();
  const root = { dataset: {}, style: {} };
  const meta = { setAttribute(_, value) { this.content = value; } };
  const media = { matches: dark, addEventListener(_, fn) { this.change = fn; } };
  const window = { addEventListener: (name, fn) => events.set(name, fn), dispatchEvent: event => events.get(event.type)?.(event) };
  const context = { window, Event, document: { documentElement: root, getElementById: () => meta }, matchMedia: () => media,
    localStorage: { getItem() { if (blocked) throw new Error('Storage blocked'); return saved; } } };
  vm.runInNewContext(init, context);
  return { root, meta, os(value) { media.matches = value; media.change(); }, storage(value, key = 'uchiwake-theme') { events.get('storage')({ key, newValue: value }); } };
}
test('saved appearance applies before app load and overrides the device', () => {
  for (const preference of ['light','dark']) {
    const app = browser({ saved: preference, dark: preference === 'light' });
    assert.equal(app.root.dataset.brandTheme, preference);
    app.os(preference !== 'light');
    assert.equal(app.root.dataset.brandTheme, preference);
    assert.equal(app.meta.content, preference === 'dark' ? '#000000' : '#ffffff');
  }
});
test('automatic appearance follows OS changes, including invalid or unavailable storage', () => {
  for (const options of [{}, {saved:'invalid'}, {blocked:true}]) {
    const app = browser(options);
    assert.equal(app.root.dataset.themePreference,'system');
    app.os(true);assert.equal(app.root.dataset.brandTheme,'dark');
    app.os(false);assert.equal(app.root.dataset.brandTheme,'light');
  }
});
test('other tabs update the theme and clearing preferences restores automatic mode', () => {
  const app = browser({saved:'light',dark:true});
  app.storage('dark');assert.equal(app.root.dataset.brandTheme,'dark');
  app.storage('light','unrelated');assert.equal(app.root.dataset.brandTheme,'dark');
  app.storage(null,null);assert.equal(app.root.dataset.themePreference,'system');
  assert.equal(app.meta.content,'#000000');
});
