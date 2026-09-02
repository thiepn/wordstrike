import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  ARCADE_RUSH_LEADERBOARD_BOARD_KEY,
  ARCADE_RUSH_LEADERBOARD_CATEGORY,
  ARCADE_RUSH_LEADERBOARD_RULES_VERSION,
  buildArcadeRushLeaderboardSubmissionResult,
  compareArcadeRushLeaderboardEntries,
  isArcadeRushLeaderboardShadowEnabled,
} from "../js/arcadeRushLeaderboard.js";
import { buildArcadeRushSessionResult } from "../js/arcadeRush/arcadeRushResult.js";
import { buildSubmissionPayload, createLeaderboardSubmissionService } from "../js/leaderboardSubmissionService.js";
import { LEADERBOARD_BOARDS } from "../js/leaderboardService.js";
import { validateLeaderboardReturnState } from "../js/leaderboardReturnState.js";
import { savePendingResultSubmission } from "../js/pendingResultSubmission.js";

assert.equal(ARCADE_RUSH_LEADERBOARD_BOARD_KEY, "arcade-rush-v1");
assert.equal(ARCADE_RUSH_LEADERBOARD_CATEGORY, "arcade-rush");
assert.equal(ARCADE_RUSH_LEADERBOARD_RULES_VERSION, 1);
// The AR13 query detector remains available for diagnostics after cutover.
assert.equal(isArcadeRushLeaderboardShadowEnabled("?dev=1"), true);
assert.equal(isArcadeRushLeaderboardShadowEnabled("?dev=true&mode=arcade-rush"), true);
assert.equal(isArcadeRushLeaderboardShadowEnabled("?dev=0"), false);
assert.equal(isArcadeRushLeaderboardShadowEnabled(""), false);

const base = {
  completed: true,
  score: 80000,
  accuracy: 98,
  durationMs: 260000,
  submittedAt: "2026-09-02T12:00:00.000Z",
  username: "Base",
};
assert.ok(compareArcadeRushLeaderboardEntries(base, { ...base, completed: false, score: 999999 }) < 0);
assert.ok(compareArcadeRushLeaderboardEntries({ ...base, score: 90000 }, base) < 0);
assert.ok(compareArcadeRushLeaderboardEntries({ ...base, accuracy: 99 }, base) < 0);
assert.ok(compareArcadeRushLeaderboardEntries({ ...base, durationMs: 250000 }, base) < 0);
assert.ok(compareArcadeRushLeaderboardEntries(
  { ...base, submittedAt: "2026-09-02T11:59:00.000Z" },
  base,
) < 0);

function makeSuccess({ developerMode = false } = {}) {
  return buildArcadeRushSessionResult({
    sessionId: "session-ar11rush12345678",
    sessionSource: developerMode ? "developer" : "arcade-rush-ready",
    startedAt: 1_000,
    endedAt: 251_000,
    durationMs: 250_000,
    activeDurationMs: 250_000,
    seed: 123_456_789,
    developerMode,
    success: true,
    accuracy: 98,
    wpm: 82,
    characters: { correct: 1_000, incorrect: 20, missed: 0, totalKeystrokes: 1_020 },
    words: { completed: 184, missed: 0, total: 184 },
    combo: { maximum: 91, final: 24 },
    wavesCompleted: 6,
    bossDefeated: true,
    bossTimeRemainingMs: 15_000,
    integrityRemaining: 3,
    perfectWaves: 2,
    wordPoints: 50_000,
  });
}

const success = makeSuccess();
assert.ok(success);
assert.equal(success.modeData.rulesVersion, 1);
assert.equal(success.modeData.recordEligible, true);
const normalized = buildArcadeRushLeaderboardSubmissionResult(success);
assert.ok(normalized);
assert.equal(normalized.completed, true);
assert.equal(normalized.bossDefeated, true);
assert.equal(normalized.wavesCompleted, 6);
assert.equal(normalized.durationMs, 250000);
assert.equal(normalized.maxCombo, 91);
assert.equal(normalized.rulesVersion, 1);
assert.equal(normalized.recordEligible, true);
assert.equal(Object.isFrozen(normalized), true);

const payload = buildSubmissionPayload("arcade-rush", success);
assert.ok(payload);
assert.equal(payload.boardKey, LEADERBOARD_BOARDS.ARCADE_RUSH);
assert.equal(payload.boardKey, "arcade-rush-v1");
assert.equal(payload.sessionId, success.sessionId);
assert.deepEqual(payload.result, normalized);

