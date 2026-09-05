import { computePracticeEvidenceConfidence, confidenceLevelForScore } from "./practiceEvidenceConfidence.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = Number.isFinite;

function linearQuality(value, perfectAtOrBelow, zeroAtOrAbove) {
  if (!finite(value)) return null;
  if (value <= perfectAtOrBelow) return 100;
  if (value >= zeroAtOrAbove) return 0;
  return 100 * (zeroAtOrAbove - value) / (zeroAtOrAbove - perfectAtOrBelow);
}

export function computePracticeAbsoluteAccuracyQuality(stat, policy = PRACTICE_MASTERY_POLICY_V1) {
  const opportunities = Number(stat?.evidence?.opportunities?.count || 0);
  const errors = Number(stat?.evidence?.opportunities?.errorCount || 0);
  const thresholds = policy.absoluteAccuracy?.[stat?.entityType];
  if (!opportunities || !thresholds) {
    return Object.freeze({ score: null, errorRate: null, evidenceCount: opportunities });
  }
  const errorRate = errors / opportunities;
  return Object.freeze({
    score: clamp(linearQuality(errorRate, thresholds.perfectAtOrBelow, thresholds.zeroAtOrAbove)),
    errorRate,
    evidenceCount: opportunities,
  });
}

function validLimiterDimension(dimension) {
  return dimension && dimension.status !== "insufficient-evidence" && finite(dimension.severityScore);
}

export function computePracticeAccuracyQuality(stat, limiterEvaluation, policy = PRACTICE_MASTERY_POLICY_V1) {
  const absolute = computePracticeAbsoluteAccuracyQuality(stat, policy);
  const inaccurate = limiterEvaluation?.dimensions?.inaccurate;
  const relativeScore = validLimiterDimension(inaccurate) ? clamp(100 - inaccurate.severityScore) : null;
  const score = absolute.score == null
    ? null
    : relativeScore == null ? absolute.score : Math.min(absolute.score, relativeScore);
  const confidence = computePracticeEvidenceConfidence(stat, "accuracy");
  const relativeAvailable = relativeScore != null;
  const confidenceScore = relativeAvailable
    ? confidence.score
    : Math.min(confidence.score, policy.absoluteOnlyAccuracyConfidenceCap);
  return Object.freeze({
    score,
    absoluteScore: absolute.score,
    relativeScore,
    errorRate: absolute.errorRate,
    evidenceCount: absolute.evidenceCount,
    confidenceScore,
    confidenceLevel: confidenceLevelForScore(confidenceScore),
    relativeAvailable,
    reasons: Object.freeze([
      ...(absolute.score == null ? ["no-first-pass-accuracy"] : []),
      ...(!relativeAvailable ? ["relative-inaccuracy-unavailable"] : []),
    ]),
  });
}

export function computePracticeSpeedQuality(stat, limiterEvaluation) {
  const slow = limiterEvaluation?.dimensions?.slow;
  const confidence = computePracticeEvidenceConfidence(stat, "normalized-residual");
  const score = validLimiterDimension(slow) ? clamp(100 - slow.severityScore) : null;
  return Object.freeze({
    score,
    evidenceCount: Number(stat?.evidence?.timing?.fluentResidual?.count || 0),
    confidenceScore: confidence.score,
    confidenceLevel: confidence.level,
    reasons: Object.freeze(score == null ? ["slow-dimension-insufficient"] : []),
  });
}

export function computePracticeStabilityQuality(stat, limiterEvaluation) {
  const unstable = limiterEvaluation?.dimensions?.unstable;
  const confidence = computePracticeEvidenceConfidence(stat, "normalized-residual");
  const score = validLimiterDimension(unstable) ? clamp(100 - unstable.severityScore) : null;
  const recent = stat?.evidence?.timing?.fluentResidual?.recentSamples;
  return Object.freeze({
    score,
    evidenceCount: Array.isArray(recent) ? recent.length : 0,
    confidenceScore: confidence.score,
    confidenceLevel: confidence.level,
    reasons: Object.freeze(score == null ? ["instability-dimension-insufficient"] : []),
  });
}

export function practiceAutomaticityStatus(score, policy = PRACTICE_MASTERY_POLICY_V1) {
  if (!finite(score)) return "unmeasured";
  if (score >= policy.automaticity.statusThresholds.strong) return "strong";
  if (score >= policy.automaticity.statusThresholds.established) return "established";
  if (score >= policy.automaticity.statusThresholds.emerging) return "emerging";
  return "developing";
}

export function computePracticeAutomaticity({
  stat,
  speedQuality,
  accuracyQuality,
  stabilityQuality,
  contextRobustness,
  policy = PRACTICE_MASTERY_POLICY_V1,
} = {}) {
  const general = computePracticeEvidenceConfidence(stat, "general");
  if (Number(stat?.evidence?.opportunities?.count || 0) === 0 || general.level === "none") {
    return Object.freeze({
      score: null,
      status: "unmeasured",
      confidenceScore: 0,
      confidenceLevel: "none",
      coreScore: null,
      components: Object.freeze({
        speed: speedQuality ?? null,
        accuracy: accuracyQuality ?? null,
        stability: stabilityQuality ?? null,
        contextRobustness: contextRobustness ?? null,
      }),
      hardGuardApplied: false,
    });
  }

  const values = {
    speed: finite(speedQuality) ? clamp(speedQuality) : 0,
    accuracy: finite(accuracyQuality) ? clamp(accuracyQuality) : 0,
    stability: finite(stabilityQuality) ? clamp(stabilityQuality) : 0,
    contextRobustness: finite(contextRobustness) ? clamp(contextRobustness) : 0,
  };
  const w = policy.automaticity.weights;
  const coreScore = clamp(
    w.speed * values.speed
    + w.accuracy * values.accuracy
    + w.stability * values.stability
    + w.contextRobustness * values.contextRobustness,
  );

  const confidences = [
    computePracticeEvidenceConfidence(stat, "general").score,
    computePracticeEvidenceConfidence(stat, "accuracy").score,
    computePracticeEvidenceConfidence(stat, "normalized-residual").score,
    computePracticeEvidenceConfidence(stat, "disfluency").score,
  ];
  const confidenceScore = clamp(Math.min(...confidences));
  let score = Math.min(coreScore, confidenceScore);
  const hardGuardApplied = (finite(accuracyQuality) && accuracyQuality < policy.automaticity.accuracyHardFloor)
    || (finite(speedQuality) && speedQuality < policy.automaticity.speedHardFloor);
  if (hardGuardApplied) score = Math.min(score, policy.automaticity.hardCap);
  score = clamp(score);

  return Object.freeze({
    score,
    status: practiceAutomaticityStatus(score, policy),
    confidenceScore,
    confidenceLevel: confidenceLevelForScore(confidenceScore),
    coreScore,
    components: Object.freeze({
      speed: finite(speedQuality) ? clamp(speedQuality) : null,
      accuracy: finite(accuracyQuality) ? clamp(accuracyQuality) : null,
      stability: finite(stabilityQuality) ? clamp(stabilityQuality) : null,
      contextRobustness: finite(contextRobustness) ? clamp(contextRobustness) : null,
    }),
    hardGuardApplied,
  });
}
