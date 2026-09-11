import {
  PRACTICE_COACH_ACTIONABLE_UTILITY,
  PRACTICE_COACH_MAX_ACTIONABLE_TARGETS,
  PRACTICE_COACH_MAX_INITIAL_LIMITER_CANDIDATES,
} from "./practiceCoachConstants.js";
import { PRACTICE_COACH_POLICY_V1 } from "./practiceCoachPolicy.js";
import { calculatePracticeCoachTargetUtility } from "./practiceCoachUtility.js";
import { buildPracticeCoachTreatmentOptions } from "./practiceCoachTreatmentOptions.js";
import { selectPersonalizedPracticeTreatment } from "./practiceCoachPersonalization.js";

const STATUS_RANK = Object.freeze({ confirmed: 2, likely: 1 });
const finite = (value) => Number.isFinite(Number(value));
const score = (dimension) => finite(dimension?.weightedSeverity)
  ? Number(dimension.weightedSeverity)
  : finite(dimension?.severityScore) ? Number(dimension.severityScore) : 0;

export function calculatePracticeCoachExecutionPressure(candidate = {}) {
  const dimensions = candidate.dimensions ?? {};
  const accuracyRecoveryPressure = Math.max(score(dimensions.inaccurate), score(dimensions.recoveryHeavy ?? dimensions["recovery-heavy"]));
  const otherExecutionPressure = Math.max(
    score(dimensions.slow),
    score(dimensions.hesitant),
    score(dimensions.unstable),
    candidate.entityType === "word" ? score(dimensions.launchLimited ?? dimensions["launch-limited"]) : 0,
  );
  return Object.freeze({ accuracyRecoveryPressure, otherExecutionPressure });
}

export function selectDefaultInterventionForEntity(candidate = {}, {
  accuracyRecoverySupported = true,
  policy = PRACTICE_COACH_POLICY_V1,
} = {}) {
  const { accuracyRecoveryPressure: ar, otherExecutionPressure: other } = calculatePracticeCoachExecutionPressure(candidate);
  if (accuracyRecoverySupported && ar >= 35 && ar >= other - 5 && ["key", "bigram", "trigram", "word"].includes(candidate.entityType)) {
    return Object.freeze({ experimentId: "accuracy-control", interventionMatch: policy.interventionMatch.canonical, reasonCode: "accuracy-recovery-match", ar, other });
  }
  if (candidate.entityType === "key") return Object.freeze({ experimentId: "weak-keys", interventionMatch: policy.interventionMatch.canonical, reasonCode: "key-foundation", ar, other });
  if (["bigram", "trigram"].includes(candidate.entityType)) return Object.freeze({ experimentId: "combination-repair", interventionMatch: policy.interventionMatch.canonical, reasonCode: "combination-limiter", ar, other });
  if (candidate.entityType === "word") return Object.freeze({ experimentId: "problem-words", interventionMatch: policy.interventionMatch.canonical, reasonCode: "word-limiter", ar, other });
  return Object.freeze({ experimentId: null, interventionMatch: policy.interventionMatch.unsupported, reasonCode: null, ar, other });
}

function hierarchyIds(candidate) {
  return new Set((candidate?.hierarchy?.explainedBy ?? []).map((entry) => typeof entry === "string" ? entry : entry?.statId).filter(Boolean));
}

export function practiceCoachTargetsOverlap(left, right) {
  if (!left || !right) return false;
  if (left.statId === right.statId) return true;
  if (left.entityType === right.entityType && left.entityKey === right.entityKey) return true;
  return hierarchyIds(left).has(right.statId) || hierarchyIds(right).has(left.statId);
}

function reasonCodeForExperiment(candidate, experimentId) {
  if (experimentId === "accuracy-control") return "accuracy-recovery-match";
  if (candidate.entityType === "key") return "key-foundation";
  if (["bigram", "trigram"].includes(candidate.entityType)) return "combination-limiter";
  if (candidate.entityType === "word") return "word-limiter";
  return null;
}

function reasonCodes(candidate, experimentId, utilityBreakdown, responseInformed = false) {
  const reasons = [];
  if (finite(candidate?.priorityScore) && Number(candidate.priorityScore) >= 60) reasons.push("high-impact-limiter");
  if (Number(candidate?.evidenceMetadata?.primaryDimensionConfidenceScore ?? candidate?.evidenceConfidenceScore ?? 0) >= 70) reasons.push("high-confidence-limiter");
  const interventionReason = reasonCodeForExperiment(candidate, experimentId);
  if (interventionReason) reasons.push(interventionReason);
  if (utilityBreakdown.headroom >= 0.7) reasons.push("learning-headroom");
  else if (["likely", "supported"].includes(candidate?.saturationStatus)) reasons.push("saturation-deemphasis");
  if (responseInformed) reasons.push("response-informed-treatment");
  return Object.freeze([...new Set(reasons)].slice(0, 4));
}

