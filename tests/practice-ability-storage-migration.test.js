import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_LIMITS,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,
} from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { applyPracticeDatabaseUpgrade } from "../js/practiceLab/practiceIndexedDbStore.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { createDefaultPracticeAbilityState, mergePracticeAbilityObservation } from "../js/practiceLab/practiceAbilityEstimator.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { validatePracticeAbilityState } from "../js/practiceLab/practiceAbilityValidation.js";
import {
  PRACTICE_ABILITY_ESTIMATOR_VERSION,
  PRACTICE_ABILITY_OBSERVATION_VERSION,
  PRACTICE_ABILITY_POLICY_VERSION,
  PRACTICE_ABILITY_UNCERTAINTY_VERSION,
} from "../js/practiceLab/practiceAbilityConstants.js";

function makeStore(keyPath, indexDefinitions = []) {
  const indexes = new Map(indexDefinitions.map((index) => [index.name, { ...index }]));
  return {
    keyPath,
    indexNames: { contains: (name) => indexes.has(name), [Symbol.iterator]: function* () { yield* indexes.keys(); } },
    createIndex(name, nextKeyPath, options = {}) { indexes.set(name, { name, keyPath: nextKeyPath, options }); },
    deleteIndex(name) { indexes.delete(name); },
    snapshot() { return [...indexes.values()]; },
  };
}

function makeDatabase(initialStores = new Map()) {
  const stores = initialStores;
  const createdStores = [];
  return {
    objectStoreNames: { contains: (name) => stores.has(name), [Symbol.iterator]: function* () { yield* stores.keys(); } },
    createObjectStore(name, { keyPath }) { createdStores.push(name); const store = makeStore(keyPath); stores.set(name, store); return store; },
    stores,
    createdStores,
  };
}

function currentStore(name) {
  const definition = PRACTICE_STORE_DEFINITIONS[name];
  return makeStore(definition.keyPath, definition.indexes.map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} })));
}

const profileId = createPracticeId("profile", { uuid: () => "pl13-storage-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl13-storage-context-12345678" });

function validObservation(index = 1) {
  const completedAtUtc = `2026-09-${String(index).padStart(2, "0")}T10:00:00.000Z`;
  return {
    observationVersion: PRACTICE_ABILITY_OBSERVATION_VERSION,
    sessionId: createPracticeId("session", { uuid: () => `pl13-storage-session-${index}-12345678` }),
    profileId,
    contextId,
    channel: "controlled-speed",
    sourceRole: "benchmark",
    completedAtUtc,
    localDayKey: completedAtUtc.slice(0, 10),
    rawWpm: 103,
    wpm: 100,
    adjustedWpm: 100,
    adjustedLogPerformance: Math.log(100),
    accuracy: 99,
    activeDurationMs: 60_000.5,
    typedCharacterCount: 200,
    difficultyIndex: 0,
    difficultyAdjustmentLog: 0,
    difficultyModelStatus: "full",
    difficultyCoverage: 1,
    measurementSigmaLog: 0.08,
    measurementVarianceLog: 0.08 ** 2,
    reliabilityWeight: 1,
  };
}

test("PL13 advances only the intended wrapper/storage versions", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.abilityState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 7);
  assert.equal(PRACTICE_RECORD_VERSIONS.checkpoint, 3);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 5);
  assert.equal(PRACTICE_ABILITY_ESTIMATOR_VERSION, 1);
  assert.equal(PRACTICE_ABILITY_POLICY_VERSION, 1);
  assert.equal(PRACTICE_ABILITY_OBSERVATION_VERSION, 1);
  assert.equal(PRACTICE_ABILITY_UNCERTAINTY_VERSION, 1);
});

test("PL13 abilityStates schema has exact key/index ownership and unique profile-context-channel identity", () => {
  const store = PRACTICE_STORE_DEFINITIONS.abilityStates;
  assert.equal(store.keyPath, "abilityStateId");
  assert.deepEqual(store.indexes.map((index) => index.name), ["profileId", "contextId", "channel", "updatedAt", "profileContextChannel"]);
  const unique = store.indexes.find((index) => index.name === "profileContextChannel");
  assert.deepEqual(unique.keyPath, ["profileId", "contextId", "channel"]);
  assert.equal(unique.options.unique, true);
  assert.equal(PRACTICE_LIMITS.abilityStateBytes, 32 * 1024);
});

