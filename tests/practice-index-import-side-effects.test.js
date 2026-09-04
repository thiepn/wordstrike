import test from "node:test";
import assert from "node:assert/strict";

test("all PL7 runtime modules import and loader construction have zero storage/network/listener/timer side effects", async () => {
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
    const names = [
      "practiceTextSegmentation", "practiceTextAnalysis", "practiceIndexConstants", "practiceIndexSharding",
      "practiceIndexAssembler", "practiceIndexValidation", "practiceIndexLoader", "practiceTargetIndex", "practiceIndexRegistry",
    ];
    const modules = [];
    for (const name of names) modules.push(await import(new URL(`../js/practiceLab/${name}.js?pl7=${name}`, import.meta.url)));
    const loaderModule = modules[names.indexOf("practiceIndexLoader")];
    loaderModule.createPracticeIndexLoader({ fetchImpl: async () => { calls.fetch += 1; return { ok: false, status: 404, async text() { return ""; } }; }, hashText: async () => "sha256-" + "0".repeat(64) });
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

import { readFile, readdir } from "node:fs/promises";

test("PL7 static index runtime/build code stays isolated from gameplay/ranked vocabularies and user repositories", async () => {
  const practiceRoot = new URL("../js/practiceLab/", import.meta.url);
  const names = (await readdir(practiceRoot)).filter((name) => /^(practiceText|practiceIndex|practiceTargetIndex)/.test(name) && name.endsWith(".js"));
  const runtime = (await Promise.all(names.map((name) => readFile(new URL(name, practiceRoot), "utf8")))).join("\n");
  const build = [
    await readFile(new URL("../scripts/buildPracticeIndexes.mjs", import.meta.url), "utf8"),
    await readFile(new URL("../scripts/lib/practiceIndexBuildCore.mjs", import.meta.url), "utf8"),
  ].join("\n");
  for (const source of [runtime, build]) {
    assert.doesNotMatch(source, /commonGameplayWords\.json|english200\.json|buildCommonGameplay|google.?10k/i);
    assert.doesNotMatch(source, /practiceRepository|practiceIndexedDbStore|practiceManifestStore|practiceMemoryStore/);
  }
});
