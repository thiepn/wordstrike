import assert from "node:assert/strict";
import {
  FLOW_SCORE_V2_RULES,
  FLOW_V2_BOARD_KEYS,
  calculateFlowScoreV2,
  compareFlowScoreV2Results,
  createFlowScoreV2Result,
} from "../js/flow/flowScoreV2.js";
import {
  FLOW_RECORDS_V2_MAX_HISTORY,
  FLOW_RECORDS_V2_STORAGE_KEY,
  getFlowPersonalBestV2,
  getFlowRecentRunsV2,
  loadFlowRecordsV2,
  recordFlowResultV2,
  resetFlowRecordsV2,
} from "../js/flow/flowRecordsV2.js";

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

store.clear();
resetFlowRecordsV2();

const transparent = calculateFlowScoreV2({ wpm: 100, accuracy: 98, consistency: 90 });
const expectedAccuracy = Math.pow(0.98, 5);
const expectedConsistency = 0.85 + (0.15 * 0.9);
assert.equal(
  transparent.score,
  Math.round(1000 * 100 * expectedAccuracy * expectedConsistency),
);
assert.equal(transparent.wpm, 100);
assert.equal(transparent.accuracy, 98);
assert.equal(transparent.consistency, 90);
assert.equal(transparent.rulesVersion, 2);
assert.equal(transparent.metricVersion, 1);

const perfect = calculateFlowScoreV2({ wpm: 100, accuracy: 100, consistency: 100 });
const sloppy = calculateFlowScoreV2({ wpm: 100, accuracy: 95, consistency: 100 });
const inconsistent = calculateFlowScoreV2({ wpm: 100, accuracy: 100, consistency: 0 });
assert.equal(perfect.score, 100000);
assert.ok(sloppy.score < perfect.score * 0.8, "95% accuracy must carry a material score penalty");
assert.equal(inconsistent.score, 85000, "consistency may alter only the final 15% of score weight");

const capped = calculateFlowScoreV2({ wpm: 999, accuracy: 100, consistency: 100 });
assert.equal(capped.wpm, FLOW_SCORE_V2_RULES.maximumScoredWpm);
assert.equal(capped.score, 300000);

const plan = {
  id: "flow-v2-standard-contract",
  gameplayVersion: 2,
  structure: "continuous-longform",
  sessionLength: "standard",
  wordCount: 500,
  seed: "score-v2",
  seriesIds: ["station"],
};
const snapshot = {
  phase: "complete",
  currentIndex: 2500,
  passageLength: 2500,
  sessionLength: "standard",
  correctedErrors: 2,
  uncorrectedErrors: 1,
  gameplay: {
    accuracyPercent: 98,
    correctKeystrokes: 2490,
    incorrectKeystrokes: 10,
  },
  cadence: {
    finalWpm: 100,
    rawWpm: 102.5,
    cadenceScore: 90,
    sampleCount: 2000,
    typingDurationMs: 300000,
  },
  wordTimings: Array.from({ length: 500 }, () => ({})),
};
const result = createFlowScoreV2Result({
  sessionId: "flow-v2-score-session",
  endedAt: 1700000000000,
  snapshot,
  plan,
});
assert.equal(result.modeId, "flow");
assert.equal(result.variantId, "flow-standard-v2");
assert.equal(result.boardKey, FLOW_V2_BOARD_KEYS.standard);
assert.equal(result.sessionSource, "flow-v2");
assert.equal(result.scoreFormula, "wpm-accuracy-consistency-v1");
assert.equal(result.developerMode, false);
assert.equal(result.completed, true);
assert.equal(result.recordEligible, true);
assert.equal(result.score, transparent.score);
assert.equal(result.wpm, 100);
assert.equal(result.rawWpm, 102.5);
assert.equal(result.accuracy, 98);
assert.equal(result.consistency, 90);
assert.equal(result.wordsCompleted, 500);
assert.equal(result.charactersCompleted, 2500);
assert.equal(result.correctedErrors, 2);
assert.equal(result.unresolvedErrors, 1);

const lowAccuracy = createFlowScoreV2Result({
  sessionId: "flow-v2-low-accuracy",
  snapshot: {
    ...snapshot,
    gameplay: { ...snapshot.gameplay, accuracyPercent: 89.9 },
  },
  plan: { ...plan, sessionLength: "quick" },
});
assert.equal(lowAccuracy.completed, true);
assert.equal(lowAccuracy.recordEligible, false);
assert.equal(lowAccuracy.boardKey, FLOW_V2_BOARD_KEYS.quick);

