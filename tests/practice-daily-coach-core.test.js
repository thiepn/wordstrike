import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRACTICE_COACH_ALLOWED_MINUTES,
  PRACTICE_COACH_DEFAULT_MINUTES,
  PRACTICE_COACH_PLANNER_VERSION,
  PRACTICE_COACH_POLICY_VERSION,
  PRACTICE_COACH_PLAN_VERSION,
  PRACTICE_COACH_UTILITY_VERSION,
} from "../js/practiceLab/practiceCoachConstants.js";
import { normalizePracticeCoachRequestedMinutes } from "../js/practiceLab/practiceCoachPolicy.js";
import { calculatePracticeCoachTargetUtility } from "../js/practiceLab/practiceCoachUtility.js";
import {
  buildPracticeCoachTargetCandidates,
  practiceCoachTargetsOverlap,
  selectDefaultInterventionForEntity,
} from "../js/practiceLab/practiceCoachTargets.js";
import { buildPracticeCoachDailyPlan } from "../js/practiceLab/practiceCoachPlanner.js";
import { validatePracticeCoachPlan } from "../js/practiceLab/practiceCoachPlan.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";

const profileId = createPracticeId("profile", { uuid: () => "pl25-coach-profile-12345678" });
const contextId = createPracticeId("context", { uuid: () => "pl25-coach-context-12345678" });
const localDayKey = "2026-09-08";
const fixedNow = () => new Date("2026-09-08T10:00:00.000Z");

function target({
  statId = "practice-stat-test",
  entityType = "key",
  entityKey = "r",
  experimentId = "weak-keys",
  utilityScore = 80,
  hierarchy = { status: "independent", explainedBy: [] },
  reasonCodes = ["high-impact-limiter"],
} = {}) {
  return { statId, entityType, entityKey, experimentId, utilityScore, hierarchy, reasonCodes, availabilityStatus: "ready" };
}

function reviewFixture({ value = 80, overdue = true } = {}) {
  const binding = {
    reviewItemId: "practice-review_pl25-review-item-12345678",
    cycleId: 1,
    referenceAtUtc: "2026-09-06T10:00:00.000Z",
    referenceQuality: 80,
    entityType: "key",
    entityKey: "e",
    dueAtUtc: "2026-09-07T10:00:00.000Z",
    minimumMatureAtUtc: "2026-09-06T22:00:00.000Z",
    excludeFamilyIds: [],
  };
  return {
    queue: { candidates: [{ dueStatus: overdue ? "overdue" : "due", reviewValue: value, reviewBinding: binding }] },
    plan: { planVersion: 1, profileId, contextId, createdAt: "2026-09-08T10:00:00.000Z", totalCostUnits: 1, hasOverdue: overdue, bindings: [binding], reviewContentPlanHash: "fnv1a32-12345678" },
  };
}

test("PL25 Coach versions, supported budgets and fallback budget are frozen", () => {
  assert.equal(PRACTICE_COACH_PLANNER_VERSION, 1);
  assert.equal(PRACTICE_COACH_POLICY_VERSION, 1);
  assert.equal(PRACTICE_COACH_PLAN_VERSION, 1);
  assert.equal(PRACTICE_COACH_UTILITY_VERSION, 1);
  assert.deepEqual(PRACTICE_COACH_ALLOWED_MINUTES, [5, 8, 12, 15]);
  assert.equal(PRACTICE_COACH_DEFAULT_MINUTES, 12);
  assert.deepEqual(normalizePracticeCoachRequestedMinutes(8), { minutes: 8, diagnostic: null });
  assert.deepEqual(normalizePracticeCoachRequestedMinutes(11), { minutes: 12, diagnostic: "invalid-budget-setting" });
});

test("PL25 Coach Target Utility uses the frozen multiplicative need × mastery × headroom × readiness × match model", () => {
  const full = calculatePracticeCoachTargetUtility({
    priorityScore: 80,
    masteryStage: "learning",
    saturationStatus: "not-detected",
    marginalGainBand: "high",
    readinessBand: "normal",
    interventionMatch: 1,
  });
  assert.equal(full.coachTargetUtility, 80);
  assert.equal(full.utilityVersion, 1);

  const matureSaturated = calculatePracticeCoachTargetUtility({
    priorityScore: 80,
    masteryStage: "retained",
    saturationStatus: "supported",
    marginalGainBand: "low",
    readinessBand: "normal",
    interventionMatch: 1,
  });
  assert.equal(matureSaturated.masteryModifier, 0.15);
  assert.equal(matureSaturated.headroom, 0.2);
  assert.ok(Math.abs(matureSaturated.coachTargetUtility - 2.4) < 1e-12);
});

test("PL25 treatment matching prefers Accuracy & Recovery only when accuracy/recovery pressure materially dominates", () => {
  const accuracy = selectDefaultInterventionForEntity({
    entityType: "bigram",
    dimensions: {
      inaccurate: { weightedSeverity: 62 },
      recoveryHeavy: { weightedSeverity: 20 },
      slow: { weightedSeverity: 50 },
      hesitant: { weightedSeverity: 10 },
      unstable: { weightedSeverity: 5 },
    },
  });
  assert.equal(accuracy.experimentId, "accuracy-control");
  assert.equal(accuracy.reasonCode, "accuracy-recovery-match");

  const combination = selectDefaultInterventionForEntity({
    entityType: "bigram",
    dimensions: {
      inaccurate: { weightedSeverity: 20 },
      recoveryHeavy: { weightedSeverity: 10 },
      slow: { weightedSeverity: 65 },
      hesitant: { weightedSeverity: 20 },
      unstable: { weightedSeverity: 15 },
    },
  });
  assert.equal(combination.experimentId, "combination-repair");
  assert.equal(selectDefaultInterventionForEntity({ entityType: "key", dimensions: {} }).experimentId, "weak-keys");
  assert.equal(selectDefaultInterventionForEntity({ entityType: "word", dimensions: {} }).experimentId, "problem-words");
});

