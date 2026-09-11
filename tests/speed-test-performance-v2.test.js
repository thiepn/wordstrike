import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildPerformanceV2Analysis,
  buildSustainedWpmSeries,
  selectPreviousComparableSession,
} from "../js/speedTestPerformanceV2.js";

const points = Array.from({ length: 12 }, (_, index) => ({
  second: index + 1,
  durationMs: 1000,
  netCorrectChars: index < 4 ? 5 : index < 8 ? 6 : 7,
  correctChars: index < 4 ? 5 : index < 8 ? 6 : 7,
  rawChars: index < 4 ? 6 : index < 8 ? 7 : 8,
  wpm: index < 4 ? 60 : index < 8 ? 72 : 84,
  rawWpm: index < 4 ? 72 : index < 8 ? 84 : 96,
  accuracy: index === 2 ? 83.3 : 100,
  errors: index === 2 ? 1 : index === 6 ? 2 : 0,
  backspaces: index === 2 || index === 6 ? 1 : 0,
}));

const timeline = {
  version: 1,
  bucketMs: 1000,
  activeDurationMs: 12000,
  points,
  mistakes: [],
};

const sustained = buildSustainedWpmSeries(points);
assert.equal(sustained.length, points.length);
assert.equal(sustained[0].windowSeconds, 1);
assert.equal(sustained[4].windowSeconds, 5);
assert.equal(sustained.at(-1).wpm, 81.6,
  "Trailing five-second pace should be character-and-duration weighted");

const analysis = buildPerformanceV2Analysis(timeline);
assert.equal(analysis.version, 2);
assert.equal(analysis.averageWpm, 72);
assert.equal(analysis.segments.length, 3);
assert.equal(analysis.segments[0].label, "Start");
assert.equal(analysis.segments[0].wpm, 60);
assert.equal(analysis.segments[1].wpm, 72);
assert.equal(analysis.segments[2].wpm, 84);
assert.equal(analysis.paceDeltaWpm, 24);
assert.equal(analysis.totalErrors, 3);
assert.equal(analysis.totalBackspaces, 2);
assert.equal(analysis.errorsPerMinute, 15);
assert.ok(analysis.consistency > 70 && analysis.consistency < 100);
assert.match(analysis.insight, /Strong finish/);
assert.match(analysis.insight, /middle third/);

const recent = [
  { sessionId: "current", modeId: "speed-test", wpm: 80, modeData: { configId: "time-60" } },
  { sessionId: "wrong-config", modeId: "speed-test", wpm: 77, modeData: { configId: "time-15" } },
  { sessionId: "previous", modeId: "speed-test", wpm: 76, modeData: { configId: "time-60" } },
  { sessionId: "campaign", modeId: "campaign", wpm: 90, modeData: { configId: "time-60" } },
];
const previous = selectPreviousComparableSession(recent, {
  sessionId: "current",
  modeData: { configId: "time-60" },
});
assert.equal(previous?.sessionId, "previous");

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const resultsFeature = readFileSync(new URL("../js/speedTestResultsFeature.js", import.meta.url), "utf8");
assert.doesNotMatch(index, /<link[^>]+typing-performance-v2\.css/,
  "V2 results styling must not be globally loaded on unrelated screens");
assert.match(index, /js\/appBootstrap\.js\?v=20260911v8/,
  "V2 should load through the semantic V8 application bootstrap");
assert.match(resultsFeature, /speedTestPerformanceV2\.js/,
  "the semantic results feature must retain Typing Performance V2");
assert.doesNotMatch(index, /speedTestPerformanceV2\.js\?v=20260910b/,
  "historical V2 scripts must not return directly to index.html");

const v2Source = readFileSync(new URL("../js/speedTestPerformanceV2.js", import.meta.url), "utf8");
assert.match(v2Source, /styles\/screens\/typing-performance-v2\.css\?v=20260910a/,
  "V2 should lazy-load its stylesheet only when Typing results are enhanced");
assert.match(v2Source, /data-speed-performance-v2-style/);

const submission = readFileSync(new URL("../js/leaderboardSubmissionService.js", import.meta.url), "utf8");
assert.doesNotMatch(submission, /performanceTimeline/,
  "V2 analytics must remain local-only and outside ranked leaderboard payloads");

console.log("Typing Performance Timeline V2 analysis, comparison, semantic bootstrap, lazy styling, and ranked-data isolation passed.");
