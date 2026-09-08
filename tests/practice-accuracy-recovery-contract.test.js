import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID,
  PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS,
  PRACTICE_ACCURACY_RECOVERY_VERSION,
  PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION,
  PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION,
  PRACTICE_ACCURACY_RECOVERY_SELECTION_VERSION,
  PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION,
  PRACTICE_ACCURACY_RECOVERY_RESULT_VERSION,
} from "../js/practiceLab/practiceAccuracyRecoveryConstants.js";
import { normalizePracticeAccuracyRecoveryTarget } from "../js/practiceLab/practiceAccuracyRecoveryTargets.js";
import { createPracticeAccuracyRecoveryDescriptor } from "../js/practiceLab/practiceAccuracyRecoveryExperiment.js";
import { createPracticeAccuracyRecoveryFeedbackTracker, classifyPracticeAccuracyRecoveryFeedback } from "../js/practiceLab/practiceAccuracyRecoveryFeedback.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";

test("PL23 preserves stable identity, version envelope, and one-dose quotas", () => {
  assert.equal(PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID, "accuracy-control");
  assert.deepEqual([PRACTICE_ACCURACY_RECOVERY_VERSION, PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION, PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION, PRACTICE_ACCURACY_RECOVERY_SELECTION_VERSION, PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION, PRACTICE_ACCURACY_RECOVERY_RESULT_VERSION], [1,1,1,1,1,1]);
  assert.deepEqual(PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS.key, { baseline: 8, control: 24, repair: 20, mix: 20, check: 8, total: 80 });
  assert.deepEqual(PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS.bigram, { baseline: 5, control: 15, repair: 12, mix: 13, check: 5, total: 50 });
  assert.deepEqual(PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS.trigram, { baseline: 4, control: 10, repair: 9, mix: 8, check: 4, total: 35 });
  assert.deepEqual(PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS.word, { baseline: 3, control: 4, repair: 3, mix: 2, check: 3, total: 15 });
});

test("PL23 manual target family is explicit and delegates canonical entity normalization", () => {
  assert.deepEqual(normalizePracticeAccuracyRecoveryTarget({ manualType: "key", entityKey: " R ", language: "en" }), { entityType: "key", entityKey: "r" });
  assert.deepEqual(normalizePracticeAccuracyRecoveryTarget({ manualType: "combination", entityKey: " TH ", language: "en" }), { entityType: "bigram", entityKey: "th" });
  assert.deepEqual(normalizePracticeAccuracyRecoveryTarget({ manualType: "combination", entityKey: " THE ", language: "en" }), { entityType: "trigram", entityKey: "the" });
  assert.deepEqual(normalizePracticeAccuracyRecoveryTarget({ manualType: "word", entityKey: " THE ", language: "en" }), { entityType: "word", entityKey: "the", graphemeCount: 3 });
  assert.equal(normalizePracticeAccuracyRecoveryTarget({ manualType: "combination", entityKey: "four", language: "en" }), null);
  assert.equal(normalizePracticeAccuracyRecoveryTarget({ manualType: "word", entityKey: "can't", language: "en" }), null);
});

test("PL23 experiment remains a non-resumable training intervention with no measurement privilege", () => {
  const descriptor = createPracticeAccuracyRecoveryDescriptor();
  assert.equal(descriptor.id, "accuracy-control");
  assert.equal(descriptor.resumable, false);
  assert.equal(descriptor.defaultCorrectionBehavior, "allow");
  assert.equal(descriptor.abilityChannel, null);
  assert.equal(descriptor.performanceMeasurementKind, null);
  assert.equal(descriptor.retentionMeasurementKind, null);
  assert.equal(descriptor.evaluationMeasurementKind, null);
  const catalog = getPracticeExperiment("accuracy-control");
  assert.equal(catalog.title, "Accuracy & Recovery");
  assert.equal(catalog.status, "preview");
  assert.deepEqual(catalog.estimatedDurationMinutes, { minimum: 4, recommended: 5, maximum: 6 });
});

test("PL23 repair feedback is transient, target-attributed, precise, and cooldown-bounded", () => {
  assert.equal(classifyPracticeAccuracyRecoveryFeedback({ corrected: true, correctCharactersRemoved: 0 }), "repair-clean");
  assert.equal(classifyPracticeAccuracyRecoveryFeedback({ corrected: true, correctCharactersRemoved: 2 }), "repair-extra-deletion");
  assert.equal(classifyPracticeAccuracyRecoveryFeedback({ corrected: true, correctCharactersRemoved: null }), "repair-complete");
  assert.equal(classifyPracticeAccuracyRecoveryFeedback({ corrected: false, correctCharactersRemoved: 0 }), null);
  let now = 1000;
  const tracker = createPracticeAccuracyRecoveryFeedbackTracker({ clock: () => now });
  const target = { entityType: "key", entityKey: "r" };
  const attribution = [{ entityType: "key", entityKey: "r" }];
  const first = tracker.consume({ episode: { corrected: true, correctCharactersRemoved: 0 }, attribution, target });
  assert.equal(first.code, "repair-clean");
  assert.equal(first.displayDurationMs, 700);
  now += 500;
  assert.equal(tracker.consume({ episode: { corrected: true, correctCharactersRemoved: 1 }, attribution, target }), null);
  now += 600;
  assert.equal(tracker.consume({ episode: { corrected: true, correctCharactersRemoved: 1 }, attribution, target }).code, "repair-extra-deletion");
  assert.equal(tracker.consume({ episode: { corrected: true, correctCharactersRemoved: 0 }, attribution: [{ entityType: "key", entityKey: "x" }], target }), null);
});
