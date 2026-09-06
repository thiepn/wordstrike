import test from "node:test";
import assert from "node:assert/strict";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createDefaultSessionSummary } from "../js/practiceLab/practiceDefaults.js";
import {
  PRACTICE_EVALUATION_ANALYSIS_VERSION,
  PRACTICE_EVALUATION_FRAMEWORK_VERSION,
  PRACTICE_EVALUATION_INTEGRITY_VERSION,
  PRACTICE_EVALUATION_RESERVATION_VERSION,
  PRACTICE_EVALUATION_SELECTION_POLICY_VERSION,
  PRACTICE_EVALUATION_STATE_VERSION,
} from "../js/practiceLab/practiceEvaluationConstants.js";

const profileId = "practice-profile_123456789";
const contextId = "practice-context_123456789";
const sessionId = "practice-session_123456789";

test("PL18 version envelope is DB6/evaluation1/session11/foundation9 with v1 framework contracts", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 6);
  assert.equal(PRACTICE_RECORD_VERSIONS.evaluationState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 11);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 9);
  assert.equal(PRACTICE_EVALUATION_FRAMEWORK_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_STATE_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_SELECTION_POLICY_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_RESERVATION_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_INTEGRITY_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_ANALYSIS_VERSION, 1);
  assert.deepEqual(PRACTICE_STORE_DEFINITIONS.evaluationStates.indexes.map((entry) => entry.name), ["profileId", "updatedAt"]);
  assert.equal(PRACTICE_STORE_DEFINITIONS.evaluationStates.indexes[0].options.unique, true);
});

test("PL18 historical session v10 migrates to v11 with evaluationSummary null only", () => {
  const current = createDefaultSessionSummary({ sessionId, profileId, contextId, experimentId: "full-assessment", now: () => new Date("2026-09-06T12:00:00Z") });
  const historical = { ...current, recordVersion: 10 };
  delete historical.evaluationSummary;
  const migrated = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.value.recordVersion, 11);
  assert.equal(migrated.value.evaluationSummary, null);
  assert.deepEqual(migrated.steps.slice(-1), ["sessionSummary:10->11"]);
});
