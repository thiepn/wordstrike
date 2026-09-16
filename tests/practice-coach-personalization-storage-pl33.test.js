import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";
import {
  PRACTICE_COACH_BLOCK_VERSION,
  PRACTICE_COACH_PLAN_VERSION,
  PRACTICE_COACH_PLANNER_VERSION,
  PRACTICE_COACH_POLICY_VERSION,
} from "../js/practiceLab/practiceCoachConstants.js";
import {
  PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION,
  PRACTICE_COACH_PERSONALIZATION_VERSION,
  PRACTICE_COACH_TREATMENT_OPTIONS_VERSION,
} from "../js/practiceLab/practiceCoachPersonalizationConstants.js";
import { PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION } from "../js/practiceLab/practiceTreatmentConstants.js";
import { buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import {
  calculatePracticeCoachPlanHash,
  migratePracticeCoachPlanV1ToV2,
  validatePracticeCoachPlan,
} from "../js/practiceLab/practiceCoachPlan.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";

const profileId = createPracticeId("profile", { uuid: () => "pl33-store-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl33-store-context-12345678" });
const now = () => new Date("2026-09-11T12:00:00.000Z");

function target() {
  return { statId: "stat-a", entityType: "key", entityKey: "r", experimentId: "weak-keys", baseUtilityScore: 80, personalizedUtilityScore: 80, utilityScore: 80, hierarchy: { explainedBy: [] }, availabilityStatus: "ready", personalizationDecision: null, responseInformed: false };
}

function currentPlan() {
  return buildPracticeCoachDailyPlan({ profileId, contextId, localDayKey: "2026-09-11", requestedMinutes: 8, inputFingerprint: "pl33-storage", targetCandidates: [target()], realTextSupportedMinutes: [10, 5, 3], now });
}

function personalizationDecisionFixture() {
  return {
    version: 1,
    personalizationPolicyVersion: 1,
    applied: true,
    treatmentFamilyKey: "weak-keys@fixture",
    sourceScope: "exact-target",
    outcomeKey: "cold-transfer",
    delayBucket: "long",
    evidenceDepth: "high",
    responsePattern: "positive-signal",
    eligibleSampleCount: 10,
    medianResponse: 8,
    responseUnit: "quality-points",
    freshnessBucket: "0-7d",
    assignmentComposition: { manual: 8, coach: 2, total: 10 },
    measurementGrade: "prospective-recorded-clean",
    responseModifier: 1.1,
    baseInterventionMatch: 1,
    personalizedInterventionMatch: 1.1,
    sourceResponseStateId: "practice-treatment-response-state_hash-fixture-12345678",
    sourceResponseStateUpdatedAt: "2026-09-10T12:00:00.000Z",
    responseModelVersion: 1,
    comparisonAdjusted: true,
    needUtility: 80,
    evidenceInputs: [{
      treatmentFamilyKey: "weak-keys@fixture",
      treatmentResponseStateId: "practice-treatment-response-state_hash-fixture-12345678",
      updatedAt: "2026-09-10T12:00:00.000Z",
      sourceScope: "exact-target",
      responseModifier: 1.1,
    }],
    optionComparisons: [{
      experimentId: "weak-keys",
      treatmentFamilyKey: "weak-keys@fixture",
      baseInterventionMatch: 1,
      responseModifier: 1.1,
      personalizedInterventionMatch: 1.1,
      personalizedOptionUtility: 88,
      sourceScope: "exact-target",
      responsePattern: "positive-signal",
      evidenceDepth: "high",
    }],
  };
}

test("PL33 is a DB10 record-shape upgrade with zero new stores", () => {
  assert.ok(PRACTICE_DATABASE_VERSION >= 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.coachPlan, 2);
  assert.ok(Object.keys(PRACTICE_STORE_DEFINITIONS).length >= 18);
  assert.ok(PRACTICE_STORE_DEFINITIONS.treatmentEpisodes);
  assert.ok(PRACTICE_STORE_DEFINITIONS.treatmentResponseStates);
});

test("PL33 freezes Coach v2 and personalization version envelope without bumping PL32 response model", () => {
  assert.equal(PRACTICE_COACH_PLANNER_VERSION, 2);
  assert.equal(PRACTICE_COACH_POLICY_VERSION, 2);
  assert.equal(PRACTICE_COACH_PLAN_VERSION, 2);
  assert.equal(PRACTICE_COACH_BLOCK_VERSION, 2);
  assert.equal(PRACTICE_COACH_PERSONALIZATION_VERSION, 1);
  assert.equal(PRACTICE_COACH_PERSONALIZATION_POLICY_VERSION, 1);
  assert.equal(PRACTICE_COACH_TREATMENT_OPTIONS_VERSION, 1);
  assert.equal(PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION, 1);
});

test("PL33 Coach v2 persists neutral personalization metadata and target audit utilities", () => {
  const plan = currentPlan();
  assert.equal(plan.recordVersion, 2);
  assert.equal(plan.plannerVersion, 2);
  assert.deepEqual(plan.personalization, {
    personalizationVersion: 1,
    personalizationPolicyVersion: 1,
    treatmentOptionsVersion: 1,
    responseModelVersion: 1,
    responseInformed: false,
  });
  const block = plan.blocks.find((entry) => entry.kind === "targeted-intervention");
  assert.equal(block.baseUtilityScore, 80);
  assert.equal(block.personalizedUtilityScore, 80);
  assert.equal(block.utilityScore, 80);
  assert.equal(block.personalizationDecision, null);
  assert.equal(validatePracticeCoachPlan(plan).valid, true);
});

test("PL33 migrates Coach plan v1 to v2 without changing frozen treatment/order and never invents personalization", () => {
  const plan = currentPlan();
  const legacy = structuredClone(plan);
  legacy.recordVersion = 1;
  legacy.coachPlanVersion = 1;
  legacy.plannerVersion = 1;
  legacy.policyVersion = 1;
  delete legacy.personalization;
  for (const block of legacy.blocks) {
    block.blockVersion = 1;
    delete block.baseUtilityScore;
    delete block.personalizedUtilityScore;
    delete block.personalizationDecision;
    delete block.responseInformed;
  }
  legacy.planHash = "legacy-hash";
  const migrated = migratePracticeCoachPlanV1ToV2(legacy);
  assert.equal(migrated.recordVersion, 2);
  assert.equal(migrated.coachPlanVersion, 2);
  assert.equal(migrated.plannerVersion, 1);
  assert.equal(migrated.policyVersion, 1);
  assert.equal(migrated.personalization, null);
  assert.deepEqual(migrated.blocks.map((block) => [block.experimentId, block.target?.entityKey ?? null]), legacy.blocks.map((block) => [block.experimentId, block.target?.entityKey ?? null]));
  assert.ok(migrated.blocks.every((block) => block.personalizationDecision === null && block.responseInformed === false));
  assert.equal(validatePracticeCoachPlan(migrated).valid, true);
});

test("PL33 generic migration routes Coach plan record v1 through the v2 migration exactly once", () => {
  const plan = currentPlan();
  const legacy = structuredClone(plan);
  legacy.recordVersion = 1;
  legacy.coachPlanVersion = 1;
  legacy.plannerVersion = 1;
  legacy.policyVersion = 1;
  delete legacy.personalization;
  for (const block of legacy.blocks) {
    block.blockVersion = 1;
    delete block.baseUtilityScore;
    delete block.personalizedUtilityScore;
    delete block.personalizationDecision;
    delete block.responseInformed;
  }
  const result = migratePracticeRecord("coachPlan", legacy);
  assert.equal(result.ok, true);
  assert.equal(result.toVersion, 2);
  assert.deepEqual(result.steps, ["coachPlan:1->2"]);
  assert.equal(result.value.plannerVersion, 1);
  assert.equal(result.value.personalization, null);
});

test("PL33 plan hash distinguishes response-state fingerprints", () => {
  const plan = currentPlan();
  const modified = structuredClone(plan);
  modified.inputFingerprint = "different-response-state-fingerprint";
  modified.planHash = null;
  modified.planHash = calculatePracticeCoachPlanHash(modified);
  assert.notEqual(modified.planHash, plan.planHash);
  assert.equal(validatePracticeCoachPlan(modified).valid, true);
});

test("PL33 plan hash binds complete persisted personalization diagnostics", () => {
  const plan = structuredClone(currentPlan());
  const block = plan.blocks.find((entry) => entry.kind === "targeted-intervention");
  block.personalizationDecision = personalizationDecisionFixture();
  block.baseUtilityScore = 80;
  block.personalizedUtilityScore = 88;
  block.utilityScore = 88;
  block.responseInformed = true;
  plan.personalization.responseInformed = true;
  plan.planHash = calculatePracticeCoachPlanHash(plan);
  assert.equal(validatePracticeCoachPlan(plan).valid, true);

  const changedNeed = structuredClone(plan);
  changedNeed.blocks.find((entry) => entry.kind === "targeted-intervention").personalizationDecision.needUtility = 81;
  assert.notEqual(calculatePracticeCoachPlanHash(changedNeed), plan.planHash);
  assert.ok(validatePracticeCoachPlan(changedNeed).errors.some((entry) => entry.code === "HASH"));

  const changedComparison = structuredClone(plan);
  changedComparison.blocks.find((entry) => entry.kind === "targeted-intervention").personalizationDecision.optionComparisons[0].personalizedOptionUtility = 87;
  assert.notEqual(calculatePracticeCoachPlanHash(changedComparison), plan.planHash);
  assert.ok(validatePracticeCoachPlan(changedComparison).errors.some((entry) => entry.code === "HASH"));
});

test("PL33 Coach plan privacy forbids raw/custom personalization payloads", () => {
  const plan = currentPlan();
  const bad = structuredClone(plan);
  bad.decisionContext.customTextHash = "secret";
  const validation = validatePracticeCoachPlan(bad);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((entry) => entry.code === "PRIVACY"));
});
