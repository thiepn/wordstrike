import { confidenceLevelForScore } from "./practiceEvidenceConfidence.js";
import { computePracticeRoleQuality } from "./practiceRoleQuality.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const saturating = (value, scale) => 1 - Math.exp(-Math.max(0, Number(value) || 0) / scale);

export function computePracticeTransferConfidence(stat, policy = PRACTICE_MASTERY_POLICY_V1) {
  const lane = stat?.evidence?.roles?.transfer;
  const opportunities = Number(lane?.opportunityCount || 0);
  const sessions = Number(lane?.sessionCount || 0);
  if (!opportunities && !sessions) {
    return Object.freeze({ score: 0, level: "none", opportunities, sessions });
  }
  const scale = policy.transfer.opportunityScales?.[stat?.entityType] ?? 1;
  const q = saturating(opportunities, scale);
  const s = saturating(sessions, policy.transfer.sessionScale);
  const score = clamp(100 * (
    policy.transfer.confidenceWeights.opportunities * q
    + policy.transfer.confidenceWeights.sessions * s
  ));
  return Object.freeze({
    score,
    level: confidenceLevelForScore(score),
    opportunities,
    sessions,
    factors: Object.freeze({ opportunities: q, sessions: s }),
  });
}

export function computePracticeTransferMastery(stat, policy = PRACTICE_MASTERY_POLICY_V1) {
  const transferLane = stat?.evidence?.roles?.transfer;
  const opportunities = Number(transferLane?.opportunityCount || 0);
  const sessions = Number(transferLane?.sessionCount || 0);
  const requiredOpportunities = policy.transfer.minimumOpportunities?.[stat?.entityType] ?? Infinity;
  const minimumMet = opportunities >= requiredOpportunities && sessions >= policy.transfer.minimumSessions;
  const confidence = computePracticeTransferConfidence(stat, policy);
  const transferQuality = computePracticeRoleQuality(stat, "transfer", policy);
  const trainingQuality = computePracticeRoleQuality(stat, "training", policy);
  const score = minimumMet && Number.isFinite(transferQuality.score) ? transferQuality.score : null;
  const gap = Number.isFinite(trainingQuality.score) && Number.isFinite(transferQuality.score)
    ? trainingQuality.score - transferQuality.score
    : null;
  return Object.freeze({
    score,
    status: !opportunities ? "unverified" : minimumMet && score != null ? "verified" : "insufficient",
    confidenceScore: confidence.score,
    confidenceLevel: confidence.level,
    opportunityCount: opportunities,
    sessionCount: sessions,
    requiredOpportunityCount: requiredOpportunities,
    requiredSessionCount: policy.transfer.minimumSessions,
    minimumEvidenceMet: minimumMet,
    roleQuality: transferQuality,
    trainingRoleQuality: Number.isFinite(trainingQuality.score) ? trainingQuality : null,
    gap,
    gapEligible: gap == null || gap <= policy.transfer.maximumTrainingGap,
  });
}
