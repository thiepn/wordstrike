import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateFlowScoreV3 } from "../js/flow/flowScoreV3.js";
import {
  buildFlowSubmissionResult,
  buildSubmissionPayload,
} from "../js/leaderboardSubmissionService.js";
import {
  LEADERBOARD_BOARDS,
  LEADERBOARD_CATEGORIES,
  getBoardKeyForSelection,
  getLeaderboardSelection,
} from "../js/leaderboardService.js";
import {
  FLOW_BOARD_KEYS,
  validateFlowScoreSubmission,
  validateScoreSubmission,
} from "../supabase/functions/_shared/scoreSubmission.js";
import {
  compareFlowLeaderboardRows,
  rankLeaderboardRows,
  validateLeaderboardRequest,
} from "../supabase/functions/_shared/leaderboardRead.js";

const accuracy = 600 / 620 * 100;
const score = calculateFlowScoreV3({
  correctCharacters: 600,
  wpm: 60,
  accuracy,
  consistency: 90,
}).score;

const result = Object.freeze({
  schemaVersion: 1,
  contractVersion: 2,
  rulesVersion: 3,
  metricVersion: 2,
  modeId: "flow",
  variantId: "flow-v3",
  boardKey: "flow-standard-v1",
  sessionId: "session-flow-v3-test-12345678",
  endedAt: 1700000000000,
  endedReason: "reset",
  sessionLength: "flow",
  completed: true,
  recordEligible: true,
  score,
  wpm: 60,
  rawWpm: 62,
  accuracy,
  consistency: 90,
  consistencySamples: 500,
  activeDurationMs: 120000,
  wordsCompleted: 120,
  charactersCompleted: 600,
  correctCharacters: 600,
  correctKeystrokes: 600,
  incorrectKeystrokes: 20,
  correctedErrors: 20,
  unresolvedErrors: 0,
  textId: "flow-v3-stream-deadbeef",
  seed: "flow-v3-leaderboard",
  theme: "mixed",
  seriesIds: ["corpus-learning-01"],
  scoreBreakdown: {},
});

const normalized = buildFlowSubmissionResult(result);
assert.ok(normalized);
assert.equal(normalized.sessionSource, "flow-release");
assert.equal(normalized.developerMode, false);
assert.equal(normalized.durationMs, 120000);
assert.equal(normalized.consistencySamples, 500);
assert.equal(normalized.correctCharacters, 600);

const payload = buildSubmissionPayload("flow", result);
assert.ok(payload);
assert.equal(payload.boardKey, LEADERBOARD_BOARDS.FLOW_STANDARD);
assert.equal(payload.sessionId, result.sessionId);
assert.equal(validateFlowScoreSubmission(payload).valid, true);
assert.equal(validateScoreSubmission(payload).valid, true);

assert.equal(
  validateScoreSubmission({ ...payload, result: { ...payload.result, score: payload.result.score + 1 } }).code,
  "SCORE_MISMATCH",
);
assert.equal(
  validateScoreSubmission({ ...payload, result: { ...payload.result, wpm: 80, rawWpm: 82 } }).code,
  "METRIC_MISMATCH",
);
assert.equal(
  validateScoreSubmission({ ...payload, result: { ...payload.result, accuracy: 89.99 } }).code,
  "INVALID_RESULT",
);
assert.equal(
  validateScoreSubmission({ ...payload, result: { ...payload.result, sessionSource: "developer" } }).code,
  "INVALID_SESSION_SOURCE",
);
assert.equal(
  validateScoreSubmission({ ...payload, sessionId: "flow-v3-old-invalid-id" }).code,
  "INVALID_SESSION_ID",
);

assert.deepEqual(FLOW_BOARD_KEYS, [LEADERBOARD_BOARDS.FLOW_STANDARD]);
const selection = getLeaderboardSelection(LEADERBOARD_BOARDS.FLOW_STANDARD);
assert.equal(selection.selectedCategory, LEADERBOARD_CATEGORIES.FLOW);
assert.equal(getBoardKeyForSelection(LEADERBOARD_CATEGORIES.FLOW), LEADERBOARD_BOARDS.FLOW_STANDARD);
assert.equal(validateLeaderboardRequest({ boardKey: LEADERBOARD_BOARDS.FLOW_STANDARD }).valid, true);
assert.equal(validateLeaderboardRequest({ boardKey: LEADERBOARD_BOARDS.FLOW_QUICK }).code, "INVALID_BOARD");
assert.equal(validateLeaderboardRequest({ boardKey: LEADERBOARD_BOARDS.FLOW_LONG }).code, "INVALID_BOARD");

