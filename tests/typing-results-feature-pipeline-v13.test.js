import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPEED_TEST_RESULTS_FEATURE_CHAIN, SPEED_TEST_RESULTS_LIFECYCLE_VERSION } from "../js/speedTestResultsFeature.js";

assert.equal(SPEED_TEST_RESULTS_LIFECYCLE_VERSION, 13);
assert.deepEqual(SPEED_TEST_RESULTS_FEATURE_CHAIN, [
  "performance-graph",
  "pace-consistency",
  "flow-trend",
  "word-mistake-inspector",
  "longitudinal-baseline",
  "typing-coach-shell",
  "adaptive-training-plan",
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const feature = read("js/speedTestResultsFeature.js");
const runtime = read("js/typingResultsRuntime.js");
const profile = read("js/speedTestWordProfileV4.js");
const v6 = read("js/speedTestResultsV6b.js");
const v7 = read("js/speedTestResultsV7.js");

assert.equal(fs.existsSync(path.join(root, "js/speedTestResultsObserverHub.js")), false);
assert.doesNotMatch(feature, /MutationObserver/);
assert.match(feature, /syncSpeedTestWordProfiler/);
assert.match(feature, /syncSpeedTestPerformanceV1/);
assert.match(feature, /syncSpeedTestPerformanceV5/);
assert.match(feature, /syncSpeedTestResultsV6/);
assert.match(feature, /syncTypingCoachV6PracticeOverlay/);
assert.match(feature, /syncSpeedTestResultsV7/);
assert.doesNotMatch(profile, /new MutationObserver/);
assert.match(profile, /export function syncSpeedTestWordProfiler/);
assert.doesNotMatch(v6, /practiceObserver|new MutationObserver/);
assert.match(v6, /export function syncTypingCoachV6PracticeOverlay/);
assert.match(v6, /export function closeTypingCoachV6PracticeOverlay/);
assert.doesNotMatch(v7, /new MutationObserver|document\.addEventListener\("click"/);
assert.match(v7, /export function handleTypingCoachV7DocumentClick/);
assert.match(runtime, /handleFeatureClick = handleSpeedTestResultsDocumentClick/);
assert.match(runtime, /destroyFeatures = closeSpeedTestResultsTransientFeatures/);
assert.equal((runtime.match(/new Observer\(/g) || []).length, 1,
  "V13 Typing Results may create only the temporary Coach-overlay observer");

console.log("WORDSTRIKE V13 native result feature registry, profiler handoff, Coach observer budget, and compatibility-bridge retirement passed.");
