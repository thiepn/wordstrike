import assert from "node:assert/strict";
import {
  SPEED_TEST_TIMELINE_STORAGE_KEY,
  createSpeedTestTimeline,
  finalizeSpeedTestTimeline,
  loadSpeedTestTimeline,
  persistSpeedTestTimeline,
  recordSpeedTestTimelineCharacter,
  recordSpeedTestTimelineCorrection,
  recordSpeedTestTimelineMissedCharacters,
  recordSpeedTestTimelineSpace,
} from "../js/speedTestTimeline.js";

const timeline = createSpeedTestTimeline();
for (let index = 0; index < 5; index += 1) {
  recordSpeedTestTimelineCharacter(timeline, {
    activeMs: 100 + index * 100,
    correct: true,
    expected: "a",
    typed: "a",
    word: "alpha",
  });
}
recordSpeedTestTimelineCharacter(timeline, {
  activeMs: 650,
  correct: false,
  expected: "l",
  typed: "x",
  word: "alpha",
});
recordSpeedTestTimelineCorrection(timeline, {
  activeMs: 720,
  erasedCorrectChars: 0,
});
recordSpeedTestTimelineSpace(timeline, 810);

for (let index = 0; index < 10; index += 1) {
  recordSpeedTestTimelineCharacter(timeline, {
    activeMs: 1100 + index * 70,
    correct: true,
    expected: "b",
    typed: "b",
    word: "beta",
  });
}

recordSpeedTestTimelineMissedCharacters(timeline, {
  activeMs: 2200,
  count: 2,
  expected: "ma",
  typed: "gam",
  word: "gamma",
});

const result = finalizeSpeedTestTimeline(timeline, 6000);
assert.equal(result.version, 1);
assert.equal(result.bucketMs, 1000);
assert.equal(result.points.length, 6, "one point should exist for every active second");
assert.equal(result.points[0].rawChars, 7, "printable inputs and a valid space count toward raw speed");
assert.equal(result.points[0].correctChars, 6);
assert.equal(result.points[0].errors, 1);
assert.equal(result.points[0].backspaces, 1);
assert.equal(result.points[0].wpm, 72);
assert.equal(result.points[0].rawWpm, 84);
assert.equal(result.points[1].wpm, 120);
assert.equal(result.points[1].rawWpm, 120);
assert.equal(result.points[2].errors, 2, "missed characters should be visible in the error timeline");
assert.equal(result.points[3].wpm, 0, "idle active seconds remain visible instead of being skipped");
assert.equal(result.mistakes.length, 2, "incorrect and missed events should retain sparse detail");
assert.equal(result.mistakes[0].type, "incorrect");
assert.equal(result.mistakes[1].type, "missed");
assert.equal(result.mistakes[1].count, 2);
assert.equal(result.analysis.peakWpm, 120);
assert.equal(result.analysis.peakSecond, 2);
assert.notEqual(result.analysis.fastest5sWpm, null);
assert.notEqual(result.analysis.slowest5sWpm, null);

const correctionTimeline = createSpeedTestTimeline();
recordSpeedTestTimelineCharacter(correctionTimeline, { activeMs: 100, correct: true });
recordSpeedTestTimelineCharacter(correctionTimeline, { activeMs: 200, correct: true });
recordSpeedTestTimelineCorrection(correctionTimeline, { activeMs: 300, erasedCorrectChars: 1 });
const corrected = finalizeSpeedTestTimeline(correctionTimeline, 1000);
assert.equal(corrected.points[0].rawWpm, 24, "raw speed keeps all printable input");
assert.equal(corrected.points[0].wpm, 12, "corrected speed subtracts erased correct progress");

const partialTimeline = createSpeedTestTimeline();
recordSpeedTestTimelineCharacter(partialTimeline, { activeMs: 2100, correct: true });
const partial = finalizeSpeedTestTimeline(partialTimeline, 2500);
assert.equal(partial.points.length, 3);
assert.equal(partial.points[2].durationMs, 500, "the final partial second uses its real duration");
assert.equal(partial.points[2].wpm, 24);

const storage = new Map();
globalThis.localStorage = {
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
assert.equal(persistSpeedTestTimeline("session-performance-v1", result, 12345), true);
assert.ok(storage.has(SPEED_TEST_TIMELINE_STORAGE_KEY));
const restored = loadSpeedTestTimeline("session-performance-v1");
assert.equal(restored.points.length, 6);
assert.equal(restored.points[0].wpm, 72);
assert.equal(restored.mistakes[0].word, "alpha");
assert.equal(loadSpeedTestTimeline("missing-session"), null);
delete globalThis.localStorage;

console.log("Typing Test performance timeline records, analyzes, and persists per-second metrics.");