const rows = [
  {
    id: "a1", userId: "a", username: "Alpha", boardKey: "flow-standard-v1",
    rulesVersion: 3, moderationStatus: "accepted", completed: true,
    score: 90000, accuracy: 97, wpm: 100, rawWpm: 103, consistency: 88,
    wordsCompleted: 800, durationMs: 120000, submittedAt: "2026-09-23T10:00:00Z",
  },
  {
    id: "a2", userId: "a", username: "Alpha", boardKey: "flow-standard-v1",
    rulesVersion: 3, moderationStatus: "accepted", completed: true,
    score: 91000, accuracy: 96, wpm: 105, rawWpm: 108, consistency: 90,
    wordsCompleted: 850, durationMs: 118000, submittedAt: "2026-09-23T11:00:00Z",
  },
  {
    id: "b1", userId: "b", username: "Beta", boardKey: "flow-standard-v1",
    rulesVersion: 3, moderationStatus: "accepted", completed: true,
    score: 91000, accuracy: 98, wpm: 99, rawWpm: 101, consistency: 92,
    wordsCompleted: 820, durationMs: 121000, submittedAt: "2026-09-23T12:00:00Z",
  },
  {
    id: "c1", userId: "c", username: "Gamma", boardKey: "flow-standard-v1",
    rulesVersion: 3, moderationStatus: "accepted", completed: true,
    score: 91000, accuracy: 98, wpm: 101, rawWpm: 104, consistency: 87,
    wordsCompleted: 830, durationMs: 119000, submittedAt: "2026-09-23T13:00:00Z",
  },
  {
    id: "old-rules", userId: "d", username: "Old", boardKey: "flow-standard-v1",
    rulesVersion: 2, moderationStatus: "accepted", completed: true,
    score: 999999, accuracy: 100, wpm: 300, submittedAt: "2026-09-23T09:00:00Z",
  },
];

assert.ok(compareFlowLeaderboardRows(rows[3], rows[2]) < 0, "WPM breaks equal score/accuracy ties");
const ranked = rankLeaderboardRows(rows, { boardKey: "flow-standard-v1", viewerUserId: "a" });
assert.deepEqual(ranked.entries.map((entry) => entry.username), ["Gamma", "Beta", "Alpha"]);
assert.equal(ranked.viewer.rank, 3);
assert.equal(ranked.entries.filter((entry) => entry.username === "Alpha").length, 1);
assert.equal(ranked.entries[0].consistency, 87);
assert.equal(ranked.entries[0].wordsCompleted, 830);

const [phase1, migration, ui, outbox, pending] = await Promise.all([
  readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260923213343_flow_v3_instant_play.sql", import.meta.url), "utf8"),
  readFile(new URL("../js/leaderboardUi.js", import.meta.url), "utf8"),
  readFile(new URL("../js/submissionOutbox.js", import.meta.url), "utf8"),
  readFile(new URL("../js/pendingResultSubmission.js", import.meta.url), "utf8"),
]);

assert.match(phase1, /session-flow-v3-/);
assert.match(phase1, /createLeaderboardSubmissionService/);
assert.match(phase1, /rerollPublicStream/);
assert.match(ui, /leaderboard-select-flow/);
assert.doesNotMatch(ui, /leaderboard-flow-select-quick/);
assert.match(ui, /SCORE.*WPM.*WORDS/s);
assert.match(outbox, /"flow"/);
assert.match(pending, /"flow"/);
assert.match(migration, /flow-standard-v1/);
assert.match(migration, /rules_version = 3/);
assert.match(migration, /flow-quick-v1', 'flow-long-v1/);
assert.match(migration, /grant execute on function public\.submit_leaderboard_result[\s\S]*to service_role/);

console.log("Flow global leaderboard contracts passed: one V3 board, cumulative score validation, best-per-player ranking, volume display, and server-only RPC access.");
