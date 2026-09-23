import assert from "node:assert/strict";
import {
  FLOW_SCORE_V2_RULES,
  FLOW_V2_BOARD_KEYS,
  calculateFlowScoreV2,
  compareFlowScoreV2Results,
  createFlowScoreV2Result,
} from "../js/flow/flowScoreV2.js";
import { createFlowSessionResult } from "../js/flow/flowProgression.js";

const perfect100 = calculateFlowScoreV2({ wpm: 100, accuracy: 100, consistency: 100 });
assert.equal(perfect100.score, 100000);
assert.equal(perfect100.wpm, 100);
assert.equal(perfect100.scoredWpm, 100);
assert.equal(perfect100.accuracyMultiplier, 1);
assert.equal(perfect100.consistencyMultiplier, 1);

const steady100 = calculateFlowScoreV2({ wpm: 100, accuracy: 100, consistency: 90 });
assert.equal(steady100.score, 98500);

const accurate98 = calculateFlowScoreV2({ wpm: 100, accuracy: 98, consistency: 90 });
assert.ok(accurate98.score < steady100.score);
assert.ok(accurate98.score > 88000 && accurate98.score < 90000, accurate98);

const sloppy95 = calculateFlowScoreV2({ wpm: 100, accuracy: 95, consistency: 90 });
assert.ok(sloppy95.score < accurate98.score);
assert.ok(sloppy95.score > 75000 && sloppy95.score < 78000, sloppy95);

const inconsistent = calculateFlowScoreV2({ wpm: 100, accuracy: 100, consistency: 0 });
assert.equal(inconsistent.score, 85000, "consistency can modify only the final 15% of score");
const superhumanInput = calculateFlowScoreV2({ wpm: 999, accuracy: 100, consistency: 100 });
assert.equal(superhumanInput.wpm, 999);
assert.equal(superhumanInput.scoredWpm, 300);
assert.equal(superhumanInput.score, 300000);
assert.equal(FLOW_SCORE_V2_RULES.accuracyExponent, 5);
assert.equal(FLOW_SCORE_V2_RULES.consistencyFloor, 0.85);
assert.equal(FLOW_SCORE_V2_RULES.consistencyWeight, 0.15);
assert.equal(FLOW_SCORE_V2_RULES.minimumRecordAccuracy, 90);

const snapshot = {
  phase: "complete",
  currentIndex: 2500,
  passageLength: 2500,
  sessionLength: "standard",
  correctedErrors: 3,
  uncorrectedErrors: 1,
  wordTimings: Array.from({ length: 500 }, () => ({})),
  gameplay: {
    correctKeystrokes: 2490,
    incorrectKeystrokes: 20,
    accuracyPercent: 98.4,
  },
  cadence: {
    finalWpm: 101.2,
    rawWpm: 104.3,
    cadenceScore: 91,
    sampleCount: 2400,
    typingDurationMs: 296000,
  },
};
const plan = {
  gameplayVersion: 2,
  structure: "continuous-longform",
  id: "flow-v2-standard-test",
  seed: "score-test",
  sessionLength: "standard",
  wordCount: 500,
  seriesIds: ["station"],
};
const result = createFlowScoreV2Result({
  sessionId: "flow-v2-session-score",
  endedAt: 1700000000000,
  snapshot,
  plan,
});
assert.ok(result);
assert.equal(result.modeId, "flow");
assert.equal(result.variantId, "flow-standard-v2");
assert.equal(result.sessionSource, "flow-v2");
assert.equal(result.scoreFormula, "wpm-accuracy-consistency-v1");
assert.equal(result.developerMode, false);
assert.equal(result.boardKey, FLOW_V2_BOARD_KEYS.standard);
assert.equal(result.rulesVersion, 2);
assert.equal(result.metricVersion, 1);
assert.equal(result.completed, true);
assert.equal(result.recordEligible, true);
assert.equal(result.wpm, 101.2);
assert.equal(result.accuracy, 98.4);
assert.equal(result.consistency, 91);
assert.equal(result.wordsCompleted, 500);
assert.equal(result.seriesIds[0], "station");
assert.equal(
  result.score,
  calculateFlowScoreV2({ wpm: 101.2, accuracy: 98.4, consistency: 91 }).score,
);
const genericResult = createFlowSessionResult({
  sessionId: "flow-v2-session-score",
  endedAt: 1700000000000,
  snapshot,
  plan,
});
assert.equal(genericResult.score, result.score);
assert.equal(genericResult.wpm, result.wpm);
assert.equal(genericResult.accuracy, result.accuracy);
assert.equal(genericResult.variantId, result.variantId);
assert.equal(genericResult.modeData.consistencyScore, result.consistency);
assert.equal(genericResult.modeData.flowScoreRulesVersion, 2);
assert.equal(genericResult.modeData.flowBoardKey, FLOW_V2_BOARD_KEYS.standard);

const ineligible = createFlowScoreV2Result({
  sessionId: "flow-v2-session-low-accuracy",
  snapshot: {
    ...snapshot,
    gameplay: { ...snapshot.gameplay, accuracyPercent: 89.9 },
  },
  plan,
});
assert.equal(ineligible.completed, true);
assert.equal(ineligible.recordEligible, false);
assert.ok(ineligible.score > 0, "ineligible runs still receive a result score");

const missingIdentity = createFlowScoreV2Result({
  sessionId: "",
  snapshot,
  plan,
});
assert.equal(missingIdentity.recordEligible, false, "ranked eligibility requires a canonical session id");

const noConsistency = createFlowScoreV2Result({
  sessionId: "flow-v2-session-too-short",
  snapshot: {
    ...snapshot,
    cadence: { ...snapshot.cadence, cadenceScore: null, sampleCount: 3 },
  },
  plan,
});
assert.equal(noConsistency.recordEligible, false);

assert.equal(compareFlowScoreV2Results(
  { score: 1000, accuracy: 95, wpm: 80, consistency: 90, endedAt: 2 },
  { score: 999, accuracy: 100, wpm: 120, consistency: 100, endedAt: 1 },
), -1);
assert.equal(compareFlowScoreV2Results(
  { score: 1000, accuracy: 99, wpm: 80, consistency: 90, endedAt: 2 },
  { score: 1000, accuracy: 98, wpm: 120, consistency: 100, endedAt: 1 },
), -1);

console.log("Flow Scoring V2 contracts passed: WPM base, accuracy^5 penalty, bounded consistency influence, eligibility, and leaderboard-ready result identity.");
