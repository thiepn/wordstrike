import test from "node:test";
import assert from "node:assert/strict";
import { buildProblemWordCandidates } from "../js/practiceLab/practiceProblemWordsSelection.js";
import { selectPracticeProblemWordsExactQuota } from "../js/practiceLab/practiceProblemWordsComposer.js";
import { scorePracticeProblemWordsProbePair, selectPracticeProblemWordsProbePair } from "../js/practiceLab/practiceProblemWordsProbeMatch.js";
import { buildPracticeProblemWordsProbeMetrics } from "../js/practiceLab/practiceProblemWordsMetrics.js";

function limiter(statId, entityType, entityKey, phenotype, priority, hierarchy = { status: "independent", explainedBy: [] }) {
  return { statId, entityType, entityKey, status: "confirmed", primaryPhenotype: phenotype, priorityScore: priority, weaknessScore: priority, evidenceConfidenceScore: 90, hierarchy };
}

test("PL22 recommendations are word-only, phenotype-aware, and hierarchy explained words are de-emphasized", () => {
  const skillStats = [
    { statId: "w1", profileId: "p", contextId: "c", entityType: "word", entityKey: "because" },
    { statId: "w2", profileId: "p", contextId: "c", entityType: "word", entityKey: "through" },
    { statId: "k1", profileId: "p", contextId: "c", entityType: "key", entityKey: "b" },
    { statId: "b1", profileId: "p", contextId: "c", entityType: "bigram", entityKey: "th" },
  ];
  const candidates = buildProblemWordCandidates({
    profileId: "p", contextId: "c", skillStats,
    limiterSnapshot: { profileId: "p", contextId: "c", candidates: [
      limiter("w1", "word", "because", "launch-limited", 80),
      limiter("w2", "word", "through", "slow", 95, { status: "explained", explainedBy: [{ entityType: "bigram", entityKey: "th", confidenceScore: 95 }] }),
      limiter("k1", "key", "b", "slow", 100), limiter("b1", "bigram", "th", "slow", 100),
    ] },
    masterySnapshot: { profileId: "p", contextId: "c", entities: [{ statId: "w1", stage: "learning" }, { statId: "w2", stage: "learning" }] },
    learningStates: [],
  });
  assert.equal(candidates.every((candidate) => candidate.entityType === "word"), true);
  assert.deepEqual(candidates.map((candidate) => candidate.entityKey), ["because", "through"]);
  assert.equal(candidates[0].limiterPhenotype, "launch-limited");
  assert.equal(candidates[1].hierarchyDeemphasized, true);
  assert.deepEqual(candidates[1].explanatoryEntities, [{ entityType: "bigram", entityKey: "th", confidenceScore: 95 }]);
});

test("PL22 exact composer hits quota without overshoot and prefers family diversity deterministically", () => {
  const candidates = [
    { candidateId: "a", targetOpportunityCount: 2, familyId: "f1" },
    { candidateId: "b", targetOpportunityCount: 1, familyId: "f1" },
    { candidateId: "c", targetOpportunityCount: 1, familyId: "f2" },
    { candidateId: "d", targetOpportunityCount: 1, familyId: "f3" },
  ];
  const first = selectPracticeProblemWordsExactQuota(candidates, 3, { sessionId: "s", entityKey: "because" });
  const second = selectPracticeProblemWordsExactQuota(candidates, 3, { sessionId: "s", entityKey: "because" });
  assert.equal(first.targetOpportunityCount, 3);
  assert.deepEqual(first, second);
  assert.ok(first.metrics.familyCount >= 2);
});

