import assert from "node:assert/strict";
import { test } from "node:test";

test("PL10 normalization modules import with zero storage/network/listener/timer side effects", async () => {
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
    for (const module of [
      "practiceNormalizationConstants.js",
      "practiceKeyboardGeometry.js",
      "practiceReferenceFrequency.js",
      "practiceTextDifficultyFeatures.js",
      "practiceTypabilityModel.js",
      "practiceContextFeatures.js",
      "practiceContextNormalizer.js",
      "practiceNormalizationValidation.js",
      "practiceTypabilityRuntime.js",
      "practiceNormalizationAnalysis.js",
    ]) {
      await import(new URL(`../js/practiceLab/${module}?pl10=${encodeURIComponent(module)}`, import.meta.url));
    }
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});