export function buildPracticeCoachTargetCandidates({
  limiterCandidates = [],
  masteryByStat = new Map(),
  learningByStat = new Map(),
  readinessBand = "unknown",
  readinessStale = false,
  accuracyRecoverySupported = true,
  reviewedStatIds = new Set(),
  reviewedEntities = new Set(),
  policy = PRACTICE_COACH_POLICY_V1,
} = {}) {
  const initial = (Array.isArray(limiterCandidates) ? limiterCandidates : [])
    .filter((candidate) => ["likely", "confirmed"].includes(candidate?.status))
    .slice(0, Math.min(PRACTICE_COACH_MAX_INITIAL_LIMITER_CANDIDATES, policy.candidateLimits.limiter));
  const output = [];
  for (const candidate of initial) {
    const entityIdentity = `${candidate.entityType}\u0000${candidate.entityKey}`;
    if (reviewedStatIds.has(candidate.statId) || reviewedEntities.has(entityIdentity)) continue;
    const intervention = selectDefaultInterventionForEntity(candidate, { accuracyRecoverySupported, policy });
    if (!intervention.experimentId || intervention.interventionMatch <= 0) continue;
    const mastery = masteryByStat instanceof Map ? masteryByStat.get(candidate.statId) : masteryByStat?.[candidate.statId];
    const learning = learningByStat instanceof Map ? learningByStat.get(candidate.statId) : learningByStat?.[candidate.statId];
    const masteryStage = mastery?.stage ?? mastery?.masteryStage ?? "unmeasured";
    const saturationStatus = learning?.saturation?.status ?? learning?.saturationStatus ?? "insufficient-data";
    const marginalGainBand = learning?.marginalGain ?? learning?.acquisition?.marginalGainStatus ?? learning?.marginalGainBand ?? "unknown";
    const breakdown = calculatePracticeCoachTargetUtility({
      priorityScore: candidate.priorityScore,
      weaknessScore: candidate.weaknessScore,
      masteryStage,
      saturationStatus,
      marginalGainBand,
      readinessBand,
      readinessStale,
      interventionMatch: intervention.interventionMatch,
      policy,
    });
    const baseUtilityScore = breakdown.coachTargetUtility;
    if (baseUtilityScore < Math.max(PRACTICE_COACH_ACTIONABLE_UTILITY, policy.actionableUtility)) continue;

    const personalizationCandidate = {
      ...candidate,
      accuracyRecoveryPressure: intervention.ar,
      otherExecutionPressure: intervention.other,
      needUtility: breakdown.needUtility,
      utilityBreakdown: breakdown,
      baseUtilityScore,
    };
    const treatmentOptions = buildPracticeCoachTreatmentOptions(personalizationCandidate, {
      preferredIntervention: intervention,
      availabilityByExperiment: candidate.coachTreatmentOptionAvailability ?? null,
      policy,
    });
    const personalized = treatmentOptions.length && candidate.coachProfileId && candidate.coachContextId
      ? selectPersonalizedPracticeTreatment({
        candidate: personalizationCandidate,
        options: treatmentOptions,
        responseStates: candidate.coachTreatmentResponseStates ?? [],
        profileId: candidate.coachProfileId,
        contextId: candidate.coachContextId,
        now: candidate.coachPersonalizationNow ?? new Date(),
      })
      : null;
    const experimentId = personalized?.experimentId ?? intervention.experimentId;
    const personalizedUtilityScore = personalized?.personalizedOptionUtility ?? baseUtilityScore;
    const rawDecision = personalized?.personalizationDecision ?? null;
    const personalizationDecision = rawDecision?.evidenceInputs?.length ? rawDecision : null;
    const responseInformed = personalized?.responseInformed === true;
    const {
      coachTreatmentResponseStates,
      coachTreatmentOptionAvailability,
      coachProfileId,
      coachContextId,
      coachPersonalizationNow,
      ...persistableCandidate
    } = candidate;
    output.push(Object.freeze({
      ...persistableCandidate,
      experimentId,
      experimentVersion: personalized?.experimentVersion ?? 1,
      interventionMatch: personalized?.personalizedInterventionMatch ?? intervention.interventionMatch,
      baseInterventionMatch: personalized?.baseInterventionMatch ?? intervention.interventionMatch,
      responseModifier: personalizationDecision?.responseModifier ?? 1,
      accuracyRecoveryPressure: intervention.ar,
      otherExecutionPressure: intervention.other,
      masteryStage,
      saturationStatus,
      marginalGainBand,
      utilityBreakdown: breakdown,
      needUtility: breakdown.needUtility,
      baseUtilityScore,
      personalizedUtilityScore,
      utilityScore: personalizedUtilityScore,
      personalizationDecision,
      responseInformed,
      personalizationDiagnostics: personalized?.optionComparisons ?? Object.freeze([]),
      reasonCodes: reasonCodes(candidate, experimentId, breakdown, responseInformed),
    }));
  }
  output.sort((a, b) => Number(b.personalizedUtilityScore) - Number(a.personalizedUtilityScore)
    || (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0)
    || Number(b.evidenceMetadata?.primaryDimensionConfidenceScore ?? b.evidenceConfidenceScore ?? 0) - Number(a.evidenceMetadata?.primaryDimensionConfidenceScore ?? a.evidenceConfidenceScore ?? 0)
    || Number(b.weaknessScore ?? 0) - Number(a.weaknessScore ?? 0)
    || a.entityType.localeCompare(b.entityType)
    || a.entityKey.localeCompare(b.entityKey)
    || a.experimentId.localeCompare(b.experimentId));
  return Object.freeze(output.slice(0, Math.min(PRACTICE_COACH_MAX_ACTIONABLE_TARGETS, policy.candidateLimits.actionable)));
}
