import assert from "node:assert/strict";
import {
  backspaceFlowText,
  createFlowTypingRun,
  getFlowTypingSnapshot,
  insertFlowText,
} from "../js/flow/flowEngine.js";
import { analyzeFlowCadence } from "../js/flow/flowCadence.js";

function typeWithIntervals(text, intervals, options = {}) {
  const run = createFlowTypingRun(text, { difficulty: options.difficulty || "natural" });
  let at = options.startAt || 1000;
  for (let index = 0; index < text.length; index += 1) {
    insertFlowText(run, text[index], at);
    if (index < text.length - 1) {
      const interval = Array.isArray(intervals)
        ? intervals[index % intervals.length]
        : intervals;
      at += interval;
    }
  }
  return run;
}

const passage = "steady rhythm stays calm and clear.";
const fastSteady = typeWithIntervals(passage, 100);
const slowSteady = typeWithIntervals(passage, 250);
const fastAnalysis = analyzeFlowCadence(fastSteady);
const slowAnalysis = analyzeFlowCadence(slowSteady);
assert.equal(fastAnalysis.cadenceScore, 100);
assert.equal(slowAnalysis.cadenceScore, 100);
assert.ok(fastAnalysis.finalWpm > slowAnalysis.finalWpm);
assert.equal(
  getFlowTypingSnapshot(fastSteady).gameplay.score,
  getFlowTypingSnapshot(slowSteady).gameplay.score,
  "Phase 4 cadence remains descriptive and must not change Phase 3 score yet",
);

const erratic = typeWithIntervals(passage, [50, 270]);
const erraticAnalysis = analyzeFlowCadence(erratic);
assert.ok(erraticAnalysis.cadenceScore < fastAnalysis.cadenceScore - 25, erraticAnalysis);
assert.ok(Math.abs(erraticAnalysis.rawWpm - 75) < 15, erraticAnalysis.rawWpm);
assert.ok(erraticAnalysis.burstCount > 0, erraticAnalysis);
assert.equal(erraticAnalysis.pauseCount, 0);

const pauseRun = typeWithIntervals("pause detection uses my baseline.", [100, 100, 100, 600, 100, 100]);
const pauseAnalysis = analyzeFlowCadence(pauseRun);
assert.ok(pauseAnalysis.pauseThresholdMs >= 500);
assert.ok(pauseAnalysis.pauseCount >= 1, pauseAnalysis);
assert.ok(pauseAnalysis.pauseEvents.some((event) => event.ms === 600));

const correctionRun = createFlowTypingRun("abcdefg", { difficulty: "natural" });
insertFlowText(correctionRun, "a", 100);
insertFlowText(correctionRun, "b", 200);
insertFlowText(correctionRun, "x", 300);
backspaceFlowText(correctionRun, 1300);
insertFlowText(correctionRun, "c", 2300);
insertFlowText(correctionRun, "d", 2400);
insertFlowText(correctionRun, "e", 2500);
insertFlowText(correctionRun, "f", 2600);
insertFlowText(correctionRun, "g", 2700);
const correctionAnalysis = analyzeFlowCadence(correctionRun);
assert.equal(correctionAnalysis.correctionCost.count, 1);
assert.equal(correctionAnalysis.correctionCost.totalMs, 1000);
assert.equal(correctionAnalysis.pauseCount, 0, "backspace repair gap must not be double-counted as a cadence pause");
assert.equal(correctionAnalysis.cadenceScore, 100);

const featureText = `She said, "Amy's code is 7."`;
const featureRun = createFlowTypingRun(featureText, { difficulty: "advanced" });
let featureAt = 1000;
for (let index = 0; index < featureText.length; index += 1) {
  insertFlowText(featureRun, featureText[index], featureAt);
  let interval = 100;
  if (featureText[index] === ",") interval = 100;
  if (featureText[index + 1] === "A") interval = 420;
  if (featureText[index + 1] === "7") interval = 260;
  featureAt += interval;
}
const featureAnalysis = analyzeFlowCadence(featureRun);
const keys = new Set(featureAnalysis.featureLatencies.map(({ key }) => key));
for (const key of ["word-transition", "after-comma", "after-sentence", "capitals", "apostrophes", "quotes", "numbers"]) {
  assert.ok(keys.has(key), `expected natural typing latency group ${key}`);
}
assert.ok(featureAnalysis.slowestHesitations.length > 0);
assert.equal(featureAnalysis.slowestHesitations[0].key, "capitals");
assert.ok(featureAnalysis.slowestHesitations[0].deltaMs > 0);
assert.ok(featureAnalysis.slowestHesitations.some(({ key }) => key === "word-transition"));

const shortRun = createFlowTypingRun("abc");
insertFlowText(shortRun, "a", 0);
insertFlowText(shortRun, "b", 100);
insertFlowText(shortRun, "c", 200);
const shortAnalysis = analyzeFlowCadence(shortRun);
assert.equal(shortAnalysis.cadenceScore, null);
assert.equal(shortAnalysis.cadenceLabel, "Warming up");

const snapshot = getFlowTypingSnapshot(featureRun);
assert.ok(snapshot.cadence);
assert.equal(snapshot.cadence.cadenceScore, featureAnalysis.cadenceScore);
assert.ok(snapshot.cadence.rawWpm > 0);
assert.ok(snapshot.cadence.finalWpm > 0);

console.log("Flow Phase 4 cadence contracts passed: speed-relative consistency, pauses, bursts, correction cost, feature hesitation, and score independence.");
