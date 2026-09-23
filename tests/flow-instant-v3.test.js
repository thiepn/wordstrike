import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FLOW_SCORE_V3_RULES,
  FLOW_V3_BOARD_KEY,
  calculateFlowScoreV3,
  createFlowScoreV3Result,
} from "../js/flow/flowScoreV3.js";
import {
  FLOW_V3_DEFAULT_THEME,
  FLOW_V3_THEME_IDS,
  createFlowStreamPlanV3,
  normalizeFlowV3Theme,
} from "../js/flow/flowStreamPlanV3.js";
import {
  FLOW_RECORDS_V3_STORAGE_KEY,
  getFlowPersonalBestV3,
  loadFlowRecordsV3,
  recordFlowResultV3,
  resetFlowRecordsV3,
} from "../js/flow/flowRecordsV3.js";
import {
  buildFlowSubmissionResult,
  buildSubmissionPayload,
} from "../js/leaderboardSubmissionService.js";
import {
  FLOW_BOARD_KEYS,
  FLOW_CONTRACT_VERSION,
  FLOW_METRIC_VERSION,
  FLOW_RULES_VERSION,
  validateScoreSubmission,
} from "../supabase/functions/_shared/scoreSubmission.js";
import {
  FLOW_LEADERBOARD_RULES_VERSION,
  PUBLIC_BOARD_KEYS,
  validateLeaderboardRequest,
} from "../supabase/functions/_shared/leaderboardRead.js";

const short = calculateFlowScoreV3({
  correctCharacters: 500,
  wpm: 80,
  accuracy: 98,
  consistency: 90,
});
const long = calculateFlowScoreV3({
  correctCharacters: 1000,
  wpm: 80,
  accuracy: 98,
  consistency: 90,
});
assert.ok(short.score > 0);
assert.ok(long.score > short.score * 2,
  "more correctly typed text must directly increase score and earn an endurance bonus");
assert.equal(FLOW_SCORE_V3_RULES.rulesVersion, 3);
assert.equal(FLOW_SCORE_V3_RULES.metricVersion, 2);
assert.equal(FLOW_V3_BOARD_KEY, "flow-standard-v1");

const emptyHistory = {
  recentDocumentIds: [],
  recentExcerptIds: [],
  recentRuns: [],
};
const firstPlan = createFlowStreamPlanV3({
  seed: "flow-v3-contract-seed",
  history: emptyHistory,
});
const firstPlanAgain = createFlowStreamPlanV3({
  seed: "flow-v3-contract-seed",
  history: emptyHistory,
});
const secondPlan = createFlowStreamPlanV3({
  seed: "flow-v3-contract-seed-2",
  history: emptyHistory,
});
assert.equal(firstPlan.gameplayVersion, 3);
assert.equal(firstPlan.structure, "continuous-stream");
assert.equal(firstPlan.sessionLength, "flow");
assert.equal(firstPlan.stream, true);
assert.equal(firstPlan.theme, "mixed");
assert.equal(firstPlan.documentCount, 10);
assert.ok(firstPlan.paragraphCount >= 50);
assert.ok(firstPlan.wordCount >= 4500,
  "one stream should contain enough material that normal sessions end by reset, not content exhaustion");
assert.equal(firstPlan.id, firstPlanAgain.id);
assert.equal(firstPlan.fullText, firstPlanAgain.fullText);
assert.notEqual(firstPlan.id, secondPlan.id);
assert.notEqual(firstPlan.fullText, secondPlan.fullText);

assert.ok(FLOW_V3_THEME_IDS.includes("science"));
const science = createFlowStreamPlanV3({
  seed: "flow-v3-science",
  theme: "science",
  history: emptyHistory,
});
assert.equal(science.theme, "science");
assert.ok(science.documents.every((document) => document.theme === "science"));
assert.equal(normalizeFlowV3Theme("not-a-theme"), FLOW_V3_DEFAULT_THEME);

const snapshot = {
  phase: "running",
  currentIndex: 600,
  passageLength: firstPlan.fullText.length,
  correctChars: 600,
  correctedErrors: 20,
  uncorrectedErrors: 0,
  wordTimings: [],
  gameplay: {
    correctKeystrokes: 600,
    incorrectKeystrokes: 20,
    accuracyPercent: 600 / 620 * 100,
  },
  cadence: {
    finalWpm: 60,
    rawWpm: 62,
    cadenceScore: 90,
    sampleCount: 500,
    typingDurationMs: 120000,
  },
};
const result = createFlowScoreV3Result({
  sessionId: "session-flow-v3-contract-12345678",
  endedAt: 1700000000000,
  endedReason: "reset",
  snapshot,
  plan: firstPlan,
});
assert.ok(result);
assert.equal(result.variantId, "flow-v3");
assert.equal(result.boardKey, "flow-standard-v1");
assert.equal(result.sessionLength, "flow");
assert.equal(result.completed, true);
assert.equal(result.recordEligible, true);
assert.equal(result.correctCharacters, 600);
assert.equal(result.wordsCompleted, 120);
assert.equal(result.score, calculateFlowScoreV3({
  correctCharacters: 600,
  wpm: 60,
  accuracy: 600 / 620 * 100,
  consistency: 90,
}).score);

