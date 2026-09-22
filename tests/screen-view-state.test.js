import assert from 'node:assert/strict';
import test from 'node:test';

async function fixture(name) {
  const frames = [], listeners = new Map();
  const previous = Object.fromEntries(['document', 'requestAnimationFrame', 'scrollX', 'scrollY', 'scrollTo'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.document = { addEventListener: (name, callback) => listeners.set(name, callback) };
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  globalThis.scrollX = 0; globalThis.scrollY = 500;
  globalThis.scrollTo = (x, y) => { globalThis.scrollX = x; globalThis.scrollY = y; };
  const detail = { id: 'help', open: false };
  const root = {
    scrollLeft: 0, scrollTop: 0, ownerDocument: { activeElement: null },
    contains: () => false,
    querySelectorAll: selector => selector === 'details' ? [detail] : [],
    querySelector: selector => selector === '#help' ? detail : null,
  };
  const view = await import(`../js/screenViewState.js?test=${name}`);
  return { ...view, root, detail, frames, listeners, cleanup() {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  } };
}

test('coalesced page replacements retain the pre-render position and closed details', async () => {
  const f = await fixture('coalesced');
  try {
    const first = f.captureScreenView(f.root);
    globalThis.scrollY = 0; f.detail.open = true; // Default intermediate markup.
    f.restoreScreenView(f.root, first);
    const second = f.captureScreenView(f.root);
    assert.equal(second.page[1], 500, 'Never capture a temporary zero-height layout');
    f.restoreScreenView(f.root, second);
    f.frames.forEach(callback => callback());
    assert.equal(globalThis.scrollY, 500);
    assert.equal(f.detail.open, false);
    globalThis.scrollY = 250;
    assert.equal(f.captureScreenView(f.root).page[1], 250, 'Completed restorations cannot pin later scrolling');
  } finally { f.cleanup(); }
});

test('a new user scroll cancels the pending restoration', async () => {
  const f = await fixture('interaction');
  try {
    f.restoreScreenView(f.root, f.captureScreenView(f.root));
    f.listeners.get('wheel')(); globalThis.scrollY = 150;
    f.frames.forEach(callback => callback());
    assert.equal(globalThis.scrollY, 150);
    assert.equal(f.captureScreenView(f.root).page[1], 150);
  } finally { f.cleanup(); }
});

test('navigation cancels an old screen restoration', async () => {
  const f = await fixture('navigation');
  try {
    f.restoreScreenView(f.root, f.captureScreenView(f.root));
    f.restoreScreenView(f.root, null); globalThis.scrollY = 0;
    f.frames.forEach(callback => callback());
    assert.equal(globalThis.scrollY, 0);
  } finally { f.cleanup(); }
});
