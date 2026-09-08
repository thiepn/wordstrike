import test from "node:test";
import assert from "node:assert/strict";
import { createPracticeFeatureGate } from "../js/practiceLab/practiceFeatureGate.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistry.js";
import { registerPracticeAccuracyRecoveryExperiment } from "../js/practiceLab/practiceAccuracyRecoveryExperiment.js";
import { buildPracticeAccuracyRecoveryDetailViewModel } from "../js/practiceLab/practiceAccuracyRecoveryUi.js";
import { renderPracticeAccuracyRecoveryDetail } from "../js/practiceLab/practiceLabRendererV23.js";
import { renderPracticeAccuracyRecoverySessionSnapshot } from "../js/practiceLab/practiceAccuracyRecoverySessionHost.js";

const root = () => ({ innerHTML: "", querySelector: () => null });

test("PL23 detail screen requires explicit Key/Combination/Word family and states the no-error-injection doctrine", () => {
  const view = buildPracticeAccuracyRecoveryDetailViewModel({
    entry: { title: "Accuracy & Recovery" },
    resolved: { runnable: true },
    state: { manualType: "word", entityType: "word", targetValue: "the", status: "ready", warnings: [], recommendations: [], recommendationStatus: "no-evidence" },
  });
  const target = root();
  renderPracticeAccuracyRecoveryDetail(target, view);
  assert.match(target.innerHTML, />KEY</);
  assert.match(target.innerHTML, />COMBINATION</);
  assert.match(target.innerHTML, />WORD</);
  assert.match(target.innerHTML, /the.*trigram or a word/i);
  assert.match(target.innerHTML, /No errors are injected/);
  assert.match(target.innerHTML, /no 98% rule is imposed/i);
  assert.match(target.innerHTML, /never blocked until correction/);
});

test("PL23 active session shows only phase/progress and repair status, never live WPM or aggregate accuracy", () => {
  const target = root();
  const contentPlan = {
    text: "rr secret",
    targetEntities: [{ entityType: "key", entityKey: "r", directTarget: true }],
    metadata: { accuracyRecovery: { target: { entityType: "key", entityKey: "r" }, phaseRanges: [
      { id: "baseline", ordinal: 1, label: "Baseline", cue: "none", startIndex: 0, endIndex: 2, opportunityQuota: 8, targetRanges: [{ startIndex: 0, endIndex: 1 }, { startIndex: 1, endIndex: 2 }] },
      { id: "control", ordinal: 2, label: "Control", cue: "subtle", startIndex: 2, endIndex: 2, opportunityQuota: 24, targetRanges: [] },
      { id: "repair", ordinal: 3, label: "Repair", cue: "subtle", startIndex: 2, endIndex: 2, opportunityQuota: 20, targetRanges: [] },
      { id: "mix", ordinal: 4, label: "Mix", cue: "none", startIndex: 2, endIndex: 2, opportunityQuota: 20, targetRanges: [] },
      { id: "check", ordinal: 5, label: "Check", cue: "none", startIndex: 2, endIndex: 9, opportunityQuota: 8, targetRanges: [] },
    ] } },
  };
  renderPracticeAccuracyRecoverySessionSnapshot(target, { contentPlan, snapshot: { lifecycleState: "active", cursorIndex: 0, errorPositions: [], content: { expectedLength: contentPlan.text.length }, metrics: { wpm: 99, accuracy: 99.9 } }, repairFeedback: { message: "Clean repair" } });
  assert.match(target.innerHTML, /Clean repair/);
  assert.match(target.innerHTML, /0% complete/);
  assert.doesNotMatch(target.innerHTML, />WPM</i);
  assert.doesNotMatch(target.innerHTML, />Accuracy</i);
  assert.doesNotMatch(target.innerHTML, /secret/);
});

test("PL23 remains behind the existing Practice feature gate", () => {
  const gate = createPracticeFeatureGate({ developerMode: false });
  const registry = createPracticeExperimentRegistry({ featureGate: gate });
  registerPracticeAccuracyRecoveryExperiment(registry, { runtime: { prepare() { throw new Error("not used"); } } });
  const resolved = registry.getResolvedExperiment("accuracy-control");
  assert.equal(resolved.featureAllowed, false);
  assert.equal(resolved.runnable, false);
  assert.equal(resolved.availability, "gated");
});
