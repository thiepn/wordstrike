import { createSkillStatId } from "./practiceIds.js";
import { createPracticeTreatmentOutcomeCandidate } from "./practiceTreatmentOutcome.js";
import { normalizePracticeConsistencyResult } from "./practiceTreatmentBaseline.js";
import { PRACTICE_TREATMENT_POLICY } from "./practiceTreatmentConstants.js";

export function buildPracticeAbilityOutcomeCandidate(observation, { abilityModelVersion = null, abilityPolicyVersion = null } = {}) {
  if (!observation || !["cold-natural-text", "common-words", "burst", "endurance", "punctuation", "numbers-symbols"].includes(observation.channel)) return null;
  return createPracticeTreatmentOutcomeCandidate({
    profileId: observation.profileId,
    contextId: observation.contextId,
    sessionId: observation.sessionId,
    observedAt: observation.completedAtUtc,
    localDayKey: observation.localDayKey ?? null,
    sourceKind: "ability-observation",
    subjectKind: "ability-channel",
    subjectId: observation.channel,
    outcomeDomain: observation.channel,
    metrics: {
      adjustedLogPerformance: observation.adjustedLogPerformance,
      measurementSigmaLog: observation.measurementSigmaLog,
      measurementVarianceLog: observation.measurementVarianceLog,
      adjustedWpm: observation.adjustedWpm,
    },
    uncertainty: { measurementSigmaLog: observation.measurementSigmaLog },
    validity: { eligible: true, abilityModelVersion, abilityPolicyVersion, observationVersion: observation.observationVersion ?? null },
    evidenceRole: observation.sourceRole ?? null,
  });
}

export function buildPracticeTargetRetestCandidate({ profileId, contextId, sessionId, observedAt, localDayKey = null, entityType, entityKey, protocolFingerprint, metrics, probeIdentity = null } = {}) {
  if (!profileId || !contextId || !sessionId || !observedAt || !entityType || typeof entityKey !== "string") return null;
  const qualityEligible = Number.isFinite(metrics?.quality)
    && Number.isFinite(metrics?.qualityCoverage)
    && metrics.qualityCoverage >= PRACTICE_TREATMENT_POLICY.baselineQualityCoverageMinimum
    && Number.isInteger(metrics?.opportunityCount)
    && metrics.opportunityCount > 0;
  if (!qualityEligible) return null;
  const subjectId = createSkillStatId(profileId, contextId, entityType, entityKey);
  return createPracticeTreatmentOutcomeCandidate({
    profileId, contextId, sessionId, observedAt, localDayKey,
    sourceKind: "target-baseline-retest",
    subjectKind: "target-stat",
    subjectId,
    outcomeDomain: "entity-target",
    protocolFingerprint,
    metrics,
    validity: { eligible: true, probeIdentity },
    evidenceRole: "diagnostic",
  });
}

export function buildPracticeRetentionOutcomeCandidates(reviewDeltas = []) {
  return reviewDeltas.flatMap((delta) => {
    if (!delta?.verificationEligible || !delta.mature || delta.noveltyStatus !== "fresh" || delta.measurementStatus !== "measured" || !Number.isFinite(delta.probeQuality)) return [];
    const subjectId = createSkillStatId(delta.profileId, delta.contextId, delta.entityType, delta.entityKey);
    return [createPracticeTreatmentOutcomeCandidate({
      profileId: delta.profileId,
      contextId: delta.contextId,
      sessionId: delta.sessionId,
      observedAt: delta.reviewedAtUtc,
      localDayKey: delta.localDayKey ?? null,
      sourceKind: "retention-review",
      subjectKind: "target-stat",
      subjectId,
      outcomeDomain: "entity-target",
      metrics: {
        quality: delta.probeQuality,
        probeQuality: delta.probeQuality,
        retentionScore: delta.retentionScore ?? null,
        preservationQuality: delta.preservationQuality ?? null,
        elapsedDays: delta.elapsedDays ?? null,
      },
      validity: {
        eligible: true,
        mature: true,
        freshness: delta.noveltyStatus,
        measurementStatus: delta.measurementStatus,
        confidence: delta.confidence ?? null,
        familyIds: delta.familyIds ?? [],
      },
      evidenceRole: "retention",
    })];
  });
}

