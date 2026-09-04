import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE_LIMITS } from "../js/practiceLab/practiceConstants.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { analyzePracticeErrors } from "../js/practiceLab/practiceErrorAnalyzer.js";
import { createPracticeErrorTracker } from "../js/practiceLab/practiceErrorTracker.js";
import { validateSessionSummary } from "../js/practiceLab/practiceValidation.js";

function errorSummary() {
  const tracker = createPracticeErrorTracker();
  tracker.consume({
    eventIndex: 1,
    eventTraceVersion: 3,
    timingSegmentId: 1,
    type: "character",
    entered: "SECRET_WRONG_VALUE",
    expected: "SECRET_EXPECTED_VALUE",
    textPosition: 0,
    cursorBefore: 0,
    cursorAfter: 1,
    correctness: "incorrect",
    relativeActiveTimestampMs: 10,
  });
  return analyzePracticeErrors({
    events: [],
    traceMetadata: { capacity: 20_000, retainedEventCount: 0, totalEventCount: 1, truncated: true },
    trackerSnapshot: tracker.finalizeSnapshot(),
    latencyAnalysis: { classifiedTransitions: [] },
  }).sessionSummary;
}

test("PL9 persisted errorSummary contains only compact aggregate evidence", () => {
  const summary = errorSummary();
  const json = JSON.stringify(summary);
  for (const forbidden of [
    "SECRET_WRONG_VALUE",
    "SECRET_EXPECTED_VALUE",
    "entered",
    "expected",
    "eventTrace",
    "classifiedEventTrace",
    "recentEpisodes",
    "episodeEvents",
    "mistypedStrings",
    "customText",
  ]) assert.equal(json.includes(forbidden), false, `durable errorSummary leaked ${forbidden}`);
  assert.equal(json.length < 16 * 1024, true);
});

test("PL9 errorSummary remains safely within the existing sessionSummary object limit", () => {
  const session = createDefaultSessionSummary({
    overrides: {
      contentDescriptor: {
        contentPlanVersion: 1,
        contentId: "private-custom-text-reference",
        contentHash: "sha256:private-content-hash",
        sourceType: "custom-text",
      },
      errorSummary: errorSummary(),
    },
  });
  const bytes = new TextEncoder().encode(JSON.stringify(session)).byteLength;
  assert.equal(bytes < PRACTICE_LIMITS.sessionObjectBytes, true);
  assert.equal(validateSessionSummary(session).valid, true);
  const json = JSON.stringify(session);
  assert.equal(json.includes("full private custom text"), false);
  assert.equal(json.includes("SECRET_WRONG_VALUE"), false);
});