test("PL25 hierarchy overlap and reviewed-target suppression prevent duplicate treatment of one limiter chain", () => {
  const low = { statId: "stat-low", entityType: "key", entityKey: "r", hierarchy: { explainedBy: [] } };
  const high = { statId: "stat-high", entityType: "bigram", entityKey: "tr", hierarchy: { explainedBy: [{ statId: "stat-low" }] } };
  assert.equal(practiceCoachTargetsOverlap(low, high), true);
  assert.equal(practiceCoachTargetsOverlap(low, { ...high, statId: "other", hierarchy: { explainedBy: [] } }), false);

  const candidates = buildPracticeCoachTargetCandidates({
    limiterCandidates: [{
      ...low,
      status: "confirmed",
      priorityScore: 90,
      weaknessScore: 80,
      evidenceMetadata: { primaryDimensionConfidenceScore: 90 },
      dimensions: { slow: { weightedSeverity: 70 }, inaccurate: { weightedSeverity: 10 }, recoveryHeavy: { weightedSeverity: 5 } },
    }],
    masteryByStat: new Map([["stat-low", { stage: "learning" }]]),
    learningByStat: new Map([["stat-low", { saturation: { status: "not-detected" }, marginalGain: "high" }]]),
    readinessBand: "normal",
    reviewedEntities: new Set(["key\u0000r"]),
  });
  assert.deepEqual(candidates, []);
});

test("PL25 8-minute plan selects one target plus the largest fitting 3-minute target-blind Real Text block", () => {
  const plan = buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey, requestedMinutes: 8,
    inputFingerprint: "fixture-8", targetCandidates: [target()], realTextSupportedMinutes: [10, 5, 3], now: fixedNow,
  });
  assert.equal(validatePracticeCoachPlan(plan).valid, true);
  assert.equal(plan.plannedMinutes, 8);
  assert.deepEqual(plan.blocks.map((block) => block.kind), ["targeted-intervention", "real-text"]);
  assert.equal(plan.blocks[1].realTextDurationMs, 180_000);
  assert.equal(plan.blocks[1].target, null);
});

test("PL25 reduced readiness keeps review first, then moves broad Real Text ahead of targeted acquisition", () => {
  const review = reviewFixture();
  const plan = buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey, requestedMinutes: 12,
    inputFingerprint: "fixture-reduced", reviewQueue: review.queue, reviewPlan: review.plan,
    targetCandidates: [target({ statId: "stat-a", entityKey: "r" })],
    realTextSupportedMinutes: [10, 5, 3], readinessBand: "reduced", now: fixedNow,
  });
  assert.equal(plan.blocks[0].kind, "review");
  assert.equal(plan.blocks[1].kind, "real-text");
  assert.equal(plan.blocks[2].kind, "targeted-intervention");
  assert.ok(plan.plannedMinutes <= 12);
});

test("PL25 15-minute plan permits a second high-utility non-overlapping target and interleaves broad practice", () => {
  const first = target({ statId: "stat-a", entityType: "key", entityKey: "r", experimentId: "weak-keys", utilityScore: 88 });
  const second = target({ statId: "stat-b", entityType: "word", entityKey: "speed", experimentId: "problem-words", utilityScore: 72 });
  const plan = buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey, requestedMinutes: 15,
    inputFingerprint: "fixture-15", targetCandidates: [first, second], realTextSupportedMinutes: [10, 5, 3], now: fixedNow,
  });
  assert.deepEqual(plan.blocks.map((block) => block.kind), ["targeted-intervention", "real-text", "targeted-intervention"]);
  assert.equal(plan.plannedMinutes, 15);
  assert.equal(plan.blocks[0].target.entityKey, "r");
  assert.equal(plan.blocks[2].target.entityKey, "speed");
});

test("PL25 second target is suppressed when it is in the same hierarchy chain", () => {
  const first = target({ statId: "stat-a", utilityScore: 90, hierarchy: { status: "independent", explainedBy: [] } });
  const second = target({ statId: "stat-b", entityType: "bigram", entityKey: "tr", experimentId: "combination-repair", utilityScore: 85, hierarchy: { status: "explained", explainedBy: [{ statId: "stat-a" }] } });
  const plan = buildPracticeCoachDailyPlan({
    profileId, contextId, localDayKey, requestedMinutes: 15,
    inputFingerprint: "fixture-overlap", targetCandidates: [first, second], realTextSupportedMinutes: [10, 5, 3], now: fixedNow,
  });
  assert.equal(plan.blocks.filter((block) => block.kind === "targeted-intervention").length, 1);
  assert.equal(plan.plannedMinutes, 15);
  assert.equal(plan.blocks.find((block) => block.kind === "real-text").realTextDurationMs, 600_000);
});

test("PL25 frozen block session IDs and plan hash are deterministic for the same profile/context/day inputs", () => {
  const args = {
    profileId, contextId, localDayKey, requestedMinutes: 8,
    inputFingerprint: "same-input", targetCandidates: [target()], realTextSupportedMinutes: [10, 5, 3],
  };
  const first = buildPracticeCoachDailyPlan({ ...args, now: () => new Date("2026-09-08T08:00:00.000Z") });
  const second = buildPracticeCoachDailyPlan({ ...args, now: () => new Date("2026-09-08T15:00:00.000Z") });
  assert.equal(first.planHash, second.planHash);
  assert.deepEqual(first.blocks.map((block) => block.plannedSessionId), second.blocks.map((block) => block.plannedSessionId));
  assert.notEqual(first.createdAt, second.createdAt);
});
