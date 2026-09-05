import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PRACTICE_DATABASE_VERSION } from "../js/practiceLab/practiceConstants.js";

test("all PL6 runtime corpus modules import with zero storage/network/listener/timer side effects", async () => {
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
    const modules = [
      "practiceCorpusConstants", "practiceCorpusValidation", "practiceCorpusPartition",
      "practiceCorpusProvenance", "practiceCorpusRegistry", "practiceCorpusUseGuard",
    ];
    for (const name of modules) await import(new URL(`../js/practiceLab/${name}.js?pl6=${name}`, import.meta.url));
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

test("Practice corpus architecture stays isolated while later PL13 advances IndexedDB to v3", async () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 3);
  const practiceRoot = new URL("../js/practiceLab/", import.meta.url);
  const runtimeNames = (await readdir(practiceRoot)).filter((name) => /^practiceCorpus.*\.js$/.test(name));
  const runtime = (await Promise.all(runtimeNames.map((name) => readFile(new URL(name, practiceRoot), "utf8")))).join("\n");
  const build = [
    await readFile(new URL("../scripts/buildPracticeCorpus.mjs", import.meta.url), "utf8"),
    await readFile(new URL("../scripts/lib/practiceCorpusBuildCore.mjs", import.meta.url), "utf8"),
  ].join("\n");
  for (const source of [runtime, build]) {
    assert.doesNotMatch(source, /from\s+["'][^"']*commonGameplayWords\.json/i);
    assert.doesNotMatch(source, /from\s+["'][^"']*english200\.json/i);
    assert.doesNotMatch(source, /from\s+["'][^"']*(gameplayVocabulary|buildCommonGameplay|google.?10k)/i);
  }
  assert.doesNotMatch(runtime, /indexedDB\.open|localStorage\.|\bfetch\s*\(|addEventListener\s*\(|setInterval\s*\(|setTimeout\s*\(/);
});
