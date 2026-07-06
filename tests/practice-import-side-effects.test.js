import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

test("isolated Practice imports do not touch storage, DOM listeners, timers, auth, or production registration", async () => {
  const calls = { storage: 0, indexedDb: 0, listeners: 0, timers: 0 };
  const original = {
    localStorage: globalThis.localStorage, indexedDB: globalThis.indexedDB,
    document: globalThis.document, window: globalThis.window,
    setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval,
  };
  Object.defineProperties(globalThis, {
    localStorage: { configurable: true, value: { getItem() { calls.storage += 1; }, setItem() { calls.storage += 1; }, removeItem() { calls.storage += 1; } } },
    indexedDB: { configurable: true, value: { open() { calls.indexedDb += 1; throw new Error("unexpected IndexedDB open"); } } },
    document: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    window: { configurable: true, value: { addEventListener() { calls.listeners += 1; } } },
    setTimeout: { configurable: true, value: (...args) => { calls.timers += 1; return original.setTimeout(...args); } },
    setInterval: { configurable: true, value: (...args) => { calls.timers += 1; return original.setInterval(...args); } },
  });
  try {
    const modules = ["practiceExperimentCatalog", "practiceExperimentRegistry", "practiceFeatureGate", "practiceLabRoutes", "practiceLabViewModel", "practiceLabRenderer", "practiceLabController", "practiceSessionEngine"];
    for (const name of modules) await import(new URL(`../js/practiceLab/${name}.js?audit=${name}`, import.meta.url));
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

test("Practice dependency direction excludes ranked, auth, Supabase, and UI-to-storage back edges", async () => {
  const root = new URL("../js/practiceLab/", import.meta.url);
  const files = (await readdir(root)).filter((name) => name.endsWith(".js"));
  const sources = Object.fromEntries(await Promise.all(files.map(async (name) => [name, await readFile(new URL(name, root), "utf8")])));
  const all = Object.values(sources).join("\n");
  assert.doesNotMatch(all, /from\s+["'][^"']*(supabase|leaderboard|authService|modeStorage|speedTest)/i);
  assert.doesNotMatch(all, /localStorage\.clear\s*\(|setInterval\s*\(/);
  for (const name of ["practiceRepository.js", "practiceIndexedDbStore.js", "practiceManifestStore.js", "practiceSessionEngine.js"]) assert.doesNotMatch(sources[name], /practiceLab(?:Controller|Renderer|ViewModel|Routes)/);
  for (const name of ["practiceLabRenderer.js", "practiceLabViewModel.js", "practiceLabController.js"]) assert.doesNotMatch(sources[name], /practice(?:Repository|IndexedDbStore|ManifestStore|SessionEngine)/);
  assert.doesNotMatch(all, /\.register\(\{\s*experimentId:\s*["'](?:full-assessment|weak-keys)/);
});
