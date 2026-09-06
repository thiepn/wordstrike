import { derivePracticeReviewDueStatus, practiceReviewElapsedDays } from "./practiceReviewItem.js";
import { buildPracticeRetentionEvidence } from "./practiceRetentionEvidence.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";

const finite = Number.isFinite;
const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const clamp100 = (value) => Math.max(0, Math.min(100, Number(value) || 0));

export function computePracticeDuePressure(elapsedDays, intervalDays) {
  if (!finite(elapsedDays) || !finite(intervalDays) || intervalDays <= 0) return null;
  const x = elapsedDays / Math.max(intervalDays, 0.5);
  return clamp01(2 * x - 1);
}

export function computePracticeRetentionRiskIndex(elapsedDays, stabilityDays) {
  if (!finite(elapsedDays) || !finite(stabilityDays) || stabilityDays <= 0) return null;
  return clamp01(1 - 2 ** (-elapsedDays / Math.max(stabilityDays, 0.5)));
}

export function practiceReviewValueBand(value, policy = PRACTICE_REVIEW_POLICY_V1) {
  if (!finite(value)) return "not-actionable";
  if (value >= policy.value.bands.urgent) return "urgent";
  if (value >= policy.value.bands.high) return "high";
  if (value >= policy.value.bands.medium) return "medium";
  return value > 0 ? "low" : "low";
}

export function buildPracticeReviewValue({
  reviewItem,
  masteryStage,
  impactScore = null,
  now = new Date(),
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  const dueStatus = derivePracticeReviewDueStatus(reviewItem, now, policy);
  if (!reviewItem || reviewItem.state !== "active" || ["inactive", "suspended"].includes(dueStatus)) {
    return Object.freeze({
      reviewValue: null,
      reviewValueBand: "not-actionable",
      reviewValuePerCost: null,
      dueStatus,
      impactUnknown: !finite(impactScore),
      components: null,
    });
  }
  const elapsedDays = practiceReviewElapsedDays(reviewItem, now);
  const duePressure = computePracticeDuePressure(elapsedDays, reviewItem.intervalDays) ?? 0;
  const retentionRiskIndex = computePracticeRetentionRiskIndex(elapsedDays, reviewItem.stabilityDays) ?? 0;
  const evidence = buildPracticeRetentionEvidence(reviewItem, policy);
  let verificationNeed;
  if (Number(reviewItem.retention?.currentCycleVerificationCount || 0) === 0) verificationNeed = policy.value.verificationNeed.unverified;
  else if (evidence.eligibleForRetained) verificationNeed = policy.value.verificationNeed.retainedEligible;
  else verificationNeed = Math.max(
    policy.value.verificationNeed.verifiedMinimum,
    Math.min(policy.value.verificationNeed.verifiedMaximum, 1 - evidence.confidenceScore / 100),
  );
  const latest = reviewItem.retention?.lastOutcome ?? "none";
  const fragility = policy.value.fragility[latest] ?? policy.value.fragility.none;
  const masteryNeed = policy.value.masteryNeed[masteryStage] ?? 0;
  const w = policy.value.baseWeights;
  const baseNeed = clamp01(
    w.duePressure * duePressure
    + w.retentionRisk * retentionRiskIndex
    + w.verificationNeed * verificationNeed
    + w.fragility * fragility
    + w.masteryNeed * masteryNeed,
  );
  const impactUnknown = !finite(impactScore);
  const importanceMultiplier = impactUnknown
    ? policy.value.impact.unknownMultiplier
    : policy.value.impact.baseMultiplier + policy.value.impact.rangeMultiplier * clamp100(impactScore) / 100;
  const costUnits = policy.value.costUnits[reviewItem.entityType] ?? 1.25;
  const costFactor = 1 / Math.sqrt(costUnits);
  const reviewValue = clamp100(100 * baseNeed * importanceMultiplier * costFactor);
  return Object.freeze({
    reviewValue,
    reviewValueBand: practiceReviewValueBand(reviewValue, policy),
    reviewValuePerCost: reviewValue / costUnits,
    dueStatus,
    impactUnknown,
    elapsedDays,
    costUnits,
    verificationNeed,
    components: Object.freeze({
      duePressure,
      retentionRiskIndex,
      verificationNeed,
      fragility,
      masteryNeed,
      baseNeed,
      importanceMultiplier,
      costFactor,
    }),
  });
}
