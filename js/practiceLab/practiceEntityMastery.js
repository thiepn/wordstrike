import { computePracticeEvidenceConfidence } from "./practiceEvidenceConfidence.js";
import {
  computePracticeAccuracyQuality,
  computePracticeAutomaticity,
  computePracticeSpeedQuality,
  computePracticeStabilityQuality,
} from "./practiceAutomaticity.js";
import { computePracticeContextRobustness } from "./practiceContextRobustness.js";
import {
  PRACTICE_MASTERY_MODEL_VERSION,
  PRACTICE_MASTERY_POLICY_VERSION,
  PRACTICE_MASTERY_STAGE_RANK,
} from "./practiceMasteryConstants.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";
import { computePracticeTransferMastery } from "./practiceTransferMastery.js";
import { normalizePracticeRetentionEvidence } from "./practiceRetentionEvidence.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = Number.isFinite;
const CONFIDENCE_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });

function atLeastConfidence(level, required) {
  return (CONFIDENCE_RANK[level] ?? 0) >= (CONFIDENCE_RANK[required] ?? 0);
}

function dimensionStatus(score, evidenceCount, policy) {
  if (!finite(score)) return Number(evidenceCount || 0) > 0 ? "insufficient" : "unmeasured";
  return score >= policy.dimensionStrongThreshold ? "strong" : "developing";
}

function dimensionResult({ score, confidenceScore = 0, confidenceLevel = "none", evidenceCount = 0, reasons = [], policy }) {
  return freezeDeep({
    score: finite(score) ? clamp(score) : null,
    status: dimensionStatus(score, evidenceCount, policy),
    confidence: { score: clamp(confidenceScore), level: confidenceLevel },
    evidenceCount: Math.max(0, Number(evidenceCount) || 0),
    reasons: [...new Set(reasons)].slice(0, 4),
  });
}

function buildLimiterGuard(stat, limiterEvaluation, policy) {
  const ids = [...policy.limiterGuard.criticalDimensions];
  if (stat?.entityType === "word") ids.push(...policy.limiterGuard.wordExtraCriticalDimensions);
  const confirmed = [];
  const likely = [];
  for (const id of ids) {
    const dimension = limiterEvaluation?.dimensions?.[id];
    if (!dimension || Number(dimension.severityScore || 0) < policy.limiterGuard.severityThreshold) continue;
    if (dimension.status === "confirmed") confirmed.push(id);
    else if (dimension.status === "likely") likely.push(id);
  }
  return freezeDeep({
    confirmedCritical: confirmed.length > 0,
    likelyCritical: likely.length > 0,
    confirmedDimensions: confirmed,
    likelyDimensions: likely,
    stageCap: confirmed.length ? "learning" : likely.length ? "acquired" : null,
  });
}

function buildHierarchyReadiness({ stage, automaticity, generalConfidence, limiterGuard, hierarchy, policy }) {
  const promotionEligible = (PRACTICE_MASTERY_STAGE_RANK[stage] ?? 0) >= PRACTICE_MASTERY_STAGE_RANK.acquired
    && Number(automaticity?.score || 0) >= policy.hierarchy.minimumAutomaticityScore
    && atLeastConfidence(generalConfidence.level, policy.hierarchy.minimumGeneralConfidenceLevel)
    && !limiterGuard.confirmedCritical;
  const strongPartial = hierarchy?.status === "partially-explained"
    && Number(hierarchy?.explanationRatio || 0) >= policy.hierarchy.strongPartialExplanationRatio;
  const lowerLevelSupportRequired = hierarchy?.status === "explained" || strongPartial;
  const blockingEntityIds = lowerLevelSupportRequired
    ? (hierarchy?.explainedBy ?? [])
        .map((entry) => entry.statId)
        .filter((value) => typeof value === "string")
        .slice(0, policy.hierarchy.maxBlockingEntities)
    : [];
  return freezeDeep({ promotionEligible, lowerLevelSupportRequired, blockingEntityIds });
}