const pendingValues = new Map();
const pendingStorage = {
  setItem(key, value) { pendingValues.set(key, value); },
  getItem(key) { return pendingValues.get(key) ?? null; },
  removeItem(key) { pendingValues.delete(key); },
};
const pendingIntent = savePendingResultSubmission("arcade-rush", success, {
  storage: pendingStorage,
  now: 10_000,
});
assert.ok(pendingIntent);
assert.equal(pendingIntent.mode, "arcade-rush");
assert.equal(pendingIntent.boardKey, LEADERBOARD_BOARDS.ARCADE_RUSH);
assert.equal(pendingIntent.sessionId, success.sessionId);
assert.deepEqual(pendingIntent.immutablePayload, payload);

const localOnly = makeSuccess({ developerMode: true });
assert.ok(localOnly);
assert.equal(localOnly.modeData.recordEligible, false);
const submissionService = createLeaderboardSubmissionService({ getClient: () => null });
assert.equal(
  submissionService.prepareResultSubmission(
    "arcade-rush",
    localOnly,
    { status: "signed-in", user: { id: "user-1" } },
    { status: "ready", profile: { username: "Rusher" } },
  ).reason,
  "local-only",
);

const app = { html: "", set innerHTML(value) { this.html = value; } };
globalThis.document = { querySelector: (selector) => selector === "#app" ? app : null };
const { renderLeaderboards } = await import("../js/leaderboardUi.js");
const signedOut = { status: "signed-out" };
const noProfile = { status: "idle", profile: null };

// AR14: Arcade Rush is the normal fourth tab without any developer option.
renderLeaderboards({
  status: "loading",
  selectedBoardKey: LEADERBOARD_BOARDS.CAMPAIGN,
  selectedCategory: "campaign",
  selectedTypingDuration: 60,
  entries: [],
}, signedOut, noProfile);
assert.match(app.html, /ARCADE RUSH/);
assert.doesNotMatch(app.html, /DAILY STRIKE/);

renderLeaderboards({
  status: "ready",
  selectedBoardKey: LEADERBOARD_BOARDS.ARCADE_RUSH,
  selectedCategory: "arcade-rush",
  selectedTypingDuration: 60,
  board: { boardKey: LEADERBOARD_BOARDS.ARCADE_RUSH, displayName: "Arcade Rush", rulesVersion: 1 },
  entries: [{
    rank: 1, username: "Rusher", score: 91234, accuracy: 98.7,
    durationMs: 247000, completed: true, submittedAt: "2026-09-02T12:00:00.000Z",
  }],
  viewer: null,
}, signedOut, noProfile);
assert.match(app.html, /ARCADE RUSH/);
assert.doesNotMatch(app.html, /DAILY STRIKE/);
assert.match(app.html, /RULES V1 \/\/ COMPLETED RUNS ONLY \/\/ ALL-TIME/);
assert.match(app.html, /91,234/);
assert.match(app.html, /98\.7%/);
assert.match(app.html, /4:07\.0/);
assert.doesNotMatch(app.html, /UTC CHALLENGE|challengeDate/i);

assert.deepEqual(validateLeaderboardReturnState({
  screen: "leaderboards",
  selectedCategory: "arcade-rush",
  typingDuration: 60,
}), {
  screen: "leaderboards",
  selectedCategory: "arcade-rush",
  typingDuration: 60,
});
assert.deepEqual(validateLeaderboardReturnState({
  screen: "leaderboards",
  selectedCategory: "daily",
  typingDuration: 60,
}), {
  screen: "leaderboards",
  selectedCategory: "arcade-rush",
  typingDuration: 60,
});

const adapterSource = await fs.readFile(new URL("../js/arcadeRushAppController.js", import.meta.url), "utf8");
const mainSource = await fs.readFile(new URL("../js/main.js", import.meta.url), "utf8");
assert.match(adapterSource, /openArcadeRushLeaderboard/);
assert.match(adapterSource, /LEADERBOARD_BOARDS\.ARCADE_RUSH/);
assert.match(adapterSource, /leaderboardAvailable: true/);
assert.match(mainSource, /leaderboard-select-arcade-rush/);
assert.match(mainSource, /prepareAutomaticResultSubmission\("arcade-rush", result\)/);

console.log("Arcade Rush AR11 board/payload contracts remain valid after the AR14 public cutover.");
