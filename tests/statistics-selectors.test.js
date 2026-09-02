import assert from "node:assert/strict";
import {
  getArcadeRushStatistics,
  getCampaignStatistics,
  getEndlessStatistics,
  getOverviewStatistics,
  getRecentSessionStatistics,
  getTypingTestStatistics,
} from "../js/statistics.js";
import { createDefaultModeData } from "../js/modeStorage.js";

const storage = createDefaultModeData();
storage.profile = {
  playerId: "ws_test",
  displayName: "Player",
  createdAt: 1,
  updatedAt: 1,
  profileVersion: 1,
};
storage.lifetime = {
  ...storage.lifetime,
  finalizedSessions: 8,
  successfulSessions: 6,
  failedSessions: 2,
  activePlaytimeMs: 1060000,
  wordsCompleted: 460,
  accuracyNumerator: 1890,
  accuracyDenominator: 2000,
  wpmWeightedTotal: 280000,
  wpmWeightedDurationMs: 4000,
};
storage.modes.campaign.completedSessions = 2;
storage.modes.campaign.failedSessions = 1;
storage.modes.campaign.activePlaytimeMs = 10000;
storage.modes.campaign.activity = {
  ...storage.modes.campaign.activity,
  trackedSessions: 1,
  wordsCompleted: 8,
  accuracyNumerator: 9,
  accuracyDenominator: 10,
  wpmWeightedTotal: 50000,
  wpmWeightedDurationMs: 1000,
};
storage.modes["speed-test"].wordSetRecords["english-200"]["time-15"] = {
  ...storage.modes["speed-test"].wordSetRecords["english-200"]["time-15"],
  bestWpm: 103,
  bestRawWpm: 110,
  tieAccuracy: 97,
  bestResultAt: 1000,
};
storage.modes["speed-test"].wordSetActivity["english-200"].trackedSessions = 1;
storage.modes["speed-test"].wordSetActivity["english-200"].activePlaytimeMs = 15000;
storage.modes["speed-test"].wordSetConfigUsage["english-200"]["time-15"] = 1;
storage.modes["speed-test"].records["time-15"] = {
  ...storage.modes["speed-test"].records["time-15"],
  bestWpm: 200,
};
storage.modes.endless.completedSessions = 1;
storage.modes.endless.highestStage = 18;
storage.modes.endless.records.bestStage = { stage: 18, score: 1000 };
storage.modes.endless.records.highestScore = { stage: 15, score: 2000 };
storage.modes.endless.records.longestSurvival = { survivalTimeMs: 120000 };

assert.equal(Object.hasOwn(storage.modes, "daily"), false, "active schema v2 must stay Daily-free");
const rushMode = storage.modes["arcade-rush"];
rushMode.completedSessions = 4;
rushMode.failedSessions = 1;
rushMode.activePlaytimeMs = 1000000;
rushMode.activity = {
  ...rushMode.activity,
  trackedSessions: 4,
  wordsCompleted: 420,
  accuracyNumerator: 1800,
  accuracyDenominator: 1900,
  wpmWeightedTotal: 82000000,
  wpmWeightedDurationMs: 1000000,
};
Object.assign(rushMode.records, {
  highestScore: 88000,
  bestCompletedScore: 82000,
  fastestCompletion: 275000,
  highestCombo: 104,
  bestAccuracy: 99.2,
  bestWpm: 91.5,
  mostPerfectWaves: 4,
  runsStarted: 5,
  runsCompleted: 3,
  bossesDefeated: 3,
});

storage.recentSessions = [
  {
    sessionId: "rush-success", modeId: "arcade-rush", endedAt: 3000, success: true,
    score: 82000, accuracy: 99.2, wpm: 91.5, activeDurationMs: 275000,
    modeData: {
      wavesCompleted: 6, bossDefeated: true, integrityRemaining: 3,
      maxCombo: 104, perfectWaves: 4, rulesVersion: 0,
    },
  },
  {
    sessionId: "rush-failure", modeId: "arcade-rush", endedAt: 2500, success: false,
    score: 41000, accuracy: 94, wpm: 74, activeDurationMs: 190000,
    modeData: {
      wavesCompleted: 4, bossDefeated: false, integrityRemaining: 0,
      maxCombo: 42, perfectWaves: 1, rulesVersion: 0,
    },
  },
  {
    sessionId: "new", modeId: "endless", endedAt: 2000, success: false,
    score: 1000, accuracy: 95, wpm: 60, activeDurationMs: 10000,
    modeData: { highestStage: 18 },
  },
  {
    sessionId: "old", modeId: "campaign", endedAt: 1000, success: true,
    grade: "A", accuracy: 90, wpm: 50, activeDurationMs: 5000,
    modeData: { level: 2 },
  },
  {
    sessionId: "legacy-speed", modeId: "speed-test", endedAt: 500, success: true,
    accuracy: 90, wpm: 200, activeDurationMs: 15000,
    modeData: { configId: "time-15" },
  },
  {
    sessionId: "current-speed", modeId: "speed-test", endedAt: 750, success: true,
    accuracy: 97, wpm: 103, activeDurationMs: 15000,
    modeData: { configId: "time-15", wordSetId: "english-200", wordSetName: "English 200" },
  },
];
const save = {
  currentFurthestLevel: 5,
  levels: {
    1: { grade: "S" },
    2: { grade: "A" },
    10: { grade: "B", bossCleared: true },
    3: { grade: "Fail" },
  },
};

