import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeErrorTracker } from "../js/practiceLab/practiceErrorTracker.js";
import { PRACTICE_ERROR_POLICY_V1 } from "../js/practiceLab/practiceErrorPolicy.js";

const insertion = ({ index, position, expected, entered = expected, activeMs, segment = 1 }) => ({
  eventIndex: index,
  eventTraceVersion: 3,
  timingSegmentId: segment,
  type: entered === " " ? "space" : "character",
  entered,
  expected,
  textPosition: position,
  cursorBefore: position,
  cursorAfter: position + 1,
  correctness: entered === expected ? "correct" : "incorrect",
  relativeActiveTimestampMs: activeMs,
});

const correction = ({
  index,
  before,
  after,
  activeMs,
  incorrect = 0,
  correct = 0,
  type = "backspace",
  policy = "allow",
}) => ({
  eventIndex: index,
  eventTraceVersion: 3,
  timingSegmentId: 1,
  type,
  cursorBefore: before,
  cursorAfter: after,
  removedCount: incorrect + correct,
  removedIncorrectCount: incorrect,
  removedCorrectCount: correct,
  correctionPolicy: policy,
  relativeActiveTimestampMs: activeMs,
});

test("PL9 single-backspace repair produces one corrected episode and observed recovery timings", () => {
  const tracker = createPracticeErrorTracker();
  [
    insertion({ index: 1, position: 0, expected: "a", activeMs: 0 }),
    insertion({ index: 2, position: 1, expected: "b", entered: "x", activeMs: 100 }),
    correction({ index: 3, before: 2, after: 1, activeMs: 200, incorrect: 1 }),
    insertion({ index: 4, position: 1, expected: "b", activeMs: 250 }),
    insertion({ index: 5, position: 2, expected: "c", activeMs: 300 }),
  ].forEach((event) => tracker.consume(event));
  const snapshot = tracker.getSnapshot();
  assert.equal(snapshot.errorEpisodeCount, 1);
  assert.equal(snapshot.correctedEpisodeCount, 1);
  assert.equal(snapshot.uncorrectedEpisodeCount, 0);
  assert.equal(snapshot.correctionAttemptCount, 1);
  assert.equal(snapshot.charactersRemoved, 1);
  assert.equal(snapshot.incorrectCharactersRemoved, 1);
  assert.equal(snapshot.correctCharactersRemoved, 0);
  const episode = snapshot.recentEpisodes[0];
  assert.equal(episode.correctionActionCount, 1);
  assert.equal(episode.correctionInitiationMs, 100);
  assert.equal(episode.correctionDistanceChars, 0);
  assert.equal(episode.correctionToRepairMs, 50);
  assert.equal(episode.errorToRepairMs, 150);
  assert.equal(episode.repairToResumeMs, 50);
});

test("PL9 correction distance excludes the initial wrong insertion and counts accepted continuation before correction", () => {
  const tracker = createPracticeErrorTracker();
  [
    insertion({ index: 1, position: 0, expected: "a", entered: "x", activeMs: 10 }),
    insertion({ index: 2, position: 1, expected: "b", activeMs: 20 }),
    insertion({ index: 3, position: 2, expected: "c", activeMs: 30 }),
    insertion({ index: 4, position: 3, expected: "d", activeMs: 40 }),
    correction({ index: 5, before: 4, after: 0, activeMs: 50, incorrect: 1, correct: 3, type: "word-delete" }),
    insertion({ index: 6, position: 0, expected: "a", activeMs: 60 }),
    insertion({ index: 7, position: 1, expected: "b", activeMs: 70 }),
    insertion({ index: 8, position: 2, expected: "c", activeMs: 80 }),
    insertion({ index: 9, position: 3, expected: "d", activeMs: 90 }),
    insertion({ index: 10, position: 4, expected: "e", activeMs: 100 }),
  ].forEach((event) => tracker.consume(event));
  const episode = tracker.getSnapshot().recentEpisodes[0];
  assert.equal(episode.correctionDistanceChars, 3);
});

test("PL9 multiple Backspaces remain one episode while each correction action is counted", () => {
  const tracker = createPracticeErrorTracker();
  [
    insertion({ index: 1, position: 0, expected: "a", activeMs: 0 }),
    insertion({ index: 2, position: 1, expected: "b", activeMs: 10 }),
    insertion({ index: 3, position: 2, expected: "c", entered: "x", activeMs: 20 }),
    correction({ index: 4, before: 3, after: 2, activeMs: 30, incorrect: 1 }),
    correction({ index: 5, before: 2, after: 1, activeMs: 40, correct: 1 }),
    correction({ index: 6, before: 1, after: 0, activeMs: 50, correct: 1 }),
    insertion({ index: 7, position: 0, expected: "a", activeMs: 60 }),
    insertion({ index: 8, position: 1, expected: "b", activeMs: 70 }),
    insertion({ index: 9, position: 2, expected: "c", activeMs: 80 }),
    insertion({ index: 10, position: 3, expected: "d", activeMs: 90 }),
  ].forEach((event) => tracker.consume(event));
  const snapshot = tracker.getSnapshot();
  assert.equal(snapshot.errorEpisodeCount, 1);
  assert.equal(snapshot.correctionAttemptCount, 3);
  assert.equal(snapshot.recentEpisodes[0].correctionActionCount, 3);
  assert.equal(snapshot.charactersRemoved, 3);
  assert.equal(snapshot.incorrectCharactersRemoved, 1);
  assert.equal(snapshot.correctCharactersRemoved, 2);
});

