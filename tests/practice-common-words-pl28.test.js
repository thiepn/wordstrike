import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_COMMON_WORD_BANDS,
  PRACTICE_COMMON_WORD_BAND_RANGES,
  PRACTICE_COMMON_WORD_PRACTICE_SIZES,
  PRACTICE_COMMON_WORD_CHECK_WORD_COUNT,
  PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND,
} from "../js/practiceLab/practiceCommonWordsConstants.js";
import { selectPracticeCommonWords } from "../js/practiceLab/practiceCommonWordsSelection.js";
import { buildPracticeCommonWordBreadthSnapshot } from "../js/practiceLab/practiceCommonWordBreadth.js";
import { comparePracticeCommonWordBreadthSnapshots } from "../js/practiceLab/practiceCommonWordBreadthComparison.js";
import { buildPracticeCommonWordBandMetrics } from "../js/practiceLab/practiceCommonWordBandAccumulator.js";
import { createPracticeCommonWordsDescriptor, createPracticeCommonWordCheckDescriptor, registerPracticeCommonWordsExperiment } from "../js/practiceLab/practiceCommonWordsExperiment.js";
import { createPracticeExperimentRegistry } from "../js/practiceLab/practiceExperimentRegistryRuntime.js";
import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS } from "../js/practiceLab/practiceConstants.js";

const letters = (index) => {
  let value = index + 1; let result = "";
  while (value) { value -= 1; result = String.fromCharCode(97 + value % 26) + result; value = Math.floor(value / 26); }
  return `word${result}`;
};
const bandFor = (rank) => PRACTICE_COMMON_WORD_BANDS.find((band) => rank >= PRACTICE_COMMON_WORD_BAND_RANGES[band].minimumRank && rank <= PRACTICE_COMMON_WORD_BAND_RANGES[band].maximumRank);
const reference = {
  referenceId: "WS-COMMON-EN-1", referenceVersion: 1,
  words: Array.from({ length: 1200 }, (_, index) => ({ lexicalKey: letters(index), rank: index + 1, band: bandFor(index + 1) })),
};
const bank = { referenceId: reference.referenceId, referenceVersion: 1, bankId: "WS-COMMON-PRACTICE-EN-1", bankVersion: 1, words: reference.words };
const stat = (key, opportunities, sessions = 1, lastObservedAt = "2026-09-01T00:00:00.000Z", extras = {}) => ({
  recordVersion: 3, statId: `s_${key}`, profileId: "p", contextId: "c", entityType: "word", entityKey: key, lastObservedAt,
  evidence: { opportunities: { count: opportunities }, observation: { sessionCount: sessions, lastObservedAt } }, ...extras,
});

function assertPlanShape(words, size) {
  assert.equal(words.length, size);
  assert.equal(new Set(words.map((word) => word.lexicalKey)).size, size);
  for (const band of PRACTICE_COMMON_WORD_BANDS) assert.equal(words.filter((word) => word.band === band).length, size / 4);
  for (let offset = 0; offset < size; offset += 20) {
    const block = words.slice(offset, offset + 20);
    for (const band of PRACTICE_COMMON_WORD_BANDS) assert.equal(block.filter((word) => word.band === band).length, 5);
    let run = 1;
    for (let index = 1; index < block.length; index += 1) { run = block[index].band === block[index - 1].band ? run + 1 : 1; assert.ok(run <= 2); }
  }
}

test("PL28 generic record schemas remain stable inside the PL32 DB10 envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_RECORD_VERSIONS.abilityState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.performanceState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.coachPlan, 1);
});

test("Common Words Practice is balanced, duplicate-free, and deterministic for all v1 sizes", () => {
  for (const size of PRACTICE_COMMON_WORD_PRACTICE_SIZES) {
    const first = selectPracticeCommonWords({ bank, wordCount: size, sessionId: "session-a", skillStats: [] });
    const second = selectPracticeCommonWords({ bank, wordCount: size, sessionId: "session-a", skillStats: [] });
    assertPlanShape(first.words, size);
    assert.deepEqual(first.words.map((word) => word.lexicalKey), second.words.map((word) => word.lexicalKey));
  }
});

test("Practice selection is coverage-first and ignores weakness/mastery/saturation fields", () => {
  const core = reference.words.filter((word) => word.band === "core");
  const statsA = core.slice(0, 80).map((word, index) => stat(word.lexicalKey, 50, 8, "2026-09-08T00:00:00.000Z", { weaknessScore: 100 - index, priority: 1000, masteryState: "weak", saturation: 1 }));
  const unobservedKey = core[99].lexicalKey;
  const first = selectPracticeCommonWords({ bank, wordCount: 80, sessionId: "coverage", skillStats: statsA });
  assert.ok(first.words.some((word) => word.lexicalKey === unobservedKey));
  const mutated = statsA.map((value) => ({ ...value, weaknessScore: -999, priority: -999, masteryState: "mastered", saturation: 0 }));
  const second = selectPracticeCommonWords({ bank, wordCount: 80, sessionId: "coverage", skillStats: mutated });
  assert.deepEqual(first.words.map((word) => word.lexicalKey), second.words.map((word) => word.lexicalKey));
});

