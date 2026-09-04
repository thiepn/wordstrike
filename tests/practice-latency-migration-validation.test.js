import test from "node:test";
import assert from "node:assert/strict";
import {
  createDefaultSessionSummary,
} from "../js/practiceLab/practiceDefaults.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import {
  validatePracticeFluencySummary,
  validateSessionSummary,
} from "../js/practiceLab/practiceValidation.js";
import { analyzePracticeLatency } from "../js/practiceLab/practiceLatencyClassifier.js";

function adaptiveSummary() {
  const events = [{ eventIndex: 1, type: "character", correctness: "correct", expected: "a", textPosition: 0, timingSegmentId: 1, timingSegmentStartReason: "session-start", latencyFromPriorInsertionMs: null }];
  for (let index = 0; index < 20; index += 1) events.push({ eventIndex: index + 2, type: "character", correctness: "correct", expected: "a", textPosition: index + 1, timingSegmentId: 1, latencyFromPriorInsertionMs: 100 });
  return analyzePracticeLatency({ events }).sessionSummary;
}

test("PL8 sessionSummary v2 fluency migration proceeds sequentially through PL9 v4", () => {
  const current = createDefaultSessionSummary();
  const historical = { ...current, recordVersion: 2 };
  delete historical.fluencySummary;
  delete historical.errorSummary;
  const source = structuredClone(historical);
  const migrated = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.steps, ["sessionSummary:2->3", "sessionSummary:3->4"]);
  assert.equal(migrated.value.recordVersion, 4);
  assert.equal(migrated.value.fluencySummary, null);
  assert.equal(migrated.value.errorSummary, null);
  assert.deepEqual(historical, source);
});

test("PL8 context/fluency migration remains intact in the full v1 -> v2 -> v3 -> v4 chain", () => {
  const current = createDefaultSessionSummary();
  const historical = { ...current, recordVersion: 1 };
  delete historical.contextId;
  delete historical.fluencySummary;
  delete historical.errorSummary;
  const migrated = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.steps, ["sessionSummary:1->2", "sessionSummary:2->3", "sessionSummary:3->4"]);
  assert.equal(migrated.value.recordVersion, 4);
  assert.equal(migrated.value.fluencySummary, null);
  assert.equal(migrated.value.errorSummary, null);
  assert.equal(typeof migrated.value.contextId, "string");
});

test("PL8 fluency summary validator enforces versions, rates, counts and threshold invariants", () => {
  const summary = adaptiveSummary();
  assert.equal(validatePracticeFluencySummary(summary).valid, true);
  const badCount = structuredClone(summary);
  badCount.fluentTransitionCount += 1;
  assert.equal(validatePracticeFluencySummary(badCount).valid, false);

  const badRate = structuredClone(summary);
  badRate.disfluencyRate = 0.9;
  assert.equal(validatePracticeFluencySummary(badRate).valid, false);

  const badThreshold = structuredClone(summary);
  badThreshold.thresholdMs = 2000;
  assert.equal(validatePracticeFluencySummary(badThreshold).valid, false);
});

test("current v4 session summaries still accept null or valid compact PL8 fluency summaries", () => {
  const base = createDefaultSessionSummary();
  assert.equal(base.recordVersion, 4);
  assert.equal(base.fluencySummary, null);
  assert.equal(base.errorSummary, null);
  assert.equal(validateSessionSummary(base).valid, true);

  const withFluency = { ...base, fluencySummary: adaptiveSummary() };
  assert.equal(validateSessionSummary(withFluency).valid, true);

  const invalid = { ...base, fluencySummary: { classifierVersion: 999 } };
  assert.equal(validateSessionSummary(invalid).valid, false);
});
