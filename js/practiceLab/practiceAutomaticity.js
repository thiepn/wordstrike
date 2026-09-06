import { computePracticeEvidenceConfidence, confidenceLevelForScore } from "./practiceEvidenceConfidence.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";
import {
  clampPracticeQuality,
  computePracticeAbsoluteAccuracyQuality,
  computePracticeAccuracyQuality,
  computePracticeSpeedQuality,
} from "./practiceExecutionQuality.js";

export { computePracticeAbsoluteAccuracyQuality, computePracticeAccuracyQuality, computePracticeSpeedQuality } from "./practiceExecutionQuality.js";

const finite = Number.isFinite;

function validLimiterDimension(dimension) {
  return dimension && dimension.status !== "insufficient-evidence" && finite(dimension.severityScore);
}

export function computePracticeStabilityQuality(stat, limiterEvaluation) {
  const unstable = limiterEvaluation?.dimensions?.unstable;
  const confidence = computePracticeEvidenceConfidence(stat, "normalized-residual");
  const score = validLimiterDimension(unstable) ? clampPracticeQuality(100 - unstable.severityScore) : null;
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
      components: Object.freeze({ speed: speedQuality ?? null, accuracy: accuracyQuality ?? null, stability: stabilityQuality ?? null, contextRobustness: contextRobustness ?? null }),
      hardGuardApplied: false,
    });
  }

  const values = {
    speed: finite(speedQuality) ? clampPracticeQuality(speedQuality) : 0,
    accuracy: finite(accuracyQuality) ? clampPracticeQuality(accuracyQuality) : 0,
    stability: finite(stabilityQuality) ? clampPracticeQuality(stabilityQuality) : 0,
    contextRobustness: finite(contextRobustness) ? clampPracticeQuality(contextRobustness) : 0,
  };
  const w = policy.automaticity.weights;
  const coreScore = clampPracticeQuality(w.speed * values.speed + w.accuracy * values.accuracy + w.stability * values.stability + w.contextRobustness * values.contextRobustness);
  const confidences = [
    computePracticeEvidenceConfidence(stat, "general").score,
    computePracticeEvidenceConfidence(stat, "accuracy").score,
    computePracticeEvidenceConfidence(stat, "normalized-residual").score,
    computePracticeEvidenceConfidence(stat, "disfluency").score,
  ];
  const confidenceScore = clampPracticeQuality(Math.min(...confidences));
  let score = Math.min(coreScore, confidenceScore);
  const hardGuardApplied = (finite(accuracyQuality) && accuracyQuality < policy.automaticity.accuracyHardFloor)
    || (finite(speedQuality) && speedQuality < policy.automaticity.speedHardFloor);
  if (hardGuardApplied) score = Math.min(score, policy.automaticity.hardCap);
  score = clampPracticeQuality(score);

  return Object.freeze({
    score,
    status: practiceAutomaticityStatus(score, policy),
    confidenceScore,
    confidenceLevel: confidenceLevelForScore(confidenceScore),
    coreScore,
    components: Object.freeze({
      speed: finite(speedQuality) ? clampPracticeQuality(speedQuality) : null,
      accuracy: finite(accuracyQuality) ? clampPracticeQuality(accuracyQuality) : null,
      stability: finite(stabilityQuality) ? clampPracticeQuality(stabilityQuality) : null,
      contextRobustness: finite(contextRobustness) ? clampPracticeQuality(contextRobustness) : null,
    }),
    hardGuardApplied,
  });
}
