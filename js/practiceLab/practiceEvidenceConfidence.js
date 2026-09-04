import { PRACTICE_SKILL_EVIDENCE_POLICY_V1 } from "./practiceSkillEvidencePolicy.js";

export const PRACTICE_EVIDENCE_CONFIDENCE_DIMENSIONS = Object.freeze([
  "general",
  "accuracy",
  "fluent-timing",
  "normalized-residual",
  "disfluency",
  "errors",
  "word-launch",
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const saturating = (value, scale) => 1 - Math.exp(-Math.max(0, Number(value) || 0) / scale);

function quantityFor(stat, dimension) {
  const evidence = stat?.evidence;
  if (!evidence) return 0;
  if (dimension === "fluent-timing") return evidence.timing?.fluentCount ?? 0;
  if (dimension === "normalized-residual") return evidence.timing?.fluentResidual?.count ?? 0;
  if (dimension === "disfluency") return evidence.timing?.eligibleCount ?? 0;
  if (dimension === "errors") return Math.max(evidence.opportunities?.errorCount ?? 0, evidence.errors?.primaryEpisodeCount ?? 0);
  if (dimension === "word-launch") return evidence.launchTiming?.eligibleCount ?? 0;
  return evidence.opportunities?.count ?? 0;
}

export function confidenceLevelForScore(score, policy = PRACTICE_SKILL_EVIDENCE_POLICY_V1) {
  const value = clamp(Number(score) || 0, 0, 100);
  if (value === 0) return "none";
  if (value < policy.confidenceThresholds.medium) return "low";
  if (value < policy.confidenceThresholds.high) return "medium";
  return "high";
}

export function computePracticeEvidenceConfidence(stat, dimension = "general", policy = PRACTICE_SKILL_EVIDENCE_POLICY_V1) {
  if (!PRACTICE_EVIDENCE_CONFIDENCE_DIMENSIONS.includes(dimension)) throw new TypeError("Unsupported Practice evidence confidence dimension");
  const entityType = stat?.entityType ?? "default";
  const scale = policy.confidenceQuantityScales[entityType] ?? policy.confidenceQuantityScales.default;
  const quantity = quantityFor(stat, dimension);
  const observation = stat?.evidence?.observation ?? {};
  const factors = Object.freeze({
    quantity: saturating(quantity, scale),
    sessions: saturating(observation.sessionCount ?? 0, policy.confidenceSessionScale),
    days: saturating(observation.dayCount ?? 0, policy.confidenceDayScale),
    breadth: saturating(observation.breadthEvidencePoints ?? 0, policy.confidenceBreadthScale),
  });
  const raw = 100 * (
    policy.confidenceWeights.quantity * factors.quantity
    + policy.confidenceWeights.sessions * factors.sessions
    + policy.confidenceWeights.days * factors.days
    + policy.confidenceWeights.breadth * factors.breadth
  );
  const score = clamp(raw, 0, 100);
  return Object.freeze({
    dimension,
    quantity,
    score,
    level: confidenceLevelForScore(score, policy),
    factors,
  });
}
