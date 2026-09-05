import {
  PRACTICE_ABILITY_CONFIDENCE_LEVELS,
  PRACTICE_ABILITY_ERROR_CODES,
  PRACTICE_ABILITY_ESTIMATOR_VERSION,
  PRACTICE_ABILITY_POLICY_VERSION,
  PRACTICE_ABILITY_SOURCE_ROLES,
} from "./practiceAbilityConstants.js";
import { PRACTICE_ABILITY_POLICY_V1, validatePracticeAbilityPolicy } from "./practiceAbilityPolicy.js";
import { createPracticeAbilityStateId } from "./practiceIds.js";

const DAY_MS = 86_400_000;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function emptySourceRoleCounts() {
  return Object.fromEntries(PRACTICE_ABILITY_SOURCE_ROLES.map((role) => [role, 0]));
}

function abilityError(code, message) {
  const error = new TypeError(message);
  error.code = code;
  return error;
}

export function derivePracticeAbilityEstimate({ meanLogWpm = null, varianceLogWpm = null, evidence = null, policy = PRACTICE_ABILITY_POLICY_V1 } = {}) {
  validatePracticeAbilityPolicy(policy);
  const observationCount = evidence?.observationCount ?? 0;
  if (!observationCount) return freezeDeep({
    status: "unmeasured",
    meanLogWpm: null,
    varianceLogWpm: null,
    estimateWpm: null,
    interval95LowerWpm: null,
    interval95UpperWpm: null,
    relativeIntervalWidth: null,
    confidenceLevel: "none",
    smallestReliableRelativeChange: null,
    smallestReliableChangeWpm: null,
  });
  if (!Number.isFinite(meanLogWpm) || !Number.isFinite(varianceLogWpm) || varianceLogWpm < 0) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.INVALID_STATE, "Measured Practice ability requires finite mean and non-negative variance");
  const sigma = Math.sqrt(varianceLogWpm);
  const estimateWpm = Math.exp(meanLogWpm);
  const lower = Math.exp(meanLogWpm - 1.96 * sigma);
  const upper = Math.exp(meanLogWpm + 1.96 * sigma);
  const relativeIntervalWidth = (upper - lower) / estimateWpm;
  const upperRelativeHalfWidth = Math.exp(1.96 * sigma) - 1;
  const confidencePolicy = policy.confidence;
  let confidenceLevel = "low";
  if (
    observationCount >= confidencePolicy.highObservationCount
    && (evidence?.sessionCount ?? 0) >= confidencePolicy.highSessionCount
    && (evidence?.dayCount ?? 0) >= confidencePolicy.highDayCount
    && upperRelativeHalfWidth <= confidencePolicy.highUpperRelativeHalfWidth
  ) confidenceLevel = "high";
  else if (
    observationCount >= confidencePolicy.mediumObservationCount
    && (evidence?.sessionCount ?? 0) >= confidencePolicy.mediumSessionCount
    && upperRelativeHalfWidth <= confidencePolicy.mediumUpperRelativeHalfWidth
  ) confidenceLevel = "medium";
  if (!PRACTICE_ABILITY_CONFIDENCE_LEVELS.includes(confidenceLevel)) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.INVALID_STATE, "Derived Practice ability confidence is invalid");
  const status = ["medium", "high"].includes(confidenceLevel) && (evidence?.dayCount ?? 0) >= confidencePolicy.establishedMinimumDayCount
    ? "established"
    : "provisional";
  const smallestReliableRelativeChange = Math.exp(1.96 * Math.sqrt(2 * varianceLogWpm)) - 1;
  return freezeDeep({
    status,
    meanLogWpm,
    varianceLogWpm,
    estimateWpm,
    interval95LowerWpm: lower,
    interval95UpperWpm: upper,
    relativeIntervalWidth,
    confidenceLevel,
    smallestReliableRelativeChange,
    smallestReliableChangeWpm: estimateWpm * smallestReliableRelativeChange,
  });
}

export function createDefaultPracticeAbilityState({ profileId, contextId, channel, now = () => new Date() } = {}) {
  const timestampValue = typeof now === "function" ? now() : now;
  const timestamp = (timestampValue instanceof Date ? timestampValue : new Date(timestampValue)).toISOString();
  const evidence = freezeDeep({
    observationCount: 0,
    sessionCount: 0,
    dayCount: 0,
    firstObservedAt: null,
    lastObservedAt: null,
    lastObservedDayKey: null,
    totalActiveDurationMs: 0,
    totalTypedCharacters: 0,
    downweightedObservationCount: 0,
    sourceRoleCounts: emptySourceRoleCounts(),
  });
  return freezeDeep({
    abilityStateId: createPracticeAbilityStateId(profileId, contextId, channel),
    profileId,
    contextId,
    channel,
    recordVersion: 1,
    estimatorVersion: PRACTICE_ABILITY_ESTIMATOR_VERSION,
    estimatorPolicyVersion: PRACTICE_ABILITY_POLICY_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    estimate: derivePracticeAbilityEstimate({ evidence }),
    evidence,
    recentObservations: [],
  });
}

