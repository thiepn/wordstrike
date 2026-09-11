import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_LIMITS,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import { buildPracticeFoundationAnalysis, PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { validateSessionSummary } from "../js/practiceLab/practiceValidation.js";

test("PL19 contracts remain intact inside the current PL33 DB10/session13/foundation10 envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.assessmentRun, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_RECORD_VERSIONS.coachPlan, 2);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
  assert.equal(PRACTICE_LIMITS.assessmentRunBytes, 128 * 1024);
  assert.equal(PRACTICE_LIMITS.assessmentRuns, 50);
  assert.ok(PRACTICE_STORE_DEFINITIONS.assessmentRuns);
  assert.deepEqual(PRACTICE_STORE_DEFINITIONS.assessmentRuns.indexes.map((index) => index.name), [
    "profileId", "contextId", "status", "depth", "startedAt", "completedAt", "profileStatus",
  ]);
});

test("PL19 historical session v11 migrates through assessmentBinding v12 to PL25 coachBinding v13", () => {
  const current = createDefaultSessionSummary({
    profileId: "practice-profile_migration-12345678",
    contextId: "practice-context_migration-12345678",
    sessionId: "practice-session_migration-12345678",
    now: () => new Date("2026-09-07T00:00:00.000Z"),
  });
  const v11 = { ...current, recordVersion: 11 };
  delete v11.assessmentBinding;
  delete v11.coachBinding;
  const migrated = migratePracticeRecord("sessionSummary", v11);
  assert.equal(migrated.ok, true, JSON.stringify(migrated.error));
  assert.deepEqual(migrated.steps, ["sessionSummary:11->12", "sessionSummary:12->13"]);
  assert.equal(migrated.value.assessmentBinding, null);
  assert.equal(migrated.value.coachBinding, null);
  assert.equal(migrated.value.evaluationSummary, current.evaluationSummary);
  assert.equal(validateSessionSummary(migrated.value).valid, true);
});

test("PL19 foundation v10 always owns explicit assessment analysis", () => {
  const foundation = buildPracticeFoundationAnalysis({ events: [], traceMetadata: { truncated: false } });
  assert.equal(foundation.version, 10);
  assert.equal(foundation.assessment.version, 1);
  assert.equal(foundation.assessment.status, "not-requested");
  assert.equal(foundation.assessment.assessmentBlockDelta, null);
});