function selectStage({
  measured,
  acquired,
  transferred,
  robust,
  retained,
  limiterGuard,
}) {
  if (!measured) return "unmeasured";
  let stage = retained ? "retained" : robust ? "robust" : transferred ? "transferred" : acquired ? "acquired" : "learning";
  if (limiterGuard.confirmedCritical && PRACTICE_MASTERY_STAGE_RANK[stage] > PRACTICE_MASTERY_STAGE_RANK.learning) {
    stage = "learning";
  } else if (limiterGuard.likelyCritical && PRACTICE_MASTERY_STAGE_RANK[stage] > PRACTICE_MASTERY_STAGE_RANK.acquired) {
    stage = "acquired";
  }
  return stage;
}

export function evaluatePracticeEntityMastery({
  stat,
  limiterEvaluation,
  retentionEvidence,
  hierarchy = null,
  policy = PRACTICE_MASTERY_POLICY_V1,
} = {}) {
  if (!stat?.statId || stat.recordVersion !== 3 || !stat.evidence) {
    throw new TypeError("Practice entity mastery requires canonical PL11 skillStat v3 evidence");
  }
  const generalConfidence = computePracticeEvidenceConfidence(stat, "general");
  const accuracy = computePracticeAccuracyQuality(stat, limiterEvaluation, policy);
  const speed = computePracticeSpeedQuality(stat, limiterEvaluation);
  const stability = computePracticeStabilityQuality(stat, limiterEvaluation);
  const context = computePracticeContextRobustness(stat, policy);
  const transfer = computePracticeTransferMastery(stat, policy);
  const retention = normalizePracticeRetentionEvidence(retentionEvidence);

  const automaticity = computePracticeAutomaticity({
    stat,
    speedQuality: speed.score,
    accuracyQuality: accuracy.score,
    stabilityQuality: stability.score,
    contextRobustness: context.score,
    policy,
  });

  const dimensions = freezeDeep({
    accuracy: dimensionResult({
      score: accuracy.score,
      confidenceScore: accuracy.confidenceScore,
      confidenceLevel: accuracy.confidenceLevel,
      evidenceCount: accuracy.evidenceCount,
      reasons: accuracy.reasons,
      policy,
    }),
    speed: dimensionResult({
      score: speed.score,
      confidenceScore: speed.confidenceScore,
      confidenceLevel: speed.confidenceLevel,
      evidenceCount: speed.evidenceCount,
      reasons: speed.reasons,
      policy,
    }),
    stability: dimensionResult({
      score: stability.score,
      confidenceScore: stability.confidenceScore,
      confidenceLevel: stability.confidenceLevel,
      evidenceCount: stability.evidenceCount,
      reasons: stability.reasons,
      policy,
    }),
    contextRobustness: dimensionResult({
      score: context.score,
      confidenceScore: generalConfidence.score,
      confidenceLevel: generalConfidence.level,
      evidenceCount: context.eligibleRoleCount,
      reasons: context.reasons,
      policy,
    }),
    transfer: dimensionResult({
      score: transfer.score,
      confidenceScore: transfer.confidenceScore,
      confidenceLevel: transfer.confidenceLevel,
      evidenceCount: transfer.opportunityCount,
      reasons: transfer.score == null ? ["transfer-unverified"] : [],
      policy,
    }),
    retention: dimensionResult({
      score: retention.score,
      confidenceScore: retention.confidenceScore,
      confidenceLevel: retention.confidenceLevel,
      evidenceCount: retention.verificationCount,
      reasons: retention.status !== "verified" ? ["retention-unverified"] : [],
      policy,
    }),
  });

  const scores = {
    accuracy: accuracy.score,
    speed: speed.score,
    stability: stability.score,
    contextRobustness: context.score,
    transfer: transfer.score,
    retention: retention.score,
  };
  const masteryScore = clamp(Object.entries(policy.masteryWeights)
    .reduce((sum, [key, weight]) => sum + (finite(scores[key]) ? weight * scores[key] / 100 : 0), 0));
  const availableWeight = Object.entries(policy.masteryWeights)
    .reduce((sum, [key, weight]) => sum + (finite(scores[key]) ? weight : 0), 0);
  const acquisitionScore = clamp((
    policy.masteryWeights.accuracy * (finite(accuracy.score) ? accuracy.score : 0)
    + policy.masteryWeights.speed * (finite(speed.score) ? speed.score : 0)
    + policy.masteryWeights.stability * (finite(stability.score) ? stability.score : 0)
    + policy.masteryWeights.contextRobustness * (finite(context.score) ? context.score : 0)
  ) / policy.coreMasteryWeight);

  const limiterGuard = buildLimiterGuard(stat, limiterEvaluation, policy);
  const measured = Number(stat.evidence?.opportunities?.count || 0) > 0 && generalConfidence.level !== "none";
  const g = policy.gates.acquired;
  const acquired = measured
    && acquisitionScore >= g.acquisitionScore
    && Number(automaticity.score || 0) >= g.automaticityScore
    && atLeastConfidence(generalConfidence.level, g.minimumGeneralConfidenceLevel)
    && Number(accuracy.score || 0) >= g.accuracy
    && Number(speed.score || 0) >= g.speed
    && Number(stability.score || 0) >= g.stability
    && Number(context.score || 0) >= g.contextRobustness
    && !limiterGuard.confirmedCritical;

  const transferred = acquired
    && Number(transfer.score || 0) >= policy.transfer.minimumScore
    && atLeastConfidence(transfer.confidenceLevel, "medium")
    && transfer.minimumEvidenceMet
    && transfer.gapEligible;

  const robustGate = policy.gates.robust;
  const robust = transferred
    && Number(automaticity.score || 0) >= robustGate.automaticityScore
    && acquisitionScore >= robustGate.acquisitionScore
    && Number(context.score || 0) >= robustGate.contextRobustness
    && Number(stability.score || 0) >= robustGate.stability
    && atLeastConfidence(generalConfidence.level, robustGate.minimumGeneralConfidenceLevel)
    && context.eligibleRoleCount >= robustGate.minimumEligibleRoles
    && !limiterGuard.confirmedCritical
    && !limiterGuard.likelyCritical;

  const retainedGate = policy.gates.retained;
  const retained = robust
    && retention.status === "verified"
    && Number(retention.score || 0) >= retainedGate.score
    && atLeastConfidence(retention.confidenceLevel, retainedGate.minimumConfidenceLevel)
    && retention.eligibleForRetained === true;

  const stage = selectStage({ measured, acquired, transferred, robust, retained, limiterGuard });
  const anchorEligibility = freezeDeep({
    eligible: (stage === "robust" || stage === "retained")
      && Number(automaticity.score || 0) >= policy.anchor.minimumAutomaticityScore
      && atLeastConfidence(generalConfidence.level, policy.anchor.minimumGeneralConfidenceLevel)
      && !limiterGuard.confirmedCritical
      && !limiterGuard.likelyCritical,
  });
  const hierarchyReadiness = buildHierarchyReadiness({
    stage,
    automaticity,
    generalConfidence,
    limiterGuard,
    hierarchy,
    policy,
  });
  const coreAvailable = [accuracy.score, speed.score, stability.score, context.score].every(finite);

  return freezeDeep({
    modelVersion: PRACTICE_MASTERY_MODEL_VERSION,
    policyVersion: PRACTICE_MASTERY_POLICY_VERSION,
    statId: stat.statId,
    profileId: stat.profileId,
    contextId: stat.contextId,
    entityType: stat.entityType,
    entityKey: stat.entityKey,
    status: !measured ? "insufficient-data" : coreAvailable ? "ready" : "partial",
    stage,
    masteryScore,
    availableWeight,
    acquisitionScore,
    automaticity,
    dimensions,
    transfer,
    retention,
    limiterGuard,
    anchorEligibility,
    hierarchyReadiness,
    evidenceSummary: freezeDeep({
      opportunityCount: Number(stat.evidence?.opportunities?.count || 0),
      observationSessionCount: Number(stat.evidence?.observation?.sessionCount || 0),
      observationDayCount: Number(stat.evidence?.observation?.dayCount || 0),
      breadthEvidencePoints: Number(stat.evidence?.observation?.breadthEvidencePoints || 0),
      directTargetedCount: Number(stat.evidence?.opportunities?.directTargetedCount || 0),
      generalConfidenceScore: generalConfidence.score,
      generalConfidenceLevel: generalConfidence.level,
      eligibleRoleCount: context.eligibleRoleCount,
      lastObservedAt: stat.lastObservedAt ?? stat.evidence?.observation?.lastObservedAt ?? null,
    }),
  });
}
