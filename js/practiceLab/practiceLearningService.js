import { createPracticePeerReferenceIndex } from "./practicePeerReference.js";
import { evaluatePracticeLimiterDimensions } from "./practiceLimiterDimensions.js";
import { PRACTICE_LIMITER_POLICY_V1, PRACTICE_LIMITER_MODEL_VERSION, PRACTICE_LIMITER_POLICY_VERSION } from "./practiceLimiterPolicy.js";
import { buildPracticeMasteryEvaluationSet } from "./practiceMasterySnapshot.js";
import { PRACTICE_MASTERY_MODEL_VERSION, PRACTICE_MASTERY_POLICY_VERSION } from "./practiceMasteryConstants.js";
import { buildPracticeAbilityLearningCurve } from "./practiceAbilityLearningCurve.js";
import { computePracticeRecentContextDose, evaluatePracticeGlobalPlateau } from "./practiceGlobalPlateau.js";
import { evaluatePracticeSaturation } from "./practiceSaturationModel.js";
import {
  PRACTICE_GLOBAL_PLATEAU_MODEL_VERSION,
  PRACTICE_LEARNING_CURVE_VERSION,
  PRACTICE_LEARNING_MODEL_VERSION,
  PRACTICE_LEARNING_OBSERVATION_VERSION,
  PRACTICE_LEARNING_POLICY_VERSION,
  PRACTICE_SATURATION_MODEL_VERSION,
  PRACTICE_SATURATION_STATUS_RANK,
} from "./practiceLearningConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function fnv32(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function fingerprint(records) {
  return `${records.length}:${fnv32(records.map((record) => `${record.learningStateId ?? record.statId ?? record.abilityStateId}|${record.updatedAt ?? ""}`).sort().join("\n"))}`;
}

function acquisitionSummary(state) {
  const curve = state.acquisition.curve;
  return freezeDeep({
    observationCount: state.acquisition.observationCount,
    dayCount: state.acquisition.dayCount,
    cumulativeDoseUnits: state.acquisition.cumulativeDoseUnits,
    curveStatus: curve.status,
    curveConfidence: curve.confidence,
    overallGainPerDose: curve.medianSlopePointsPerDose,
    recentGainPerDose: curve.recentSlopePointsPerDose,
    currentEntryQuality: curve.recentQuality,
    medianPracticeGain: curve.medianPracticeGain,
    marginalGainStatus: curve.marginalGainStatus,
  });
}

function transferSummary(state) {
  const curve = state.transfer.curve;
  return freezeDeep({
    observationCount: state.transfer.observationCount,
    dayCount: state.transfer.dayCount,
    curveStatus: curve.status,
    confidence: curve.confidence,
    gainPerDose: curve.medianSlopePointsPerDose,
    recentGainPerDose: curve.recentSlopePointsPerDose,
    recentQuality: curve.recentQuality,
    lastDelaySinceAcquisitionMs: state.transfer.observations.at(-1)?.timeSincePreviousAcquisitionMs ?? null,
  });
}

function limiterSummary(stat, peerIndex, impactCandidate, policy) {
  const full = evaluatePracticeLimiterDimensions(stat, peerIndex.forStat(stat), policy);
  return freezeDeep({
    status: full.status,
    primaryPhenotype: full.primaryPhenotype,
    mixedTypes: full.mixedTypes,
    weaknessScore: full.weaknessScore,
    primaryDimensionConfidenceScore: full.primaryDimensionConfidenceScore,
    primaryDimensionConfidenceLevel: full.primaryDimensionConfidenceLevel,
    impactScore: impactCandidate?.impact?.impactScore ?? null,
    dimensions: full.dimensions,
  });
}

