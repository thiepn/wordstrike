import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { warmStudioAssets, mountStrikeStudio, enhanceStudioScreen } from '../js/strikeStudioPresentation.js';
const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('identity assets load after the released screen styles, once each', () => {
  const html = read('index.html');
  assert.equal((html.match(/href="styles\/strike-studio.css\?v=20260918a"/g) || []).length, 1);
  assert.equal((html.match(/src="js\/strikeStudioPresentation.js\?v=20260918a"/g) || []).length, 1);
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
  const moduleUrl = 'https://example.test/wordstrike/js/strikeStudioPresentation.js?v=20260918a';
  assert.equal(await warmStudioAssets(storage,moduleUrl),true);
  assert.equal(await warmStudioAssets(storage,moduleUrl),true);
  assert.equal(opened,'wordstrike-ui-studio-20260918a'); assert.equal(adds,1); assert.equal(hits.size,2);
  assert.ok(hits.has('https://example.test/wordstrike/styles/strike-studio.css?v=20260918a'));
});
test('offline/quota/blocked cache failure cannot interrupt the game', async () => {
  assert.equal(await warmStudioAssets(null), false);
  assert.equal(await warmStudioAssets({open: async () => {throw Error('blocked');}}, 'https://example.test/js/a.js'), false);
});

test('every new UI asset is explicitly available in the shared offline shell', () => {
  const sw = read('sw.js');
  for (const asset of ['js/strikeStudioPresentation.js','styles/strike-studio.css']) {
    assert.ok(sw.includes(`"./${asset}"`));
    assert.ok(sw.includes(`"./${asset}?v=20260918a"`));
  }
});

test('setup preview matches real plans for all lengths, modifiers and adaptive practice', async () => {
  const { getFlowSetupPreview } = await import('../js/flow/flowUiPhase7Polish.js');
  const { createFlowRunPlan } = await import('../js/flow/flowRunPlan.js');
  for (const [sessionLength, count] of [['quick',1],['standard',3],['long',5]]) {
    const draft = {sessionLength,category:'mixed',difficulty:'natural'};
    const plan = createFlowRunPlan({...draft,seed:'preview-contract'});
    const before = JSON.stringify(plan);
    const preview = getFlowSetupPreview(draft,plan);
    assert.equal(preview.sectionCount,count);
    assert.equal(preview.wordCount,plan.wordCount);
    assert.equal(preview.coherent,true);
    assert.equal(preview.targetMinutes,plan.targetMinutes);
    for (const modifiers of [[],['sprint'],['no-backspace']]) {
      const expected = createFlowRunPlan({...draft,seed:plan.seed,modifiers});
      const actual = getFlowSetupPreview(draft,plan,modifiers);
      assert.equal(actual.sectionCount,expected.passageCount);
      assert.equal(actual.wordCount,expected.wordCount);
      assert.equal(actual.targetMinutes,expected.targetMinutes);
    }
    assert.equal(JSON.stringify(plan),before,'preview never mutates the run');
    const adaptive = createFlowRunPlan({...draft,seed:plan.seed,adaptiveProfile:{weaknesses:[{key:'commas',severity:70}]}});
    assert.equal(getFlowSetupPreview(draft,adaptive).wordCount,adaptive.wordCount);
  }
});

test('setup summary no longer listens to character/HUD subtree mutations', () => {
  const source = read('js/flow/flowUiPhase7Polish.js');
  assert.doesNotMatch(source,/subtree:\s*true/);
  assert.match(source,/setupControl\(event.target\) &&/);
  assert.doesNotMatch(source,/passages: 12|passages: 24/);
});