const overview = getOverviewStatistics(storage, save);
assert.equal(overview.campaignProgress, 3);
assert.equal(overview.bestTypingWpm, 103);
assert.equal(overview.highestEndlessStage, 18);
assert.equal(overview.arcadeRushBestScore, 88000);
assert.equal(overview.arcadeRushCompletionRate, 60);
assert.equal(overview.lifetime.accuracy, 94.5);
assert.equal(overview.lifetime.weightedWpm, 70);
assert.equal(overview.recent.length, 5);
assert.equal("dailyStreak" in overview, false);

const campaign = getCampaignStatistics(storage, save);
assert.equal(campaign.highestUnlockedLevel, 5);
assert.equal(campaign.highestCompletedLevel, 10);
assert.equal(campaign.levelsCompleted, 3);
assert.equal(campaign.completionPercentage, 3);
assert.equal(campaign.bossesCompleted, 1);
assert.deepEqual(campaign.grades, { S: 1, A: 1, B: 1, C: 0, D: 0 });
assert.equal(campaign.wordsCompleted, 8);
assert.equal(campaign.weightedAccuracy, 90);

const typing = getTypingTestStatistics(storage);
assert.equal(typing.timeRecords[0].bestWpm, 103);
assert.equal(typing.timeRecords[0].rawWpm, 110);
assert.equal(typing.bestWpm, 103);
assert.equal(typing.wordSet.name, "English 200");
assert.equal(typing.mostUsedConfiguration, "15 Seconds");
assert.equal(typing.wordRecords[0].bestWpm, null);

const endless = getEndlessStatistics(storage);
assert.equal(endless.highestStage, 18);
assert.equal(endless.bestScore, 2000);
assert.equal(endless.longestSurvivalMs, 120000);
assert.equal("modifiersSurvived" in endless, false);

const rush = getArcadeRushStatistics(storage);
assert.deepEqual(rush, {
  highestScore: 88000,
  bestCompletedScore: 82000,
  fastestCompletionMs: 275000,
  highestCombo: 104,
  bestAccuracy: 99.2,
  bestWpm: 91.5,
  mostPerfectWaves: 4,
  runsStarted: 5,
  runsCompleted: 3,
  finalizedRuns: 4,
  failedRuns: 1,
  completionRate: 60,
  bossesDefeated: 3,
  activePlaytimeMs: 1000000,
  wordsCompleted: 420,
  weightedAccuracy: 1800 / 1900 * 100,
  weightedWpm: 82,
});
assert.equal("dateKey" in rush, false);
assert.equal("streak" in rush, false);
assert.equal("attempts" in rush, false);

const original = JSON.stringify(storage.recentSessions);
assert.equal(getRecentSessionStatistics(storage, "campaign").length, 1);
assert.match(getRecentSessionStatistics(storage, "campaign")[0].primaryMetric, /LEVEL 2.*A/);
assert.match(getRecentSessionStatistics(storage, "endless")[0].primaryMetric, /STAGE 18/);
const speedRecent = getRecentSessionStatistics(storage, "speed-test");
assert.match(speedRecent[0].primaryMetric, /English 200/);
assert.match(speedRecent[1].primaryMetric, /LEGACY TEST/);
const rushRecent = getRecentSessionStatistics(storage, "arcade-rush");
assert.equal(rushRecent.length, 2);
assert.match(rushRecent[0].primaryMetric, /COMPLETE.*82,000/);
assert.deepEqual(rushRecent[0].arcadeRush, {
  wavesCompleted: 6,
  bossDefeated: true,
  integrityRemaining: 3,
  maxCombo: 104,
  rulesVersion: 0,
  rulesLabel: "DRAFT",
});
assert.match(rushRecent[1].primaryMetric, /WAVE 5\/7.*41,000/);
assert.equal(rushRecent[1].arcadeRush.integrityRemaining, 0);
assert.equal(JSON.stringify(storage.recentSessions), original);

console.log("Overview, Campaign, Typing Test, Endless, Arcade Rush PB/lifetime, and Rush recent selectors passed.");
