import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildArcadeRushSessionResult } from "../js/arcadeRush/arcadeRushResult.js";
import { buildSubmissionPayload } from "../js/leaderboardSubmissionService.js";
import {
  ARCADE_RUSH_BOARD_KEY as SERVER_RUSH_BOARD,
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_VARIANT_ID,
  isPossibleArcadeRushWordCounters,
  validateScoreSubmission,
} from "../supabase/functions/_shared/scoreSubmission.js";
import {
  ARCADE_RUSH_BOARD_KEY as READ_RUSH_BOARD,
  compareArcadeRushLeaderboardRows,
  rankLeaderboardRows,
  validateLeaderboardRequest,
} from "../supabase/functions/_shared/leaderboardRead.js";

assert.equal(SERVER_RUSH_BOARD, "arcade-rush-v1");
assert.equal(READ_RUSH_BOARD, SERVER_RUSH_BOARD);
assert.equal(ARCADE_RUSH_CONTRACT_VERSION, 1);
assert.equal(ARCADE_RUSH_RULES_VERSION, 1);
assert.equal(ARCADE_RUSH_VARIANT_ID, "draft-r1-s1");

const durationMs = 250_000;
const correctCharacters = 1_000;
const incorrectCharacters = 20;
const totalKeystrokes = correctCharacters + incorrectCharacters;
const missedCharacters = 0;
const accuracy = correctCharacters / (totalKeystrokes + missedCharacters) * 100;
const wpm = (correctCharacters / 5) / (durationMs / 60_000);

const canonical = buildArcadeRushSessionResult({
  sessionId: "session-ar12rush12345678",
  sessionSource: "arcade-rush-ready",
  startedAt: 1_000,
  endedAt: 251_000,
  durationMs,
  activeDurationMs: durationMs,
  seed: 123_456_789,
  developerMode: false,
  success: true,
  accuracy,
  wpm,
  characters: {
    correct: correctCharacters,
    incorrect: incorrectCharacters,
    missed: missedCharacters,
    totalKeystrokes,
  },
  words: { completed: 184, missed: 0, total: 184 },
  combo: { maximum: 91, final: 24 },
  wavesCompleted: 6,
  bossDefeated: true,
  bossTimeRemainingMs: 15_000,
  integrityRemaining: 5,
  perfectWaves: 2,
  wordPoints: 50_000,
});
assert.ok(canonical);
assert.equal(canonical.score, 101_400);

const payload = buildSubmissionPayload("arcade-rush", canonical);
assert.ok(payload);
assert.equal(payload.boardKey, SERVER_RUSH_BOARD);
const validated = validateScoreSubmission(payload);
assert.equal(validated.valid, true);
assert.equal(validated.value.score, canonical.score);
assert.equal(validated.value.completed, true);
assert.equal(validated.value.challengeDate, null);
assert.equal(validated.value.challengeVersion, null);
assert.equal(validated.value.integrityRemaining, 5);
assert.equal(validated.value.metrics.contractVersion, 1);
assert.equal(validated.value.metrics.rulesVersion, 1);
assert.equal(validated.value.metrics.bossDefeated, true);
assert.equal(validated.value.metrics.wordPoints, 50_000);
assert.equal(validated.value.metrics.waveClearBonus, 12_000);
assert.equal(validated.value.metrics.perfectWaveBonus, 3_000);
assert.equal(validated.value.metrics.bossBonus, 8_000);
assert.equal(validated.value.metrics.integrityBonus, 10_000);
assert.equal(validated.value.metrics.timeBonus, 1_500);
assert.equal(validated.value.metrics.accuracyBonus, 16_900);

const requestWith = (changes) => ({
  ...payload,
  result: { ...payload.result, ...changes },
});
assert.equal(validateScoreSubmission(requestWith({ developerMode: true })).code, "DEVELOPER_RESULT");
assert.equal(validateScoreSubmission(requestWith({ recordEligible: false })).code, "RECORD_NOT_ELIGIBLE");
assert.equal(validateScoreSubmission(requestWith({ sessionSource: "developer" })).code, "INVALID_SESSION_SOURCE");
assert.equal(validateScoreSubmission(requestWith({ contractVersion: 2 })).code, "INVALID_RESULT");
assert.equal(validateScoreSubmission(requestWith({ rulesVersion: 2 })).code, "INVALID_RESULT");
assert.equal(validateScoreSubmission(requestWith({ variantId: "rush-v1" })).code, "INVALID_RESULT");
assert.equal(validateScoreSubmission(requestWith({ seed: 0x1_0000_0000 })).code, "INVALID_RESULT");
assert.equal(validateScoreSubmission(requestWith({ completed: false })).code, "INVALID_FAILURE_STATE");
assert.equal(validateScoreSubmission(requestWith({ bossDefeated: false })).code, "INVALID_FAILURE_STATE");
assert.equal(validateScoreSubmission(requestWith({ wordsMissed: 1, wordsTotal: 185 })).code, "INVALID_WORD_COUNTERS");
assert.equal(validateScoreSubmission(requestWith({ correctCharacters: 999 })).code, "INVALID_WORD_COUNTERS");
assert.equal(validateScoreSubmission(requestWith({ accuracy: payload.result.accuracy - 0.1 })).code, "METRIC_MISMATCH");
assert.equal(validateScoreSubmission(requestWith({ wpm: payload.result.wpm + 1 })).code, "METRIC_MISMATCH");
assert.equal(validateScoreSubmission(requestWith({ wordPoints: 1_000 })).code, "SCORE_MISMATCH");
assert.equal(validateScoreSubmission(requestWith({ accuracyBonus: payload.result.accuracyBonus + 1 })).code, "SCORE_MISMATCH");
assert.equal(validateScoreSubmission(requestWith({ score: payload.result.score + 1 })).code, "SCORE_MISMATCH");
const extra = structuredClone(payload);
extra.result.email = "private@example.com";
assert.equal(validateScoreSubmission(extra).code, "INVALID_RESULT");
assert.equal(validateScoreSubmission({ ...payload, userId: "forged" }).code, "INVALID_REQUEST");

