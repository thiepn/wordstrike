import { PRACTICE_MASTERY_STAGE_RANK } from "./practiceMasteryConstants.js";
import { evaluatePracticeSaturation } from "./practiceSaturationModel.js";
import { PRACTICE_WEAK_KEYS_POLICY_V1 } from "./practiceWeakKeysPolicy.js";
import { normalizePracticeWeakKeyTarget } from "./practiceWeakKeysTargets.js";

const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const LIMITER_STATUS_STRENGTH = Object.freeze({ confirmed: 3, likely: 2, possible: 1, "not-elevated": 0, "insufficient-data": 0 });
const MASTERY_PREFERENCE = Object.freeze({ learning: 0, acquired: 1, unmeasured: 2, transferred: 3, robust: 4, retained: 5 });

function confidenceFor(limiter) {
  const values = [
    limiter?.evidenceMetadata?.primaryDimensionConfidenceScore,
    limiter?.evidenceConfidenceScore,
    limiter?.evidenceMetadata?.generalConfidenceScore,
  ].filter(finite);
  return values.length ? Math.max(...values) : 0;
}

function downstreamFor(statId, limiterSnapshot) {
  const counts = { bigram: 0, trigram: 0, word: 0 };
  for (const candidate of limiterSnapshot?.candidates ?? []) {
    if (!["likely", "confirmed"].includes(candidate?.status) || !["bigram", "trigram", "word"].includes(candidate?.entityType)) continue;
    const explains = candidate?.hierarchy?.explainedBy?.some((entry) => entry?.statId === statId);
    if (explains) counts[candidate.entityType] += 1;
  }
  return Object.freeze({
    downstreamExplainedCount: counts.bigram + counts.trigram + counts.word,
    bigramCount: counts.bigram,
    trigramCount: counts.trigram,
    wordCount: counts.word,
  });
}

function saturationFactor(status, policy) {
  return finite(policy.recommendation.saturationFactors?.[status])
    ? policy.recommendation.saturationFactors[status]
    : 1;
}

function fallbackPriority(limiter, confidence) {
  const weakness = finite(limiter?.weaknessScore) ? limiter.weaknessScore : 0;
  return weakness * confidence / 100;
}

function compareCandidates(a, b) {
  if (b.effectivePriorityScore !== a.effectivePriorityScore) return b.effectivePriorityScore - a.effectivePriorityScore;
  const statusDelta = (LIMITER_STATUS_STRENGTH[b.limiterStatus] ?? 0) - (LIMITER_STATUS_STRENGTH[a.limiterStatus] ?? 0);
  if (statusDelta) return statusDelta;
  if (b.downstreamExplainedCount !== a.downstreamExplainedCount) return b.downstreamExplainedCount - a.downstreamExplainedCount;
  if (b.evidenceConfidenceScore !== a.evidenceConfidenceScore) return b.evidenceConfidenceScore - a.evidenceConfidenceScore;
  const aWeakness = finite(a.weaknessScore) ? a.weaknessScore : -1;
  const bWeakness = finite(b.weaknessScore) ? b.weaknessScore : -1;
  if (bWeakness !== aWeakness) return bWeakness - aWeakness;
  const stageDelta = (MASTERY_PREFERENCE[a.masteryStage] ?? 9) - (MASTERY_PREFERENCE[b.masteryStage] ?? 9);
  if (stageDelta) return stageDelta;
  return a.entityKey.localeCompare(b.entityKey) || a.statId.localeCompare(b.statId);
}

