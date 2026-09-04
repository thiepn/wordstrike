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

test("PL9 advances only sessionSummary to v4 while Practice DB and checkpoint remain unchanged", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 2);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 4);
  assert.equal(PRACTICE_RECORD_VERSIONS.checkpoint, 2);
  assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 2);
  assert.equal(PRACTICE_RECORD_VERSIONS.profile, 3);
});

test("PL9 sessionSummary v3 migrates sequentially to v4 with null historical error evidence", () => {
  const current = createDefaultSessionSummary({ now });
  const legacy = { ...current, recordVersion: 3 };
  delete legacy.errorSummary;
  const original = structuredClone(legacy);
  const migrated = migratePracticeRecord("sessionSummary", legacy);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.fromVersion, 3);
  assert.equal(migrated.toVersion, 4);
  assert.deepEqual(migrated.steps, ["sessionSummary:3->4"]);
  assert.equal(migrated.value.errorSummary, null);
  assert.deepEqual(legacy, original);
});

test("PL9 preserves the full historical session migration chain", () => {
  const current = createDefaultSessionSummary({ now });
  const v1 = { ...current, recordVersion: 1 };
  delete v1.contextId;
  delete v1.fluencySummary;
  delete v1.errorSummary;
  const migrated = migratePracticeRecord("sessionSummary", v1);
  assert.equal(migrated.ok, true);
  assert.deepEqual(migrated.steps, ["sessionSummary:1->2", "sessionSummary:2->3", "sessionSummary:3->4"]);
  assert.equal(migrated.value.fluencySummary, null);
  assert.equal(migrated.value.errorSummary, null);
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
