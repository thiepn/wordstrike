import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_TYPABILITY_MODEL_KIND,
  PRACTICE_TYPABILITY_MODEL_VERSION,
  PRACTICE_TYPABILITY_REFERENCE_VERSION,
  PRACTICE_TYPABILITY_WEIGHTS_V1,
  buildPracticeTypabilityReference,
  calculatePracticeDifficultyPercentile,
  scorePracticeTextTypability,
} from "../js/practiceLab/practiceTypabilityModel.js";

function feature(overrides = {}) {
  return {
    featureVersion: 1,
    language: "en",
    meanWordLength: 5,
    p90WordLength: 8,
    uppercaseRatio: 0.04,
    punctuationRatio: 0.06,
    digitRatio: 0.02,
    symbolRatio: 0.01,
    lexicalRarityScore: 0.3,
    bigramRarityScore: 0.3,
    ...overrides,
  };
}

function reference(rows) {
  return buildPracticeTypabilityReference({
    trainingFeatures: rows,
    language: "en",
    corpusId: "practice-en-fixture",
    corpusVersion: 1,
    corpusChecksum: `sha256-${"1".repeat(64)}`,
    indexSchemaVersion: 1,
    indexChecksum: `sha256-${"2".repeat(64)}`,
    segmentationVersion: 1,
    tokenizationVersion: 1,
    sourceIds: ["fixture-source"],
  });
}

test("PL10 v1 typability weights are fixed, positive-direction, and sum exactly to one", () => {
  assert.equal(PRACTICE_TYPABILITY_MODEL_VERSION, 1);
  assert.equal(PRACTICE_TYPABILITY_REFERENCE_VERSION, 1);
  assert.equal(PRACTICE_TYPABILITY_MODEL_KIND, "heuristic-relative-v1");
  const expected = {
    meanWordLength: 0.16,
    p90WordLength: 0.08,
    uppercaseRatio: 0.10,
    punctuationRatio: 0.12,
    digitRatio: 0.08,
    symbolRatio: 0.08,
    lexicalRarityScore: 0.19,
    bigramRarityScore: 0.19,
  };
  assert.deepEqual(PRACTICE_TYPABILITY_WEIGHTS_V1, expected);
  assert.ok(Math.abs(Object.values(PRACTICE_TYPABILITY_WEIGHTS_V1).reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});

test("PL10 missing frequency features renormalize to 0.62 available weight and partial status", () => {
  const rows = [feature(), feature({ meanWordLength: 6, p90WordLength: 9 })].map((row) => ({ ...row, lexicalRarityScore: null, bigramRarityScore: null }));
  const ref = reference(rows);
  const score = scorePracticeTextTypability({ features: rows[0], reference: ref, language: "en" });
  assert.equal(score.status, "partial");
  assert.equal(score.availableModelWeight, 0.62);
  assert.ok(Math.abs(Object.values(score.effectiveWeights).reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
  assert.equal(Object.hasOwn(score.effectiveWeights, "lexicalRarityScore"), false);
  assert.equal(Object.hasOwn(score.effectiveWeights, "bigramRarityScore"), false);
  assert.ok(Number.isFinite(score.difficultyIndex));
});

test("PL10 complete feature coverage scores as full and preserves all model weights", () => {
  const rows = [feature(), feature({ meanWordLength: 6, lexicalRarityScore: 0.5, bigramRarityScore: 0.6 })];
  const ref = reference(rows);
  const score = scorePracticeTextTypability({ features: rows[0], reference: ref, language: "en" });
  assert.equal(score.status, "full");
  assert.equal(score.availableModelWeight, 1);
  assert.deepEqual(score.effectiveWeights, PRACTICE_TYPABILITY_WEIGHTS_V1);
});

test("PL10 unsupported languages refuse a numeric typability correction", () => {
  const ref = reference([feature(), feature({ meanWordLength: 6 })]);
  const score = scorePracticeTextTypability({ features: { ...feature(), language: "de" }, reference: ref, language: "de" });
  assert.equal(score.status, "unsupported-language");
  assert.equal(score.difficultyIndex, null);
  assert.equal(score.relativeDifficultyPercentile, null);
});

test("PL10 robust reference statistics resist a single extreme outlier", () => {
  const rows = [5, 5, 5, 5, 50].map((meanWordLength) => feature({ meanWordLength }));
  const ref = reference(rows);
  assert.equal(ref.featureStats.meanWordLength.median, 5);
  assert.equal(ref.featureStats.meanWordLength.mad, 0);
  assert.equal(ref.featureStats.meanWordLength.robustScale, 0);
});

test("PL10 empirical midrank percentile is deterministic for ties", () => {
  assert.equal(calculatePracticeDifficultyPercentile(3, [1, 2, 3, 4, 5]), 50);
  assert.equal(calculatePracticeDifficultyPercentile(2, [1, 2, 2, 3]), 50);
});

test("PL10 harder feature directions monotonically increase DifficultyIndex under a fixed reference", () => {
  const rows = [
    feature({ meanWordLength: 4, p90WordLength: 6, uppercaseRatio: 0.01, punctuationRatio: 0.02, digitRatio: 0, symbolRatio: 0, lexicalRarityScore: 0.1, bigramRarityScore: 0.1 }),
    feature({ meanWordLength: 5, p90WordLength: 8, uppercaseRatio: 0.03, punctuationRatio: 0.04, digitRatio: 0.01, symbolRatio: 0.01, lexicalRarityScore: 0.3, bigramRarityScore: 0.3 }),
    feature({ meanWordLength: 6, p90WordLength: 10, uppercaseRatio: 0.05, punctuationRatio: 0.06, digitRatio: 0.02, symbolRatio: 0.02, lexicalRarityScore: 0.5, bigramRarityScore: 0.5 }),
  ];
  const ref = reference(rows);
  const baseline = feature();
  const baseScore = scorePracticeTextTypability({ features: baseline, reference: ref, language: "en" }).difficultyIndex;
  for (const [key, harder] of [
    ["meanWordLength", 7],
    ["p90WordLength", 12],
    ["uppercaseRatio", 0.08],
    ["punctuationRatio", 0.10],
    ["digitRatio", 0.06],
    ["symbolRatio", 0.06],
    ["lexicalRarityScore", 0.8],
    ["bigramRarityScore", 0.8],
  ]) {
    const score = scorePracticeTextTypability({ features: feature({ [key]: harder }), reference: ref, language: "en" }).difficultyIndex;
    assert.ok(score > baseScore, `${key} should increase difficulty`);
  }
});
