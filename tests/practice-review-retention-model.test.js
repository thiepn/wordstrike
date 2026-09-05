import assert from "node:assert/strict";
import { test } from "node:test";
import { createDefaultReviewItem } from "../js/practiceLab/practiceDefaults.js";
import {
  activatePracticeReviewItem,
  derivePracticeReviewDueStatus,
  practiceInitialReviewIntervalDays,
  practiceMaturityDelayDays,
} from "../js/practiceLab/practiceReviewItem.js";
import { mergePracticeRetentionReviewDelta } from "../js/practiceLab/practiceReviewItemMerge.js";
import {
  classifyPracticeRetentionOutcome,
  computePracticePreservationQuality,
  computePracticeRetentionScore,
  practiceRetentionConfidence,
  updatePracticeRetentionStability,
} from "../js/practiceLab/practiceRetentionQuality.js";
import { buildPracticeRetentionEvidence } from "../js/practiceLab/practiceRetentionEvidence.js";
import {
  buildPracticeReviewValue,
  computePracticeDuePressure,
  computePracticeRetentionRiskIndex,
} from "../js/practiceLab/practiceReviewValue.js";
import { PRACTICE_REVIEW_POLICY_V1, validatePracticeReviewPolicy } from "../js/practiceLab/practiceReviewPolicy.js";

const DAY = 86_400_000;
const reviewBase = () => createDefaultReviewItem({
  reviewItemId: "practice-review_pl17-model-12345678",
  profileId: "practice-profile_pl17-model-12345678",
  contextId: "practice-context_pl17-model-12345678",
  entityType: "key",
  entityKey: "a",
  now: () => new Date("2026-01-01T00:00:00.000Z"),
});

function delta(item, {
  sessionId,
  reviewedAtUtc,
  localDayKey,
  outcome,
  probeQuality,
  retentionScore,
  elapsedDays,
  familyIds,
  verificationEligible = true,
} = {}) {
  return {
    deltaVersion: 1,
    sessionId,
    profileId: item.profileId,
    contextId: item.contextId,
    reviewItemId: item.reviewItemId,
    cycleId: item.cycle.cycleId,
    expectedReferenceAtUtc: item.cycle.referenceAtUtc,
    entityType: item.entityType,
    entityKey: item.entityKey,
    reviewedAtUtc,
    localDayKey,
    measurementStatus: verificationEligible ? "measured" : "non-verifying",
    probeQuality,
    referenceQuality: item.cycle.referenceQuality,
    retentionScore,
    outcome,
    opportunityCount: 5,
    qualityCoverage: 1,
    plannedIntervalDays: item.intervalDays,
    elapsedDays,
    mature: true,
    noveltyStatus: "fresh",
    familyIds,
    verificationEligible,
  };
}

test("PL17 canonical policy locks review/retention engineering coefficients", () => {
  assert.equal(validatePracticeReviewPolicy().valid, true);
  assert.deepEqual(PRACTICE_REVIEW_POLICY_V1.quality.weights, { accuracy: 0.45, speed: 0.40, disfluency: 0.15 });
  assert.equal(PRACTICE_REVIEW_POLICY_V1.quality.minimumAvailableWeight, 0.60);
  assert.deepEqual(PRACTICE_REVIEW_POLICY_V1.initialIntervalsDays, { acquired: 1, transferred: 2, robust: 3, retained: 7 });
  assert.equal(PRACTICE_REVIEW_POLICY_V1.overdueRatio, 1.5);
  assert.deepEqual(PRACTICE_REVIEW_POLICY_V1.probe.minimumOpportunities, { key: 5, bigram: 4, trigram: 3, word: 2 });
  assert.deepEqual(PRACTICE_REVIEW_POLICY_V1.probe.maximumOpportunities, { key: 8, bigram: 6, trigram: 5, word: 4 });
  assert.equal(PRACTICE_REVIEW_POLICY_V1.stability.minimumDays, 0.5);
  assert.equal(PRACTICE_REVIEW_POLICY_V1.stability.maximumDays, 180);
});

