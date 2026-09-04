import test from "node:test";
import assert from "node:assert/strict";
import { analyzePracticeLatency } from "../js/practiceLab/practiceLatencyClassifier.js";

test("PL8 analyzes a near-capacity trace with bounded deterministic output", () => {
  const events = [];
  for (let index = 0; index < 20_000; index += 1) {
    events.push({
      eventIndex: index + 1,
      type: "character",
      expected: "a",
      entered: "a",
      correctness: "correct",
      textPosition: index,
      timingSegmentId: 1,
      timingSegmentStartReason: index === 0 ? "session-start" : null,
      latencyFromPriorInsertionMs: index === 0 ? null : index % 997 === 0 ? 2300 : 90 + (index % 11),
    });
  }
  const result = analyzePracticeLatency({
    events,
    traceMetadata: { capacity: 20_000, retainedEventCount: 20_000, totalEventCount: 20_000, truncated: false },
  });
  assert.equal(result.sessionSummary.classifiedInsertionTransitionCount, 20_000);
  assert.equal(result.sessionSummary.coverage.scope, "complete-session");
  assert.ok(result.sessionSummary.interruptionCount > 0);
  assert.ok(result.sessionSummary.fluentTransitionCount > 19_000);
  assert.equal(result.sessionSummary.calibration.confidence, "high");
  assert.equal(result.classifiedTransitions.length, 20_000);
});
