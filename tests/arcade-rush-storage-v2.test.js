import assert from "node:assert/strict";
import {
  createDefaultArcadeRushRecords,
  createDefaultModeData,
  getArcadeRushRecordFlags,
  getArcadeRushRecords,
  LEGACY_MODE_DATA_STORAGE_KEY,
  loadModeData,
  migrateModeDataToV2,
  MODE_DATA_SCHEMA_VERSION,
  MODE_DATA_STORAGE_KEY,
  recordArcadeRushRunStarted,
  recordCompletedSession,
} from "../js/modeStorage.js";
import { MODE_IDS } from "../js/modes.js";

const RETIRED_DAILY_STORAGE_KEY = "wordstrike_daily_legacy_v1";
const values = new Map();
globalThis.localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); },
};

function resetValues() {
  values.clear();
}

assert.equal(MODE_DATA_SCHEMA_VERSION, 2);
assert.equal(MODE_DATA_STORAGE_KEY, "wordstrike_mode_data_v2");
assert.equal(LEGACY_MODE_DATA_STORAGE_KEY, "wordstrike_mode_data_v1");

const defaults = createDefaultModeData();
assert.equal(defaults.schemaVersion, 2);
assert.ok(defaults.modes[MODE_IDS.CAMPAIGN]);
assert.ok(defaults.modes[MODE_IDS.SPEED_TEST]);
assert.ok(defaults.modes[MODE_IDS.ENDLESS]);
assert.ok(defaults.modes[MODE_IDS.ARCADE_RUSH]);
assert.equal(Object.hasOwn(defaults.modes, "daily"), false);
assert.deepEqual(defaults.modes[MODE_IDS.ARCADE_RUSH].records, createDefaultArcadeRushRecords());

const dailyHeavyV1 = {
  schemaVersion: 1,
  profile: null,
  lifetime: null,
  totals: {
    completedSessions: 12,
    failedSessions: 3,
    activePlaytimeMs: 123456,
    charactersTyped: 900,
    correctCharacters: 800,
    incorrectCharacters: 50,
    missedCharacters: 50,
    wordsCompleted: 200,
  },
  modes: {
    campaign: { completedSessions: 4, failedSessions: 1, highestScore: 4444 },
    "speed-test": { completedSessions: 3, bestWpm: 88 },
    endless: { completedSessions: 2, highestStage: 11 },
    daily: {
      completedSessions: 3,
      failedSessions: 1,
      highestScore: 9999,
      records: {
        currentStreak: 7,
        bestStreak: 12,
        distinctCompletedDays: 2,
        lastSuccessfulDateKey: "2026-09-01",
        days: {
          "2026-09-01": {
            attempts: 4,
            firstCompletedAt: 100,
            lastAttemptAt: 200,
            best: { success: true, score: 9999, activeDurationMs: 120000, accuracy: 99, endedAt: 200, sessionId: "daily-old" },
          },
          "2026-08-31": {
            attempts: 2,
            firstCompletedAt: 50,
            lastAttemptAt: 60,
            best: { success: true, score: 8888, activeDurationMs: 130000, accuracy: 97, endedAt: 60, sessionId: "daily-older" },
          },
        },
      },
    },
  },
  recentSessions: [
    { sessionId: "daily-recent", modeId: "daily", endedAt: 300, success: true, score: 9999, modeData: { dateKey: "2026-09-01", challengeVersion: 1 } },
    { sessionId: "campaign-recent", modeId: "campaign", endedAt: 250, success: true, score: 4444, accuracy: 95, wpm: 55, modeData: { level: 10 } },
    { sessionId: "endless-recent", modeId: "endless", endedAt: 200, success: false, score: 3000, accuracy: 91, wpm: 60, modeData: { highestStage: 11, wordsCompleted: 80, survivalTimeMs: 90000 } },
  ],
  recordedSessionIds: ["daily-recent", "campaign-recent", "endless-recent"],
};

const pureMigration = migrateModeDataToV2(dailyHeavyV1);
assert.equal(pureMigration.schemaVersion, 2);
assert.equal(Object.hasOwn(pureMigration.modes, "daily"), false);
assert.equal(pureMigration.modes.campaign.highestScore, 4444);
assert.equal(pureMigration.modes.endless.highestStage, 11);
assert.deepEqual(pureMigration.modes[MODE_IDS.ARCADE_RUSH].records, createDefaultArcadeRushRecords());
assert.deepEqual(pureMigration.recentSessions.map(({ modeId }) => modeId), ["campaign", "endless"]);
for (const recent of pureMigration.recentSessions) {
  assert.equal(Object.hasOwn(recent.modeData, "dateKey"), false);
  assert.equal(Object.hasOwn(recent.modeData, "challengeVersion"), false);
}
assert.deepEqual(migrateModeDataToV2(pureMigration), pureMigration, "v2 migration must be idempotent");

