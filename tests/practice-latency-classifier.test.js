import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePracticeLatency,
  classifyPracticeLatencyEvents,
  PRACTICE_LATENCY_POLICY_V1,
} from "../js/practiceLab/practiceLatencyClassifier.js";

const insertion = (eventIndex, latency, {
  segment = 1,
  correct = true,
  startReason = null,
  expected = "a",
} = {}) => ({
  eventIndex,
  type: "character",
  expected,
  entered: expected,
  correctness: correct ? "correct" : "incorrect",
  textPosition: eventIndex - 1,
  latencyFromPriorInsertionMs: latency,
  timingSegmentId: segment,
  timingSegmentStartReason: startReason,
});

const correction = (eventIndex, type = "backspace", segment = 1) => ({
  eventIndex,
  type,
  correctness: null,
  latencyFromPriorInsertionMs: null,
  timingSegmentId: segment,
});

function traceFromLatencies(latencies, options = {}) {
  return [insertion(1, null, { ...options, startReason: options.startReason ?? "session-start" }), ...latencies.map((latency, index) => insertion(index + 2, latency, options))];
}

test("PL8 adaptive threshold is robust to a long disfluent observation", () => {
  const baseline = [80, 82, 85, 87, 90, 94, 100, 88, 91, 86, 84, 92, 96, 89, 93, 81, 97, 83, 95, 99];
  const result = analyzePracticeLatency({ events: traceFromLatencies([...baseline, 1400]) });
  assert.equal(result.sessionSummary.calibration.status, "adaptive");
  assert.ok(result.sessionSummary.calibration.baselineMedianMs < 100);
  assert.ok(result.sessionSummary.thresholdMs >= 250 && result.sessionSummary.thresholdMs < 400);
  assert.equal(result.sessionSummary.disfluentTransitionCount, 1);
  assert.equal(result.sessionSummary.interruptionCount, 0);
  assert.ok(result.sessionSummary.fluentMedianMs < 100);
});

test("PL8 thresholds adapt to fast and slower session baselines", () => {
  const fast = analyzePracticeLatency({ events: traceFromLatencies(Array.from({ length: 24 }, (_, index) => 80 + (index % 5) * 5)) });
  const slow = analyzePracticeLatency({ events: traceFromLatencies(Array.from({ length: 24 }, (_, index) => 280 + (index % 5) * 15)) });
  assert.equal(fast.sessionSummary.thresholdMs, PRACTICE_LATENCY_POLICY_V1.minimumAdaptiveThresholdMs);
  assert.ok(slow.sessionSummary.thresholdMs > fast.sessionSummary.thresholdMs);
  assert.ok(slow.sessionSummary.thresholdMs >= 700);
});

test("PL8 locks the 2000 ms hard interruption boundary and adaptive maximum", () => {
  const baseline = Array.from({ length: 20 }, () => 300);
  const result = analyzePracticeLatency({ events: traceFromLatencies([...baseline, 1999, 2000]) });
  assert.ok(result.sessionSummary.thresholdMs <= PRACTICE_LATENCY_POLICY_V1.maximumAdaptiveThresholdMs);
  const tail = result.classifiedTransitions.slice(-2);
  assert.equal(tail[0].classification, "disfluent");
  assert.equal(tail[1].classification, "interruption");
  assert.equal(result.sessionSummary.interruptionCount, 1);
});

test("PL8 handles zero MAD and insufficient calibration without fabricated rates", () => {
  const zeroMad = analyzePracticeLatency({ events: traceFromLatencies(Array.from({ length: 20 }, () => 100)) });
  assert.equal(zeroMad.sessionSummary.calibration.baselineMadMs, 0);
  assert.equal(zeroMad.sessionSummary.thresholdMs, 250);

  const short = analyzePracticeLatency({ events: traceFromLatencies([100, 105, 110, 115, 120]) });
  assert.equal(short.sessionSummary.calibration.status, "insufficient-data");
  assert.equal(short.sessionSummary.thresholdMs, null);
  assert.equal(short.sessionSummary.disfluencyRate, null);
  assert.equal(short.sessionSummary.eligibleTransitionCount, 0);
  assert.equal(short.sessionSummary.excludedReasons.insufficientData, 5);
});

test("PL8 excludes segment starts, pause boundaries, corrections and incorrect calibration transitions", () => {
  const events = [
    insertion(1, null, { segment: 1, startReason: "session-start" }),
    ...Array.from({ length: 20 }, (_, index) => insertion(index + 2, 100, { segment: 1 })),
    insertion(22, 100, { segment: 2, startReason: "resume" }),
    insertion(23, 100, { segment: 2 }),
    correction(24, "backspace", 2),
    insertion(25, 500, { segment: 2 }),
    insertion(26, 100, { segment: 2 }),
    insertion(27, 100, { segment: 2, correct: false }),
    insertion(28, 100, { segment: 2 }),
    insertion(29, 100, { segment: 2 }),
  ];
  const result = analyzePracticeLatency({ events });
  const byIndex = new Map(result.classifiedTransitions.map((item) => [item.eventIndex, item]));
  assert.equal(byIndex.get(1).reason, "segment-start");
  assert.equal(byIndex.get(22).reason, "timing-boundary");
  assert.equal(byIndex.get(25).reason, "post-correction");
  assert.equal(byIndex.get(27).reason, "correctness");
  assert.equal(byIndex.get(28).reason, "correctness");
  assert.equal(byIndex.get(29).classification, "fluent");
  assert.equal(result.sessionSummary.calibrationSampleCount, 22);
});

test("word-delete is a correction boundary and interruptions do not poison later transitions", () => {
  const events = [
    insertion(1, null, { startReason: "session-start" }),
    ...Array.from({ length: 20 }, (_, index) => insertion(index + 2, 100)),
    correction(22, "word-delete"),
    insertion(23, 700),
    insertion(24, 2400),
    insertion(25, 105),
    insertion(26, 98),
  ];
  const result = analyzePracticeLatency({ events });
  const byIndex = new Map(result.classifiedTransitions.map((item) => [item.eventIndex, item]));
  assert.equal(byIndex.get(23).reason, "post-correction");
  assert.equal(byIndex.get(24).classification, "interruption");
  assert.equal(byIndex.get(25).classification, "fluent");
  assert.equal(byIndex.get(26).classification, "fluent");
});

test("PL8 reports complete vs retained-window coverage and caps truncated confidence", () => {
  const events = traceFromLatencies(Array.from({ length: 220 }, () => 100));
  const complete = analyzePracticeLatency({ events, traceMetadata: { capacity: 20000, retainedEventCount: events.length, totalEventCount: events.length, truncated: false } });
  assert.equal(complete.sessionSummary.coverage.scope, "complete-session");
  assert.equal(complete.sessionSummary.calibration.confidence, "high");

  const partial = analyzePracticeLatency({ events, traceMetadata: { capacity: 220, retainedEventCount: events.length, totalEventCount: 500, truncated: true } });
  assert.equal(partial.sessionSummary.coverage.scope, "retained-window");
  assert.equal(partial.sessionSummary.calibration.confidence, "medium");
});

test("PL8 classifier is pure for identical events and policy", () => {
  const events = traceFromLatencies(Array.from({ length: 20 }, (_, index) => 90 + index % 3));
  const first = classifyPracticeLatencyEvents({ events });
  const second = classifyPracticeLatencyEvents({ events });
  assert.deepEqual(first, second);
});