test("PL9 word-delete measures exact over-deletion without creating multiple episodes", () => {
  const tracker = createPracticeErrorTracker();
  for (let position = 0; position < 4; position += 1) tracker.consume(insertion({ index: position + 1, position, expected: String.fromCharCode(97 + position), activeMs: position * 10 }));
  tracker.consume(insertion({ index: 5, position: 4, expected: "e", entered: "x", activeMs: 40 }));
  tracker.consume(correction({ index: 6, before: 5, after: 0, activeMs: 50, incorrect: 1, correct: 4, type: "word-delete" }));
  for (let position = 0; position <= 5; position += 1) tracker.consume(insertion({ index: 7 + position, position, expected: String.fromCharCode(97 + position), activeMs: 60 + position * 10 }));
  const snapshot = tracker.getSnapshot();
  assert.equal(snapshot.errorEpisodeCount, 1);
  assert.equal(snapshot.correctedEpisodeCount, 1);
  assert.equal(snapshot.charactersRemoved, 5);
  assert.equal(snapshot.incorrectCharactersRemoved, 1);
  assert.equal(snapshot.correctCharactersRemoved, 4);
});

test("PL9 uncorrected adjacent reversal is one transposition episode and not a cascade", () => {
  const tracker = createPracticeErrorTracker();
  tracker.consume(insertion({ index: 1, position: 0, expected: "t", entered: "h", activeMs: 0 }));
  tracker.consume(insertion({ index: 2, position: 1, expected: "h", entered: "t", activeMs: 10 }));
  tracker.consume(insertion({ index: 3, position: 2, expected: "e", activeMs: 20 }));
  const snapshot = tracker.finalizeSnapshot();
  assert.equal(snapshot.errorEpisodeCount, 1);
  assert.equal(snapshot.uncorrectedEpisodeCount, 1);
  assert.equal(snapshot.structuralCounts.transposition, 1);
  assert.equal(snapshot.cascadeEpisodeCount, 0);
});

test("PL9 conservative cascade requires multiple errors plus compound/unknown structure", () => {
  const tracker = createPracticeErrorTracker();
  tracker.consume(insertion({ index: 1, position: 0, expected: "a", entered: "x", activeMs: 0 }));
  tracker.consume(insertion({ index: 2, position: 1, expected: "b", entered: "y", activeMs: 10 }));
  tracker.consume(insertion({ index: 3, position: 2, expected: "c", activeMs: 20 }));
  const snapshot = tracker.finalizeSnapshot();
  assert.equal(snapshot.structuralCounts.compound, 1);
  assert.equal(snapshot.cascadeEpisodeCount, 1);
});

test("PL9 correct-text revision and ignored/disabled corrections do not create fake error episodes", () => {
  const tracker = createPracticeErrorTracker();
  tracker.consume(insertion({ index: 1, position: 0, expected: "a", activeMs: 0 }));
  tracker.consume(correction({ index: 2, before: 1, after: 0, activeMs: 10, correct: 1 }));
  tracker.consume({ ...correction({ index: 3, before: 0, after: 0, activeMs: 20, policy: "ignore" }), removedCount: 0, removedCorrectCount: 0 });
  tracker.consume({ ...correction({ index: 4, before: 0, after: 0, activeMs: 30, policy: "disabled" }), removedCount: 0, removedCorrectCount: 0 });
  const snapshot = tracker.getSnapshot();
  assert.equal(snapshot.errorEpisodeCount, 0);
  assert.equal(snapshot.nonErrorCorrectionActionCount, 1);
  assert.equal(snapshot.correctionAttemptCount, 3);
  assert.equal(snapshot.ignoredCorrectionActionCount, 1);
  assert.equal(snapshot.disabledCorrectionAttemptCount, 1);
});

test("PL9 active episode memory is bounded and degrades over-limit episodes", () => {
  const tracker = createPracticeErrorTracker();
  for (let index = 0; index < PRACTICE_ERROR_POLICY_V1.maximumEpisodeEvents + 8; index += 1) {
    tracker.consume(insertion({ index: index + 1, position: index, expected: "a", entered: "x", activeMs: index }));
  }
  const snapshot = tracker.finalizeSnapshot();
  assert.equal(snapshot.errorEpisodeCount, 1);
  assert.equal(snapshot.structuralCounts.unknown, 1);
  assert.equal(snapshot.activeEpisodeTruncatedCount, 1);
  assert.equal(snapshot.recentEpisodes[0].bounded, true);
  assert.equal(snapshot.recentEpisodes[0].confidence, "unresolved");
  assert.equal(snapshot.recentEpisodes.length <= PRACTICE_ERROR_POLICY_V1.recentEpisodeSamples, true);
});
