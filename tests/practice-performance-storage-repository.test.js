import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE_DATABASE_VERSION, PRACTICE_LIMITS, PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";
import { applyPracticeDatabaseUpgrade } from "../js/practiceLab/practiceIndexedDbStore.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { createDefaultPracticePerformanceState } from "../js/practiceLab/practicePerformanceState.js";
import { buildPracticePerformanceAnalysis } from "../js/practiceLab/practicePerformanceAnalysis.js";
import { validatePracticePerformanceState } from "../js/practiceLab/practicePerformanceValidation.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function fakeUpgradeDatabase(initialNames) {
  const names = new Set(initialNames);
  const stores = new Map([...names].map((name) => [name, { indexNames: [], createIndex() {}, deleteIndex() {} }]));
  const created = [];
  return {
    created,
    database: {
      objectStoreNames: { contains: (name) => names.has(name) },
      createObjectStore(name) {
        names.add(name);
        created.push(name);
        const store = { indexNames: [], createIndex(indexName) { this.indexNames.push(indexName); }, deleteIndex() {} };
        stores.set(name, store);
        return store;
      },
    },
    transaction: { objectStore: (name) => stores.get(name) },
  };
}

test("PL14 performance-state contract remains intact inside the current PL16 DB/session envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 5);
  assert.equal(PRACTICE_RECORD_VERSIONS.performanceState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 9);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_LIMITS.performanceStateBytes, 64 * 1024);
  assert.deepEqual(PRACTICE_STORE_DEFINITIONS.performanceStates, {
    keyPath: "performanceStateId",
    indexes: [
      { name: "profileId", keyPath: "profileId" },
      { name: "contextId", keyPath: "contextId" },
      { name: "updatedAt", keyPath: "updatedAt" },
      { name: "profileContext", keyPath: ["profileId", "contextId"], options: { unique: true } },
    ],
  });
  const priorStores = Object.keys(PRACTICE_STORE_DEFINITIONS).filter((name) => name !== "performanceStates");
  const upgrade = fakeUpgradeDatabase(priorStores);
  applyPracticeDatabaseUpgrade(upgrade.database, upgrade.transaction);
  assert.deepEqual(upgrade.created, ["performanceStates"]);
  const fresh = fakeUpgradeDatabase([]);
  applyPracticeDatabaseUpgrade(fresh.database, fresh.transaction);
  assert.deepEqual(fresh.created.sort(), Object.keys(PRACTICE_STORE_DEFINITIONS).sort());
});

test("PL14 historical session v7 performance migration remains null through the current PL16 v9 wrapper", () => {
  const harnessProfile = "practice-profile_pl14-migration-profile-12345678";
  const harnessContext = "practice-context_pl14-migration-context-12345678";
  const current = createDefaultSessionSummary({ profileId: harnessProfile, contextId: harnessContext, sessionId: "practice-session_pl14-migration-session-12345678", now: () => new Date("2026-09-05T12:00:00Z") });
  const legacy = { ...current, recordVersion: 7 };
  delete legacy.performanceMeasurementSummary;
  delete legacy.learningEvidenceSummary;
  const migration = migratePracticeRecord("sessionSummary", legacy);
  assert.equal(migration.ok, true);
  assert.equal(migration.toVersion, 9);
  assert.deepEqual(migration.steps, ["sessionSummary:7->8", "sessionSummary:8->9"]);
  assert.equal(migration.value.performanceMeasurementSummary, null);
  assert.equal(migration.value.learningEvidenceSummary, null);
  assert.equal(migration.value.abilityMeasurementSummary, current.abilityMeasurementSummary);
});

function referenceAbility() {
  return { estimate: { status: "established", confidenceLevel: "high", meanLogWpm: Math.log(100), varianceLogWpm: 0.0004, estimateWpm: 100 }, recentObservations: [99, 99, 99].map((accuracy) => ({ accuracy })) };
}
function foundation(contextId) {
  return { latency: { sessionSummary: { fluentMedianMs: 100, fluentMadMs: 0, interruptionRate: 0, coverage: { scope: "complete-session" } }, classifiedTransitions: [] }, normalization: { context: { contextId }, sessionSummary: { textDifficulty: { status: "full", difficultyIndex: 0, availableModelWeight: 1 } } } };
}