test("PL22 probe matcher enforces exact 3/3 family/content disjointness and bounded matching", () => {
  const unit = (id, family, difficulty, launch) => ({ candidateId: id, contentId: id, familyId: family, targetOpportunityCount: 1, compositionMode: "natural-text-bundle", typabilityScore: difficulty, difficultyFeatures: { meanWordLength: 1, p90WordLength: 1, uppercaseRatio: 0, punctuationRatio: 0, digitRatio: 0, symbolRatio: 0, lexicalRarityScore: 0, bigramRarityScore: 0 }, launchSignatures: [launch] });
  const entry = { probeId: "entry", compositionMode: "natural-text-bundle", units: [unit("a", "fa", 40, "x"), unit("b", "fb", 40, "y"), unit("c", "fc", 40, "z")] };
  const good = { probeId: "good", compositionMode: "natural-text-bundle", units: [unit("d", "fd", 40.1, "x"), unit("e", "fe", 40.1, "y"), unit("f", "ff", 40.1, "z")] };
  const overlap = { probeId: "overlap", compositionMode: "natural-text-bundle", units: [unit("a", "fa", 40, "x"), unit("g", "fg", 40, "y"), unit("h", "fh", 40, "z")] };
  assert.equal(scorePracticeProblemWordsProbePair(entry, good).valid, true);
  assert.equal(scorePracticeProblemWordsProbePair(entry, overlap).valid, false);
  assert.equal(selectPracticeProblemWordsProbePair({ entryCandidates: [entry], exitCandidates: [overlap, good] }).exit.probeId, "good");
});

function targetTrace({ start, word, launchResidual, internalResidual, errorOffset = null }) {
  const events = [];
  const transitions = [];
  Array.from(word).forEach((expected, offset) => {
    const position = start + offset;
    const isError = offset === errorOffset;
    events.push({ type: "character", isFirstAttempt: true, textPosition: position, expected, correctness: isError ? "incorrect" : "correct" });
    transitions.push({ isFirstAttempt: true, textPosition: position, correctness: isError ? "incorrect" : "correct", latencyClass: offset === 0 ? "fluent" : "fluent", residualLatencyMs: offset === 0 ? launchResidual : internalResidual, observedLatencyMs: 100 + (offset === 0 ? launchResidual : internalResidual) });
  });
  return { events, transitions };
}

test("PL22 word profile keeps first-pass accuracy, launch, and internal execution separate", () => {
  const word = "because";
  const a = targetTrace({ start: 0, word, launchResidual: 70, internalResidual: 5 });
  const b = targetTrace({ start: 10, word, launchResidual: 80, internalResidual: 4, errorOffset: 3 });
  const c = targetTrace({ start: 20, word, launchResidual: 60, internalResidual: 6 });
  const metrics = buildPracticeProblemWordsProbeMetrics({
    eventTrace: [...a.events, ...b.events, ...c.events],
    foundationAnalysis: { normalization: { normalizedTransitions: [...a.transitions, ...b.transitions, ...c.transitions] }, errors: { episodes: [] } },
    targetWordRanges: [{ startIndex: 0, endIndex: 7 }, { startIndex: 10, endIndex: 17 }, { startIndex: 20, endIndex: 27 }],
    expectedEntityKey: word,
  });
  assert.equal(metrics.opportunityCount, 3);
  assert.equal(metrics.wholeWordFirstPassAccuracy, 2 / 3);
  assert.equal(metrics.launch.fluentResidualMedianMs, 70);
  assert.equal(metrics.internal.fluentResidualMedianMs, 5);
  assert.notEqual(metrics.launch.fluentResidualMedianMs, metrics.internal.fluentResidualMedianMs);
});

test("a corrected/repairable word still remains a first-pass word error", () => {
  const word = "because";
  const trace = targetTrace({ start: 0, word, launchResidual: 10, internalResidual: 5, errorOffset: 2 });
  trace.events.push({ type: "backspace", isFirstAttempt: false, textPosition: 2 }, { type: "character", isFirstAttempt: false, textPosition: 2, expected: "c", correctness: "correct" });
  const metrics = buildPracticeProblemWordsProbeMetrics({ eventTrace: trace.events, foundationAnalysis: { normalization: { normalizedTransitions: trace.transitions }, errors: { episodes: [{ startTextPosition: 2, errorToRepairMs: 240 }] } }, targetWordRanges: [{ startIndex: 0, endIndex: 7 }], expectedEntityKey: word });
  assert.equal(metrics.wholeWordFirstPassAccuracy, 0);
  assert.equal(metrics.recovery.primaryErrorEpisodeCount, 1);
  assert.equal(metrics.recovery.errorToRepairMeanMs, 240);
});
