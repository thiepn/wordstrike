import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import {
  PRACTICE_DATABASE_VERSION, PRACTICE_LIMITS, PRACTICE_MANIFEST_VERSION,
  PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_NAMES,
} from "../js/practiceLab/practiceConstants.js";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { createPracticeLabController } from "../js/practiceLab/practiceLabController.js";
import { createPracticeLabRoute, normalizePracticeLabRoute, PRACTICE_LAB_ROUTES } from "../js/practiceLab/practiceLabRoutes.js";
import { validatePracticeExperimentDescriptor } from "../js/practiceLab/practiceSessionContract.js";
import { normalizeSessionSummary, validatePracticeSerializable, validateSessionSummary } from "../js/practiceLab/practiceValidation.js";

const descriptor = Object.freeze({
  id: "full-assessment", version: 2, title: "Full Assessment", category: "assessment",
  sessionSchemaVersion: 1, defaultCorrectionBehavior: "allow",
  supportedCompletionModes: Object.freeze(["content", "manual"]), resumable: true,
});

test("Phase 0 foundation constants remain intact inside the current PL18 storage envelope", async () => {
  assert.equal(PRACTICE_MANIFEST_VERSION, 1);
  assert.equal(PRACTICE_DATABASE_VERSION, 6);
  assert.equal(PRACTICE_RECORD_VERSIONS.profile, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 11);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.evaluationState, 1);
  assert.equal(PRACTICE_STORE_NAMES.length, 14);
  assert.equal(PRACTICE_STORE_NAMES.includes("evaluationStates"), true);
  assert.equal(PRACTICE_LIMITS.checkpointTtlMs, 86_400_000);
  assert.equal(PRACTICE_LIMITS.sessionSummarySoftCap, 1_000);
  const docs = await readFile(new URL("../docs/PRACTICE_LAB_DATA_ARCHITECTURE.md", import.meta.url), "utf8");
  for (const value of ["wordstrike.practice.manifest.v1", "wordstrike-practice-lab", "activeSessionCheckpoints"]) assert.match(docs, new RegExp(value));
});

test("Full Assessment fixture integrates catalog through registry without activating reserved routes", () => {
  const catalogEntry = getPracticeExperiment("full-assessment");
  const gate = createPracticeFeatureGate({ developerMode: true });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  let descriptorCalls = 0;
  assert.equal(catalogEntry.status, "preview");
  assert.equal(registry.getResolvedExperiment("full-assessment").runnable, false);
  registry.register({ experimentId: "full-assessment", implementationVersion: 1, descriptorFactory: () => { descriptorCalls += 1; return descriptor; }, setupFactory() {} });
  const resolved = registry.getResolvedExperiment("full-assessment");
  assert.equal(descriptorCalls, 1);
  assert.equal(validatePracticeExperimentDescriptor(resolved.registration.descriptor).valid, true);
  assert.equal(resolved.availability, "available");
  assert.equal(resolved.runnable, true);
  assert.equal(catalogEntry.status, "preview");
  assert.equal(normalizePracticeLabRoute(createPracticeLabRoute(PRACTICE_LAB_ROUTES.EXPERIMENT_SETUP, { experimentId: "full-assessment" }), { featureGate: gate }).name, "home");
  registry.unregister("full-assessment");
  assert.equal(registry.getResolvedExperiment("full-assessment").runnable, false);
  const publicRegistry = createPracticeExperimentRegistry({ featureGate: createPracticeFeatureGate() });
  publicRegistry.register({ experimentId: "full-assessment", implementationVersion: 1, descriptorFactory: () => descriptor });
  assert.equal(publicRegistry.getResolvedExperiment("full-assessment").availability, "gated");
  assert.equal(publicRegistry.getResolvedExperiment("full-assessment").runnable, false);
});

test("Practice summaries reject and normalize ranked/raw fields and configuration blocks unsafe keys", () => {
  const base = createDefaultSessionSummary();
  for (const field of ["boardKey", "rulesVersion", "leaderboardEligible", "submissionPayload", "rawEvents", "eventTrace", "rawEventTrace"]) {
    const injected = { ...base, [field]: field === "leaderboardEligible" ? true : "forbidden" };
    assert.equal(validateSessionSummary(injected).valid, false, field);
    assert.equal(Object.hasOwn(normalizeSessionSummary(injected), field), false, field);
  }
  assert.equal(validatePracticeSerializable(JSON.parse('{"__proto__":{"polluted":true}}')).valid, false);
  assert.equal({}.polluted, undefined);
});

test("controller mount/unmount stress leaves no listeners, subscribers, or stale route history", () => {
  const listeners = new Set();
  const root = {
    innerHTML: "", addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); }, contains: () => true,
  };
  const gate = createPracticeFeatureGate({ developerMode: true });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  const controller = createPracticeLabController({ root, featureGate: gate, experimentRegistry: registry, renderer() {} });
  for (let cycle = 0; cycle < 50; cycle += 1) {
    controller.mount();
    for (let index = 0; index < 10; index += 1) controller.navigate(createPracticeLabRoute(index % 2 ? PRACTICE_LAB_ROUTES.SKILL_MAP : PRACTICE_LAB_ROUTES.PROGRESS));
    assert.equal(listeners.size, 1);
    assert.equal(registry.getDiagnostics().subscriberCount, 1);
    controller.unmount();
    assert.equal(listeners.size, 0);
    assert.equal(registry.getDiagnostics().subscriberCount, 0);
    assert.equal(controller.getSnapshot().historyDepth, 0);
    assert.equal(controller.navigate(createPracticeLabRoute(PRACTICE_LAB_ROUTES.PROGRESS)), false);
  }
});
