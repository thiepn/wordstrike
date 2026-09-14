import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { auditPracticeStoredData } from "../js/practiceLab/practiceIntegrityAudit.js";
import { createPracticePhysicalTelemetryRepositoryFacade } from "../js/practiceLab/practicePhysicalTelemetryService.js";
import { createPracticePhysicalTelemetryRuntime, observePracticePhysicalTelemetryKeyDown } from "../js/practiceLab/practicePhysicalTelemetryRuntime.js";

const profileId = "practice-profile_pl39-physical-profile-12345678";
const contextId = "practice-context_pl39-physical-context-12345678";
const sessionId = "practice-session_pl39-physical-session-12345678";
const trainingPlan = { metadata: { partition: "training", evidenceRole: "training" } };

function repository({ enabled = true, inputMethod = "physical" } = {}) {
  return {
    async initializePracticeStorage() {
      return {
        manifest: { settings: { physicalKeyboardTelemetryEnabled: enabled } },
        profile: { profileId },
        context: { contextId, profileId, inputMethod },
      };
    },
    async getPracticeContext() { return { contextId, profileId, inputMethod }; },
  };
}

function documentHarness() {
  const active = new Map();
  let adds = 0; let removes = 0;
  return {
    visibilityState: "visible",
    addEventListener(type, callback) { adds += 1; const set = active.get(type) ?? new Set(); set.add(callback); active.set(type, set); },
    removeEventListener(type, callback) { removes += 1; active.get(type)?.delete(callback); },
    counts() { return { adds, removes, active: [...active.values()].reduce((sum, set) => sum + set.size, 0) }; },
  };
}

function keyEvent(code, key) {
  return { code, key, location: 0, repeat: false, isComposing: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, getModifierState: () => false };
}

test("PL39 telemetry is default-off, physical-only, and excludes Custom/protected evidence roles", async () => {
  const store = createPracticeMemoryStore(); await store.open();
  const telemetryRepository = createPracticePhysicalTelemetryRepositoryFacade({ dataStore: store, now: () => new Date("2026-09-14T00:00:00.000Z") });
  const doc = documentHarness();
  const disabled = createPracticePhysicalTelemetryRuntime({ repository: repository({ enabled: false }), telemetryRepository, profileId, contextId, sessionId, documentObject: doc });
  assert.equal((await disabled.prepare({ contentPlan: trainingPlan, evidenceRole: "training" })).eligible, false);
  const software = createPracticePhysicalTelemetryRuntime({ repository: repository({ inputMethod: "software" }), telemetryRepository, profileId, contextId, sessionId, documentObject: doc });
  assert.equal((await software.prepare({ contentPlan: trainingPlan, evidenceRole: "training" })).eligible, false);
  const unknown = createPracticePhysicalTelemetryRuntime({ repository: repository({ inputMethod: "unknown" }), telemetryRepository, profileId, contextId, sessionId, documentObject: doc });
  assert.equal((await unknown.prepare({ contentPlan: trainingPlan, evidenceRole: "training" })).eligible, false);
  for (const role of ["custom", "transfer", "benchmark", "research-holdout"]) {
    const runtime = createPracticePhysicalTelemetryRuntime({ repository: repository(), telemetryRepository, profileId, contextId, sessionId, documentObject: doc });
    assert.equal((await runtime.prepare({ contentPlan: { metadata: { partition: role, evidenceRole: role } }, evidenceRole: role })).eligible, false, role);
  }
});

test("PL39 100 start/stop cycles do not leak or multiply physical-key listeners", async () => {
  const store = createPracticeMemoryStore(); await store.open();
  const telemetryRepository = createPracticePhysicalTelemetryRepositoryFacade({ dataStore: store, now: () => new Date("2026-09-14T00:00:00.000Z") });
  const doc = documentHarness();
  const runtime = createPracticePhysicalTelemetryRuntime({ repository: repository(), telemetryRepository, profileId, contextId, sessionId, documentObject: doc });
  assert.equal((await runtime.prepare({ contentPlan: trainingPlan, evidenceRole: "training" })).eligible, true);
  for (let index = 0; index < 100; index += 1) {
    runtime.start();
    assert.equal(doc.counts().active, 2, `cycle ${index}: keyup + visibility listeners only`);
    runtime.stop();
    assert.equal(doc.counts().active, 0, `cycle ${index}: all document listeners detached`);
  }
  assert.equal(doc.counts().adds, 200);
  assert.equal(doc.counts().removes, 200);
  assert.equal(observePracticePhysicalTelemetryKeyDown(keyEvent("KeyA", "a")), false, "capture must remain off outside an active eligible Practice session");
});

test("PL39 persisted physical telemetry contains aggregates only, not event.key, raw timestamps or ordered sequences", async () => {
  const store = createPracticeMemoryStore(); await store.open();
  const telemetryRepository = createPracticePhysicalTelemetryRepositoryFacade({ dataStore: store, now: () => new Date("2026-09-14T00:00:00.000Z") });
  const doc = documentHarness();
  let clock = 0;
  const runtime = createPracticePhysicalTelemetryRuntime({ repository: repository(), telemetryRepository, profileId, contextId, sessionId, documentObject: doc, clock: () => clock });
  await runtime.prepare({ contentPlan: trainingPlan, evidenceRole: "training" });
  runtime.start();
  for (let index = 0; index < 20; index += 1) {
    clock += 100;
    const code = index % 2 ? "KeyB" : "KeyA";
    const value = index % 2 ? "b" : "a";
    assert.equal(observePracticePhysicalTelemetryKeyDown(keyEvent(code, value)), true);
    runtime.observeCanonicalInput(
      { type: "character", value, monotonicTimestampMs: clock },
      { accepted: true, correctness: "correct", position: index, expected: value },
      { timing: { timingSegmentId: 1 } },
    );
  }
  const result = await runtime.afterCanonicalCommit({ sessionSummary: { sessionId, profileId, contextId, status: "completed", completedAtUtc: "2026-09-14T00:05:00.000Z" }, contentPlan: trainingPlan });
  assert.equal(result.applied, true);
  runtime.stop();
  const serialized = JSON.stringify({ stats: await store.list("physicalTelemetryStats"), sessions: await store.list("physicalTelemetrySessions") });
  for (const forbidden of ["eventKey", "keystrokeSequence", "rawEvents", "orderedEvents", "monotonicTimestampMs", "\"key\":\"a\""]) assert.equal(serialized.includes(forbidden), false, forbidden);
  const audit = await auditPracticeStoredData(store);
  assert.equal(audit.valid, true, JSON.stringify(audit.errors));
});
