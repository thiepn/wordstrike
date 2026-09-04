import test from "node:test";
import assert from "node:assert/strict";

test("PL8 foundation modules import with zero storage/network/listener/timer side effects", async () => {
  const calls = { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 };
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
    localStorage: { configurable: true, value: { getItem() { calls.storage += 1; }, setItem() { calls.storage += 1; }, removeItem() { calls.storage += 1; } } },
    indexedDB: { configurable: true, value: { open() { calls.indexedDb += 1; throw new Error("unexpected IndexedDB open"); } } },
    fetch: { configurable: true, value: async () => { calls.fetch += 1; throw new Error("unexpected fetch"); } },
    document: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    window: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    setTimeout: { configurable: true, value: (...args) => { calls.timers += 1; return original.setTimeout(...args); } },
    setInterval: { configurable: true, value: (...args) => { calls.timers += 1; return original.setInterval(...args); } },
  });
  try {
    await import(new URL("../js/practiceLab/practiceRobustStats.js?pl8=stats", import.meta.url));
    await import(new URL("../js/practiceLab/practiceLatencyClassifier.js?pl8=classifier", import.meta.url));
    await import(new URL("../js/practiceLab/practiceFoundationAnalysis.js?pl8=foundation", import.meta.url));
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});
