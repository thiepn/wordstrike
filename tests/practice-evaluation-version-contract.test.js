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

test("PL18 evaluation contracts remain intact inside the PL25 DB8/session13/foundation10 envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 8);
  assert.equal(PRACTICE_RECORD_VERSIONS.evaluationState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);
  assert.equal(PRACTICE_EVALUATION_FRAMEWORK_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_STATE_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_SELECTION_POLICY_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_RESERVATION_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_INTEGRITY_VERSION, 1);
  assert.equal(PRACTICE_EVALUATION_ANALYSIS_VERSION, 1);
  assert.deepEqual(PRACTICE_STORE_DEFINITIONS.evaluationStates.indexes.map((entry) => entry.name), ["profileId", "updatedAt"]);
  assert.equal(PRACTICE_STORE_DEFINITIONS.evaluationStates.indexes[0].options.unique, true);
});

test("PL18 historical session v10 evaluation migration remains null through the current PL25 v13 wrapper", () => {
  const current = createDefaultSessionSummary({ sessionId, profileId, contextId, experimentId: "full-assessment", now: () => new Date("2026-09-06T12:00:00Z") });
  const historical = { ...current, recordVersion: 10 };
  delete historical.evaluationSummary;
  delete historical.assessmentBinding;
  delete historical.coachBinding;
  const migrated = migratePracticeRecord("sessionSummary", historical);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.value.recordVersion, 13);
  assert.equal(migrated.value.evaluationSummary, null);
  assert.equal(migrated.value.assessmentBinding, null);
  assert.equal(migrated.value.coachBinding, null);
  assert.deepEqual(migrated.steps.slice(-3), ["sessionSummary:10->11", "sessionSummary:11->12", "sessionSummary:12->13"]);
});
