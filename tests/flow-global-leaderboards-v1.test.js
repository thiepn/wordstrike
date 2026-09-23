import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

const result = Object.freeze({
  schemaVersion: 1,
  contractVersion: 1,
  rulesVersion: 2,
  metricVersion: 1,
  modeId: "flow",
  variantId: "flow-standard-v2",
  boardKey: "flow-standard-v1",
  sessionId: "session-flow-v2-test-12345678",
  endedAt: 1700000000000,
  sessionLength: "standard",
  completed: true,
  recordEligible: true,
  score: 89218,
  wpm: 100,
  rawWpm: 102,
  accuracy: 98.04,
  consistency: 90,
  consistencySamples: 900,
  activeDurationMs: 120000,
  wordsCompleted: 400,
  charactersCompleted: 1000,
  correctKeystrokes: 1000,
  incorrectKeystrokes: 20,
  correctedErrors: 20,
  unresolvedErrors: 0,
  textId: "flow-v2-standard-deadbeef",
  seed: "phase5-server-validation",
  seriesIds: ["corpus-learning-01"],
  scoreBreakdown: {},
});

const normalized = buildFlowSubmissionResult(result);
assert.ok(normalized);
assert.equal(normalized.sessionSource, "flow-release");
assert.equal(normalized.developerMode, false);
assert.equal(normalized.durationMs, 120000);
assert.equal(normalized.consistencySamples, 900);

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
  validateScoreSubmission({ ...payload, result: { ...payload.result, wpm: 130 } }).code,
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
  validateScoreSubmission({ ...payload, sessionId: "flow-v2-old-invalid-id" }).code,
  "INVALID_SESSION_ID",
);

assert.deepEqual(FLOW_BOARD_KEYS, [
  LEADERBOARD_BOARDS.FLOW_QUICK,
  LEADERBOARD_BOARDS.FLOW_STANDARD,
  LEADERBOARD_BOARDS.FLOW_LONG,
]);
for (const [length, boardKey] of Object.entries({
  quick: LEADERBOARD_BOARDS.FLOW_QUICK,
  standard: LEADERBOARD_BOARDS.FLOW_STANDARD,
  long: LEADERBOARD_BOARDS.FLOW_LONG,
})) {
  const selection = getLeaderboardSelection(boardKey);
  assert.equal(selection.selectedCategory, LEADERBOARD_CATEGORIES.FLOW);
  assert.equal(selection.selectedFlowLength, length);
  assert.equal(getBoardKeyForSelection(LEADERBOARD_CATEGORIES.FLOW, 60, length), boardKey);
  assert.equal(validateLeaderboardRequest({ boardKey }).valid, true);
}

const rows = [
  {
    id: "a1", userId: "a", username: "Alpha", boardKey: "flow-standard-v1",
    rulesVersion: 2, moderationStatus: "accepted", completed: true,
    score: 90000, accuracy: 97, wpm: 100, rawWpm: 103, consistency: 88,
    durationMs: 120000, submittedAt: "2026-09-23T10:00:00Z",
  },
  {
    id: "a2", userId: "a", username: "Alpha", boardKey: "flow-standard-v1",
    rulesVersion: 2, moderationStatus: "accepted", completed: true,
    score: 91000, accuracy: 96, wpm: 105, rawWpm: 108, consistency: 90,
    durationMs: 118000, submittedAt: "2026-09-23T11:00:00Z",
  },
  {
    id: "b1", userId: "b", username: "Beta", boardKey: "flow-standard-v1",
    rulesVersion: 2, moderationStatus: "accepted", completed: true,
    score: 91000, accuracy: 98, wpm: 99, rawWpm: 101, consistency: 92,
    durationMs: 121000, submittedAt: "2026-09-23T12:00:00Z",
  },
  {
    id: "c1", userId: "c", username: "Gamma", boardKey: "flow-standard-v1",
    rulesVersion: 2, moderationStatus: "accepted", completed: true,
    score: 91000, accuracy: 98, wpm: 101, rawWpm: 104, consistency: 87,
    durationMs: 119000, submittedAt: "2026-09-23T13:00:00Z",
  },
  {
    id: "old-rules", userId: "d", username: "Old", boardKey: "flow-standard-v1",
    rulesVersion: 1, moderationStatus: "accepted", completed: true,
    score: 999999, accuracy: 100, wpm: 300, submittedAt: "2026-09-23T09:00:00Z",
  },
];

assert.ok(compareFlowLeaderboardRows(rows[3], rows[2]) < 0, "WPM breaks equal score/accuracy ties");
const ranked = rankLeaderboardRows(rows, { boardKey: "flow-standard-v1", viewerUserId: "a" });
assert.deepEqual(ranked.entries.map((entry) => entry.username), ["Gamma", "Beta", "Alpha"]);
assert.equal(ranked.viewer.rank, 3);
assert.equal(ranked.entries.filter((entry) => entry.username === "Alpha").length, 1);
assert.equal(ranked.entries[0].consistency, 87);

const [phase1, migration, ui, outbox, pending] = await Promise.all([
  readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260923172506_flow_global_leaderboards_v1.sql", import.meta.url), "utf8"),
  readFile(new URL("../js/leaderboardUi.js", import.meta.url), "utf8"),
  readFile(new URL("../js/submissionOutbox.js", import.meta.url), "utf8"),
  readFile(new URL("../js/pendingResultSubmission.js", import.meta.url), "utf8"),
]);

assert.match(phase1, /session-flow-v2-/);
assert.match(phase1, /prepareResultSubmission\("flow"/);
assert.match(phase1, /savePendingResultSubmission\("flow"/);
assert.match(phase1, /wordstrike:open-leaderboard/);
assert.match(ui, /leaderboard-select-flow/);
assert.match(ui, /leaderboard-flow-select-quick/);
assert.match(ui, /SCORE.*WPM.*ACCURACY/s);
assert.match(outbox, /"flow"/);
assert.match(pending, /"flow"/);
assert.match(migration, /flow-quick-v1/);
assert.match(migration, /flow-standard-v1/);
assert.match(migration, /flow-long-v1/);
assert.match(migration, /case when selected_board\.board_key like 'flow-%' then score end desc/);
assert.match(migration, /grant execute on function public\.submit_leaderboard_result[\s\S]*to service_role/);

console.log("Flow Phase 5 global leaderboard contracts passed: durable client submission, server score validation, three boards, deterministic ranking, auth resume, and server-only RPC access.");
