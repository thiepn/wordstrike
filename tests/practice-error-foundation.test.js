import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPracticeFoundationAnalysis,
  PRACTICE_FOUNDATION_ANALYSIS_VERSION,
} from "../js/practiceLab/practiceFoundationAnalysis.js";
import { analyzePracticeLatency } from "../js/practiceLab/practiceLatencyClassifier.js";
import { createPracticeErrorTracker } from "../js/practiceLab/practiceErrorTracker.js";

function insertion(index, latency = index === 1 ? null : 100) {
  return {
    eventIndex: index,
    eventTraceVersion: 3,
    timingSegmentId: 1,
    timingSegmentStartReason: index === 1 ? "session-start" : null,
    type: "character",
    entered: "a",
    expected: "a",
    textPosition: index - 1,
    cursorBefore: index - 1,
    cursorAfter: index,
    correctness: "correct",
    relativeActiveTimestampMs: (index - 1) * 100,
    latencyFromPriorInsertionMs: latency,
  };
}

test("PL9 latency/error outputs remain intact inside PL14 foundation analysis v6", () => {
  const events = Array.from({ length: 30 }, (_, index) => insertion(index + 1));
  const metadata = { capacity: 20_000, retainedEventCount: events.length, totalEventCount: events.length, truncated: false };
  const tracker = createPracticeErrorTracker();
  events.forEach((event) => tracker.consume(event));
  const foundation = buildPracticeFoundationAnalysis({
    events,
    traceMetadata: metadata,
    errorTrackerSnapshot: tracker.finalizeSnapshot(),
  });
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 6);
  assert.equal(foundation.version, 6);
  assert.ok(foundation.latency);
  assert.ok(foundation.errors);
  assert.ok(foundation.normalization);
  assert.ok(foundation.skills);
  assert.equal(foundation.ability.status, "not-requested");
  assert.equal(foundation.ability.observation, null);
  assert.equal(foundation.performance.status, "not-requested");
  assert.equal(foundation.errors.sessionSummary.errorEpisodeCount, 0);
  assert.equal(foundation.errors.sessionSummary.correctedEpisodeRate, null);
  assert.equal(Object.isFrozen(foundation), true);
  assert.equal(Object.isFrozen(foundation.errors), true);
});

test("PL9 does not alter PL8 latency classification for an equivalent trace", () => {
  const events = Array.from({ length: 30 }, (_, index) => insertion(index + 1, index === 25 ? 600 : index === 0 ? null : 100));
  const metadata = { capacity: 20_000, retainedEventCount: events.length, totalEventCount: events.length, truncated: false };
  const direct = analyzePracticeLatency({ events, traceMetadata: metadata });
  const tracker = createPracticeErrorTracker();
  events.forEach((event) => tracker.consume(event));
  const foundation = buildPracticeFoundationAnalysis({ events, traceMetadata: metadata, errorTrackerSnapshot: tracker.finalizeSnapshot() });
  assert.deepEqual(foundation.latency, direct);
});

test("PL9 fallback foundation analysis remains safe for PL8-style synthetic traces without tracker state", () => {
  const events = Array.from({ length: 5 }, (_, index) => {
    const event = insertion(index + 1);
    delete event.cursorBefore;
    delete event.cursorAfter;
    return event;
  });
  const foundation = buildPracticeFoundationAnalysis({
    events,
    traceMetadata: { capacity: 20_000, retainedEventCount: 5, totalEventCount: 5, truncated: false },
  });
  assert.equal(foundation.version, 6);
  assert.equal(foundation.errors.sessionSummary.errorEpisodeCount, 0);
  assert.equal(foundation.skills.version, 1);
  assert.equal(foundation.skills.summary, null);
  assert.equal(foundation.ability.status, "not-requested");
});