test("PL14 state delta merges atomically once and conflicting session ID cannot mutate performance state", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl14-atomic-state", text: "abc" });
  const measuredAt = "2026-09-05T12:00:00.000Z";
  const session = { sessionId: harness.sessionId, profileId: harness.profileId, contextId: harness.contextId, status: "completed", completionReason: "time-complete", completedAtUtc: measuredAt, localDayKey: "2026-09-05", wpm: 101, rawWpm: 101, accuracy: 99, activeDurationMs: 120_000, typedCharacterCount: 500, configuration: { correctionBehavior: "allow" } };
  const performance = buildPracticePerformanceAnalysis({ session, experiment: { performanceMeasurementKind: "state-probe", performanceReferenceChannel: "controlled-speed" }, foundationAnalysis: foundation(harness.contextId), contentPlan: { targetEntities: [] }, evidenceRole: "diagnostic", referenceAbilityState: referenceAbility(), existingPerformanceState: null, eventTrace: [], traceMetadata: { truncated: false } });
  assert.equal(performance.status, "measured");
  const summary = createDefaultSessionSummary({ profileId: harness.profileId, contextId: harness.contextId, sessionId: harness.sessionId, now: () => new Date(measuredAt), overrides: { performanceMeasurementSummary: performance.sessionSummary } });
  const first = await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, performanceStateDelta: performance.performanceStateDelta, clearCheckpoint: false });
  assert.equal(first.performanceUpdated, true);
  const stateAfterFirst = await harness.repository.getPerformanceState(harness.profileId, harness.contextId);
  assert.equal(validatePracticePerformanceState(stateAfterFirst).valid, true);
  assert.equal(Object.keys(stateAfterFirst.currentStates).length, 1);
  const replay = await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, performanceStateDelta: performance.performanceStateDelta, clearCheckpoint: false });
  assert.equal(replay.idempotent, true);
  assert.deepEqual(await harness.repository.getPerformanceState(harness.profileId, harness.contextId), stateAfterFirst);
  await assert.rejects(() => harness.repository.commitCompletedPracticeSession({ sessionSummary: { ...summary, recommendationIds: ["conflict"] }, performanceStateDelta: performance.performanceStateDelta, clearCheckpoint: false }), /different completed Practice session|duplicate/i);
  assert.deepEqual(await harness.repository.getPerformanceState(harness.profileId, harness.contextId), stateAfterFirst);
});

test("PL14 structurally invalid performance delta rolls back before session write", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl14-invalid-delta", text: "abc" });
  const summary = createDefaultSessionSummary({ profileId: harness.profileId, contextId: harness.contextId, sessionId: harness.sessionId, now: harness.time.wallClock, overrides: { performanceMeasurementSummary: { analysisVersion: 1, measurementKind: "state-probe", status: "measured", referenceChannel: "controlled-speed", paceState: "typical", controlQuality: "unknown", readinessBand: "normal", relativeStateDelta: 0, stateZ: 0, measurementConfidence: "medium", warmupObserved: false, warmupGainRelative: null } } });
  const invalid = { type: "state-probe", sessionId: harness.sessionId, profileId: harness.profileId, contextId: harness.contextId, currentStateObservation: { nope: true }, warmupObservation: null };
  await assert.rejects(() => harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, performanceStateDelta: invalid }), /performance-state delta failed validation/i);
  assert.equal(await harness.repository.getSessionSummary(harness.sessionId), null);
  assert.equal(await harness.repository.getPerformanceState(harness.profileId, harness.contextId), null);
});

test("PL14 reset clears performance state while ordinary retention leaves it untouched", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl14-retention", text: "abc" });
  const state = createDefaultPracticePerformanceState({ profileId: harness.profileId, contextId: harness.contextId, now: harness.time.wallClock });
  await harness.dataStore.put("performanceStates", state);
  await harness.repository.runPracticeRetention();
  assert.ok(await harness.repository.getPerformanceState(harness.profileId, harness.contextId));
  await harness.repository.resetPracticeData();
  assert.equal((await harness.dataStore.list("performanceStates")).length, 0);
});
