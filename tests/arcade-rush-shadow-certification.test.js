import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildArcadeRushSessionResult } from "../js/arcadeRush/arcadeRushResult.js";
import {
  createArcadeRushShadowCertificationSnapshot,
  getArcadeRushShadowRunPolicy,
  isArcadeRushShadowCertificationEnabled,
  isArcadeRushShadowCertified,
} from "../js/arcadeRushShadowCertification.js";
import { createArcadeRushShadowCoordinator } from "../js/arcadeRushShadowCoordinator.js";
import {
  getArcadeRushRecordFlags,
  getArcadeRushRecords,
  recordArcadeRushRunStarted,
  recordCompletedSession,
  resetModeData,
} from "../js/modeStorage.js";
import { getAllModes, MODE_IDS } from "../js/modes.js";
import { buildSubmissionPayload } from "../js/leaderboardSubmissionService.js";
import {
  ARCADE_RUSH_BOARD_KEY as SERVER_RUSH_BOARD,
  validateScoreSubmission,
} from "../supabase/functions/_shared/scoreSubmission.js";
import {
  rankLeaderboardRows,
  validateLeaderboardRequest,
} from "../supabase/functions/_shared/leaderboardRead.js";

const SHADOW_QUERY = "?dev=1&mode=arcade-rush&rushShadow=v1";

assert.equal(isArcadeRushShadowCertificationEnabled(SHADOW_QUERY), true);
assert.equal(isArcadeRushShadowCertificationEnabled(`${SHADOW_QUERY}&rushSeed=123`), true);
assert.equal(isArcadeRushShadowCertificationEnabled("?dev=1&mode=arcade-rush"), false);
assert.equal(isArcadeRushShadowCertificationEnabled("?dev=1&rushShadow=v1"), false);
assert.equal(isArcadeRushShadowCertificationEnabled("?mode=arcade-rush&rushShadow=v1"), false);
assert.equal(isArcadeRushShadowCertificationEnabled("?dev=true&mode=arcade-rush&rushShadow=v1"), false);
assert.equal(isArcadeRushShadowCertificationEnabled(""), false);

const rankedPolicy = getArcadeRushShadowRunPolicy(`${SHADOW_QUERY}&rushSeed=123`);
assert.equal(rankedPolicy.enabled, true);
assert.equal(rankedPolicy.effectiveDeveloperMode, false);
assert.equal(rankedPolicy.allowDeveloperSeedOverride, false);
assert.equal(rankedPolicy.ignoredDeveloperSeedOverride, true);
assert.equal(rankedPolicy.boardKey, "arcade-rush-v1");
assert.equal(rankedPolicy.contractVersion, 1);
assert.equal(rankedPolicy.rulesVersion, 1);

const ordinaryDevPolicy = getArcadeRushShadowRunPolicy("?dev=1&mode=arcade-rush&rushSeed=123");
assert.equal(ordinaryDevPolicy.enabled, false);
assert.equal(ordinaryDevPolicy.allowDeveloperSeedOverride, true);
assert.equal(ordinaryDevPolicy.ignoredDeveloperSeedOverride, false);

const publicModeIds = getAllModes().map(({ id }) => id);
const dailyPublic = publicModeIds.includes(MODE_IDS.DAILY);
const rushPublic = publicModeIds.includes(MODE_IDS.ARCADE_RUSH);
// AR13's isolation invariant is intentionally valid on both sides of AR14:
// exactly one replacement mode may be public at a time.
assert.equal(dailyPublic !== rushPublic, true);
assert.equal(rushPublic, true);
assert.equal(dailyPublic, false);

const durationMs = 250_000;
const correctCharacters = 1_000;
const incorrectCharacters = 20;
const totalKeystrokes = correctCharacters + incorrectCharacters;
const missedCharacters = 0;
const accuracy = correctCharacters / (totalKeystrokes + missedCharacters) * 100;
const wpm = (correctCharacters / 5) / (durationMs / 60_000);