resetValues();
values.set(LEGACY_MODE_DATA_STORAGE_KEY, JSON.stringify(dailyHeavyV1));
values.set(RETIRED_DAILY_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, mode: dailyHeavyV1.modes.daily }));
const loadedMigrated = loadModeData();
assert.deepEqual(loadedMigrated, pureMigration);
assert.equal(JSON.parse(values.get(MODE_DATA_STORAGE_KEY)).schemaVersion, 2);
assert.equal(values.has(RETIRED_DAILY_STORAGE_KEY), false, "AR16 removes the obsolete Daily compatibility sidecar");
assert.equal(Object.hasOwn(loadModeData().modes, "daily"), false);

// A corrupt v2 payload falls back to the still-readable v1 source and repairs v2.
values.set(MODE_DATA_STORAGE_KEY, "{broken");
assert.equal(loadModeData().modes.campaign.highestScore, 4444);
assert.equal(JSON.parse(values.get(MODE_DATA_STORAGE_KEY)).schemaVersion, 2);

// Malformed data with no usable legacy source safely returns a clean v2 default.
resetValues();
values.set(MODE_DATA_STORAGE_KEY, "{broken");
assert.deepEqual(loadModeData(), createDefaultModeData());

function rushResult(sessionId, overrides = {}) {
  return {
    schemaVersion: 1,
    sessionId,
    modeId: MODE_IDS.ARCADE_RUSH,
    variantId: "draft-r0-s1",
    endedAt: 10000,
    success: true,
    score: 60000,
    accuracy: 97.5,
    wpm: 82,
    activeDurationMs: 290000,
    developerMode: false,
    characters: { correct: 500, incorrect: 10, missed: 5, totalKeystrokes: 510 },
    words: { completed: 140, missed: 2 },
    combo: { maximum: 62, final: 12 },
    modeData: {
      rulesVersion: 0,
      recordEligible: false,
      wavesCompleted: 6,
      finalWave: 7,
      bossDefeated: true,
      bossTimeRemainingMs: 12000,
      integrityRemaining: 3,
      perfectWaves: 2,
    },
    ...overrides,
  };
}

resetValues();
assert.equal(recordArcadeRushRunStarted({ developerMode: false }), true);
assert.equal(recordArcadeRushRunStarted({ developerMode: false }), true);
assert.equal(recordArcadeRushRunStarted({ developerMode: true }), false);

const failed = rushResult("rush-failed", {
  success: false,
  score: 42000,
  accuracy: 94,
  wpm: 74,
  activeDurationMs: 210000,
  combo: { maximum: 37, final: 0 },
  modeData: {
    rulesVersion: 0,
    recordEligible: false,
    wavesCompleted: 4,
    finalWave: 5,
    bossDefeated: false,
    bossTimeRemainingMs: 0,
    integrityRemaining: 0,
    perfectWaves: 1,
  },
});
assert.equal(recordCompletedSession(failed), true, "failed Rush runs must persist locally");
assert.equal(recordCompletedSession(failed), false, "Rush terminal results must be deduplicated");

const success = rushResult("rush-success");
const flags = getArcadeRushRecordFlags(success);
assert.equal(flags.newHighestScore, true);
assert.equal(flags.newBestCompletedScore, true);
assert.equal(flags.newFastestCompletion, true);
assert.equal(recordCompletedSession(success), true);

const records = getArcadeRushRecords();
assert.equal(records.runsStarted, 2);
assert.equal(records.runsCompleted, 1);
assert.equal(records.bossesDefeated, 1);
assert.equal(records.highestScore, 60000);
assert.equal(records.bestCompletedScore, 60000);
assert.equal(records.fastestCompletion, 290000);
assert.equal(records.highestCombo, 62);
assert.equal(records.bestAccuracy, 97.5);
assert.equal(records.bestWpm, 82);
assert.equal(records.mostPerfectWaves, 2);
assert.deepEqual(loadModeData().recentSessions.map(({ modeId }) => modeId), [MODE_IDS.ARCADE_RUSH, MODE_IDS.ARCADE_RUSH]);

const beforeDev = JSON.stringify(loadModeData());
assert.equal(recordCompletedSession(rushResult("rush-dev", { developerMode: true, score: 999999 })), false);
assert.equal(JSON.stringify(loadModeData()), beforeDev);

console.log("Arcade Rush schema v2 migration, retired Daily cleanup, local records, corruption recovery, and idempotence passed.");
