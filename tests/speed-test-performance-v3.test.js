import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildErrorRecoveryProfile,
  buildPaceZoneDistribution,
  buildPerformanceV3Analysis,
  buildSameConfigTrend,
  resampleWpmSeries,
} from "../js/speedTestPerformanceV3.js";

const wpms = [60, 70, 80, 90, 100, 110, 100, 90, 80, 70, 60, 50];
const points = wpms.map((wpm, index) => ({
  second: index + 1,
  startMs: index * 1000,
  elapsedMs: (index + 1) * 1000,
  durationMs: 1000,
  wpm,
  rawWpm: wpm + 8,
  accuracy: index === 3 || index === 8 ? 85 : 100,
  errors: index === 3 || index === 8 ? 1 : 0,
  backspaces: index === 3 ? 1 : 0,
  correctChars: Math.round((wpm / 60) * 5),
  netCorrectChars: Math.round((wpm / 60) * 5),
}));

const timeline = {
  version: 1,
  bucketMs: 1000,
  activeDurationMs: 12000,
  points,
  mistakes: [],
};

const zones = buildPaceZoneDistribution(timeline, 80);
assert.equal(Math.round(zones.surge.percent), 25);
assert.equal(Math.round(zones.flow.percent), 33);
assert.equal(Math.round(zones.recovery.percent), 33);
assert.equal(Math.round(zones.drop.percent), 8);

const recovery = buildErrorRecoveryProfile(timeline);
assert.equal(recovery.attempts, 2);
assert.equal(recovery.recovered, 1);
assert.equal(recovery.medianSeconds, 1);

const recent = [
  { sessionId: "r1", modeId: "speed-test", endedAt: 100, wpm: 72, accuracy: 97, modeData: { configId: "time-60", wordSetId: "english-200", rawWpm: 77 } },
  { sessionId: "r2", modeId: "speed-test", endedAt: 200, wpm: 76, accuracy: 98, modeData: { configId: "time-60", wordSetId: "english-200", rawWpm: 82 } },
  { sessionId: "wrong", modeId: "speed-test", endedAt: 250, wpm: 120, accuracy: 99, modeData: { configId: "time-15", wordSetId: "english-200", rawWpm: 128 } },
  { sessionId: "r3", modeId: "speed-test", endedAt: 300, wpm: 78, accuracy: 99, modeData: { configId: "time-60", wordSetId: "english-200", rawWpm: 84 } },
];
const result = {
  sessionId: "current",
  endedAt: 400,
  wpm: 80,
  accuracy: 99.5,
  modeData: { configId: "time-60", wordSetId: "english-200", rawWpm: 86 },
};

const trend = buildSameConfigTrend(recent, result);
assert.equal(trend.count, 4);
assert.equal(trend.bestWpm, 80);
assert.equal(trend.percentile, 100);
assert.equal(trend.deltaVsBaseline, 4.7);

const analysis = buildPerformanceV3Analysis(timeline, { recentSessions: recent, result });
assert.equal(analysis.version, 3);
assert.equal(analysis.zones.flow.label, "Flow");
assert.equal(analysis.recovery.medianSeconds, 1);
assert.equal(analysis.trend.count, 4);
assert.equal(analysis.dropStreakSeconds, 1);
assert.ok(analysis.burstWpm >= 100);
assert.match(analysis.insight, /recent same-test baseline/i);

assert.deepEqual(resampleWpmSeries([{ wpm: 50 }, { wpm: 100 }], 3), [50, 75, 100]);

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const resultsFeature = readFileSync(new URL("../js/speedTestResultsFeature.js", import.meta.url), "utf8");
assert.match(index, /js\/appBootstrap\.js\?v=20260911v8/);
assert.match(resultsFeature, /import "\.\/speedTestPerformanceV3\.js";/,
  "the semantic results feature must retain Typing Performance V3");
assert.doesNotMatch(index, /speedTestPerformanceV3\.js\?v=20260911a/,
  "historical V3 scripts must not return directly to index.html");
assert.doesNotMatch(index, /<link[^>]+typing-performance-v3\.css/,
  "V3 styling should remain lazy so unrelated screens keep certified default pixels");

const submission = readFileSync(new URL("../js/leaderboardSubmissionService.js", import.meta.url), "utf8");
assert.doesNotMatch(submission, /performanceV3|paceZone|errorRecovery|recentPercentile/,
  "V3 intelligence must stay outside ranked leaderboard payloads");

console.log("Typing Performance Timeline V3 flow, recovery, trend, semantic bootstrap, PB-series helpers, and ranked-data isolation passed.");
