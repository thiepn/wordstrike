import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_OBSOLETE_INDEXES, PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";
import { applyPracticeDatabaseUpgrade } from "../js/practiceLab/practiceIndexedDbStore.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";

function collection(map) {
  return {
    contains: (name) => map.has(name),
    [Symbol.iterator]: function* () { yield* map.keys(); },
  };
}

function makeStore(keyPath, indexes = [], rows = []) {
  const indexMap = new Map(indexes.map((index) => [index.name, structuredClone(index)]));
  return {
    keyPath,
    rows,
    get indexNames() { return collection(indexMap); },
    createIndex(name, nextKeyPath, options = {}) { indexMap.set(name, { name, keyPath: nextKeyPath, options: structuredClone(options) }); },
    deleteIndex(name) { indexMap.delete(name); },
    snapshot() { return { keyPath, indexes: [...indexMap.values()].map(structuredClone), rows: structuredClone(rows) }; },
  };
}

const historicalCoreStores = Object.freeze([
  "meta", "profiles", "contexts", "skillStats", "abilityStates", "performanceStates", "learningStates",
  "evaluationStates", "assessmentRuns", "coachPlans", "sessionSummaries", "reviewItems", "presets",
  "activeSessionCheckpoints", "quarantine",
]);

function storesForVersion(version) {
  const names = [...historicalCoreStores];
  if (version >= 9) names.push("customTexts");
  if (version >= 10) names.push("treatmentEpisodes", "treatmentResponseStates");
  if (version >= 11) names.push("physicalTelemetryStats", "physicalTelemetrySessions");
  if (version >= 12) names.push("researchEnrollments", "researchAssignments", "researchAnalysisStates");
  return names;
}

function legacyIndexes(storeName, version) {
  const current = PRACTICE_STORE_DEFINITIONS[storeName]?.indexes ?? [];
  const indexes = current.map(structuredClone);
  if (storeName === "customTexts" && version === 9) {
    indexes.push({ name: "lastUsedAt", keyPath: "lastUsedAt", options: {} });
    indexes.push({ name: "normalizedTitle", keyPath: "normalizedTitle", options: {} });
    return indexes.filter((index) => !["createdAt"].includes(index.name));
  }
  if (storeName === "sessionSummaries" && version < 12) return indexes.filter((index) => !["researchAssignmentId", "profileContextCompletedAt"].includes(index.name));
  return indexes;
}

function databaseFixture(version) {
  const stores = new Map();
  for (const storeName of storesForVersion(version)) {
    const definition = PRACTICE_STORE_DEFINITIONS[storeName];
    if (!definition) continue;
    const rows = storeName === "meta" ? [{ key: `migration-fixture-db${version}`, value: `preserve-db${version}` }] : [];
    stores.set(storeName, makeStore(definition.keyPath, legacyIndexes(storeName, version), rows));
  }
  const createdStores = [];
  const database = {
    objectStoreNames: collection(stores),
    createObjectStore(name, { keyPath }) {
      const store = makeStore(keyPath);
      stores.set(name, store);
      createdStores.push(name);
      return store;
    },
  };
  const transaction = { objectStore: (name) => stores.get(name) };
  return { database, transaction, stores, createdStores };
}

function normalizedIndex(index) {
  return { name: index.name, keyPath: index.keyPath, unique: Boolean(index.options?.unique) };
}

function certifySchema(version) {
  const fixture = databaseFixture(version);
  const beforeMeta = fixture.stores.get("meta")?.snapshot().rows ?? [];
  applyPracticeDatabaseUpgrade(fixture.database, fixture.transaction);
  assert.deepEqual(fixture.stores.get("meta")?.snapshot().rows ?? [], beforeMeta, `DB${version} schema upgrade changed representative data`);
  for (const [storeName, definition] of Object.entries(PRACTICE_STORE_DEFINITIONS)) {
    const store = fixture.stores.get(storeName);
    assert.ok(store, `DB${version}->${PRACTICE_DATABASE_VERSION} missing store ${storeName}`);
    assert.deepEqual(store.keyPath, definition.keyPath, `DB${version}->current keyPath mismatch for ${storeName}`);
    const actual = store.snapshot().indexes.map(normalizedIndex).sort((a, b) => a.name.localeCompare(b.name));
    const expected = definition.indexes.map(normalizedIndex).sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(actual, expected, `DB${version}->current index mismatch for ${storeName}`);
    for (const obsolete of PRACTICE_OBSOLETE_INDEXES[storeName] || []) assert.equal(actual.some((index) => index.name === obsolete), false, `${storeName}.${obsolete} survived DB${version} upgrade`);
  }
  return { from: version, to: PRACTICE_DATABASE_VERSION, status: "PASS", createdStores: fixture.createdStores };
}

function historicalSession(version) {
  const value = createDefaultSessionSummary({
    profileId: "practice-profile_pl39-migration-profile-12345678",
    contextId: "practice-context_pl39-migration-context-12345678",
    sessionId: `practice-session_pl39-migration-v${version}-12345678`,
    now: () => new Date("2026-09-14T00:00:00.000Z"),
  });
  value.recordVersion = version;
  const introduced = [
    [2, "contextId"], [3, "fluencySummary"], [4, "errorSummary"], [5, "normalizationSummary"],
    [6, "skillEvidenceSummary"], [7, "abilityMeasurementSummary"], [8, "performanceMeasurementSummary"],
    [9, "learningEvidenceSummary"], [10, "retentionReviewSummary"], [11, "evaluationSummary"],
    [12, "assessmentBinding"], [13, "coachBinding"], [14, "researchBinding"],
  ];
  for (const [introducedVersion, key] of introduced) if (version < introducedVersion) delete value[key];
  return value;
}

function certifySessionRecordMigrations() {
  const paths = [];
  for (let version = 1; version < PRACTICE_RECORD_VERSIONS.sessionSummary; version += 1) {
    const source = historicalSession(version);
    const snapshot = structuredClone(source);
    const result = migratePracticeRecord("sessionSummary", source);
    assert.equal(result.ok, true, `sessionSummary v${version} migration failed: ${result.error?.message ?? "unknown"}`);
    assert.equal(result.toVersion, PRACTICE_RECORD_VERSIONS.sessionSummary);
    assert.equal(result.value.recordVersion, PRACTICE_RECORD_VERSIONS.sessionSummary);
    assert.deepEqual(source, snapshot, `sessionSummary v${version} migration mutated source record`);
    paths.push({ from: version, to: result.toVersion, steps: result.steps, status: "PASS" });
  }
  return paths;
}

const schemaPaths = [];
for (let version = 1; version < PRACTICE_DATABASE_VERSION; version += 1) schemaPaths.push(certifySchema(version));
const fresh = certifySchema(PRACTICE_DATABASE_VERSION);
const sessionRecordPaths = certifySessionRecordMigrations();

const report = {
  certificationVersion: 1,
  databaseVersion: PRACTICE_DATABASE_VERSION,
  databaseUpgradePaths: [...schemaPaths, { ...fresh, fresh: true }],
  sessionSummaryMigrationPaths: sessionRecordPaths,
  unexpectedRecordLoss: 0,
  status: "PASS",
};
console.log(JSON.stringify(report, null, 2));
