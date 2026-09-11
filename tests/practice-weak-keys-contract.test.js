import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
} from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import {
  PRACTICE_WEAK_KEYS_EXPERIMENT_ID,
  PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION,
  PRACTICE_WEAK_KEYS_GENERATOR_VERSION,
  PRACTICE_WEAK_KEYS_PHASE_QUOTAS,
  PRACTICE_WEAK_KEYS_POLICY_VERSION,
  PRACTICE_WEAK_KEYS_RESULT_VERSION,
  PRACTICE_WEAK_KEYS_SELECTION_VERSION,
  PRACTICE_WEAK_KEYS_VERSION,
} from "../js/practiceLab/practiceWeakKeysConstants.js";
import { PRACTICE_WEAK_KEYS_POLICY_V1 } from "../js/practiceLab/practiceWeakKeysPolicy.js";
import {
  getPracticeWeakKeysLanguageSupport,
  normalizePracticeWeakKeyTarget,
  validateWeakKeyTarget,
} from "../js/practiceLab/practiceWeakKeysTargets.js";
import { normalizePracticeWeakKeysManualInput } from "../js/practiceLab/practiceWeakKeysUi.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import { createPracticeWeakKeysDescriptor } from "../js/practiceLab/practiceWeakKeysExperiment.js";
import { classifyPracticeKeyboardGeometry } from "../js/practiceLab/practiceKeyboardGeometry.js";

function readyIndex() {
  const calls = [];
  return {
    calls,
    async getTargetContentRefs(query) {
      calls.push(["content", query]);
      return [
        { contentId: "c1", familyId: "f1", count: 1, positions: [2] },
        { contentId: "c2", familyId: "f2", count: 1, positions: [3] },
      ];
    },
    async getTargetWordRefs(query) {
      calls.push(["words", query]);
      return ["rain", "river", "road", "train", "green"];
    },
  };
}

test("PL21 contracts remain intact inside the PL25 DB8/session13/foundation10 envelope", () => {
  assert.ok(PRACTICE_DATABASE_VERSION >= 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
});

test("PL21 version family and experiment identity start at v1", () => {
  assert.equal(PRACTICE_WEAK_KEYS_VERSION, 1);
  assert.equal(PRACTICE_WEAK_KEYS_POLICY_VERSION, 1);
  assert.equal(PRACTICE_WEAK_KEYS_GENERATOR_VERSION, 1);
  assert.equal(PRACTICE_WEAK_KEYS_SELECTION_VERSION, 1);
  assert.equal(PRACTICE_WEAK_KEYS_RESULT_VERSION, 1);
  assert.equal(PRACTICE_WEAK_KEYS_EXPERIMENT_ID, "weak-keys");
  assert.equal(PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION, 1);
});

test("PL21 uses the exact fixed 80-opportunity dose", () => {
  assert.deepEqual(PRACTICE_WEAK_KEYS_PHASE_QUOTAS, {
    "entry-probe": 8,
    focus: 24,
    context: 20,
    interleave: 20,
    "exit-probe": 8,
    total: 80,
  });
  assert.equal(PRACTICE_WEAK_KEYS_POLICY_V1.quotas.total, 80);
});

test("English Weak Keys normalizes manual uppercase visibly to lowercase", () => {
  assert.deepEqual(normalizePracticeWeakKeyTarget({ entityType: "key", entityKey: " R ", language: "en" }), { entityType: "key", entityKey: "r" });
  const ui = normalizePracticeWeakKeysManualInput("R", "en");
  assert.equal(ui.valid, true);
  assert.equal(ui.normalizedValue, "r");
  assert.equal(ui.target.entityKey, "r");
});

test("English Weak Keys rejects multi-character, whitespace, digits, punctuation, and symbols", () => {
  for (const value of ["th", " ", "\t", "\n", "0", "9", ",", ".", ";", "'", "-", "@", "é"]) {
    assert.equal(normalizePracticeWeakKeyTarget({ entityType: "key", entityKey: value, language: "en" }), null, value);
  }
  assert.equal(normalizePracticeWeakKeysManualInput("th", "en").message, "Weak Keys trains one letter at a time.");
});

test("non-English target policy is explicitly unsupported rather than globally ASCII-normalized", () => {
  assert.deepEqual(getPracticeWeakKeysLanguageSupport("fr-FR"), { language: "fr", supported: false, version: 1 });
  assert.equal(normalizePracticeWeakKeyTarget({ entityType: "key", entityKey: "r", language: "fr" }), null);
});

test("Weak Keys geometry uses the declared QWERTZ/AZERTY layout and leaves unknown layouts unavailable", () => {
  const qwertz = classifyPracticeKeyboardGeometry({ layout: "qwertz", previousExpected: "y", currentExpected: "z" });
  const azerty = classifyPracticeKeyboardGeometry({ layout: "azerty", previousExpected: "a", currentExpected: "z" });
  const unknown = classifyPracticeKeyboardGeometry({ layout: "custom-layout", previousExpected: "a", currentExpected: "z" });
  assert.equal(qwertz.known, true);
  assert.equal(azerty.known, true);
  assert.equal(unknown.known, false);
  assert.equal(unknown.geometryClass, "unknown");
});

test("target availability consumes only training reverse-index APIs", async () => {
  const index = readyIndex();
  const result = await validateWeakKeyTarget({
    context: { dataLocale: "en", contextId: "ctx" },
    entityKey: "R",
    indexProvider: index,
  });
  assert.equal(result.status, "ready");
  assert.equal(result.entityKey, "r");
  assert.equal(result.trainingEvidence.targetWordCount, 5);
  assert.equal(index.calls.length, 2);
  for (const [, query] of index.calls) {
    assert.equal(query.partition, "training");
    assert.equal(query.purpose, "training");
    assert.equal(query.entityType, "key");
    assert.equal(query.entityKey, "r");
  }
});

test("missing target reverse-index evidence is unavailable with no fallback", async () => {
  const result = await validateWeakKeyTarget({
    context: { dataLocale: "en" },
    entityKey: "q",
    indexProvider: {
      async getTargetContentRefs() { return []; },
      async getTargetWordRefs() { return []; },
    },
  });
  assert.equal(result.eligible, false);
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.reasons, ["KEY_INDEX_NOT_FOUND"]);
});

test("the existing weak-keys catalog mode is implemented as preview instead of duplicated", () => {
  const entry = getPracticeExperiment("weak-keys");
  assert.equal(entry.id, "weak-keys");
  assert.equal(entry.version, 1);
  assert.equal(entry.status, "preview");
  assert.equal(entry.estimatedDurationMinutes.minimum, 4);
  assert.equal(entry.estimatedDurationMinutes.maximum, 6);
  assert.match(entry.description, /one difficult letter/i);
  assert.deepEqual(entry.capabilities, ["manual-target", "recommended-target", "fixed-dose", "same-session-check"]);
});

test("Weak Keys descriptor has no protected measurement privilege and is non-resumable", () => {
  const descriptor = createPracticeWeakKeysDescriptor();
  assert.equal(descriptor.id, "weak-keys");
  assert.equal(descriptor.resumable, false);
  assert.equal(descriptor.defaultCorrectionBehavior, "allow");
  assert.deepEqual(descriptor.supportedCompletionModes, ["content"]);
  assert.equal(descriptor.abilityChannel, null);
  assert.equal(descriptor.performanceMeasurementKind, null);
  assert.equal(descriptor.retentionMeasurementKind, null);
  assert.equal(descriptor.evaluationMeasurementKind, null);
});
