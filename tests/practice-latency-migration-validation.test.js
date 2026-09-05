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

test("PL8 sessionSummary v2 fluency migration proceeds sequentially through PL16 v9", () => {
  const current = createDefaultSessionSummary();
  const historical = { ...current, recordVersion: 2 };
  delete historical.fluencySummary;
  delete historical.errorSummary;
  delete historical.normalizationSummary;
  delete historical.skillEvidenceSummary;
  delete historical.abilityMeasurementSummary;
  delete historical.performanceMeasurementSummary;
  delete historical.learningEvidenceSummary;
  const source = structuredClone(historical);
  const migrated = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.steps, ["sessionSummary:2->3", "sessionSummary:3->4", "sessionSummary:4->5", "sessionSummary:5->6", "sessionSummary:6->7", "sessionSummary:7->8", "sessionSummary:8->9"]);
  assert.equal(migrated.value.recordVersion, 9);
  assert.equal(migrated.value.fluencySummary, null);
  assert.equal(migrated.value.errorSummary, null);
  assert.equal(migrated.value.normalizationSummary, null);
  assert.equal(migrated.value.skillEvidenceSummary, null);
  assert.equal(migrated.value.abilityMeasurementSummary, null);
  assert.equal(migrated.value.performanceMeasurementSummary, null);
  assert.equal(migrated.value.learningEvidenceSummary, null);
  assert.deepEqual(historical, source);
});

test("PL8 context/fluency migration remains intact in the full v1 -> v2 -> v3 -> v4 -> v5 -> v6 -> v7 -> v8 -> v9 chain", () => {
  const current = createDefaultSessionSummary();
  const historical = { ...current, recordVersion: 1 };
  delete historical.contextId;
  delete historical.fluencySummary;
  delete historical.errorSummary;
  delete historical.normalizationSummary;
  delete historical.skillEvidenceSummary;
  delete historical.abilityMeasurementSummary;
  delete historical.performanceMeasurementSummary;
  delete historical.learningEvidenceSummary;
  const migrated = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.steps, ["sessionSummary:1->2", "sessionSummary:2->3", "sessionSummary:3->4", "sessionSummary:4->5", "sessionSummary:5->6", "sessionSummary:6->7", "sessionSummary:7->8", "sessionSummary:8->9"]);
  assert.equal(migrated.value.recordVersion, 9);
  assert.equal(migrated.value.fluencySummary, null);
  assert.equal(migrated.value.errorSummary, null);
  assert.equal(migrated.value.normalizationSummary, null);
  assert.equal(migrated.value.skillEvidenceSummary, null);
  assert.equal(migrated.value.abilityMeasurementSummary, null);
  assert.equal(migrated.value.performanceMeasurementSummary, null);
  assert.equal(migrated.value.learningEvidenceSummary, null);
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

test("current v9 session summaries still accept null or valid compact PL8 fluency summaries", () => {
  const base = createDefaultSessionSummary();
  assert.equal(base.recordVersion, 9);
  assert.equal(base.fluencySummary, null);
  assert.equal(base.errorSummary, null);
  assert.equal(base.normalizationSummary, null);
  assert.equal(base.skillEvidenceSummary, null);
  assert.equal(base.abilityMeasurementSummary, null);
  assert.equal(base.performanceMeasurementSummary, null);
  assert.equal(base.learningEvidenceSummary, null);
  assert.equal(validateSessionSummary(base).valid, true);

  const withFluency = { ...base, fluencySummary: adaptiveSummary() };
  assert.equal(validateSessionSummary(withFluency).valid, true);

  const invalid = { ...base, fluencySummary: { classifierVersion: 999 } };
  assert.equal(validateSessionSummary(invalid).valid, false);
});
