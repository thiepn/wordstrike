import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeErrorTracker } from "../js/practiceLab/practiceErrorTracker.js";
import { analyzePracticeErrors } from "../js/practiceLab/practiceErrorAnalyzer.js";

function insertion(index, position, correct, activeMs) {
  return {
    eventIndex: index,
    eventTraceVersion: 3,
    timingSegmentId: 1,
    type: "character",
    entered: correct ? "a" : "x",
    expected: "a",
    textPosition: position,
    cursorBefore: position,
    cursorAfter: position + 1,
    correctness: correct ? "correct" : "incorrect",
    relativeActiveTimestampMs: activeMs,
    latencyFromPriorInsertionMs: index === 1 ? null : 100,
  };
}

function correction(index, before, activeMs) {
  return {
    eventIndex: index,
    eventTraceVersion: 3,
    timingSegmentId: 1,
    type: "backspace",
    cursorBefore: before,
    cursorAfter: before - 1,
    removedCount: 1,
    removedIncorrectCount: 1,
    removedCorrectCount: 0,
    correctionPolicy: "allow",
    relativeActiveTimestampMs: activeMs,
  };
}

test("PL9 streaming tracker preserves complete-session error counts beyond retained trace capacity", () => {
  const tracker = createPracticeErrorTracker();
  const retained = [];
  const retainedCapacity = 20_000;
  let eventIndex = 0;
  let cursor = 0;
  let activeMs = 0;
  let expectedEpisodes = 0;

  const push = (event) => {
    tracker.consume(event);
    retained.push(event);
    if (retained.length > retainedCapacity) retained.shift();
  };

  for (let insertionOrdinal = 0; insertionOrdinal < 24_500; insertionOrdinal += 1) {
    activeMs += 10;
    eventIndex += 1;
    if (insertionOrdinal > 0 && insertionOrdinal % 900 === 0) {
      expectedEpisodes += 1;
      push(insertion(eventIndex, cursor, false, activeMs));
      cursor += 1;
      activeMs += 5;
      eventIndex += 1;
      push(correction(eventIndex, cursor, activeMs));
      cursor -= 1;
      activeMs += 5;
      eventIndex += 1;
      push(insertion(eventIndex, cursor, true, activeMs));
      cursor += 1;
      activeMs += 5;
      eventIndex += 1;
      push(insertion(eventIndex, cursor, true, activeMs));
      cursor += 1;
    } else {
      push(insertion(eventIndex, cursor, true, activeMs));
      cursor += 1;
    }
  }

  const summary = analyzePracticeErrors({
    events: retained,
    traceMetadata: {
      capacity: retainedCapacity,
      retainedEventCount: retained.length,
      totalEventCount: eventIndex,
      truncated: eventIndex > retained.length,
    },
    trackerSnapshot: tracker.finalizeSnapshot(),
    latencyAnalysis: { classifiedTransitions: [] },
  }).sessionSummary;

  assert.equal(summary.errorEpisodeCount, expectedEpisodes);
  assert.equal(summary.correctedEpisodeCount, expectedEpisodes);
  assert.equal(summary.coverage.aggregateScope, "complete-session");
  assert.equal(summary.coverage.traceScope, "retained-window");
  assert.equal(summary.coverage.traceTruncated, true);
  assert.equal(summary.structuralCounts.substitution + summary.structuralCounts.compound + summary.structuralCounts.unknown >= 0, true);
  assert.equal(summary.correctedEpisodeCount + summary.uncorrectedEpisodeCount, summary.errorEpisodeCount);
});

test("PL9 streaming and retained-trace enrichment do not double-count recent episodes", () => {
  const tracker = createPracticeErrorTracker();
  const events = [
    insertion(1, 0, false, 0),
    correction(2, 1, 10),
    insertion(3, 0, true, 20),
    insertion(4, 1, true, 30),
  ];
  events.forEach((event) => tracker.consume(event));
  const summary = analyzePracticeErrors({
    events,
    traceMetadata: { capacity: 20_000, retainedEventCount: 4, totalEventCount: 4, truncated: false },
    trackerSnapshot: tracker.finalizeSnapshot(),
    latencyAnalysis: { classifiedTransitions: [] },
  }).sessionSummary;
  assert.equal(summary.errorEpisodeCount, 1);
  assert.equal(summary.correctedEpisodeCount, 1);
});