test("PL13 fresh DB v3 creates exactly all declared stores and indexes", () => {
  const fresh = makeDatabase();
  applyPracticeDatabaseUpgrade(fresh);
  assert.deepEqual([...fresh.stores.keys()], PRACTICE_STORE_NAMES);
  for (const [name, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
    const actual = fresh.stores.get(name).snapshot().map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
    const expected = definition.indexes.map((index) => ({ name: index.name, keyPath: index.keyPath, options: index.options || {} }));
    assert.deepEqual(actual, expected, name);
  }
});

test("PL13 v2-to-v3 upgrade creates only abilityStates and leaves all preexisting stores intact", () => {
  const stores = new Map();
  for (const name of PRACTICE_STORE_NAMES) if (name !== "abilityStates") stores.set(name, currentStore(name));
  const before = new Map([...stores].map(([name, store]) => [name, JSON.stringify(store.snapshot())]));
  const upgraded = makeDatabase(stores);
  applyPracticeDatabaseUpgrade(upgraded, { objectStore: (name) => upgraded.stores.get(name) });
  assert.deepEqual(upgraded.createdStores, ["abilityStates"]);
  for (const [name, snapshot] of before) assert.equal(JSON.stringify(upgraded.stores.get(name).snapshot()), snapshot, `${name} must remain structurally untouched`);
  assert.equal(upgraded.stores.get("abilityStates").snapshot().find((index) => index.name === "profileContextChannel")?.options?.unique, true);
});

test("PL13 sessionSummary v6 migrates sequentially to v7 with null ability summary and no historical ability backfill", () => {
  const current = createDefaultSessionSummary({ profileId, contextId, now: () => new Date("2026-09-05T10:00:00.000Z") });
  const historical = { ...current, recordVersion: 6 };
  delete historical.abilityMeasurementSummary;
  const migration = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migration.ok, true);
  assert.deepEqual(migration.steps, ["sessionSummary:6->7"]);
  assert.equal(migration.value.recordVersion, 7);
  assert.equal(migration.value.abilityMeasurementSummary, null);
  assert.equal(Object.hasOwn(migration.value, "newAbilityEstimate"), false);
});

test("PL13 ability state accepts fractional accumulated active time, remains bounded, and contains no user text or duplicated diagnostic state", () => {
  let state = createDefaultPracticeAbilityState({ profileId, contextId, channel: "controlled-speed", now: () => new Date("2026-09-01T10:00:00.000Z") });
  state = mergePracticeAbilityObservation(state, validObservation(5));
  const validation = validatePracticeAbilityState(state, { maxBytes: PRACTICE_LIMITS.abilityStateBytes });
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  assert.equal(state.evidence.totalActiveDurationMs, 60_000.5);
  assert.ok(new TextEncoder().encode(JSON.stringify(state)).byteLength < PRACTICE_LIMITS.abilityStateBytes);
  const serialized = JSON.stringify(state);
  for (const forbidden of ["eventTrace", "rawEvents", "customText", "contentSnapshot", "passageText", "limiter", "skillEvidence", "containingWords"]) assert.equal(serialized.includes(forbidden), false, forbidden);
});

test("PL13 ability modules import with zero storage/network/listener/timer side effects", async () => {
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
    for (const module of ["practiceAbilityConstants.js", "practiceAbilityPolicy.js", "practiceAbilityObservation.js", "practiceAbilityEstimator.js", "practiceAbilityComparison.js", "practiceAbilityValidation.js"]) {
      await import(new URL(`../js/practiceLab/${module}?pl13=${encodeURIComponent(module)}`, import.meta.url));
    }
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});

test("PL13 ordinary quota retention has no ability-state deletion path", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceRetention.js", import.meta.url), "utf8");
  assert.equal(source.includes("abilityStates"), false);
  assert.equal(source.includes("abilityState"), false);
});
