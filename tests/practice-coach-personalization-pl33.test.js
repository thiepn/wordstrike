import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_COACH_ACTIONABLE_UTILITY,
  PRACTICE_COACH_SECOND_TARGET_UTILITY,
} from "../js/practiceLab/practiceCoachConstants.js";
import {
  PRACTICE_COACH_ACCURACY_ALTERNATIVE_MIN_PRESSURE,
  PRACTICE_COACH_PERSONALIZATION_DEPTH_WEIGHTS,
  PRACTICE_COACH_PERSONALIZATION_VERSION,
} from "../js/practiceLab/practiceCoachPersonalizationConstants.js";
import { calculatePracticeCoachNeedUtility } from "../js/practiceLab/practiceCoachUtility.js";
import {
  buildPracticeCoachTreatmentOptions,
  getCurrentPracticeCoachTreatmentFamilyKey,
} from "../js/practiceLab/practiceCoachTreatmentOptions.js";
import {
  calculatePracticeCoachResponseModifier,
  selectPersonalizedPracticeTreatment,
} from "../js/practiceLab/practiceCoachPersonalization.js";
import { selectPracticeCoachResponseProfile } from "../js/practiceLab/practiceCoachPersonalizationEvidence.js";
import { buildPracticeCoachTargetCandidates } from "../js/practiceLab/practiceCoachTargets.js";
import { buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import { PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION } from "../js/practiceLab/practiceTreatmentConstants.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";

const profileId = createPracticeId("profile", { uuid: () => "pl33-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl33-context-12345678" });
const now = new Date("2026-09-11T12:00:00.000Z");

function sample({
  day = 0,
  responseValue = 10,
  targetStatId = "stat-th",
  assignmentKind = "manual",
  measurementGrade = "independent",
} = {}) {
  const observedAt = new Date(Date.parse("2026-09-10T12:00:00.000Z") - day * 86_400_000).toISOString();
  return Object.freeze({
    treatmentEpisodeId: `episode-${day}-${targetStatId}`,
    candidateId: `candidate-${day}-${targetStatId}`,
    observedAt,
    localDayKey: observedAt.slice(0, 10),
    assignmentKind,
    targetStatId,
    measurementGrade,
    primaryEligible: true,
    aggregateEligible: true,
    contaminated: false,
    evidenceGrade: "prospective-recorded-clean",
    responseValue,
    responseUnit: "quality-points",
    tradeoff: false,
    classification: null,
  });
}

function state({ experimentId = "combination-repair", entityType = "bigram", outcomeKey = "cold-transfer", delayBucket = "long", samples = [] } = {}) {
  const treatmentFamilyKey = getCurrentPracticeCoachTreatmentFamilyKey(experimentId);
  return Object.freeze({
    treatmentResponseStateId: `state-${experimentId}-${outcomeKey}-${delayBucket}`,
    profileId,
    contextId,
    recordVersion: 1,
    stateVersion: 1,
    responseModelVersion: PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
    treatmentFamilyKey,
    targetEntityType: entityType,
    outcomeKey,
    delayBucket,
    responseUnit: "quality-points",
    samples: Object.freeze(samples),
    summary: null,
    updatedAt: "2026-09-10T13:00:00.000Z",
  });
}

function candidate({ entityType = "bigram", entityKey = "th", statId = "stat-th", priorityScore = 80, ar = 22, slow = 60 } = {}) {
  return {
    statId, entityType, entityKey, status: "confirmed", priorityScore, weaknessScore: 80,
    evidenceMetadata: { primaryDimensionConfidenceScore: 90 }, hierarchy: { status: "independent", explainedBy: [] },
    dimensions: {
      inaccurate: { weightedSeverity: ar }, recoveryHeavy: { weightedSeverity: ar - 2 },
      slow: { weightedSeverity: slow }, hesitant: { weightedSeverity: 10 }, unstable: { weightedSeverity: 5 },
    },
  };
}

function mediumSamples(options = {}) {
  return [0, 1, 2, 3, 4].map((day) => sample({ day, ...options }));
}
function highSamples(options = {}) {
  return Array.from({ length: 10 }, (_, day) => sample({ day, ...options }));
}

test("PL33 freezes current need gates and exposes unchanged NeedUtility semantics", () => {
  assert.equal(PRACTICE_COACH_ACTIONABLE_UTILITY, 35);
  assert.equal(PRACTICE_COACH_SECOND_TARGET_UTILITY, 60);
  assert.equal(PRACTICE_COACH_ACCURACY_ALTERNATIVE_MIN_PRESSURE, 20);
  assert.deepEqual(PRACTICE_COACH_PERSONALIZATION_DEPTH_WEIGHTS, { insufficient: 0, low: 0, medium: 0.5, high: 1 });
  const need = calculatePracticeCoachNeedUtility({ priorityScore: 80, masteryStage: "learning", saturationStatus: "not-detected", marginalGainBand: "high", readinessBand: "normal" });
  assert.equal(need.needUtility, 80);
});

test("PL33 treatment options remain entity-compatible and add Accuracy & Recovery only at AR >=20", () => {
  const low = buildPracticeCoachTreatmentOptions({ entityType: "word", accuracyRecoveryPressure: 19 }, { preferredIntervention: { experimentId: "problem-words" } });
  assert.deepEqual(low.map((row) => row.experimentId), ["problem-words"]);
  const eligible = buildPracticeCoachTreatmentOptions({ entityType: "word", accuracyRecoveryPressure: 20 }, { preferredIntervention: { experimentId: "problem-words" } });
  assert.deepEqual(eligible.map((row) => row.experimentId), ["problem-words", "accuracy-control"]);
  assert.deepEqual(eligible.map((row) => row.baseInterventionMatch), [1, 0.85]);
  assert.equal(buildPracticeCoachTreatmentOptions({ entityType: "custom", accuracyRecoveryPressure: 100 }).length, 0);
});

test("PL33 exact-target medium evidence outranks family high evidence", () => {
  const familySamples = highSamples().map((entry, index) => ({ ...entry, targetStatId: `stat-family-${index % 3}` }));
  const exact = state({ samples: mediumSamples({ responseValue: -10, targetStatId: "stat-th" }) });
  const family = state({ outcomeKey: "retention-review", samples: familySamples });
  const profile = selectPracticeCoachResponseProfile({
    responseStates: [family, exact], profileId, contextId,
    treatmentFamilyKey: exact.treatmentFamilyKey, targetEntityType: "bigram", targetStatId: "stat-th", now,
  });
  assert.equal(profile.sourceScope, "exact-target");
  assert.equal(profile.summary.evidenceDepth, "medium");
  assert.equal(profile.summary.responsePattern, "negative-signal");
});

test("PL33 low exact-target evidence falls back to medium family evidence with target diversity", () => {
  const exactLow = state({ samples: [sample({ day: 0 }), sample({ day: 1 }), sample({ day: 2 })] });
  const familySamples = [
    sample({ day: 0, targetStatId: "stat-a" }), sample({ day: 1, targetStatId: "stat-a" }), sample({ day: 2, targetStatId: "stat-b" }),
    sample({ day: 3, targetStatId: "stat-b" }), sample({ day: 4, targetStatId: "stat-a" }),
  ];
  const family = state({ outcomeKey: "retention-review", samples: familySamples });
  const profile = selectPracticeCoachResponseProfile({ responseStates: [exactLow, family], profileId, contextId, treatmentFamilyKey: family.treatmentFamilyKey, targetEntityType: "bigram", targetStatId: "stat-th", now });
  assert.equal(profile.sourceScope, "family");
  assert.equal(profile.summary.evidenceDepth, "medium");
});

test("PL33 ignores wrong context, wrong entity type, wrong family, wrong response model and stale samples", () => {
  const valid = state({ samples: mediumSamples() });
  const wrongContext = { ...valid, contextId: createPracticeId("context", { uuid: () => "other-context-12345678" }) };
  const wrongEntity = { ...valid, targetEntityType: "word" };
  const wrongFamily = { ...valid, treatmentFamilyKey: getCurrentPracticeCoachTreatmentFamilyKey("accuracy-control") };
  const wrongModel = { ...valid, responseModelVersion: 999 };
  const stale = state({ samples: mediumSamples().map((entry, i) => ({ ...entry, observedAt: new Date(Date.parse("2026-01-01T12:00:00.000Z") + i * 86_400_000).toISOString(), localDayKey: `2026-01-0${i + 1}` })) });
  for (const row of [wrongContext, wrongEntity, wrongFamily, wrongModel, stale]) {
    assert.equal(selectPracticeCoachResponseProfile({ responseStates: [row], profileId, contextId, treatmentFamilyKey: valid.treatmentFamilyKey, targetEntityType: "bigram", targetStatId: "stat-th", now }), null);
  }
});

test("PL33 response modifier implements magnitude, depth, freshness and the 0.80-1.20 cap", () => {
  const profile = selectPracticeCoachResponseProfile({ responseStates: [state({ samples: highSamples({ responseValue: 10 }) })], profileId, contextId, treatmentFamilyKey: getCurrentPracticeCoachTreatmentFamilyKey("combination-repair"), targetEntityType: "bigram", targetStatId: "stat-th", now });
  const decision = calculatePracticeCoachResponseModifier(profile, { now, baseInterventionMatch: 1 });
  assert.equal(decision.version, PRACTICE_COACH_PERSONALIZATION_VERSION);
  assert.equal(decision.responseModifier, 1.2);
  const negativeProfile = selectPracticeCoachResponseProfile({ responseStates: [state({ samples: highSamples({ responseValue: -100 }) })], profileId, contextId, treatmentFamilyKey: getCurrentPracticeCoachTreatmentFamilyKey("combination-repair"), targetEntityType: "bigram", targetStatId: "stat-th", now });
  assert.equal(calculatePracticeCoachResponseModifier(negativeProfile, { now }).responseModifier, 0.8);

  const oneThreshold = selectPracticeCoachResponseProfile({ responseStates: [state({ samples: highSamples({ responseValue: 5 }) })], profileId, contextId, treatmentFamilyKey: getCurrentPracticeCoachTreatmentFamilyKey("combination-repair"), targetEntityType: "bigram", targetStatId: "stat-th", now });
  assert.equal(calculatePracticeCoachResponseModifier(oneThreshold, { now }).responseModifier, 1.1);
});

test("PL33 medium, coach-only and hybrid evidence are conservatively damped", () => {
  const medium = selectPracticeCoachResponseProfile({ responseStates: [state({ samples: mediumSamples({ responseValue: 10 }) })], profileId, contextId, treatmentFamilyKey: getCurrentPracticeCoachTreatmentFamilyKey("combination-repair"), targetEntityType: "bigram", targetStatId: "stat-th", now });
  assert.equal(calculatePracticeCoachResponseModifier(medium, { now }).responseModifier, 1.1);
  const coachOnly = selectPracticeCoachResponseProfile({ responseStates: [state({ samples: highSamples({ responseValue: 10, assignmentKind: "coach" }) })], profileId, contextId, treatmentFamilyKey: getCurrentPracticeCoachTreatmentFamilyKey("combination-repair"), targetEntityType: "bigram", targetStatId: "stat-th", now });
  assert.equal(calculatePracticeCoachResponseModifier(coachOnly, { now }).responseModifier, 1.1);
  const hybrid = selectPracticeCoachResponseProfile({ responseStates: [state({ samples: highSamples({ responseValue: 10, measurementGrade: "hybrid" }) })], profileId, contextId, treatmentFamilyKey: getCurrentPracticeCoachTreatmentFamilyKey("combination-repair"), targetEntityType: "bigram", targetStatId: "stat-th", now });
  assert.equal(hybrid.summary.evidenceDepth, "medium");
  assert.equal(calculatePracticeCoachResponseModifier(hybrid, { now }).responseModifier, 1.05);
});

test("PL33 little-signal and mixed histories are exactly neutral", () => {
  const little = state({ samples: highSamples({ responseValue: 0 }) });
  const profile = selectPracticeCoachResponseProfile({ responseStates: [little], profileId, contextId, treatmentFamilyKey: little.treatmentFamilyKey, targetEntityType: "bigram", targetStatId: "stat-th", now });
  assert.equal(profile.summary.responsePattern, "little-signal");
  assert.equal(calculatePracticeCoachResponseModifier(profile, { now }).responseModifier, 1);
  const mixedValues = [10, -10, 10, -10, 10, -10, 10, -10, 10, -10];
  const mixed = state({ samples: mixedValues.map((responseValue, day) => sample({ day, responseValue })) });
  const mixedProfile = selectPracticeCoachResponseProfile({ responseStates: [mixed], profileId, contextId, treatmentFamilyKey: mixed.treatmentFamilyKey, targetEntityType: "bigram", targetStatId: "stat-th", now });
  assert.equal(mixedProfile.summary.responsePattern, "mixed");
  assert.equal(calculatePracticeCoachResponseModifier(mixedProfile, { now }).responseModifier, 1);
});

test("PL33 can narrowly override a generic preferred treatment only with sufficiently strong personal evidence", () => {
  const c = { entityType: "bigram", statId: "stat-th", needUtility: 80, accuracyRecoveryPressure: 22 };
  const options = buildPracticeCoachTreatmentOptions(c, { preferredIntervention: { experimentId: "combination-repair" } });
  const combinationNegative = state({ samples: highSamples({ responseValue: -10 }) });
  const accuracyPositive = state({ experimentId: "accuracy-control", samples: highSamples({ responseValue: 10 }) });
  const result = selectPersonalizedPracticeTreatment({ candidate: c, options, responseStates: [combinationNegative, accuracyPositive], profileId, contextId, now });
  assert.equal(result.experimentId, "accuracy-control");
  assert.equal(result.baseInterventionMatch, 0.85);
  assert.equal(result.responseInformed, true);
  assert.ok(result.personalizedOptionUtility > 80 * 0.8);
});

test("PL33 cannot resurrect BaseCoachUtility <35", () => {
  const rows = buildPracticeCoachTargetCandidates({
    limiterCandidates: [candidate({ priorityScore: 34, ar: 25 })],
    masteryByStat: new Map([["stat-th", { stage: "learning" }]]),
    learningByStat: new Map([["stat-th", { saturation: { status: "not-detected" }, marginalGain: "high" }]]),
    readinessBand: "normal",
  });
  assert.equal(rows.length, 0);
});

test("PL33 cannot turn a base-55 candidate into a second target even if personalized utility exceeds 60", () => {
  const first = { statId: "stat-a", entityType: "key", entityKey: "r", experimentId: "weak-keys", baseUtilityScore: 80, personalizedUtilityScore: 80, utilityScore: 80, hierarchy: { explainedBy: [] }, availabilityStatus: "ready" };
  const second = { statId: "stat-b", entityType: "word", entityKey: "because", experimentId: "problem-words", baseUtilityScore: 55, personalizedUtilityScore: 66, utilityScore: 66, hierarchy: { explainedBy: [] }, availabilityStatus: "ready" };
  const plan = buildPracticeCoachDailyPlan({ profileId, contextId, localDayKey: "2026-09-11", requestedMinutes: 15, inputFingerprint: "pl33-second-gate", targetCandidates: [first, second], realTextSupportedMinutes: [10, 5, 3], now: () => now });
  assert.equal(plan.blocks.filter((block) => block.kind === "targeted-intervention").length, 1);
});

test("PL33 no-response treatment selection remains the PL25 default", () => {
  const c = { entityType: "bigram", statId: "stat-th", needUtility: 80, accuracyRecoveryPressure: 22 };
  const options = buildPracticeCoachTreatmentOptions(c, { preferredIntervention: { experimentId: "combination-repair" } });
  const result = selectPersonalizedPracticeTreatment({ candidate: c, options, responseStates: [], profileId, contextId, now });
  assert.equal(result.experimentId, "combination-repair");
  assert.equal(result.personalizedOptionUtility, 80);
  assert.equal(result.responseInformed, false);
});
