import { createSkillStatId } from "./practiceIds.js";
import { createPracticeTreatmentOutcomeCandidate } from "./practiceTreatmentOutcome.js";

export function buildPracticeAbilityOutcomeCandidate(observation, { abilityModelVersion = null } = {}) {
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
    validity: { eligible: true, abilityModelVersion, observationVersion: observation.observationVersion ?? null },
    evidenceRole: observation.sourceRole ?? null,
  });
}

export function buildPracticeTargetRetestCandidate({ profileId, contextId, sessionId, observedAt, localDayKey = null, entityType, entityKey, protocolFingerprint, metrics, probeIdentity = null } = {}) {
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
      validity: { eligible: true, confidence: delta.confidence ?? null, familyIds: delta.familyIds ?? [] },
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

export function buildPracticeConsistencyOutcomeCandidate({ profileId, contextId, sessionId, observedAt, localDayKey = null, result } = {}) {
  if (!result) return null;
  return createPracticeTreatmentOutcomeCandidate({
    profileId, contextId, sessionId, observedAt, localDayKey,
    sourceKind: "consistency-result",
    subjectKind: "outcome-domain",
    subjectId: "consistency",
    outcomeDomain: "consistency",
    metrics: result,
    validity: { eligible: true, analysisVersion: result.analysisVersion ?? null, durationMs: result.durationMs ?? null },
    evidenceRole: "training",
  });
}

export function buildPracticeFrontierOutcomeCandidate({ profileId, contextId, sessionId, observedAt, localDayKey = null, frontier } = {}) {
  if (!frontier) return null;
  return createPracticeTreatmentOutcomeCandidate({
    profileId, contextId, sessionId, observedAt, localDayKey,
    sourceKind: "control-frontier",
    subjectKind: "outcome-domain",
    subjectId: "control-frontier",
    outcomeDomain: "control-frontier",
    metrics: frontier,
    validity: { eligible: true, modelVersion: frontier.modelVersion ?? null, policyVersion: frontier.policyVersion ?? null },
    evidenceRole: "training",
  });
}