test("PL17 initial intervals, maturity and due status are delay-derived rather than persisted due state", () => {
  assert.equal(practiceInitialReviewIntervalDays("acquired"), 1);
  assert.equal(practiceInitialReviewIntervalDays("transferred"), 2);
  assert.equal(practiceInitialReviewIntervalDays("robust"), 3);
  assert.equal(practiceInitialReviewIntervalDays("retained"), 7);
  assert.equal(practiceMaturityDelayDays(1), 0.75);
  assert.equal(practiceMaturityDelayDays(0.5), 0.5);
  const item = activatePracticeReviewItem(reviewBase(), {
    masteryStage: "acquired",
    referenceAtUtc: "2026-01-01T00:00:00.000Z",
    referenceQuality: 80,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(item.intervalDays, 1);
  assert.equal(item.stabilityDays, 1);
  assert.equal(item.minimumMatureAtUtc, "2026-01-01T18:00:00.000Z");
  assert.equal(item.dueAtUtc, "2026-01-02T00:00:00.000Z");
  assert.equal(derivePracticeReviewDueStatus(item, new Date("2026-01-01T08:00:00.000Z")), "not-mature");
  assert.equal(derivePracticeReviewDueStatus(item, new Date("2026-01-01T20:00:00.000Z")), "scheduled");
  assert.equal(derivePracticeReviewDueStatus(item, new Date("2026-01-02T00:00:00.000Z")), "due");
  assert.equal(derivePracticeReviewDueStatus(item, new Date("2026-01-02T12:00:00.000Z")), "overdue");
});

test("PL17 preservation and retention score formulas preserve absolute quality and relative preservation", () => {
  assert.equal(computePracticePreservationQuality(85, 80), 90);
  assert.equal(computePracticePreservationQuality(85, 70), 70);
  assert.equal(computePracticePreservationQuality(45, 45), 100);
  assert.deepEqual(computePracticeRetentionScore(85, 70), { retentionScore: 70, preservationQuality: 70 });
  assert.equal(computePracticeRetentionScore(45, 45).retentionScore, 72.5);
});

test("PL17 outcome gates distinguish strong, pass, fragile and fail exactly", () => {
  assert.equal(classifyPracticeRetentionOutcome(80, 85), "strong");
  assert.equal(classifyPracticeRetentionOutcome(70, 70), "pass");
  assert.equal(classifyPracticeRetentionOutcome(69, 60), "fragile");
  assert.equal(classifyPracticeRetentionOutcome(90, 54.999), "fail");
  assert.equal(classifyPracticeRetentionOutcome(null, null), null);
});

test("PL17 stability formulas and bounds are exact", () => {
  assert.equal(updatePracticeRetentionStability(2, 3, "strong"), 4.5);
  assert.equal(updatePracticeRetentionStability(2, 3, "pass"), 3.45);
  assert.equal(updatePracticeRetentionStability(2, 3, "fragile"), 2.1);
  assert.equal(updatePracticeRetentionStability(2, 3, "fail"), 1);
  assert.equal(updatePracticeRetentionStability(100, 100, "strong"), 180);
  assert.equal(updatePracticeRetentionStability(0.5, 0.5, "fail"), 0.5);
});

test("PL17 confidence uses verification/day/delay factors and remains separate from quality", () => {
  const one = practiceRetentionConfidence({ verificationCount: 1, distinctReviewDays: 1, maxSuccessfulDelayDays: 1 });
  const two = practiceRetentionConfidence({ verificationCount: 2, distinctReviewDays: 2, maxSuccessfulDelayDays: 3 });
  assert.ok(one.score > 0 && one.score < 50);
  assert.equal(one.level, "low");
  assert.ok(two.score >= 50);
  assert.equal(two.level, "medium");
  assert.ok(two.verificationFactor > one.verificationFactor);
  assert.ok(two.dayFactor > one.dayFactor);
  assert.ok(two.delayFactor > one.delayFactor);
});

test("PL17 current-cycle two-day/two-family delayed success makes Retained eligibility reachable", () => {
  let item = activatePracticeReviewItem(reviewBase(), {
    masteryStage: "robust",
    referenceAtUtc: "2026-01-01T00:00:00.000Z",
    referenceQuality: 80,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  const first = delta(item, {
    sessionId: "practice-session_pl17-retention-1",
    reviewedAtUtc: "2026-01-02T00:00:00.000Z",
    localDayKey: "2026-01-02",
    outcome: "pass",
    probeQuality: 80,
    retentionScore: 90,
    elapsedDays: 1,
    familyIds: ["family-a"],
  });
  item = mergePracticeRetentionReviewDelta(item, first).item;
  assert.equal(item.retention.currentCycleSuccessfulCount, 1);
  assert.equal(buildPracticeRetentionEvidence(item).eligibleForRetained, false);

  const second = delta(item, {
    sessionId: "practice-session_pl17-retention-2",
    reviewedAtUtc: "2026-01-05T00:00:00.000Z",
    localDayKey: "2026-01-05",
    outcome: "strong",
    probeQuality: 90,
    retentionScore: 95,
    elapsedDays: 3,
    familyIds: ["family-b"],
  });
  item = mergePracticeRetentionReviewDelta(item, second).item;
  const evidence = buildPracticeRetentionEvidence(item);
  assert.equal(item.retention.currentCycleSuccessfulCount, 2);
  assert.equal(item.retention.currentCycleDistinctSuccessfulDays, 2);
  assert.equal(item.retention.currentCycleDistinctSuccessfulFamilies, 2);
  assert.equal(item.retention.currentCycleMaxSuccessfulDelayDays, 3);
  assert.equal(evidence.status, "verified");
  assert.equal(evidence.confidenceLevel, "medium");
  assert.equal(evidence.eligibleForRetained, true);
});

test("PL17 verified failure suspends the item and immediately removes Retained eligibility", () => {
  let item = activatePracticeReviewItem(reviewBase(), {
    masteryStage: "robust",
    referenceAtUtc: "2026-01-01T00:00:00.000Z",
    referenceQuality: 85,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  item = mergePracticeRetentionReviewDelta(item, delta(item, {
    sessionId: "practice-session_pl17-fail",
    reviewedAtUtc: "2026-01-04T00:00:00.000Z",
    localDayKey: "2026-01-04",
    outcome: "fail",
    probeQuality: 40,
    retentionScore: 30,
    elapsedDays: 3,
    familyIds: ["family-fail"],
  })).item;
  assert.equal(item.state, "suspended");
  assert.equal(item.suspensionReason, "retention-failed");
  assert.equal(item.dueAtUtc, null);
  assert.equal(buildPracticeRetentionEvidence(item).status, "failed");
  assert.equal(buildPracticeRetentionEvidence(item).eligibleForRetained, false);
});

test("PL17 Review Value separates timing, risk, verification, impact and cost", () => {
  const item = activatePracticeReviewItem(reviewBase(), {
    masteryStage: "acquired",
    referenceAtUtc: "2026-01-01T00:00:00.000Z",
    referenceQuality: 80,
    now: () => new Date("2026-01-01T00:00:00.000Z"),
  });
  assert.equal(computePracticeDuePressure(0.5, 1), 0);
  assert.equal(computePracticeDuePressure(1, 1), 1);
  assert.ok(computePracticeRetentionRiskIndex(1, 1) > computePracticeRetentionRiskIndex(0.5, 1));
  const lowImpact = buildPracticeReviewValue({ reviewItem: item, masteryStage: "acquired", impactScore: 10, now: new Date("2026-01-02T00:00:00.000Z") });
  const highImpact = buildPracticeReviewValue({ reviewItem: item, masteryStage: "acquired", impactScore: 90, now: new Date("2026-01-02T00:00:00.000Z") });
  const unknownImpact = buildPracticeReviewValue({ reviewItem: item, masteryStage: "acquired", impactScore: null, now: new Date("2026-01-02T00:00:00.000Z") });
  assert.ok(highImpact.reviewValue > lowImpact.reviewValue);
  assert.ok(unknownImpact.reviewValue > 0);
  assert.equal(unknownImpact.impactUnknown, true);
  for (const result of [lowImpact, highImpact, unknownImpact]) assert.ok(result.reviewValue >= 0 && result.reviewValue <= 100);
});