function candidateSort(a, b) {
  const status = (PRACTICE_SATURATION_STATUS_RANK[b.saturation.status] ?? 0) - (PRACTICE_SATURATION_STATUS_RANK[a.saturation.status] ?? 0);
  if (status) return status;
  const aImpact = Number.isFinite(a.limiter.impactScore) ? a.limiter.impactScore : -1;
  const bImpact = Number.isFinite(b.limiter.impactScore) ? b.limiter.impactScore : -1;
  if (bImpact !== aImpact) return bImpact - aImpact;
  if (b.limiter.primaryDimensionConfidenceScore !== a.limiter.primaryDimensionConfidenceScore) return b.limiter.primaryDimensionConfidenceScore - a.limiter.primaryDimensionConfidenceScore;
  const aGain = Number.isFinite(a.acquisition.recentGainPerDose) ? a.acquisition.recentGainPerDose : Infinity;
  const bGain = Number.isFinite(b.acquisition.recentGainPerDose) ? b.acquisition.recentGainPerDose : Infinity;
  if (aGain !== bGain) return aGain - bGain;
  return a.entityType.localeCompare(b.entityType) || a.entityKey.localeCompare(b.entityKey) || a.statId.localeCompare(b.statId);
}

export function createPracticeLearningService({
  repository,
  limiterService = null,
  masteryService = null,
  now = () => new Date(),
  policy = PRACTICE_LEARNING_POLICY_V1,
  limiterPolicy = PRACTICE_LIMITER_POLICY_V1,
} = {}) {
  if (!repository || typeof repository.getPracticeContext !== "function" || typeof repository.listLearningStates !== "function" || typeof repository.listSkillStats !== "function") throw new TypeError("Practice learning service requires learning/context/skill repository reads");
  if (limiterService != null && typeof limiterService.buildContextLimiterSnapshot !== "function") throw new TypeError("Practice learning limiterService is invalid");
  if (masteryService != null && typeof masteryService !== "object") throw new TypeError("Practice learning masteryService is invalid");
  if (typeof now !== "function") throw new TypeError("Practice learning service requires injected now()");
  const cache = new Map();

  const evaluateContext = async (profileId, contextId) => {
    const [context, learningStates, skillStats, abilityState] = await Promise.all([
      repository.getPracticeContext(contextId),
      repository.listLearningStates(profileId, contextId),
      repository.listSkillStats(profileId, contextId),
      typeof repository.getAbilityState === "function" ? repository.getAbilityState(profileId, contextId, "cold-natural-text") : null,
    ]);
    if (!context || context.profileId !== profileId) throw new TypeError("Practice learning context is missing or belongs to another profile");
    const learningFingerprint = fingerprint(learningStates);
    const skillFingerprint = fingerprint(skillStats);
    const abilityFingerprint = abilityState ? fingerprint([abilityState]) : "0:00000000";
    const cacheKey = [
      profileId,
      contextId,
      PRACTICE_LEARNING_MODEL_VERSION,
      PRACTICE_LEARNING_POLICY_VERSION,
      PRACTICE_LEARNING_CURVE_VERSION,
      PRACTICE_LEARNING_OBSERVATION_VERSION,
      PRACTICE_SATURATION_MODEL_VERSION,
      PRACTICE_GLOBAL_PLATEAU_MODEL_VERSION,
      PRACTICE_LIMITER_MODEL_VERSION,
      PRACTICE_LIMITER_POLICY_VERSION,
      PRACTICE_MASTERY_MODEL_VERSION,
      PRACTICE_MASTERY_POLICY_VERSION,
      learningFingerprint,
      skillFingerprint,
      abilityFingerprint,
    ].join("|");
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const peerIndex = createPracticePeerReferenceIndex(skillStats, limiterPolicy);
    const statById = new Map(skillStats.map((stat) => [stat.statId, stat]));
    const masteryResults = buildPracticeMasteryEvaluationSet({ skillStats, context });
    const masteryById = new Map(masteryResults.map((entry) => [entry.statId, entry]));
    let impactById = new Map();
    if (limiterService) {
      const snapshot = await limiterService.buildContextLimiterSnapshot({ profileId, contextId });
      impactById = new Map((snapshot?.candidates ?? []).map((candidate) => [candidate.statId, candidate]));
    }
    const results = [];
    for (const state of learningStates) {
      const stat = statById.get(state.statId);
      if (!stat) continue;
      const mastery = masteryById.get(state.statId) ?? null;
      const limiter = limiterSummary(stat, peerIndex, impactById.get(state.statId), limiterPolicy);
      const saturation = evaluatePracticeSaturation({ learningState: state, mastery, limiter, policy });
      results.push(freezeDeep({
        statId: state.statId,
        profileId,
        contextId,
        entityType: state.entityType,
        entityKey: state.entityKey,
        learningState: state,
        mastery,
        limiter,
        acquisition: acquisitionSummary(state),
        transfer: transferSummary(state),
        saturation,
        marginalGain: state.acquisition.curve.marginalGainStatus,
        diagnostics: {
          learningStateUpdatedAt: state.updatedAt,
          skillStatUpdatedAt: stat.updatedAt,
          impactAvailable: Number.isFinite(limiter.impactScore),
        },
      }));
    }
    const generatedAt = now();
    const abilityCurve = buildPracticeAbilityLearningCurve(abilityState, { policy });
    const recentDose = computePracticeRecentContextDose(learningStates, generatedAt, policy);
    const globalPlateau = evaluatePracticeGlobalPlateau({ abilityCurve, recentDose, entityResults: results, policy });
    const evaluated = freezeDeep({ context, learningStates, skillStats, abilityState, abilityCurve, recentDose, globalPlateau, results, cacheKey });
    cache.clear();
    cache.set(cacheKey, evaluated);
    return evaluated;
  };

  const getEntityLearningState = async (profileId, contextId, entityType, entityKey) => {
    if (![profileId, contextId, entityType, entityKey].every((value) => typeof value === "string")) throw new TypeError("Practice entity learning query requires string identity fields");
    const evaluated = await evaluateContext(profileId, contextId);
    return evaluated.results.find((entry) => entry.entityType === entityType && entry.entityKey === entityKey) ?? null;
  };

  const buildContextLearningSnapshot = async ({ profileId, contextId, maxSaturationCandidates = policy.snapshot.maxSaturationCandidates } = {}) => {
    if (!Number.isInteger(maxSaturationCandidates) || maxSaturationCandidates < 1 || maxSaturationCandidates > 128) throw new TypeError("Practice learning snapshot candidate bound is invalid");
    const evaluated = await evaluateContext(profileId, contextId);
    const counts = { insufficient: 0, notDetected: 0, approaching: 0, possible: 0, likely: 0, supported: 0, resolved: 0 };
    const countKey = { "insufficient-data": "insufficient", "not-detected": "notDetected", approaching: "approaching", possible: "possible", likely: "likely", supported: "supported", resolved: "resolved" };
    for (const result of evaluated.results) counts[countKey[result.saturation.status]] += 1;
    const candidates = evaluated.results
      .filter((result) => ["approaching", "possible", "likely", "supported"].includes(result.saturation.status))
      .sort(candidateSort)
      .slice(0, maxSaturationCandidates);
    const measured = evaluated.results.filter((result) => result.acquisition.observationCount > 0).length;
    const status = measured === 0 ? "insufficient-data" : measured === evaluated.results.length ? "ready" : "partial";
    return freezeDeep({
      profileId,
      contextId,
      modelVersions: {
        learningModelVersion: PRACTICE_LEARNING_MODEL_VERSION,
        learningPolicyVersion: PRACTICE_LEARNING_POLICY_VERSION,
        learningObservationVersion: PRACTICE_LEARNING_OBSERVATION_VERSION,
        learningCurveVersion: PRACTICE_LEARNING_CURVE_VERSION,
        saturationModelVersion: PRACTICE_SATURATION_MODEL_VERSION,
        globalPlateauModelVersion: PRACTICE_GLOBAL_PLATEAU_MODEL_VERSION,
      },
      status,
      counts,
      saturationCandidates: candidates,
      globalAbilityTrajectory: evaluated.abilityCurve,
      globalPlateau: evaluated.globalPlateau,
      diagnostics: {
        evaluatedLearningStateCount: evaluated.results.length,
        returnedSaturationCandidateCount: candidates.length,
        maxSaturationCandidates,
        recentDose: evaluated.recentDose,
      },
    });
  };

  return Object.freeze({
    getEntityLearningState,
    buildContextLearningSnapshot,
    invalidateContext(contextId) {
      for (const key of [...cache.keys()]) if (key.split("|")[1] === contextId) cache.delete(key);
    },
    clear() { cache.clear(); },
    getCacheSize() { return cache.size; },
  });
}