export function buildWeakKeyCandidates({
  profileId,
  contextId,
  language = "en",
  skillStats = [],
  limiterSnapshot = null,
  masterySnapshot = null,
  learningStates = [],
  availabilityByKey = null,
  maxResults = PRACTICE_WEAK_KEYS_POLICY_V1.recommendation.maxResults,
  policy = PRACTICE_WEAK_KEYS_POLICY_V1,
} = {}) {
  if (typeof profileId !== "string" || typeof contextId !== "string") throw new TypeError("Weak Keys recommendations require profile/context identity");
  if (limiterSnapshot && (limiterSnapshot.profileId !== profileId || limiterSnapshot.contextId !== contextId)) throw new TypeError("Weak Keys limiter snapshot context mismatch");
  if (masterySnapshot && (masterySnapshot.profileId !== profileId || masterySnapshot.contextId !== contextId)) throw new TypeError("Weak Keys mastery snapshot context mismatch");

  const limiterByStat = new Map((limiterSnapshot?.candidates ?? []).map((entry) => [entry.statId, entry]));
  const masteryByStat = new Map((masterySnapshot?.entities ?? []).map((entry) => [entry.statId, entry]));
  const learningByStat = new Map((Array.isArray(learningStates) ? learningStates : []).map((entry) => [entry.statId, entry]));
  const result = [];

  for (const stat of Array.isArray(skillStats) ? skillStats : []) {
    if (stat?.profileId !== profileId || stat?.contextId !== contextId || stat?.entityType !== "key") continue;
    const target = normalizePracticeWeakKeyTarget({ entityType: "key", entityKey: stat.entityKey, language });
    if (!target) continue;
    const limiter = limiterByStat.get(stat.statId) ?? null;
    if (!limiter || ![...policy.recommendation.preferredLimiterStatuses, ...policy.recommendation.secondaryLimiterStatuses].includes(limiter.status)) continue;
    const mastery = masteryByStat.get(stat.statId) ?? null;
    const masteryStage = mastery?.stage ?? "unmeasured";
    if (policy.recommendation.normallyExcludedMasteryStages.includes(masteryStage)) continue;
    const availability = availabilityByKey instanceof Map ? availabilityByKey.get(target.entityKey) : availabilityByKey?.[target.entityKey];
    if (availability && availability.status !== "ready") continue;

    const confidence = confidenceFor(limiter);
    if (confidence <= 0) continue;
    const learningState = learningByStat.get(stat.statId) ?? null;
    const saturation = learningState
      ? evaluatePracticeSaturation({ learningState, mastery, limiter })
      : Object.freeze({ status: "insufficient-data", confidence: "none", type: "unknown", reasons: Object.freeze(["learning-state-unavailable"]) });
    const factor = saturationFactor(saturation.status, policy);
    const rawPriority = finite(limiter.priorityScore) ? limiter.priorityScore : fallbackPriority(limiter, confidence);
    const downstream = downstreamFor(stat.statId, limiterSnapshot);
    result.push(freezeDeep({
      statId: stat.statId,
      entityType: "key",
      entityKey: target.entityKey,
      limiterStatus: limiter.status,
      limiterPhenotype: limiter.primaryPhenotype ?? "mixed",
      limiterPriorityScore: finite(limiter.priorityScore) ? limiter.priorityScore : null,
      effectivePriorityScore: rawPriority * factor,
      weaknessScore: finite(limiter.weaknessScore) ? limiter.weaknessScore : null,
      evidenceConfidenceScore: confidence,
      masteryStage,
      masteryRank: PRACTICE_MASTERY_STAGE_RANK[masteryStage] ?? null,
      saturationStatus: saturation.status,
      saturationConfidence: saturation.confidence,
      saturationType: saturation.type,
      saturationDeemphasized: factor < 1,
      saturationFactor: factor,
      ...downstream,
      targetSource: "recommended",
    }));
  }

  result.sort(compareCandidates);
  const bounded = Math.max(0, Math.min(Number.isInteger(maxResults) ? maxResults : 0, policy.recommendation.maxResults));
  return Object.freeze(result.slice(0, bounded));
}

export function getWeakKeyManualSaturationWarning({ statId, limiterSnapshot = null, masterySnapshot = null, learningStates = [] } = {}) {
  if (!statId) return null;
  const limiter = (limiterSnapshot?.candidates ?? []).find((entry) => entry.statId === statId) ?? null;
  const mastery = (masterySnapshot?.entities ?? []).find((entry) => entry.statId === statId) ?? null;
  const learningState = (Array.isArray(learningStates) ? learningStates : []).find((entry) => entry.statId === statId) ?? null;
  if (!learningState) return null;
  const saturation = evaluatePracticeSaturation({ learningState, mastery, limiter });
  if (!["likely", "supported", "resolved"].includes(saturation.status)) return null;
  return freezeDeep({
    status: saturation.status,
    message: "Recent learning evidence suggests this key may already be saturated. Manual practice is still allowed, but another unresolved limiter may have higher value.",
  });
}
