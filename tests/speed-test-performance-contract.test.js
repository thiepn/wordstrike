import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const speedTest = readFileSync(new URL("../js/speedTest.js", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../js/speedTestTimeline.js", import.meta.url), "utf8");
const graph = readFileSync(new URL("../js/speedTestPerformanceV1.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../styles/screens/typing-performance-v1.css", import.meta.url), "utf8");
const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../styles/app.css", import.meta.url), "utf8");
const resultsFeature = readFileSync(new URL("../js/speedTestResultsFeature.js", import.meta.url), "utf8");
const leaderboard = readFileSync(new URL("../js/leaderboardSubmissionService.js", import.meta.url), "utf8");

assert.match(speedTest, /timeline:\s*createSpeedTestTimeline\(\)/);
assert.match(speedTest, /recordSpeedTestTimelineCharacter\(state\.timeline/);
assert.match(speedTest, /recordSpeedTestTimelineCorrection\(state\.timeline/);
assert.match(speedTest, /recordSpeedTestTimelineMissedCharacters\(state\.timeline/);
assert.match(speedTest, /recordSpeedTestTimelineSpace\(state\.timeline/);
assert.match(speedTest, /performanceTimeline:\s*state\.performanceTimeline/);
assert.match(speedTest, /persistSpeedTestTimeline\(/);

assert.match(timeline, /bucketMs:\s*1000|DEFAULT_BUCKET_MS\s*=\s*1000/);
assert.match(timeline, /Math\.ceil\(duration \/ bucketMs\)/,
  "timeline must preserve each active second instead of sampling opportunistically");
assert.match(timeline, /fastest5sWpm/);
assert.match(timeline, /slowest5sWpm/);
assert.match(timeline, /MAX_STORED_TIMELINES\s*=\s*30/);

assert.match(graph, /speed-performance-line--wpm/);
assert.match(graph, /speed-performance-line--raw/);
assert.match(graph, /speed-performance-error-marker/);
assert.match(graph, /data-speed-performance-tooltip/);
assert.match(graph, /pointermove/);
assert.match(graph, /ArrowLeft/);
assert.match(graph, /getCurrentSpeedTest/);

assert.match(css, /\.speed-performance-chart/);
assert.match(css, /touch-action:\s*pan-y/);
assert.match(css, /@media \(max-width:\s*720px\)/);

assert.match(index, /styles\/app\.css\?v=20260911v8/,
  "V8 should load Typing performance styling through the semantic app stylesheet boundary");
assert.match(index, /js\/appBootstrap\.js\?v=20260911v8/,
  "V8 should load Typing performance behavior through the semantic application bootstrap");
assert.match(appCss, /\.\/screens\/typing-performance-v1\.css\?v=20260910a/,
  "the semantic stylesheet boundary must retain Typing performance V1 styling");
assert.match(resultsFeature, /speedTestPerformanceV1\.js/,
  "the semantic results feature must retain Typing performance V1 behavior");
assert.doesNotMatch(index, /typing-performance-v1\.css\?v=20260910a/,
  "historical performance CSS must not return to index.html");
assert.doesNotMatch(index, /speedTestPerformanceV1\.js\?v=20260910a/,
  "historical performance scripts must not return to index.html");

assert.doesNotMatch(leaderboard, /performanceTimeline/,
  "rich per-second analytics must remain local and outside leaderboard submissions");

console.log("Typing Test performance V1 analytics remain local and load through the V8 semantic app boundaries.");
