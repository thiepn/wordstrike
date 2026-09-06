import { computePracticeEvidenceConfidence, confidenceLevelForScore } from "./practiceEvidenceConfidence.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";

const finite = Number.isFinite;
export const clampPracticeQuality = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

function linearQuality(value, perfectAtOrBelow, zeroAtOrAbove) {
  if (!finite(value)) return null;
  if (value <= perfectAtOrBelow) return 100;
  if (value >= zeroAtOrAbove) return 0;
  return 100 * (zeroAtOrAbove - value) / (zeroAtOrAbove - perfectAtOrBelow);
}

export function computePracticeRelativeResidualQuality(relativeResidual, policy = PRACTICE_MASTERY_POLICY_V1) {
  if (!finite(relativeResidual)) return null;
  if (relativeResidual < 0) return 100;
  return clampPracticeQuality(linearQuality(
    relativeResidual,
    policy.roleQuality.speed.perfectAtOrBelow,
    policy.roleQuality.speed.zeroAtOrAbove,
  ));
}

export function computePracticeDisfluencyRateQuality(disfluencyRate, policy = PRACTICE_MASTERY_POLICY_V1) {
  if (!finite(disfluencyRate)) return null;
  return clampPracticeQuality(linearQuality(
    disfluencyRate,
    policy.roleQuality.disfluency.perfectAtOrBelow,
    policy.roleQuality.disfluency.zeroAtOrAbove,
  ));
}

export function computePracticeAbsoluteAccuracyQuality(stat, policy = PRACTICE_MASTERY_POLICY_V1) {
  const opportunities = Number(stat?.evidence?.opportunities?.count || 0);
  const errors = Number(stat?.evidence?.opportunities?.errorCount || 0);
  const thresholds = policy.absoluteAccuracy?.[stat?.entityType];
  if (!opportunities || !thresholds) return Object.freeze({ score: null, errorRate: null, evidenceCount: opportunities });
  const errorRate = errors / opportunities;
  return Object.freeze({
    score: clampPracticeQuality(linearQuality(errorRate, thresholds.perfectAtOrBelow, thresholds.zeroAtOrAbove)),
    errorRate,
    evidenceCount: opportunities,
  });
}

export function computePracticeRoleAccuracyQuality(entityType, opportunityCount, errorCount, policy = PRACTICE_MASTERY_POLICY_V1) {
  return computePracticeAbsoluteAccuracyQuality({
    entityType,
    evidence: { opportunities: { count: Number(opportunityCount || 0), errorCount: Number(errorCount || 0) } },
  }, policy).score;
}

function validLimiterDimension(dimension) {
  return dimension && dimension.status !== "insufficient-evidence" && finite(dimension.severityScore);
}

export function computePracticeAccuracyQuality(stat, limiterEvaluation, policy = PRACTICE_MASTERY_POLICY_V1) {
  const absolute = computePracticeAbsoluteAccuracyQuality(stat, policy);
  const inaccurate = limiterEvaluation?.dimensions?.inaccurate;
  const relativeScore = validLimiterDimension(inaccurate) ? clampPracticeQuality(100 - inaccurate.severityScore) : null;
  const score = absolute.score == null ? null : relativeScore == null ? absolute.score : Math.min(absolute.score, relativeScore);
  const confidence = computePracticeEvidenceConfidence(stat, "accuracy");
  const relativeAvailable = relativeScore != null;
  const confidenceScore = relativeAvailable ? confidence.score : Math.min(confidence.score, policy.absoluteOnlyAccuracyConfidenceCap);
  return Object.freeze({
    score,
    absoluteScore: absolute.score,
    relativeScore,
    errorRate: absolute.errorRate,
    evidenceCount: absolute.evidenceCount,
    confidenceScore,
    confidenceLevel: confidenceLevelForScore(confidenceScore),
    relativeAvailable,
    reasons: Object.freeze([...(absolute.score == null ? ["no-first-pass-accuracy"] : []), ...(!relativeAvailable ? ["relative-inaccuracy-unavailable"] : [])]),
  });
}

export function computePracticeSpeedQuality(stat, limiterEvaluation) {
  const slow = limiterEvaluation?.dimensions?.slow;
  const confidence = computePracticeEvidenceConfidence(stat, "normalized-residual");
  const score = validLimiterDimension(slow) ? clampPracticeQuality(100 - slow.severityScore) : null;
  return Object.freeze({
    score,
    evidenceCount: Number(stat?.evidence?.timing?.fluentResidual?.count || 0),
    confidenceScore: confidence.score,
    confidenceLevel: confidence.level,
    reasons: Object.freeze(score == null ? ["slow-dimension-insufficient"] : []),
  });
}

