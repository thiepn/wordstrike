import assert from "node:assert/strict";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticePhysicalTelemetryRepositoryFacade } from "../js/practiceLab/practicePhysicalTelemetryService.js";
import {
  createPracticePhysicalTelemetryRuntime,
  observePracticePhysicalTelemetryKeyDown,
} from "../js/practiceLab/practicePhysicalTelemetryRuntime.js";

const listeners = new Map();
const documentObject = {
  visibilityState: "visible",
  addEventListener(type, callback) { listeners.set(type, callback); },
  removeEventListener(type, callback) { if (listeners.get(type) === callback) listeners.delete(type); },
};
const profileId = "practice-profile_12345678";
const contextId = "practice-context_12345678";
const sessionId = "practice-session_12345678";
const contentPlan = { metadata: { partition: "training", evidenceRole: "training" } };
const canonicalRepository = {
  async initializePracticeStorage() {
    return {
      manifest: { settings: { physicalKeyboardTelemetryEnabled: true } },
      profile: { profileId },
      context: { contextId, profileId, inputMethod: "physical" },
    };
  },
  async getPracticeContext() { return { contextId, profileId, inputMethod: "physical" }; },
};
const store = createPracticeMemoryStore();
await store.open();
const telemetryRepository = createPracticePhysicalTelemetryRepositoryFacade({ dataStore: store, now: () => new Date("2026-09-12T01:00:00.000Z") });
let clock = 0;
const runtime = createPracticePhysicalTelemetryRuntime({ repository: canonicalRepository, telemetryRepository, profileId, contextId, sessionId, documentObject, clock: () => clock, wallClock: () => new Date("2026-09-12T01:00:00.000Z") });
const eligibility = await runtime.prepare({ contentPlan, evidenceRole: "training" });
assert.equal(eligibility.eligible, true);
runtime.start();
assert.equal(listeners.has("keyup"), true, "keyup listener exists only during active eligible physical session");

function event(code, key, overrides = {}) {
  return { code, key, location: 0, repeat: false, isComposing: false, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, getModifierState: () => false, ...overrides };
}
for (let i = 0; i < 40; i += 1) {
  clock += 100;
  assert.equal(observePracticePhysicalTelemetryKeyDown(event(i % 2 ? "KeyB" : "KeyA", i % 2 ? "b" : "a")), true);
  runtime.observeCanonicalInput(
    { type: "character", value: i % 2 ? "b" : "a", monotonicTimestampMs: clock },
    { accepted: true, correctness: "correct", position: i, expected: i % 2 ? "b" : "a" },
    { timing: { timingSegmentId: 1 } },
  );
}
assert.equal(runtime.getDelta().eligibleTextEventCount, 40);
assert.equal(runtime.getDelta().validCodeEventCount, 40);
const applied = await runtime.afterCanonicalCommit({ sessionSummary: { sessionId, profileId, contextId, status: "completed", completedAtUtc: "2026-09-12T01:00:00.000Z" }, contentPlan });
assert.equal(applied.applied, true);
runtime.stop();
assert.equal(listeners.has("keyup"), false);
assert.equal(observePracticePhysicalTelemetryKeyDown(event("KeyA", "a")), false, "outside active Practice execution must capture nothing");

const disabledRepository = { ...canonicalRepository, async initializePracticeStorage() { return { manifest: { settings: { physicalKeyboardTelemetryEnabled: false } }, profile: { profileId }, context: { contextId, profileId, inputMethod: "physical" } }; } };
const disabledRuntime = createPracticePhysicalTelemetryRuntime({ repository: disabledRepository, telemetryRepository, profileId, contextId, sessionId: "practice-session_disabled", documentObject });
assert.equal((await disabledRuntime.prepare({ contentPlan, evidenceRole: "training" })).eligible, false);
disabledRuntime.start();
assert.equal(observePracticePhysicalTelemetryKeyDown(event("KeyA", "a")), false);
disabledRuntime.stop();

const softwareRepository = { ...canonicalRepository, async initializePracticeStorage() { return { manifest: { settings: { physicalKeyboardTelemetryEnabled: true } }, profile: { profileId }, context: { contextId, profileId, inputMethod: "software" } }; } };
const softwareRuntime = createPracticePhysicalTelemetryRuntime({ repository: softwareRepository, telemetryRepository, profileId, contextId, sessionId: "practice-session_software", documentObject });
assert.equal((await softwareRuntime.prepare({ contentPlan, evidenceRole: "training" })).eligible, false);
softwareRuntime.start();
assert.equal(observePracticePhysicalTelemetryKeyDown(event("KeyA", "a")), false);
softwareRuntime.stop();

console.log("PL36 active-session capture lifecycle, global-pipeline bridge, opt-in, and non-physical exclusion passed.");
