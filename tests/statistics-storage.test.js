import assert from "node:assert/strict";
import {
  ensureStoredPlayerProfile,
  getPublicPlayerProfile,
  LEGACY_MODE_DATA_STORAGE_KEY,
  loadModeData,
  MODE_DATA_STORAGE_KEY,
  recordCompletedSession,
  updateStoredDisplayName,
} from "../js/modeStorage.js";

const RETIRED_DAILY_STORAGE_KEY = "wordstrike_daily_legacy_v1";
const values = new Map();
globalThis.localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); },
};

values.set(RETIRED_DAILY_STORAGE_KEY, JSON.stringify({ obsolete: true }));
values.set(LEGACY_MODE_DATA_STORAGE_KEY, JSON.stringify({
  schemaVersion: 1,
  totals: {
    completedSessions: 3,
    failedSessions: 1,
    activePlaytimeMs: 5000,
    charactersTyped: 40,
    correctCharacters: 30,
    incorrectCharacters: 5,
    missedCharacters: 5,
    wordsCompleted: 8,
  },
  modes: {
    campaign: { completedSessions: 3, highestScore: 900 },
    "speed-test": { records: { "time-15": { bestWpm: 80 } } },
    endless: { highestStage: 7, records: { bestStage: { stage: 7 } } },
    daily: {
      completedSessions: 2,
      failedSessions: 1,
      records: {
        currentStreak: 2,
        bestStreak: 3,
        days: {
          "2026-06-20": {
            attempts: 1,
            firstCompletedAt: 100,
            best: { success: true, score: 1000 },
          },
        },
      },
    },
  },
  recentSessions: [
    { sessionId: "old-daily", modeId: "daily", endedAt: 1, success: true, score: 1000, modeData: { dateKey: "2026-06-20" } },
  ],
  recordedSessionIds: ["old-daily"],
}));

let data = loadModeData();
assert.equal(data.schemaVersion, 2);
assert.equal(data.profile, null);
assert.equal(data.lifetime.finalizedSessions, 3);
assert.equal(data.lifetime.successfulSessions, 2);
assert.equal(data.lifetime.accuracyNumerator, 30);
assert.equal(data.lifetime.accuracyDenominator, 40);
assert.equal(data.lifetime.historicalBackfillApplied, true);
assert.equal(data.modes.campaign.highestScore, 900);
assert.equal(data.modes["speed-test"].records["time-15"].bestWpm, 80);
assert.equal(data.modes.endless.records.bestStage.stage, 7);
assert.equal(Object.hasOwn(data.modes, "daily"), false);
assert.equal(data.recentSessions.some(({ modeId }) => modeId === "daily"), false);
assert.equal(data.recordedSessionIds.includes("old-daily"), false);
assert.equal(values.has(RETIRED_DAILY_STORAGE_KEY), false, "retired Daily sidecar must be removed during storage normalization");
assert.ok(data.modes["arcade-rush"]);

const cryptoSource = { randomUUID: () => "storage-profile-id" };
const profile = ensureStoredPlayerProfile({ cryptoSource, now: 1000 });
assert.equal(profile.playerId, "ws_storage-profile-id");
assert.equal(ensureStoredPlayerProfile({ cryptoSource, now: 2000 }).playerId, profile.playerId);
assert.equal(updateStoredDisplayName("  Nova   Prime  ", 3000).displayName, "Nova Prime");
assert.equal(updateStoredDisplayName("Nova Prime", 4000).updatedAt, 4000);
assert.equal(ensureStoredPlayerProfile().playerId, profile.playerId);
assert.deepEqual(getPublicPlayerProfile(), {
  playerId: profile.playerId,
  displayName: "Nova Prime",
  profileVersion: 1,
});
assert.deepEqual(
  [...values.keys()].sort(),
  [LEGACY_MODE_DATA_STORAGE_KEY, MODE_DATA_STORAGE_KEY].sort(),
);

const makeResult = (sessionId) => ({
  schemaVersion: 1,
  sessionId,
  modeId: "campaign",
  variantId: "normal",
  endedAt: 5000,
  success: true,
  score: 100,
  grade: "A",
  accuracy: 80,
  wpm: 40,
  activeDurationMs: 2000,
  developerMode: false,
  characters: { correct: 8, incorrect: 1, missed: 1, totalKeystrokes: 9 },
  words: { completed: 2, missed: 1 },
  modeData: { level: 1 },
});
assert.equal(recordCompletedSession(makeResult("new-session")), true);
assert.equal(recordCompletedSession(makeResult("new-session")), false);
data = loadModeData();
assert.equal(data.lifetime.finalizedSessions, 4);
assert.equal(data.lifetime.wordsCompleted, 10);
assert.equal(data.lifetime.wpmWeightedTotal, 80000);
assert.equal(data.modes.campaign.activity.trackedSessions, 1);
assert.equal(data.modes.campaign.activity.wordsCompleted, 2);
assert.equal(data.recentSessions.length, 1);

const beforeDeveloper = JSON.stringify(data);
assert.equal(recordCompletedSession({
  ...makeResult("developer"),
  developerMode: true,
}), false);
assert.equal(JSON.stringify(loadModeData()), beforeDeveloper);

values.set(MODE_DATA_STORAGE_KEY, JSON.stringify({
  ...data,
  profile: { playerId: "", displayName: "\n", createdAt: -1 },
  lifetime: { lifetimeVersion: 1, finalizedSessions: -5, activePlaytimeMs: Infinity },
}));
data = loadModeData();
assert.equal(data.profile, null);
assert.equal(data.lifetime.finalizedSessions, 0);
assert.equal(data.lifetime.activePlaytimeMs, 0);
assert.equal(data.modes.campaign.highestScore, 900);

console.log("Profile/lifetime v1→v2 migration, stable identity, retired Daily cleanup, aggregates, and duplicate guards passed.");
