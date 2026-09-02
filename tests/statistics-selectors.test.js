import assert from "node:assert/strict";
import {
  getCampaignStatistics,
  getDailyStatistics,
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
  finalizedSessions: 4,
  successfulSessions: 3,
  failedSessions: 1,
  activePlaytimeMs: 60000,
  wordsCompleted: 40,
  accuracyNumerator: 90,
  accuracyDenominator: 100,
  wpmWeightedTotal: 120000,
  wpmWeightedDurationMs: 2000,
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
assert.equal(Object.hasOwn(storage.modes, "daily"), false, "AR8 active schema v2 must not expose Daily mode state");
storage.recentSessions = [
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
assert.equal(overview.dailyStreak, 0, "Daily active statistics are intentionally absent from schema v2 before AR9");
assert.equal(overview.lifetime.accuracy, 90);
assert.equal(overview.lifetime.weightedWpm, 60);
assert.equal(overview.recent.length, 4);

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

const daily = getDailyStatistics(storage, "2026-06-21");
assert.equal(daily.todayAttempts, 0);
assert.equal(daily.todayBestScore, null);
assert.equal(daily.todayCompleted, false);
assert.equal(daily.distinctDaysCompleted, 0);
assert.equal(daily.latestDates.length, 0);

const original = JSON.stringify(storage.recentSessions);
assert.equal(getRecentSessionStatistics(storage, "campaign").length, 1);
assert.match(getRecentSessionStatistics(storage, "campaign")[0].primaryMetric, /LEVEL 2.*A/);
assert.match(getRecentSessionStatistics(storage, "endless")[0].primaryMetric, /STAGE 18/);
const speedRecent = getRecentSessionStatistics(storage, "speed-test");
assert.match(speedRecent[0].primaryMetric, /English 200/);
assert.match(speedRecent[1].primaryMetric, /LEGACY TEST/);
assert.equal(JSON.stringify(storage.recentSessions), original);

console.log("Overview, Campaign, Typing Test, Endless, Daily-free v2 compatibility, and Recent pure selector tests passed.");