const tooFewSamples = createFlowScoreV2Result({
  sessionId: "flow-v2-no-consistency",
  snapshot: {
    ...snapshot,
    cadence: { ...snapshot.cadence, cadenceScore: null, sampleCount: 2 },
  },
  plan: { ...plan, sessionLength: "long" },
});
assert.equal(tooFewSamples.recordEligible, false);
assert.equal(tooFewSamples.consistency, 0);

const first = recordFlowResultV2(result);
assert.equal(first.recorded, true);
assert.equal(first.isPersonalBest, true);
assert.equal(first.previousBest, null);
assert.equal(first.personalBest.score, result.score);
assert.ok(store.has(FLOW_RECORDS_V2_STORAGE_KEY));

const duplicate = recordFlowResultV2(result);
assert.equal(duplicate.recorded, false);
assert.equal(loadFlowRecordsV2().completedRuns, 1);

const worseStandard = {
  ...result,
  sessionId: "flow-v2-score-session-2",
  endedAt: 1700000001000,
  score: result.score - 5000,
  wpm: 95,
};
const worse = recordFlowResultV2(worseStandard);
assert.equal(worse.isPersonalBest, false);
assert.equal(getFlowPersonalBestV2("standard").sessionId, result.sessionId);

const betterStandard = {
  ...result,
  sessionId: "flow-v2-score-session-3",
  endedAt: 1700000002000,
  score: result.score + 1000,
  wpm: 101,
};
const better = recordFlowResultV2(betterStandard);
assert.equal(better.isPersonalBest, true);
assert.equal(getFlowPersonalBestV2("standard").sessionId, betterStandard.sessionId);

const quickResult = {
  ...result,
  sessionId: "flow-v2-quick-pb",
  sessionLength: "quick",
  variantId: "flow-quick-v2",
  boardKey: FLOW_V2_BOARD_KEYS.quick,
  score: 70000,
};
recordFlowResultV2(quickResult);
assert.equal(getFlowPersonalBestV2("quick").sessionId, quickResult.sessionId);
assert.equal(getFlowPersonalBestV2("standard").sessionId, betterStandard.sessionId);
assert.equal(getFlowPersonalBestV2("long"), null);

const ineligible = {
  ...lowAccuracy,
  sessionId: "flow-v2-ineligible-history",
  endedAt: 1700000003000,
};
const ineligibleRecord = recordFlowResultV2(ineligible);
assert.equal(ineligibleRecord.recorded, true);
assert.equal(ineligibleRecord.isPersonalBest, false);
assert.equal(getFlowPersonalBestV2("quick").sessionId, quickResult.sessionId);
assert.equal(getFlowRecentRunsV2(1)[0].sessionId, ineligible.sessionId);

for (let index = 0; index < FLOW_RECORDS_V2_MAX_HISTORY + 8; index += 1) {
  recordFlowResultV2({
    ...result,
    sessionId: `flow-v2-bounded-${index}`,
    endedAt: 1700000010000 + index,
    score: 50000 + index,
  });
}
assert.equal(loadFlowRecordsV2().history.length, FLOW_RECORDS_V2_MAX_HISTORY);

assert.ok(compareFlowScoreV2Results(
  { score: 90000, accuracy: 98, wpm: 100, consistency: 90, endedAt: 2 },
  { score: 89000, accuracy: 100, wpm: 120, consistency: 100, endedAt: 1 },
) < 0);
assert.ok(compareFlowScoreV2Results(
  { score: 90000, accuracy: 99, wpm: 100, consistency: 90, endedAt: 2 },
  { score: 90000, accuracy: 98, wpm: 110, consistency: 100, endedAt: 1 },
) < 0);
assert.ok(compareFlowScoreV2Results(
  { score: 90000, accuracy: 99, wpm: 100, consistency: 90, endedAt: 1 },
  { score: 90000, accuracy: 99, wpm: 100, consistency: 90, endedAt: 2 },
) < 0);

console.log("Flow V2 Phase 3 scoring/records passed: transparent WPM-accuracy-consistency score, 90% PB gate, separate length PBs, idempotency, and bounded history.");
