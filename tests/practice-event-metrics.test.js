import assert from "node:assert/strict";
import { createPracticeEventBuffer } from "../js/practiceLab/practiceEventBuffer.js";
import { createPracticeMetricsCollector } from "../js/practiceLab/practiceMetrics.js";

const buffer = createPracticeEventBuffer({ capacity: 3 });
for (let index = 0; index < 5; index += 1) buffer.push({ eventIndex: index + 1 });
assert.equal(buffer.size, 3);
assert.equal(buffer.totalEventCount, 5);
assert.equal(buffer.truncated, true);
assert.deepEqual(buffer.getTrace().map((event) => event.eventIndex), [3, 4, 5]);

const metrics = createPracticeMetricsCollector();
const expected = [..."abcdefghijk"];
for (let index = 0; index < expected.length; index += 1) {
  const activeMs = index * 100;
  metrics.recordInsertion({
    value: expected[index],
    expected: expected[index],
    correct: true,
    position: index,
    expectedGraphemes: expected,
    monotonicMs: activeMs,
    activeMs,
    performanceStartMono: 0,
    unit: null,
  });
}
const snapshot = metrics.snapshot({
  activeDurationMs: 60_000,
  pausedDurationMs: 5_000,
  wallDurationMs: 65_000,
  finalTypedEntries: expected.map((value) => ({ value, correct: true })),
});
assert.equal(snapshot.rawWpm, 11 / 5);
assert.equal(snapshot.wpm, 11 / 5);
assert.equal(snapshot.accuracy, 100);
assert.equal(snapshot.transitionCount, 10);
assert.equal(snapshot.transitionMeanMs, 100);
assert.equal(snapshot.transitionVariance, 0);
assert.equal(snapshot.consistency, 100);
assert.equal(snapshot.longestInputHesitationMs, 100);

const observations = metrics.observations();
assert.equal(observations.keys.length, 11);
assert.ok(observations.bigrams.some((item) => item.entityKey === "ab"));
assert.ok(observations.trigrams.some((item) => item.entityKey === "abc"));
assert.equal(observations.trigrams.some((item) => [...item.entityKey].length !== 3), false);

const sparse = createPracticeMetricsCollector();
sparse.recordInsertion({
  value: "x", expected: "y", correct: false, position: 0,
  expectedGraphemes: ["y"], monotonicMs: 0, activeMs: 0, performanceStartMono: 0, unit: null,
});
sparse.recordCorrection({
  type: "backspace",
  policy: "allow",
  removed: [{ correct: false }],
  activeMs: 100,
});
sparse.recordInsertion({
  value: "y", expected: "y", correct: true, position: 0,
  expectedGraphemes: ["y"], monotonicMs: 300, activeMs: 300, performanceStartMono: 0, unit: null,
});
const corrected = sparse.snapshot({
  activeDurationMs: 1000,
  finalTypedEntries: [{ value: "y", correct: true }],
});
assert.equal(corrected.correctedIncorrectCharacters, 1);
assert.equal(corrected.uncorrectedErrors, 0);
assert.equal(corrected.correctionCostMs, 200);
assert.equal(corrected.consistency, null);

const inactive = createPracticeMetricsCollector();
for (const [index, activeMs] of [0, 100, 3000].entries()) inactive.recordInsertion({
  value: "a", expected: "a", correct: true, position: index,
  expectedGraphemes: ["a", "a", "a"], monotonicMs: activeMs, activeMs,
  performanceStartMono: 0, unit: null,
});
assert.equal(inactive.snapshot({ activeDurationMs: 3000, finalTypedEntries: [] }).transitionCount, 1);

console.log("Practice bounded event buffering, WPM, accuracy, corrections, hesitation, consistency, inactivity exclusion, and observations passed.");

