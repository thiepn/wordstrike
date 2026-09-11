import assert from "node:assert/strict";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticePhysicalTelemetryRepositoryFacade } from "../js/practiceLab/practicePhysicalTelemetryService.js";

const profileId = "practice-profile_12345678";
const contextId = "practice-context_12345678";
const completedAt = "2026-09-12T00:00:00.000Z";
const session = (id, overrides = {}) => ({ sessionId: id, profileId, contextId, status: "completed", completedAtUtc: completedAt, ...overrides });
const delta = (overrides = {}) => ({
  eligibleTextEventCount: 40,
  validCodeEventCount: 40,
  codeCoverage: 1,
  keys: [{ entityType: "physical-key", entityKey: "KeyA", activationCount: 40, firstPassActivationCount: 40, firstPassCorrectActivationCount: 38, firstPassErrorOriginCount: 2, timingEligibleCount: 30, fluentCount: 20, disfluentCount: 10, residualSamples: [1, 2], fluentLatencySamples: [90, 100] }],
  transitions: [{ entityType: "physical-transition", entityKey: "KeyA>KeyB", timingEligibleCount: 12, fluentCount: 8, disfluentCount: 4, residualSamples: [3], fluentLatencySamples: [110] }],
  modifierRoutes: [{ entityType: "modifier-route", entityKey: "uppercase-letter|shift|left", opportunityCount: 10, timingEligibleCount: 8, residualSamples: [2] }],
  diagnostics: {},
  ...overrides,
});
const settings = { physicalKeyboardTelemetryEnabled: true };
const context = { inputMethod: "physical" };
const contentPlan = { metadata: { partition: "training", evidenceRole: "training" } };

const store = createPracticeMemoryStore();
await store.open();
const repository = createPracticePhysicalTelemetryRepositoryFacade({ dataStore: store, now: () => new Date("2026-09-12T01:00:00.000Z") });
let result = await repository.applyPhysicalTelemetrySession({ sessionSummary: session("practice-session_aaaaaaaa"), delta: delta(), settings, context, evidenceRole: "training", contentPlan });
assert.equal(result.applied, true);
assert.equal((await repository.listPhysicalTelemetryStats(profileId, contextId)).length, 3);
assert.equal((await repository.listPhysicalTelemetrySessions(profileId, contextId)).length, 1);

result = await repository.applyPhysicalTelemetrySession({ sessionSummary: session("practice-session_aaaaaaaa"), delta: delta(), settings, context, evidenceRole: "training", contentPlan });
assert.equal(result.idempotent, true);
const keyStat = (await repository.listPhysicalTelemetryStats(profileId, contextId)).find((item) => item.entityType === "physical-key");
assert.equal(keyStat.observation.activationCount, 40, "duplicate sidecar application must not double count");
assert.equal(keyStat.observation.distinctSessionCount, 1);

result = await repository.applyPhysicalTelemetrySession({ sessionSummary: session("practice-session_bbbbbbbb"), delta: delta({ eligibleTextEventCount: 30, validCodeEventCount: 20, codeCoverage: 2 / 3 }), settings, context, evidenceRole: "training", contentPlan });
assert.equal(result.insufficient, true);
assert.equal((await repository.getPhysicalTelemetrySession("practice-session_bbbbbbbb")).status, "insufficient");
assert.equal((await repository.listPhysicalTelemetryStats(profileId, contextId)).find((item) => item.entityType === "physical-key").observation.activationCount, 40);

result = await repository.applyPhysicalTelemetrySession({ sessionSummary: session("practice-session_cccccccc"), delta: delta(), settings, context, evidenceRole: "custom", contentPlan: { metadata: { partition: "custom" } } });
assert.equal(result.skipped, true);
assert.equal(await repository.getPhysicalTelemetrySession("practice-session_cccccccc"), null, "Custom Text must leave no PL36 persistence marker");

const snapshot = await repository.getPhysicalTelemetrySnapshot(profileId, contextId);
assert.equal(snapshot.coverage.eligibleSessions, 1);
assert.equal(snapshot.coverage.physicalCodesObserved, 1);
assert.equal(snapshot.keys[0].observedMisstrikeOriginRate, 2 / 40);
assert.equal(snapshot.keys[0].confidence, "none");

const cleared = await repository.clearPhysicalTelemetry(profileId, { contextId });
assert.equal(cleared.deletedStats, 3);
assert.equal((await repository.listPhysicalTelemetryStats(profileId, contextId)).length, 0);
assert.equal((await repository.listPhysicalTelemetrySessions(profileId, contextId)).length, 0);
console.log("PL36 sidecar persistence, coverage floor, idempotency, privacy exclusion, snapshot, and clear contracts passed.");
