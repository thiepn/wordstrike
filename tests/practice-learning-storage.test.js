import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
  PRACTICE_STORE_NAMES,
} from "../js/practiceLab/practiceConstants.js";
import { applyPracticeDatabaseUpgrade } from "../js/practiceLab/practiceIndexedDbStore.js";
import { createDefaultSessionSummary, createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { createDefaultPracticeLearningState } from "../js/practiceLab/practiceLearningState.js";
import { createSkillStatId } from "../js/practiceLab/practiceIds.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { buildPracticeRetentionPlan } from "../js/practiceLab/practiceRetention.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function makeStore(keyPath, indexDefinitions = []) {
  const indexes = new Map(indexDefinitions.map((index) => [index.name, { ...index }]));
  return {
    keyPath,
    indexNames: {
      contains: (name) => indexes.has(name),
      [Symbol.iterator]: function* () { yield* indexes.keys(); },
    },
    createIndex(name, nextKeyPath, options = {}) { indexes.set(name, { name, keyPath: nextKeyPath, options }); },
    deleteIndex(name) { indexes.delete(name); },
    snapshot() { return [...indexes.values()]; },
  };
}

function currentStore(name) {
  const definition = PRACTICE_STORE_DEFINITIONS[name];
  return makeStore(definition.keyPath, definition.indexes.map((index) => ({
    name: index.name,
    keyPath: index.keyPath,
    options: index.options || {},
  })));
}

function makeDatabase(initialStores = new Map()) {
  const stores = initialStores;
  const createdStores = [];
  return {
    objectStoreNames: {
      contains: (name) => stores.has(name),
      [Symbol.iterator]: function* () { yield* stores.keys(); },
    },
    createObjectStore(name, { keyPath }) {
      createdStores.push(name);
      const store = makeStore(keyPath);
      stores.set(name, store);
      return store;
    },
    stores,
    createdStores,
  };
}

test("PL16 v4-to-v5 learning-store contract remains intact inside the PL18 DB6 envelope", () => {
  const stores = new Map();
  for (const name of PRACTICE_STORE_NAMES) {
    if (name !== "learningStates") stores.set(name, currentStore(name));
  }
  const before = new Map([...stores].map(([name, store]) => [name, JSON.stringify(store.snapshot())]));
  const database = makeDatabase(stores);
  applyPracticeDatabaseUpgrade(database, { objectStore: (name) => database.stores.get(name) });
  assert.equal(PRACTICE_DATABASE_VERSION, 6);
  assert.deepEqual(database.createdStores, ["learningStates"]);
  for (const [name, snapshot] of before) {
    assert.equal(JSON.stringify(database.stores.get(name).snapshot()), snapshot, `${name} changed during PL16 upgrade`);
  }
  assert.equal(database.stores.get("learningStates").keyPath, "learningStateId");
  assert.ok(database.stores.get("learningStates").snapshot().some((index) => index.name === "profileContextEntity" && index.options?.unique));
});

test("PL16 historical sessionSummary v8 reaches PL18 v11 with learning, retention and evaluation summaries null and no fabricated curve payload", () => {
  const current = createDefaultSessionSummary({
    profileId: "practice-profile_pl16-migration-profile-12345678",
    contextId: "practice-context_pl16-migration-context-12345678",
    now: () => new Date("2026-09-05T10:00:00.000Z"),
  });
  const historical = { ...current, recordVersion: 8 };
  delete historical.learningEvidenceSummary;
  delete historical.retentionReviewSummary;
  delete historical.evaluationSummary;
  const migration = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migration.ok, true, JSON.stringify(migration.error));
  assert.deepEqual(migration.steps, ["sessionSummary:8->9", "sessionSummary:9->10", "sessionSummary:10->11"]);
  assert.equal(migration.value.recordVersion, 11);
  assert.equal(migration.value.learningEvidenceSummary, null);
  assert.equal(migration.value.retentionReviewSummary, null);
  assert.equal(migration.value.evaluationSummary, null);
  assert.equal("learningObservationDeltas" in migration.value, false);
  assert.equal("learningCurve" in migration.value, false);
});

test("PL16 skill-stat pruning plan cascades to matching learning state and PL17 review item but never independently prunes a flat state", () => {
  const profileId = "practice-profile_pl16-retention-profile-12345678";
  const contextId = "practice-context_pl16-retention-context-12345678";
  const makeStat = (index, confidenceScore = index === 0 ? 0 : 90) => createDefaultSkillStat({
    profileId,
    contextId,
    entityType: "bigram",
    entityKey: `bg-${String(index).padStart(4, "0")}`,
    now: () => new Date("2026-09-05T10:00:00.000Z"),
    overrides: { confidenceScore, confidenceLevel: confidenceScore >= 80 ? "high" : "none" },
  });
  const skillStats = Array.from({ length: 1501 }, (_, index) => makeStat(index));
  const prunedStat = skillStats[0];
  const matching = createDefaultPracticeLearningState({
    profileId,
    contextId,
    entityType: prunedStat.entityType,
    entityKey: prunedStat.entityKey,
    statId: prunedStat.statId,
  });
  const retainedStat = skillStats.at(-1);
  const retainedFlat = createDefaultPracticeLearningState({
    profileId,
    contextId,
    entityType: retainedStat.entityType,
    entityKey: retainedStat.entityKey,
    statId: retainedStat.statId,
  });
  const plan = buildPracticeRetentionPlan({ skillStats, learningStates: [matching, retainedFlat], now: Date.parse("2026-09-05T12:00:00.000Z") });
  assert.ok(plan.skillStats.includes(prunedStat.statId));
  assert.ok(plan.learningStates.includes(matching.learningStateId));
  assert.equal(plan.learningStates.includes(retainedFlat.learningStateId), false);
});

test("PL16 reset clears learningStates with the rest of Practice data", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl16-reset-learning" });
  const entityType = "bigram";
  const entityKey = "th";
  const statId = createSkillStatId(harness.profileId, harness.contextId, entityType, entityKey);
  const state = createDefaultPracticeLearningState({
    profileId: harness.profileId,
    contextId: harness.contextId,
    entityType,
    entityKey,
    statId,
  });
  await harness.dataStore.put("learningStates", state);
  assert.equal((await harness.dataStore.list("learningStates")).length, 1);
  await harness.repository.resetPracticeData();
  assert.equal((await harness.dataStore.list("learningStates")).length, 0);
});

test("PL16/PL17 record contracts remain intact inside PL18 DB6 / evaluation1 / session11", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 6);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.evaluationState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 11);
});

test("PL16 runtime modules import with zero storage/network/listener/timer side effects", async () => {
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
      "practiceLearningConstants",
      "practiceLearningPolicy",
      "practiceLearningQuality",
      "practiceLearningObservation",
      "practiceLearningCurve",
      "practiceLearningState",
      "practiceLearningStateMerge",
      "practiceLearningValidation",
      "practiceSaturationModel",
      "practiceAbilityLearningCurve",
      "practiceGlobalPlateau",
      "practiceLearningAnalysis",
      "practiceLearningService",
    ];
    for (const name of modules) await import(new URL(`../js/practiceLab/${name}.js?pl16=${name}`, import.meta.url));
    assert.deepEqual(calls, { storage: 0, indexedDb: 0, fetch: 0, listeners: 0, timers: 0 });
  } finally {
    for (const [key, value] of Object.entries(original)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
});
