import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import {
  PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID,
  PRACTICE_PROBLEM_WORDS_EXPERIMENT_VERSION,
  PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION,
  PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS,
  PRACTICE_PROBLEM_WORDS_POLICY_VERSION,
  PRACTICE_PROBLEM_WORDS_RESULT_VERSION,
  PRACTICE_PROBLEM_WORDS_SELECTION_VERSION,
  PRACTICE_PROBLEM_WORDS_VERSION,
} from "../js/practiceLab/practiceProblemWordsConstants.js";
import { normalizePracticeProblemWordInput, validateProblemWordTarget } from "../js/practiceLab/practiceProblemWordsTargets.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import { createPracticeProblemWordsDescriptor } from "../js/practiceLab/practiceProblemWordsExperiment.js";

function readyIndex() {
  const calls = [];
  return {
    calls,
    async getWordSummary(query) {
      calls.push(query);
      return {
        lexicalKey: query.lexicalKey,
        contents: [
          { contentId: "c1", familyId: "f1", count: 1, positions: [4] },
          { contentId: "c2", familyId: "f2", count: 1, positions: [8] },
        ],
      };
    },
  };
}

test("PL22 contracts remain intact inside the PL25 DB8/session13/foundation10 envelope", () => {
  assert.ok(PRACTICE_DATABASE_VERSION >= 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
});

test("PL22 version family and stable experiment identity start at v1", () => {
  assert.equal(PRACTICE_PROBLEM_WORDS_VERSION, 1);
  assert.equal(PRACTICE_PROBLEM_WORDS_EXPERIMENT_VERSION, 1);
  assert.equal(PRACTICE_PROBLEM_WORDS_POLICY_VERSION, 1);
  assert.equal(PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION, 1);
  assert.equal(PRACTICE_PROBLEM_WORDS_SELECTION_VERSION, 1);
  assert.equal(PRACTICE_PROBLEM_WORDS_RESULT_VERSION, 1);
  assert.equal(PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID, "problem-words");
});

test("PL22 uses exact Baseline/Focus/Context/Mix/Check word quotas", () => {
  assert.deepEqual(PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS, {
    "entry-probe": 3,
    focus: 4,
    context: 3,
    interleave: 2,
    "exit-probe": 3,
    total: 15,
  });
});

test("Problem Words visibly normalizes English case but rejects unsupported lexical classes", () => {
  const normalized = normalizePracticeProblemWordInput("  Because  ", "en");
  assert.equal(normalized.valid, true);
  assert.equal(normalized.normalizedValue, "because");
  assert.deepEqual(normalized.target, { entityType: "word", entityKey: "because" });
  for (const value of ["a", "I", "two words", "don't", "well-known", "abc1", "a$b", "abcdefghijklmnopqrstuvwxy"]) {
    assert.equal(normalizePracticeProblemWordInput(value, "en").valid, false, value);
  }
  assert.equal(normalizePracticeProblemWordInput("because", "fr-FR").status, "unsupported");
});

test("Problem Words availability consumes only the training word reverse index", async () => {
  const index = readyIndex();
  const result = await validateProblemWordTarget({ context: { dataLocale: "en", contextId: "ctx" }, entityKey: "Because", indexProvider: index });
  assert.equal(result.status, "ready");
  assert.equal(result.entityKey, "because");
  assert.equal(result.trainingEvidence.contentCount, 2);
  assert.equal(result.trainingEvidence.familyCount, 2);
  assert.equal(index.calls.length, 1);
  assert.deepEqual(index.calls[0], { partition: "training", lexicalKey: "because", purpose: "training" });
});

test("unknown Problem Word is unavailable and never receives invented content", async () => {
  const result = await validateProblemWordTarget({ context: { dataLocale: "en" }, entityKey: "unknownword", indexProvider: { async getWordSummary() { return null; } } });
  assert.equal(result.eligible, false);
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.reasons, ["WORD_NOT_IN_TRAINING_CORPUS"]);
});

test("existing problem-words catalog entry is preview, unique, and retains no protected measurement privilege", () => {
  const entry = getPracticeExperiment("problem-words");
  assert.equal(entry.id, "problem-words");
  assert.equal(entry.version, 1);
  assert.equal(entry.status, "preview");
  assert.deepEqual(entry.estimatedDurationMinutes, { minimum: 4, recommended: 5, maximum: 6 });
  assert.match(entry.description, /difficult words/i);
  assert.deepEqual(entry.capabilities, ["manual-target", "recommended-target", "fixed-dose", "same-session-check"]);
  const descriptor = createPracticeProblemWordsDescriptor();
  assert.equal(descriptor.resumable, false);
  assert.equal(descriptor.defaultCorrectionBehavior, "allow");
  assert.equal(descriptor.abilityChannel, null);
  assert.equal(descriptor.performanceMeasurementKind, null);
  assert.equal(descriptor.retentionMeasurementKind, null);
  assert.equal(descriptor.evaluationMeasurementKind, null);
});
