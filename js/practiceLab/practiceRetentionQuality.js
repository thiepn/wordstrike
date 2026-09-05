import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";
import { clampPracticeStabilityDays } from "./practiceReviewItem.js";
import { practiceMedian } from "./practiceRobustStats.js";

const finite = Number.isFinite;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

export function computePracticePreservationQuality(referenceQuality, probeQuality) {
  if (!finite(referenceQuality) || !finite(probeQuality)) return null;
  return clamp(100 + 2 * (probeQuality - referenceQuality));
}

export function computePracticeRetentionScore(referenceQuality, probeQuality) {
  const preservationQuality = computePracticePreservationQuality(referenceQuality, probeQuality);
  if (!finite(preservationQuality) || !finite(probeQuality)) return Object.freeze({ retentionScore: null, preservationQuality: null });
  return Object.freeze({
    retentionScore: clamp(0.5 * probeQuality + 0.5 * preservationQuality),
    preservationQuality,
  });
}

export function classifyPracticeRetentionOutcome(probeQuality, retentionScore, policy = PRACTICE_REVIEW_POLICY_V1) {
  if (!finite(probeQuality) || !finite(retentionScore)) return null;
  if (probeQuality >= policy.outcomes.strong.minimumProbeQuality && retentionScore >= policy.outcomes.strong.minimumRetentionScore) return "strong";
  if (probeQuality >= policy.outcomes.pass.minimumProbeQuality && retentionScore >= policy.outcomes.pass.minimumRetentionScore) return "pass";
  if (retentionScore >= policy.outcomes.fragile.minimumRetentionScore) return "fragile";
  return "fail";
}

export function updatePracticeRetentionStability(oldStabilityDays, elapsedDays, outcome, policy = PRACTICE_REVIEW_POLICY_V1) {
  if (!finite(oldStabilityDays) || oldStabilityDays <= 0 || !finite(elapsedDays) || elapsedDays < 0) return null;
  const S = oldStabilityDays;
  const d = elapsedDays;
  let next;
  if (outcome === "strong") next = Math.max(policy.stability.strong.oldMultiplier * S, policy.stability.strong.delayMultiplier * d);
  else if (outcome === "pass") next = Math.max(policy.stability.pass.oldMultiplier * S, policy.stability.pass.delayMultiplier * d);
  else if (outcome === "fragile") next = Math.max(policy.stability.minimumDays, Math.min(policy.stability.fragile.oldMultiplier * S, d));
  else if (outcome === "fail") next = Math.max(policy.stability.minimumDays, Math.min(policy.stability.fail.oldMultiplier * S, policy.stability.fail.delayMultiplier * d));
  else return null;
  return clampPracticeStabilityDays(next, policy);
}

export function practiceRetentionConfidence({ verificationCount = 0, distinctReviewDays = 0, maxSuccessfulDelayDays = 0 } = {}, policy = PRACTICE_REVIEW_POLICY_V1) {
  const cfg = policy.retentionAggregate.confidence;
  const V = Math.max(0, Number(verificationCount) || 0);
  const D = Math.max(0, Number(distinctReviewDays) || 0);
  const L = Math.max(0, Number(maxSuccessfulDelayDays) || 0);
  const verificationFactor = 1 - Math.exp(-V / cfg.verificationScale);
  const dayFactor = 1 - Math.exp(-D / cfg.dayScale);
  const delayFactor = 1 - Math.exp(-L / cfg.successfulDelayScaleDays);
  const score = clamp(100 * (
    cfg.weights.verification * verificationFactor
    + cfg.weights.days * dayFactor
    + cfg.weights.delay * delayFactor
  ));
  const level = V === 0 ? "none" : score < 50 ? "low" : score < 80 ? "medium" : "high";
  return Object.freeze({ score, level, verificationFactor, dayFactor, delayFactor });
}

export function medianPracticeRetentionScores(values) {
  return practiceMedian(Array.isArray(values) ? values : [], { min: 0, max: 100 });
}
