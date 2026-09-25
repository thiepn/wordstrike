import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FLOW_SCORE_V3_RULES,
  FLOW_V3_BOARD_KEY,
  calculateFlowScoreV3,
  createFlowScoreV3Result,
} from "../js/flow/flowScoreV3.js";
import {
  FLOW_V3_DEFAULT_SESSION_PRESET,
  FLOW_V3_DEFAULT_THEME,
  FLOW_V3_SESSION_PRESETS,
  FLOW_V3_THEME_IDS,
  createFlowStreamPlanV3,
  normalizeFlowV3SessionPreset,
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
  createLeaderboardSubmissionService,
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
assert.equal(FLOW_SCORE_V3_RULES.rulesVersion, 4);
assert.equal(FLOW_SCORE_V3_RULES.metricVersion, 2);
assert.equal(FLOW_V3_BOARD_KEY, "flow-standard-3m-v1");

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
const quickPlan = createFlowStreamPlanV3({
  seed: "flow-v3-quick-contract",
  sessionPreset: "quick",
  history: emptyHistory,
});
assert.equal(firstPlan.gameplayVersion, 3);
assert.equal(firstPlan.structure, "continuous-stream");
assert.equal(firstPlan.sessionLength, "flow");
assert.equal(firstPlan.sessionPreset, "standard");
assert.equal(firstPlan.targetMinutes, 3);
assert.equal(firstPlan.targetDurationMs, 180000);
assert.equal(firstPlan.stream, true);
assert.equal(firstPlan.theme, "mixed");
assert.equal(firstPlan.documentCount, 10);
assert.ok(firstPlan.paragraphCount >= 50);
assert.ok(firstPlan.wordCount >= 4500,
  "one stream should contain enough material that normal timed sessions end by the clock, not content exhaustion");
assert.equal(firstPlan.id, firstPlanAgain.id);
assert.equal(firstPlan.fullText, firstPlanAgain.fullText);
assert.notEqual(firstPlan.id, secondPlan.id);
assert.notEqual(firstPlan.fullText, secondPlan.fullText);
assert.equal(quickPlan.sessionPreset, "quick");
assert.equal(quickPlan.targetDurationMs, 120000);

assert.ok(FLOW_V3_THEME_IDS.includes("science"));
const science = createFlowStreamPlanV3({
  seed: "flow-v3-science",
  theme: "science",
  history: emptyHistory,
});
assert.equal(science.theme, "science");
assert.ok(science.documents.every((document) => document.theme === "science"));
assert.equal(normalizeFlowV3Theme("not-a-theme"), FLOW_V3_DEFAULT_THEME);
assert.equal(normalizeFlowV3SessionPreset("unknown"), FLOW_V3_DEFAULT_SESSION_PRESET);
assert.equal(FLOW_V3_SESSION_PRESETS.quick.durationMs, 120000);
assert.equal(FLOW_V3_SESSION_PRESETS.standard.durationMs, 180000);
assert.equal(FLOW_V3_SESSION_PRESETS.deep.durationMs, 300000);
assert.equal(FLOW_V3_SESSION_PRESETS.endless.durationMs, null);

const snapshot = {
  phase: "running",
  currentIndex: 900,
  passageLength: firstPlan.fullText.length,
  correctChars: 900,
  correctedErrors: 30,
  uncorrectedErrors: 0,
  wordTimings: [],
  gameplay: {
    correctKeystrokes: 900,
    incorrectKeystrokes: 30,
    accuracyPercent: 900 / 930 * 100,
  },
  cadence: {
    finalWpm: 60,
    rawWpm: 62,
    cadenceScore: 90,
    sampleCount: 500,
    typingDurationMs: 180000,
  },
};
const result = createFlowScoreV3Result({
  sessionId: "session-flow-v3-contract-12345678",
  endedAt: 1700000000000,
  endedReason: "complete",
  snapshot,
  plan: firstPlan,
});
assert.ok(result);
assert.equal(result.variantId, "flow-v3");
assert.equal(result.boardKey, "flow-standard-3m-v1");
assert.equal(result.sessionLength, "flow");
assert.equal(result.sessionPreset, "standard");
assert.equal(result.completed, true);
assert.equal(result.recordEligible, true);
assert.equal(result.correctCharacters, 900);
assert.equal(result.wordsCompleted, 180);
assert.equal(result.score, calculateFlowScoreV3({
  correctCharacters: 900,
  wpm: 60,
  accuracy: 900 / 930 * 100,
  consistency: 90,
}).score);

const quickResult = createFlowScoreV3Result({
  sessionId: "session-flow-v3-quick-12345678",
  endedAt: 1700000000500,
  endedReason: "complete",
  snapshot,
  plan: quickPlan,
});
assert.equal(quickResult.sessionPreset, "quick");
assert.equal(quickResult.recordEligible, false,
  "Quick, Deep, and Endless sessions must not compete on the standard 3-minute board");

const resetResult = createFlowScoreV3Result({
  sessionId: "session-flow-v3-reset-12345678",
  endedAt: 1700000000750,
  endedReason: "reset",
  snapshot,
  plan: firstPlan,
});
assert.equal(resetResult.completed, false);
assert.equal(resetResult.recordEligible, false,
  "Leaving or resetting before FLOW COMPLETE must never create a competitive result");

const normalized = buildFlowSubmissionResult(result);
assert.ok(normalized);
assert.equal(normalized.sessionLength, "flow");
assert.equal("sessionPreset" in normalized, false,
  "session preset is local metadata and must not alter the server submission schema");
assert.equal(normalized.correctCharacters, 900);
assert.equal(normalized.endedReason, "complete");
const payload = buildSubmissionPayload("flow", result);
assert.ok(payload);
assert.equal(payload.boardKey, "flow-standard-3m-v1");
assert.equal(validateScoreSubmission(payload).valid, true);

const eligibilityService = createLeaderboardSubmissionService({
  getClient: () => null,
});
assert.equal(
  eligibilityService.prepareResultSubmission(
    "flow",
    result,
    { status: "signed-in", user: { id: "flow-user" } },
    { status: "ready", profile: { username: "Flow_User" } },
  ).status,
  "ready",
  "current rules-v4 Flow results must reach the shared submission ready state",
);
assert.equal(
  eligibilityService.refreshSubmissionEligibility(
    { status: "signed-out" },
    { status: "ready", profile: { username: "Flow_User" } },
  ).reason,
  "signed-out",
);
assert.equal(
  validateScoreSubmission({
    ...payload,
    result: { ...payload.result, endedReason: "reset", recordEligible: true },
  }).code,
  "TEST_NOT_COMPLETED",
);
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

assert.equal(FLOW_CONTRACT_VERSION, 3);
assert.equal(FLOW_RULES_VERSION, 4);
assert.equal(FLOW_METRIC_VERSION, 2);
assert.deepEqual(FLOW_BOARD_KEYS, ["flow-standard-3m-v1"]);
assert.equal(FLOW_LEADERBOARD_RULES_VERSION, 4);
assert.equal(PUBLIC_BOARD_KEYS.includes("flow-standard-3m-v1"), true);
assert.equal(PUBLIC_BOARD_KEYS.includes("flow-quick-v1"), false);
assert.equal(PUBLIC_BOARD_KEYS.includes("flow-long-v1"), false);
assert.equal(validateLeaderboardRequest({ boardKey: "flow-standard-3m-v1" }).valid, true);
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
  readFile(new URL("../supabase/migrations/20260925154500_flow_timed_3m_leaderboard_v1.sql", import.meta.url), "utf8"),
]);
assert.match(phase1, /if \(isPublicStreamRun\(\)\) \{\s*startRun\(\);/);
assert.match(phase1, /event\.key === "Tab"/);
assert.match(phase1, /skipPublicStreamText/);
assert.match(phase1, /data-flow-action="next-text"/);
assert.match(phase1, /flow-v3-tab-shortcut/);
assert.match(phase1, /data-flow-theme-select/);
assert.match(phase1, /data-flow-session-preset/);
assert.match(phase1, /data-flow-session-remaining/);
assert.match(phase1, /finishPublicStreamSession/);
assert.match(phase1, /calculateFlowScoreV3/);
assert.doesNotMatch(ui, /aria-label="Flow run length"/);
assert.doesNotMatch(ui, /leaderboard-flow-select-quick/);
assert.match(ui, /SCORE.*WPM.*WORDS/s);
assert.match(loader, /flowTheme/);
assert.match(loader, /flowLength/);
assert.match(loader, /flowStreamPlanV3\.js\?v=[0-9a-z]+/);
assert.match(loader, /flowScoreV3\.js\?v=[0-9a-z]+/);
assert.match(loader, /flowRecordsV3\.js\?v=[0-9a-z]+/);
assert.match(migration, /flow-quick-v1', 'flow-standard-v1', 'flow-long-v1/);
assert.match(migration, /flow-standard-3m-v1/);
assert.match(migration, /rules_version[^\n]*4|rules_version, ranking_strategy[\s\S]*\n\s*4,/);
assert.match(migration, /'wordsCompleted', words_completed/);

console.log("Flow V3 session contracts passed: direct timed stream, next-source Tab skip, duration presets, theme filter, rules-v4 3-minute scoring, durable PBs, and server validation.");
