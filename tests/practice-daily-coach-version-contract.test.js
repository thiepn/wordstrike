import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import { PRACTICE_FOUNDATION_ANALYSIS_VERSION } from "../js/practiceLab/practiceFoundationAnalysis.js";
import {
  PRACTICE_COACH_BLOCK_VERSION,
  PRACTICE_COACH_PLAN_VERSION,
  PRACTICE_COACH_PLANNER_VERSION,
  PRACTICE_COACH_POLICY_VERSION,
  PRACTICE_COACH_REVIEW_EXPERIMENT_ID,
  PRACTICE_COACH_REVIEW_EXPERIMENT_VERSION,
  PRACTICE_COACH_REVIEW_GENERATOR_VERSION,
  PRACTICE_COACH_UTILITY_VERSION,
} from "../js/practiceLab/practiceCoachConstants.js";
import { createPracticeCoachReviewDescriptor } from "../js/practiceLab/practiceCoachReview.js";

test("PL25 has the exact DB8/session13/foundation10 and v1 Coach envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 9);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_RECORD_VERSIONS.coachPlan, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.evaluationState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.assessmentRun, 1);
  assert.equal(PRACTICE_FOUNDATION_ANALYSIS_VERSION, 10);

  assert.equal(PRACTICE_COACH_PLAN_VERSION, 1);
  assert.equal(PRACTICE_COACH_PLANNER_VERSION, 1);
  assert.equal(PRACTICE_COACH_POLICY_VERSION, 1);
  assert.equal(PRACTICE_COACH_BLOCK_VERSION, 1);
  assert.equal(PRACTICE_COACH_UTILITY_VERSION, 1);
  assert.equal(PRACTICE_COACH_REVIEW_GENERATOR_VERSION, 1);
  assert.equal(PRACTICE_COACH_REVIEW_EXPERIMENT_VERSION, 1);
});

test("PL25 coachPlans store and session child lookup are the only new persistence ownership", () => {
  const coach = PRACTICE_STORE_DEFINITIONS.coachPlans;
  assert.equal(coach.keyPath, "coachPlanId");
  assert.deepEqual(coach.indexes.map((index) => index.name), [
    "profileId", "contextId", "localDayKey", "status", "updatedAt", "profileContextDay",
  ]);
  const uniqueDay = coach.indexes.find((index) => index.name === "profileContextDay");
  assert.deepEqual(uniqueDay.keyPath, ["profileId", "contextId", "localDayKey"]);
  assert.equal(uniqueDay.options.unique, true);

  const sessionCoachIndex = PRACTICE_STORE_DEFINITIONS.sessionSummaries.indexes.find((index) => index.name === "coachPlanId");
  assert.equal(sessionCoachIndex.keyPath, "coachBinding.coachPlanId");
});

test("PL25 hidden Coach Review descriptor is retention-only and cannot claim other measurement privileges", () => {
  const descriptor = createPracticeCoachReviewDescriptor();
  assert.equal(descriptor.id, PRACTICE_COACH_REVIEW_EXPERIMENT_ID);
  assert.equal(descriptor.internalCoachOnly, true);
  assert.equal(descriptor.retentionMeasurementKind, "entity-review");
  assert.equal(descriptor.abilityChannel, null);
  assert.equal(descriptor.performanceMeasurementKind, null);
  assert.equal(descriptor.evaluationMeasurementKind, null);
  assert.equal(descriptor.resumable, false);
});