export function buildPracticeTransferOutcomeCandidate({ profileId, contextId, sessionId, observedAt, localDayKey = null, entityType, entityKey, metrics, freshness = "fresh", integrity = "valid", transferEvidenceEligible = true } = {}) {
  if (!transferEvidenceEligible || freshness !== "fresh" || integrity !== "valid") return null;
  const subjectId = createSkillStatId(profileId, contextId, entityType, entityKey);
  return createPracticeTreatmentOutcomeCandidate({
    profileId, contextId, sessionId, observedAt, localDayKey,
    sourceKind: "cold-transfer",
    subjectKind: "target-stat",
    subjectId,
    outcomeDomain: "entity-target",
    metrics,
    validity: { eligible: true, freshness, integrity, transferEvidenceEligible },
    evidenceRole: "transfer",
  });
}

export function buildPracticeTransferOutcomeCandidatesFromLearning(deltas = [], evaluationSummary = null) {
  if (evaluationSummary?.kind !== "cold-transfer" || evaluationSummary?.freshnessStatus !== "fresh" || evaluationSummary?.integrityStatus !== "valid" || evaluationSummary?.transferEvidenceEligible !== true) return [];
  return deltas.flatMap((delta) => {
    if (delta?.kind !== "transfer" || delta?.evidenceRole !== "transfer" || !delta?.observation || !Number.isFinite(delta.observation.quality)) return [];
    return [buildPracticeTransferOutcomeCandidate({
      profileId: delta.profileId,
      contextId: delta.contextId,
      sessionId: delta.sessionId,
      observedAt: delta.observation.completedAtUtc,
      localDayKey: delta.observation.localDayKey ?? null,
      entityType: delta.entityType,
      entityKey: delta.entityKey,
      metrics: {
        quality: delta.observation.quality,
        qualityCoverage: delta.observation.qualityCoverage ?? null,
        opportunityCount: delta.observation.opportunityCount ?? 0,
        firstPassAccuracy: delta.observation.metrics?.accuracy ?? delta.observation.metrics?.firstPassAccuracy ?? null,
        normalizedResidualMedianMs: delta.observation.metrics?.normalizedResidualMedianMs ?? null,
        disfluencyRate: delta.observation.metrics?.disfluencyRate ?? null,
        launchResidualMedianMs: delta.observation.metrics?.launchResidualMedianMs ?? null,
        launchDisfluencyRate: delta.observation.metrics?.launchDisfluencyRate ?? null,
        internalResidualMedianMs: delta.observation.metrics?.internalResidualMedianMs ?? null,
        internalDisfluencyRate: delta.observation.metrics?.internalDisfluencyRate ?? null,
      },
      freshness: "fresh",
      integrity: "valid",
      transferEvidenceEligible: true,
    })].filter(Boolean);
  });
}

export function buildPracticeConsistencyOutcomeCandidate({ profileId, contextId, sessionId, observedAt, localDayKey = null, result } = {}) {
  const normalized = normalizePracticeConsistencyResult(result);
  if (!normalized || normalized.status !== "complete" || !Number.isFinite(normalized.paceVariationPercent)) return null;
  return createPracticeTreatmentOutcomeCandidate({
    profileId, contextId, sessionId, observedAt, localDayKey,
    sourceKind: "consistency-result",
    subjectKind: "outcome-domain",
    subjectId: "consistency",
    outcomeDomain: "consistency",
    metrics: normalized,
    validity: { eligible: true, analysisVersion: normalized.analysisVersion, resultVersion: normalized.resultVersion, durationMs: normalized.durationMs },
    evidenceRole: "training",
  });
}

export function buildPracticeFrontierOutcomeCandidate({ profileId, contextId, sessionId, observedAt, localDayKey = null, frontier } = {}) {
  if (!frontier || !["bracketed", "lower-bound"].includes(frontier.status)) return null;
  return createPracticeTreatmentOutcomeCandidate({
    profileId, contextId, sessionId, observedAt, localDayKey,
    sourceKind: "control-frontier",
    subjectKind: "outcome-domain",
    subjectId: "control-frontier",
    outcomeDomain: "control-frontier",
    metrics: {
      modelVersion: frontier.modelVersion ?? null,
      policyVersion: frontier.policyVersion ?? null,
      status: frontier.status,
      confidence: frontier.confidence ?? null,
      frontierWpm: frontier.frontierWpm ?? null,
      lowerBoundWpm: frontier.frontierLowerWpm ?? null,
      upperBoundWpm: frontier.frontierUpperWpm ?? null,
    },
    validity: { eligible: true, modelVersion: frontier.modelVersion ?? null, policyVersion: frontier.policyVersion ?? null },
    evidenceRole: "training",
  });
}