test("typing breadth uses canonical denominators and PL11/PL15-derived evidence states", () => {
  const [u, o, r, a, s] = reference.words.slice(0, 5);
  const skillStats = [stat(o.lexicalKey, 1, 1), stat(r.lexicalKey, 3, 2), stat(a.lexicalKey, 4, 2), stat(s.lexicalKey, 6, 3)];
  const masterySnapshot = { entities: [
    { entityType: "word", entityKey: a.lexicalKey, automaticity: { score: 80, confidenceLevel: "medium" } },
    { entityType: "word", entityKey: s.lexicalKey, automaticity: { score: 94, confidenceLevel: "high" } },
  ] };
  const snapshot = buildPracticeCommonWordBreadthSnapshot({ profileId: "p", contextId: "c", referenceBank: reference, skillStats, masterySnapshot });
  assert.equal(snapshot.words.find((word) => word.lexicalKey === u.lexicalKey).coverage.state, "unobserved");
  assert.equal(snapshot.words.find((word) => word.lexicalKey === o.lexicalKey).coverage.state, "observed");
  assert.equal(snapshot.words.find((word) => word.lexicalKey === r.lexicalKey).coverage.state, "repeated-evidence");
  assert.equal(snapshot.words.find((word) => word.lexicalKey === a.lexicalKey).coverage.state, "automatic");
  assert.equal(snapshot.words.find((word) => word.lexicalKey === s.lexicalKey).coverage.state, "strong");
  assert.equal(snapshot.bands.core.totalWords, 100);
  assert.equal(snapshot.overall.totalWords, 1200);
  const later = buildPracticeCommonWordBreadthSnapshot({ profileId: "p", contextId: "c", referenceBank: reference, skillStats: [...skillStats, stat(u.lexicalKey, 3, 2)], masterySnapshot });
  const comparison = comparePracticeCommonWordBreadthSnapshots(snapshot, later);
  assert.equal(comparison.overall.repeatedEvidence.countDelta, 1);
  assert.throws(() => comparePracticeCommonWordBreadthSnapshots(snapshot, { ...later, contextId: "other" }), /not strongly comparable/);
});

test("band metrics keep first-pass word correctness separate from launch and internal timing", () => {
  const contentPlan = { units: [
    { type: "word", startIndex: 0, endIndex: 2, text: "ab", metadata: { commonWords: { band: "core" } } },
    { type: "word", startIndex: 3, endIndex: 5, text: "cd", metadata: { commonWords: { band: "broad" } } },
  ] };
  const eventTrace = [
    { type: "character", isFirstAttempt: true, textPosition: 0, expected: "a", correctness: "correct" },
    { type: "character", isFirstAttempt: true, textPosition: 1, expected: "b", correctness: "incorrect" },
    { type: "character", isFirstAttempt: true, textPosition: 3, expected: "c", correctness: "correct" },
    { type: "character", isFirstAttempt: true, textPosition: 4, expected: "d", correctness: "correct" },
  ];
  const normalizedTransitions = [
    { isFirstAttempt: true, textPosition: 0, latencyClass: "fluent", residualLatencyMs: 10 },
    { isFirstAttempt: true, textPosition: 1, latencyClass: "disfluent", residualLatencyMs: 50 },
    { isFirstAttempt: true, textPosition: 3, latencyClass: "disfluent", residualLatencyMs: 40 },
    { isFirstAttempt: true, textPosition: 4, latencyClass: "fluent", residualLatencyMs: 20 },
  ];
  const metrics = buildPracticeCommonWordBandMetrics({ contentPlan, eventTrace, foundationAnalysis: { normalization: { normalizedTransitions } } });
  assert.equal(metrics.core.wordOpportunityCount, 1);
  assert.equal(metrics.core.wholeWordFirstPassAccuracy, 0);
  assert.equal(metrics.core.launchResidualMedianMs, 10);
  assert.equal(metrics.core.internalResidualMedianMs, null);
  assert.equal(metrics.broad.wholeWordFirstPassAccuracy, 1);
  assert.equal(metrics.broad.launchDisfluencyRate, 1);
  assert.equal(metrics.broad.internalResidualMedianMs, 20);
  assert.equal("wpm" in metrics.broad, false);
});

test("visible Practice and hidden Check preserve distinct PL13 roles", () => {
  const practice = createPracticeCommonWordsDescriptor();
  const check = createPracticeCommonWordCheckDescriptor();
  assert.equal(practice.id, "common-words");
  assert.equal(practice.abilityChannel, null);
  assert.equal(check.id, "common-words-check");
  assert.equal(check.abilityChannel, "common-words");
  assert.equal(practice.resumable, false);
  assert.equal(check.resumable, false);
  assert.equal(getPracticeExperiment("common-words").status, "preview");
  const registry = createPracticeExperimentRegistry();
  registerPracticeCommonWordsExperiment(registry, { runtime: { prepare() {}, getAvailability() {}, getBreadthSnapshot() {} } });
  assert.equal(registry.getResolvedExperiment("common-words").runnable, true);
});

test("PL28 standardized Check contract remains exactly 200 words and 50 per band", () => {
  assert.equal(PRACTICE_COMMON_WORD_CHECK_WORD_COUNT, 200);
  assert.equal(PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND, 50);
});
