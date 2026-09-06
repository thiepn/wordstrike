import { PRACTICE_REVIEW_POLICY_VERSION } from "./practiceReviewConstants.js";

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};

export const PRACTICE_REVIEW_POLICY_V1 = deepFreeze({
  version: PRACTICE_REVIEW_POLICY_VERSION,
  admission: {
    minimumMasteryStage: "acquired",
    minimumGeneralConfidence: "medium",
    minimumReferenceQuality: 70,
    minimumImpactScore: 60,
    maxNewItemsPerReconciliation: 100,
  },
  quality: {
    weights: { accuracy: 0.45, speed: 0.40, disfluency: 0.15 },
    minimumAvailableWeight: 0.60,
  },
  initialIntervalsDays: {
    acquired: 1,
    transferred: 2,
    robust: 3,
    retained: 7,
  },
  maturity: {
    minimumDays: 0.5,
    intervalFraction: 0.75,
    differentLocalDayRequired: true,
  },
  overdueRatio: 1.5,
  reviewItem: {
    maxRecentProbeFamilies: 8,
    maxRecentProbes: 12,
  },
  plan: {
    maxBindings: 8,
    maxCostUnits: 8,
    includeNearDueByDefault: false,
  },
  probe: {
    minimumOpportunities: { key: 5, bigram: 4, trigram: 3, word: 2 },
    maximumOpportunities: { key: 8, bigram: 6, trigram: 5, word: 4 },
    maxFamilyIds: 4,
    minimumQualityCoverage: 0.60,
  },
  outcomes: {
    strong: { minimumProbeQuality: 80, minimumRetentionScore: 85 },
    pass: { minimumProbeQuality: 70, minimumRetentionScore: 70 },
    fragile: { minimumRetentionScore: 55 },
  },
  stability: {
    minimumDays: 0.5,
    maximumDays: 180,
    strong: { oldMultiplier: 2.2, delayMultiplier: 1.5 },
    pass: { oldMultiplier: 1.6, delayMultiplier: 1.15 },
    fragile: { oldMultiplier: 1.05 },
    fail: { oldMultiplier: 0.5, delayMultiplier: 0.5 },
  },
  retentionAggregate: {
    latestScoreCount: 5,
    confidence: {
      verificationScale: 2,
      dayScale: 2,
      successfulDelayScaleDays: 7,
      weights: { verification: 0.40, days: 0.25, delay: 0.35 },
    },
    retainedEligibility: {
      minimumScore: 70,
      minimumConfidenceLevel: "medium",
      minimumSuccessfulCount: 2,
      minimumDistinctSuccessfulDays: 2,
      minimumSuccessfulDelayDays: 3,
      minimumDistinctSuccessfulFamilies: 2,
    },
  },
  referenceUpgradeThreshold: 8,
  value: {
    baseWeights: {
      duePressure: 0.30,
      retentionRisk: 0.25,
      verificationNeed: 0.20,
      fragility: 0.15,
      masteryNeed: 0.10,
    },
    verificationNeed: {
      unverified: 1,
      verifiedMinimum: 0.40,
      verifiedMaximum: 0.80,
      retainedEligible: 0.25,
    },
    fragility: { none: 0, strong: 0, pass: 0.20, fragile: 0.60, fail: 1 },
    masteryNeed: { unmeasured: 0, learning: 0, acquired: 1, transferred: 0.85, robust: 0.65, retained: 0.45 },
    impact: { unknownMultiplier: 0.75, baseMultiplier: 0.60, rangeMultiplier: 0.40 },
    costUnits: { key: 1, bigram: 1.05, trigram: 1.10, word: 1.25 },
    bands: { urgent: 70, high: 50, medium: 30 },
  },
  queue: {
    maxCandidates: 100,
  },
});

export function validatePracticeReviewPolicy(policy = PRACTICE_REVIEW_POLICY_V1) {
  const errors = [];
  const qualitySum = Object.values(policy?.quality?.weights ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const valueSum = Object.values(policy?.value?.baseWeights ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const confidenceSum = Object.values(policy?.retentionAggregate?.confidence?.weights ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (Math.abs(qualitySum - 1) > 1e-12) errors.push("quality weights must sum to 1");
  if (Math.abs(valueSum - 1) > 1e-12) errors.push("review-value weights must sum to 1");
  if (Math.abs(confidenceSum - 1) > 1e-12) errors.push("retention-confidence weights must sum to 1");
  if (!(policy?.stability?.minimumDays > 0 && policy?.stability?.maximumDays >= policy.stability.minimumDays)) errors.push("stability bounds are invalid");
  if (!(policy?.probe?.minimumQualityCoverage >= 0 && policy.probe.minimumQualityCoverage <= 1)) errors.push("probe quality coverage is invalid");
  return { valid: errors.length === 0, errors };
}