export function computePracticeHesitationQuality(stat, limiterEvaluation) {
  const hesitant = limiterEvaluation?.dimensions?.hesitant;
  const confidence = computePracticeEvidenceConfidence(stat, "disfluency");
  const score = validLimiterDimension(hesitant) ? clampPracticeQuality(100 - hesitant.severityScore) : null;
  return Object.freeze({
    score,
    evidenceCount: Number(stat?.evidence?.timing?.eligibleCount || 0),
    confidenceScore: confidence.score,
    confidenceLevel: confidence.level,
    reasons: Object.freeze(score == null ? ["hesitation-dimension-insufficient"] : []),
  });
}

export function combinePracticeExecutionQuality({ accuracy = null, speed = null, disfluency = null } = {}, {
  weights = PRACTICE_REVIEW_POLICY_V1.quality.weights,
  minimumAvailableWeight = PRACTICE_REVIEW_POLICY_V1.quality.minimumAvailableWeight,
} = {}) {
  const components = { accuracy, speed, disfluency };
  const availableWeight = Object.entries(weights)
    .filter(([key]) => finite(components[key]))
    .reduce((sum, [, weight]) => sum + weight, 0);
  const score = availableWeight + 1e-12 < minimumAvailableWeight
    ? null
    : Object.entries(weights)
        .filter(([key]) => finite(components[key]))
        .reduce((sum, [key, weight]) => sum + weight * components[key], 0) / availableWeight;
  return Object.freeze({
    score: finite(score) ? clampPracticeQuality(score) : null,
    availableWeight,
    components: Object.freeze({
      accuracy: finite(accuracy) ? clampPracticeQuality(accuracy) : null,
      speed: finite(speed) ? clampPracticeQuality(speed) : null,
      disfluency: finite(disfluency) ? clampPracticeQuality(disfluency) : null,
    }),
  });
}

export function buildPracticePersistentExecutionQuality({
  stat,
  limiterEvaluation,
  masteryPolicy = PRACTICE_MASTERY_POLICY_V1,
  reviewPolicy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  const accuracy = computePracticeAccuracyQuality(stat, limiterEvaluation, masteryPolicy);
  const speed = computePracticeSpeedQuality(stat, limiterEvaluation);
  const hesitation = computePracticeHesitationQuality(stat, limiterEvaluation);
  const combined = combinePracticeExecutionQuality({
    accuracy: accuracy.score,
    speed: speed.score,
    disfluency: hesitation.score,
  }, {
    weights: reviewPolicy.quality.weights,
    minimumAvailableWeight: reviewPolicy.quality.minimumAvailableWeight,
  });
  return Object.freeze({
    score: combined.score,
    availableWeight: combined.availableWeight,
    components: Object.freeze({ accuracy, speed, hesitation }),
  });
}

export function buildPracticeSessionExecutionQuality({
  entityType,
  opportunityCount = 0,
  errorCount = 0,
  timingEligibleCount = 0,
  disfluentCount = 0,
  fluentLatencyMeanMs = null,
  fluentResidualMeanMs = null,
  fluentResidualCount = 0,
  masteryPolicy = PRACTICE_MASTERY_POLICY_V1,
  weights = PRACTICE_REVIEW_POLICY_V1.quality.weights,
  minimumAvailableWeight = PRACTICE_REVIEW_POLICY_V1.quality.minimumAvailableWeight,
} = {}) {
  const opportunities = Math.max(0, Number(opportunityCount) || 0);
  const errors = Math.max(0, Number(errorCount) || 0);
  const timingEligible = Math.max(0, Number(timingEligibleCount) || 0);
  const disfluent = Math.max(0, Number(disfluentCount) || 0);
  const accuracy = opportunities > 0 ? computePracticeRoleAccuracyQuality(entityType, opportunities, errors, masteryPolicy) : null;
  const expectedApproxMs = finite(fluentLatencyMeanMs) && finite(fluentResidualMeanMs) ? fluentLatencyMeanMs - fluentResidualMeanMs : null;
  const relativeResidual = expectedApproxMs > 0 && Number(fluentResidualCount) > 0 ? fluentResidualMeanMs / expectedApproxMs : null;
  const speed = computePracticeRelativeResidualQuality(relativeResidual, masteryPolicy);
  const disfluencyRate = timingEligible > 0 ? disfluent / timingEligible : null;
  const disfluency = computePracticeDisfluencyRateQuality(disfluencyRate, masteryPolicy);
  const combined = combinePracticeExecutionQuality({ accuracy, speed, disfluency }, { weights, minimumAvailableWeight });
  return Object.freeze({
    quality: combined.score,
    availableQualityWeight: combined.availableWeight,
    components: combined.components,
    metrics: Object.freeze({
      firstPassErrorRate: opportunities > 0 ? errors / opportunities : null,
      relativeResidual,
      disfluencyRate,
      expectedApproxMs: expectedApproxMs > 0 ? expectedApproxMs : null,
    }),
    evidence: Object.freeze({
      opportunityCount: opportunities,
      errorCount: errors,
      timingEligibleCount: timingEligible,
      disfluentCount: disfluent,
      fluentResidualCount: Math.max(0, Number(fluentResidualCount) || 0),
    }),
  });
}