function compactRecentObservation(observation, innovationLog) {
  return freezeDeep({
    sessionId: observation.sessionId,
    completedAtUtc: observation.completedAtUtc,
    localDayKey: observation.localDayKey,
    channel: observation.channel,
    sourceRole: observation.sourceRole,
    rawWpm: observation.rawWpm,
    adjustedWpm: observation.adjustedWpm,
    accuracy: observation.accuracy,
    activeDurationMs: observation.activeDurationMs,
    typedCharacterCount: observation.typedCharacterCount,
    difficultyIndex: observation.difficultyIndex,
    difficultyModelStatus: observation.difficultyModelStatus,
    measurementSigmaLog: observation.measurementSigmaLog,
    reliabilityWeight: observation.reliabilityWeight,
    innovationLog,
  });
}

export function mergePracticeAbilityObservation(state, observation, policy = PRACTICE_ABILITY_POLICY_V1) {
  validatePracticeAbilityPolicy(policy);
  if (!state || !observation) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.INVALID_OBSERVATION, "Practice ability merge requires state and observation");
  if (state.estimatorVersion !== PRACTICE_ABILITY_ESTIMATOR_VERSION || state.estimatorPolicyVersion !== PRACTICE_ABILITY_POLICY_VERSION) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.VERSION_MISMATCH, "Practice ability state estimator version is unsupported");
  if (state.profileId !== observation.profileId || state.contextId !== observation.contextId || state.channel !== observation.channel) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.INVALID_OBSERVATION, "Practice ability observation identity does not match state");
  const observedAt = Date.parse(observation.completedAtUtc);
  const lastObservedAt = state.evidence?.lastObservedAt ? Date.parse(state.evidence.lastObservedAt) : null;
  if (!Number.isFinite(observedAt)) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.INVALID_OBSERVATION, "Practice ability observation timestamp is invalid");
  if (lastObservedAt != null && observedAt < lastObservedAt) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.OUT_OF_ORDER_OBSERVATION, "Practice ability observations must be applied chronologically");
  const y = observation.adjustedLogPerformance;
  const rVariance = observation.measurementVarianceLog;
  if (!Number.isFinite(y) || !Number.isFinite(rVariance) || rVariance < 0) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.INVALID_OBSERVATION, "Practice ability observation measurement is invalid");

  let meanLogWpm;
  let varianceLogWpm;
  let innovationLog = null;
  if ((state.evidence?.observationCount ?? 0) === 0) {
    meanLogWpm = y;
    varianceLogWpm = Math.max(rVariance, policy.estimator.initialSigmaLog ** 2);
  } else {
    const elapsedDays = clamp((observedAt - lastObservedAt) / DAY_MS, 0, policy.estimator.maximumProcessDays);
    const priorMean = state.estimate.meanLogWpm;
    const priorVariance = state.estimate.varianceLogWpm + policy.estimator.processVariancePerDay * elapsedDays;
    const predictiveVariance = priorVariance + rVariance;
    if (!Number.isFinite(priorMean) || !Number.isFinite(priorVariance) || priorVariance < 0 || !Number.isFinite(predictiveVariance) || predictiveVariance <= 0) throw abilityError(PRACTICE_ABILITY_ERROR_CODES.INVALID_STATE, "Practice ability prior is invalid");
    innovationLog = y - priorMean;
    const innovationLimit = policy.estimator.maximumInnovationZ * Math.sqrt(predictiveVariance);
    const clippedInnovation = clamp(innovationLog, -innovationLimit, innovationLimit);
    const kalmanGain = priorVariance / (priorVariance + rVariance);
    meanLogWpm = priorMean + kalmanGain * clippedInnovation;
    varianceLogWpm = Math.max(policy.estimator.minimumVarianceLog, (1 - kalmanGain) * priorVariance);
  }

  const priorEvidence = state.evidence;
  const observationCount = priorEvidence.observationCount + 1;
  const evidence = freezeDeep({
    observationCount,
    sessionCount: priorEvidence.sessionCount + 1,
    dayCount: priorEvidence.dayCount + (priorEvidence.lastObservedDayKey === observation.localDayKey ? 0 : 1),
    firstObservedAt: priorEvidence.firstObservedAt ?? observation.completedAtUtc,
    lastObservedAt: observation.completedAtUtc,
    lastObservedDayKey: observation.localDayKey,
    totalActiveDurationMs: priorEvidence.totalActiveDurationMs + observation.activeDurationMs,
    totalTypedCharacters: priorEvidence.totalTypedCharacters + observation.typedCharacterCount,
    downweightedObservationCount: priorEvidence.downweightedObservationCount + (observation.measurementSigmaLog > policy.uncertainty.downweightedSigmaThreshold ? 1 : 0),
    sourceRoleCounts: {
      ...priorEvidence.sourceRoleCounts,
      [observation.sourceRole]: (priorEvidence.sourceRoleCounts?.[observation.sourceRole] ?? 0) + 1,
    },
  });
  const recentObservations = [
    ...(state.recentObservations ?? []),
    compactRecentObservation(observation, innovationLog),
  ].slice(-policy.recentObservationLimit);
  return freezeDeep({
    ...state,
    updatedAt: observation.completedAtUtc,
    estimate: derivePracticeAbilityEstimate({ meanLogWpm, varianceLogWpm, evidence, policy }),
    evidence,
    recentObservations,
  });
}
