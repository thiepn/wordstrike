import test from "node:test";
import assert from "node:assert/strict";

const MODULES = [
  "practiceCommonWordsConstants",
  "practiceCommonWordsPolicy",
  "practiceCommonWordReference",
  "practiceCommonWordsSelection",
  "practiceCommonWordCheckPlan",
  "practiceCommonWordBreadth",
  "practiceCommonWordBreadthComparison",
  "practiceCommonWordBandAccumulator",
  "practiceCommonWordsAnalyzer",
  "practiceCommonWordsPlan",
  "practiceCommonWordsExperiment",
  "practiceCommonWordsRuntime",
];

test("PL28 pure/runtime module imports perform zero storage, fetch, timer, or listener side effects", async () => {
  const calls = { localStorage: 0, indexedDb: 0, fetch: 0, timers: 0, listeners: 0 };
  const original = {
    localStorage: globalThis.localStorage,
    indexedDB: globalThis.indexedDB,
    fetch: globalThis.fetch,
    document: globalThis.document,
    window: globalThis.window,
    setTimeout: globalThis.setTimeout,
    setInterval: globalThis.setInterval,
  };
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: {
      getItem() { calls.localStorage += 1; return null; },
      setItem() { calls.localStorage += 1; },
      removeItem() { calls.localStorage += 1; },
    } },
    indexedDB: { configurable: true, value: { open() { calls.indexedDb += 1; throw new Error("unexpected IndexedDB open during PL28 import"); } } },
    fetch: { configurable: true, writable: true, value: async () => { calls.fetch += 1; throw new Error("unexpected fetch during PL28 import"); } },
    document: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    window: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    setTimeout: { configurable: true, writable: true, value: (...args) => { calls.timers += 1; return original.setTimeout(...args); } },
    setInterval: { configurable: true, writable: true, value: (...args) => { calls.timers += 1; return original.setInterval(...args); } },
  });
  try {
    for (const name of MODULES) await import(new URL(`../js/practiceLab/${name}.js?pl28-import-audit=${name}`, import.meta.url));
    assert.deepEqual(calls, { localStorage: 0, indexedDb: 0, fetch: 0, timers: 0, listeners: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});