const normalized = buildFlowSubmissionResult(result);
assert.ok(normalized);
assert.equal(normalized.sessionLength, "flow");
assert.equal(normalized.correctCharacters, 600);
assert.equal(normalized.endedReason, "reset");
const payload = buildSubmissionPayload("flow", result);
assert.ok(payload);
assert.equal(payload.boardKey, "flow-standard-v1");
assert.equal(validateScoreSubmission(payload).valid, true);
assert.equal(
  validateScoreSubmission({
    ...payload,
    result: { ...payload.result, score: payload.result.score + 1000 },
  }).code,
  "SCORE_MISMATCH",
);
assert.equal(
  validateScoreSubmission({
    ...payload,
    result: { ...payload.result, correctCharacters: 590 },
  }).code,
  "INVALID_RESULT",
);
assert.equal(
  validateScoreSubmission({
    ...payload,
    result: { ...payload.result, wpm: 90, rawWpm: 92 },
  }).code,
  "METRIC_MISMATCH",
);

assert.equal(FLOW_CONTRACT_VERSION, 2);
assert.equal(FLOW_RULES_VERSION, 3);
assert.equal(FLOW_METRIC_VERSION, 2);
assert.deepEqual(FLOW_BOARD_KEYS, ["flow-standard-v1"]);
assert.equal(FLOW_LEADERBOARD_RULES_VERSION, 3);
assert.equal(PUBLIC_BOARD_KEYS.includes("flow-standard-v1"), true);
assert.equal(PUBLIC_BOARD_KEYS.includes("flow-quick-v1"), false);
assert.equal(PUBLIC_BOARD_KEYS.includes("flow-long-v1"), false);
assert.equal(validateLeaderboardRequest({ boardKey: "flow-standard-v1" }).valid, true);
assert.equal(validateLeaderboardRequest({ boardKey: "flow-quick-v1" }).code, "INVALID_BOARD");
assert.equal(validateLeaderboardRequest({ boardKey: "flow-long-v1" }).code, "INVALID_BOARD");

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};
resetFlowRecordsV3();
assert.equal(loadFlowRecordsV3().completedRuns, 0);
const recorded = recordFlowResultV3(result);
assert.equal(recorded.recorded, true);
assert.equal(recorded.isPersonalBest, true);
assert.equal(getFlowPersonalBestV3().score, result.score);
assert.ok(store.has(FLOW_RECORDS_V3_STORAGE_KEY));

const betterResult = {
  ...result,
  sessionId: "session-flow-v3-contract-87654321",
  score: result.score + 1,
};
assert.equal(recordFlowResultV3(betterResult).isPersonalBest, true);
assert.equal(getFlowPersonalBestV3().score, result.score + 1);

const [phase1, loader, ui, migration] = await Promise.all([
  readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
  readFile(new URL("../js/leaderboardUi.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260923213343_flow_v3_instant_play.sql", import.meta.url), "utf8"),
]);
assert.match(phase1, /if \(isPublicStreamRun\(\)\) \{\s*startRun\(\);/);
assert.match(phase1, /event\.key === "Tab"/);
assert.match(phase1, /rerollPublicStream\(\)/);
assert.match(phase1, /TAB · NEW TEXT/);
assert.match(phase1, /data-flow-theme-select/);
assert.match(phase1, /calculateFlowScoreV3/);
assert.doesNotMatch(ui, /aria-label="Flow run length"/);
assert.doesNotMatch(ui, /leaderboard-flow-select-quick/);
assert.match(ui, /SCORE.*WPM.*WORDS/s);
assert.match(loader, /flowTheme/);
assert.match(loader, /flowStreamPlanV3\.js\?v=20260923a/);
assert.match(loader, /flowScoreV3\.js\?v=20260923a/);
assert.match(loader, /flowRecordsV3\.js\?v=20260923a/);
assert.match(migration, /where board_key in \('flow-quick-v1', 'flow-long-v1'\)/);
assert.match(migration, /where board_key = 'flow-standard-v1'/);
assert.match(migration, /rules_version = 3/);
assert.match(migration, /'wordsCompleted', words_completed/);

console.log("Flow V3 instant-play contracts passed: direct stream, Tab reroll, optional theme filter, volume-driven score, one leaderboard, durable PBs, and server validation.");