const result = buildArcadeRushSessionResult({
  sessionId: "session-ar13rush12345678",
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
assert.ok(result);
assert.equal(result.score, 101_400);
assert.equal(result.developerMode, false);
assert.equal(result.modeData.recordEligible, true);

const payload = buildSubmissionPayload("arcade-rush", result);
assert.ok(payload);
assert.equal(payload.boardKey, SERVER_RUSH_BOARD);
assert.equal(validateScoreSubmission(payload).valid, true);
assert.deepEqual(validateLeaderboardRequest({ boardKey: SERVER_RUSH_BOARD }), {
  valid: true,
  boardKey: SERVER_RUSH_BOARD,
  challengeDate: null,
});

const accepted = validateScoreSubmission(payload).value;
const ranked = rankLeaderboardRows([{
  id: "shadow-submission-1",
  userId: "shadow-user-1",
  username: "Shadow_1",
  boardKey: SERVER_RUSH_BOARD,
  rulesVersion: 1,
  moderationStatus: "accepted",
  completed: accepted.completed,
  score: accepted.score,
  accuracy: accepted.accuracy,
  durationMs: accepted.durationMs,
  submittedAt: "2026-09-02T15:00:00.000Z",
}], { boardKey: SERVER_RUSH_BOARD, viewerUserId: "shadow-user-1" });
assert.equal(ranked.entries.length, 1);
assert.equal(ranked.entries[0].rank, 1);
assert.equal(ranked.entries[0].score, result.score);
assert.equal(ranked.viewer.rank, 1);

const values = new Map();
const priorLocalStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};
try {
  resetModeData();
  assert.equal(recordArcadeRushRunStarted({ developerMode: false }), true);
  const before = getArcadeRushRecords();
  const flags = getArcadeRushRecordFlags(result, before);
  assert.equal(flags.newBest, true);
  assert.equal(flags.newBestCompletedScore, true);
  assert.equal(recordCompletedSession(result), true);
  assert.equal(recordCompletedSession(result), false);

  const records = getArcadeRushRecords();
  assert.equal(records.runsStarted, 1);
  assert.equal(records.runsCompleted, 1);
  assert.equal(records.bossesDefeated, 1);
  assert.equal(records.highestScore, 101_400);
  assert.equal(records.bestCompletedScore, 101_400);
  assert.equal(records.highestCombo, 91);

  const submissionState = {
    status: "submitted",
    mode: "arcade-rush",
    boardKey: SERVER_RUSH_BOARD,
    sessionId: result.sessionId,
    rank: 1,
    reason: null,
    error: null,
  };
  const leaderboardState = {
    status: "ready",
    selectedBoardKey: SERVER_RUSH_BOARD,
    board: { boardKey: SERVER_RUSH_BOARD, displayName: "Arcade Rush", rulesVersion: 1 },
    viewer: { rank: 1, entry: { username: "Shadow_1", score: result.score } },
  };
  const snapshot = createArcadeRushShadowCertificationSnapshot({
    search: SHADOW_QUERY,
    result,
    runStartedPersisted: true,
    resultPersisted: true,
    recordFlags: flags,
    submissionState,
    leaderboardState,
  });
  assert.equal(snapshot.status, "certified");
  assert.equal(snapshot.blockingReason, null);
  assert.equal(Object.values(snapshot.gates).every((value) => value === true), true);
  assert.equal(isArcadeRushShadowCertified(snapshot), true);

  const signedOut = createArcadeRushShadowCertificationSnapshot({
    search: SHADOW_QUERY,
    result,
    runStartedPersisted: true,
    resultPersisted: true,
    recordFlags: flags,
    submissionState: {
      status: "ineligible",
      boardKey: SERVER_RUSH_BOARD,
      sessionId: result.sessionId,
      reason: "signed-out",
    },
  });
  assert.equal(signedOut.status, "blocked");
  assert.equal(signedOut.blockingReason, "signed-out");

  const ordinaryCoordinator = createArcadeRushShadowCoordinator({
    search: "?dev=1&mode=arcade-rush&rushSeed=123",
    createSeed: () => 999,
  });
  assert.deepEqual(ordinaryCoordinator.prepareStart({ seed: 123, developerMode: true }), {
    seed: 123,
    developerMode: true,
  });
  assert.equal(ordinaryCoordinator.policy.enabled, false);
  ordinaryCoordinator.destroy();

  const rankedCoordinator = createArcadeRushShadowCoordinator({
    search: `${SHADOW_QUERY}&rushSeed=123`,
    createSeed: () => 987_654_321,
  });
  assert.deepEqual(rankedCoordinator.prepareStart({ seed: 123, developerMode: true }), {
    seed: 987_654_321,
    developerMode: false,
  });
  rankedCoordinator.destroy();
} finally {
  if (priorLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = priorLocalStorage;
}

const adapterSource = await readFile(new URL("../js/arcadeRushAppController.js", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const modesSource = await readFile(new URL("../js/modes.js", import.meta.url), "utf8");
assert.match(adapterSource, /createArcadeRushShadowCoordinator/);
assert.match(adapterSource, /shadowCoordinator\.prepareStart/);
assert.match(adapterSource, /shadowCoordinator\.onStarted/);
assert.match(adapterSource, /shadowCoordinator\.onTerminal/);
assert.match(adapterSource, /getShadowCertification/);
assert.match(adapterSource, /verifyShadowLeaderboard/);
assert.match(mainSource, /appState\.devMode\s*&&\s*search\.get\("mode"\)\s*===\s*MODE_IDS\.ARCADE_RUSH/);
assert.match(modesSource, /id:\s*MODE_IDS\.ARCADE_RUSH[\s\S]*visible:\s*true/);
assert.match(modesSource, /id:\s*MODE_IDS\.DAILY[\s\S]*visible:\s*false/);

console.log("Arcade Rush AR13 ranked shadow route remains a valid production-isolation diagnostic across the AR14 cutover.");