assert.equal(isPossibleArcadeRushWordCounters({
  integrityRemaining: 5, wordsCompleted: 184, wordsMissed: 0, wordsTotal: 184,
}), true);
assert.equal(isPossibleArcadeRushWordCounters({
  integrityRemaining: 3, wordsCompleted: 184, wordsMissed: 0, wordsTotal: 184,
}), false);
assert.equal(isPossibleArcadeRushWordCounters({
  integrityRemaining: 3, wordsCompleted: 182, wordsMissed: 2, wordsTotal: 184,
}), true);

assert.deepEqual(validateLeaderboardRequest({ boardKey: SERVER_RUSH_BOARD }), {
  valid: true,
  boardKey: SERVER_RUSH_BOARD,
  challengeDate: null,
});
assert.equal(validateLeaderboardRequest({
  boardKey: SERVER_RUSH_BOARD,
  challengeDate: "2026-09-02",
}).code, "INVALID_REQUEST");

const row = (userId, overrides = {}) => ({
  id: `${userId}-1`,
  userId,
  username: `Rush_${userId}`,
  boardKey: SERVER_RUSH_BOARD,
  rulesVersion: 1,
  moderationStatus: "accepted",
  completed: true,
  score: 80_000,
  accuracy: 98,
  durationMs: 260_000,
  submittedAt: "2026-09-02T12:00:00.000Z",
  ...overrides,
});
const base = row("base");
assert.ok(compareArcadeRushLeaderboardRows(row("score", { score: 81_000 }), base) < 0);
assert.ok(compareArcadeRushLeaderboardRows(row("accuracy", { accuracy: 99 }), base) < 0);
assert.ok(compareArcadeRushLeaderboardRows(row("time", { durationMs: 250_000 }), base) < 0);
assert.ok(compareArcadeRushLeaderboardRows(row("early", {
  submittedAt: "2026-09-02T11:59:00.000Z",
}), base) < 0);
assert.ok(compareArcadeRushLeaderboardRows(base, row("failed", {
  completed: false,
  score: 999_999,
})) < 0);

const ranked = rankLeaderboardRows([
  row("a", { id: "a-low", score: 70_000 }),
  row("a", { id: "a-best", score: 90_000, accuracy: 97 }),
  row("b", { score: 90_000, accuracy: 98, durationMs: 270_000 }),
  row("c", { score: 90_000, accuracy: 98, durationMs: 250_000 }),
  row("failed", { completed: false, score: 999_999 }),
  row("flagged", { score: 999_998, moderationStatus: "flagged" }),
  row("v2", { score: 999_997, rulesVersion: 2 }),
], { boardKey: SERVER_RUSH_BOARD, viewerUserId: "a" });
assert.deepEqual(ranked.entries.map(({ username }) => username), ["Rush_c", "Rush_b", "Rush_a"]);
assert.equal(ranked.viewer.rank, 3);
assert.equal(ranked.viewer.entry.score, 90_000);
assert.equal(ranked.entries.every(({ completed }) => completed === true), true);

const migration = await readFile(
  new URL("../supabase/migrations/20260902170000_add_arcade_rush_leaderboard_v1.sql", import.meta.url),
  "utf8",
);
assert.match(migration, /mode in \('daily_strike', 'endless', 'campaign', 'typing_test', 'arcade_rush'\)/);
assert.match(migration, /'arcade-rush-v1', 'Arcade Rush', 'arcade_rush', 1/);
assert.match(migration, /score desc,[\s\S]*accuracy desc,[\s\S]*duration_ms asc,[\s\S]*submitted_at asc/);
assert.match(migration, /where board_key = 'arcade-rush-v1'[\s\S]*completed = true[\s\S]*moderation_status = 'accepted'/);
assert.match(migration, /selected_board\.board_key <> 'arcade-rush-v1' or s\.completed = true/);
assert.match(migration, /case when selected_board\.board_key = 'arcade-rush-v1' then score end desc/);
assert.match(migration, /case when selected_board\.board_key = 'arcade-rush-v1' then accuracy end desc/);
assert.match(migration, /case when selected_board\.board_key = 'arcade-rush-v1' then duration_ms end asc/);
assert.match(migration, /from public, anon, authenticated/);
assert.match(migration, /to service_role/);

console.log("Arcade Rush AR12 Supabase validation, recomputation, ranking, and migration contracts passed.");
