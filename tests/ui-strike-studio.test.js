import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { warmStudioAssets, mountStrikeStudio, enhanceStudioScreen } from '../js/strikeStudioPresentation.js';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('identity assets load after the released screen styles, once each', () => {
  const html = read('index.html');
  assert.equal((html.match(/href="styles\/strike-studio.css\?v=20260917a"/g) || []).length, 1);
  assert.equal((html.match(/src="js\/strikeStudioPresentation.js\?v=20260917a"/g) || []).length, 1);
  assert.ok(html.indexOf('styles/strike-studio.css') > html.indexOf('practiceLabV31.css'));
});
test('presentation does not subscribe to input, animation frames, or subtree changes', () => {
  const source = read('js/strikeStudioPresentation.js');
  assert.match(source, /observer\.observe\(root, \{ childList: true \}\)/);
  assert.doesNotMatch(source, /subtree:\s*true|requestAnimationFrame\(|setInterval\(|addEventListener\(['"](?:input|beforeinput|keydown)/);
  assert.equal(mountStrikeStudio(null), null);
  assert.equal(enhanceStudioScreen(null), false);
});
test('every released mode has authored artwork rather than a generic placeholder', () => {
  const source = read('js/strikeStudioPresentation.js');
  for (const label of ['DEFEND THE CORE','FIND YOUR TEMPO','OUTLAST THE PRESSURE','STAY IN THE FLOW','BUILD YOUR EDGE']) assert.ok(source.includes(label));
});
test('appearance and reduced-motion preferences retain explicit support', () => {
  const css = read('styles/strike-studio.css');
  assert.match(css, /var\(--color-accent\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /forced-colors: active/);
  assert.match(css, /\.flow-char \{ text-shadow: none; transition: none;/);
});
test('PWA warmup caches versioned assets only when missing and is repeatable', async () => {
  const hits = new Set(); let adds = 0; let opened;
  const storage = {open: async name => { opened = name; return {match: async url => hits.has(url), addAll: async urls => {adds++;urls.forEach(url=>hits.add(url));}};}};
  const moduleUrl = 'https://example.test/wordstrike/js/strikeStudioPresentation.js?v=20260917a';
  assert.equal(await warmStudioAssets(storage,moduleUrl),true);
  assert.equal(await warmStudioAssets(storage,moduleUrl),true);
  assert.equal(opened,'wordstrike-ui-studio-20260917a'); assert.equal(adds,1); assert.equal(hits.size,2);
  assert.ok(hits.has('https://example.test/wordstrike/styles/strike-studio.css?v=20260917a'));
});
test('offline/quota/blocked cache failure cannot interrupt the game', async () => {
  assert.equal(await warmStudioAssets(null), false);
  assert.equal(await warmStudioAssets({open: async () => {throw Error('blocked');}}, 'https://example.test/js/a.js'), false);
});
