import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
} from "../js/practiceLab/practiceConstants.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { analyzePracticeErrors } from "../js/practiceLab/practiceErrorAnalyzer.js";
import { createPracticeErrorTracker } from "../js/practiceLab/practiceErrorTracker.js";
import {
  validatePracticeErrorSummary,
  validateSessionSummary,
} from "../js/practiceLab/practiceValidation.js";

const now = () => new Date("2026-09-04T14:30:00.000Z");

function emptyErrorSummary() {
  const tracker = createPracticeErrorTracker();
  return analyzePracticeErrors({
    events: [],
    traceMetadata: { capacity: 20_000, retainedEventCount: 0, totalEventCount: 0, truncated: false },
    trackerSnapshot: tracker.finalizeSnapshot(),
    latencyAnalysis: { classifiedTransitions: [] },
  }).sessionSummary;
}

test("PL9 contracts remain intact while PL16 advances only the surrounding storage/session envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 5);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 9);
  assert.equal(PRACTICE_RECORD_VERSIONS.checkpoint, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.abilityState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.profile, 3);
});

test("PL9 v3 error migration remains intact through PL10 v5, PL11 v6, PL13 v7, PL14 v8 and PL16 v9", () => {
  const current = createDefaultSessionSummary({ now });
  const legacy = { ...current, recordVersion: 3 };
  delete legacy.errorSummary;
  delete legacy.normalizationSummary;
  delete legacy.skillEvidenceSummary;
  delete legacy.abilityMeasurementSummary;
  delete legacy.learningEvidenceSummary;
  const original = structuredClone(legacy);
  const migrated = migratePracticeRecord("sessionSummary", legacy);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.fromVersion, 3);
  assert.equal(migrated.toVersion, 9);
  assert.deepEqual(migrated.steps, ["sessionSummary:3->4", "sessionSummary:4->5", "sessionSummary:5->6", "sessionSummary:6->7", "sessionSummary:7->8", "sessionSummary:8->9"]);
  assert.equal(migrated.value.errorSummary, null);
  assert.equal(migrated.value.normalizationSummary, null);
  assert.equal(migrated.value.skillEvidenceSummary, null);
  assert.equal(migrated.value.abilityMeasurementSummary, null);
  assert.equal(migrated.value.learningEvidenceSummary, null);
  assert.deepEqual(legacy, original);
});

test("PL9 preserves the full historical session migration chain through PL16", () => {
  const current = createDefaultSessionSummary({ now });
  const v1 = { ...current, recordVersion: 1 };
  delete v1.contextId;
  delete v1.fluencySummary;
  delete v1.errorSummary;
  delete v1.normalizationSummary;
  delete v1.skillEvidenceSummary;
  delete v1.abilityMeasurementSummary;
  delete v1.learningEvidenceSummary;
  const migrated = migratePracticeRecord("sessionSummary", v1);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.steps, ["sessionSummary:1->2", "sessionSummary:2->3", "sessionSummary:3->4", "sessionSummary:4->5", "sessionSummary:5->6", "sessionSummary:6->7", "sessionSummary:7->8", "sessionSummary:8->9"]);
  assert.equal(migrated.value.fluencySummary, null);
  assert.equal(migrated.value.errorSummary, null);
  assert.equal(migrated.value.normalizationSummary, null);
  assert.equal(migrated.value.skillEvidenceSummary, null);
  assert.equal(migrated.value.abilityMeasurementSummary, null);
  assert.equal(migrated.value.learningEvidenceSummary, null);
});

test("PL9 validates fixed episode counts, rates, removal relationships and nullability", () => {
  const valid = emptyErrorSummary();
  assert.equal(validatePracticeErrorSummary(valid).valid, true);
  assert.equal(valid.correctedEpisodeRate, null);
  assert.equal(valid.overDeletionRate, null);

  const badStructural = structuredClone(valid);
  badStructural.structuralCounts.substitution = 1;
  assert.equal(validatePracticeErrorSummary(badStructural).valid, false);

  const badRemoval = structuredClone(valid);
  badRemoval.charactersRemoved = 2;
  badRemoval.incorrectCharactersRemoved = 1;
  badRemoval.correctCharactersRemoved = 0;
  badRemoval.overDeletionRate = 0;
  assert.equal(validatePracticeErrorSummary(badRemoval).valid, false);
});

test("PL9 current session summaries accept null or canonical errorSummary only", () => {
  const current = createDefaultSessionSummary({ now });
  assert.equal(validateSessionSummary(current).valid, true);
  const withErrors = { ...current, errorSummary: emptyErrorSummary() };
  assert.equal(validateSessionSummary(withErrors).valid, true);
  assert.equal(validateSessionSummary({ ...withErrors, errorSummary: { ...withErrors.errorSummary, errorAnalyzerVersion: 99 } }).valid, false);
});
