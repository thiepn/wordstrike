import { PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import { createPracticeLearningStateId, createSkillStatId } from "./practiceIds.js";
import {
  PRACTICE_LEARNING_CURVE_VERSION,
  PRACTICE_LEARNING_MODEL_VERSION,
  PRACTICE_LEARNING_POLICY_VERSION,
} from "./practiceLearningConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createEmptyPracticeLearningCurve() {
  return freezeDeep({
    curveVersion: PRACTICE_LEARNING_CURVE_VERSION,
    status: "insufficient-data",
    confidence: "none",
    scope: "full-history",
    pointCount: 0,
    sessionCount: 0,
    dayCount: 0,
    minimumDose: null,
    maximumDose: null,
    doseSpan: 0,
    medianSlopePointsPerDose: null,
    slopeP10: null,
    slopeP90: null,
    improvingPairFraction: null,
    worseningPairFraction: null,
    fitResidualMad: null,
    firstQuality: null,
    recentQuality: null,
    recentSlopePointsPerDose: null,
    recentConfidence: "none",
    marginalGainStatus: "unknown",
    medianPracticeGain: null,
    practiceGainMad: null,
  });
}

export function createDefaultPracticeLearningState({
  profileId,
  contextId,
  entityType,
  entityKey,
  statId = createSkillStatId(profileId, contextId, entityType, entityKey),
  now = () => new Date(),
} = {}) {
  const time = typeof now === "function" ? now() : now;
  const timestamp = (time instanceof Date ? time : new Date(time)).toISOString();
  const emptyCurve = createEmptyPracticeLearningCurve();
  return freezeDeep({
    learningStateId: createPracticeLearningStateId(profileId, contextId, entityType, entityKey),
    statId,
    profileId,
    contextId,
    entityType,
    entityKey,
    recordVersion: PRACTICE_RECORD_VERSIONS.learningState,
    modelVersion: PRACTICE_LEARNING_MODEL_VERSION,
    policyVersion: PRACTICE_LEARNING_POLICY_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    acquisition: {
      cumulativeTargetOpportunities: 0,
      cumulativeDoseUnits: 0,
      observationCount: 0,
      sessionCount: 0,
      dayCount: 0,
      firstObservedAt: null,
      lastObservedAt: null,
      lastObservedDayKey: null,
      observations: [],
      curve: emptyCurve,
    },
    transfer: {
      observationCount: 0,
      sessionCount: 0,
      dayCount: 0,
      firstObservedAt: null,
      lastObservedAt: null,
      lastObservedDayKey: null,
      observations: [],
      curve: emptyCurve,
    },
    evidence: {
      partialObservationCount: 0,
      completeObservationCount: 0,
      skippedObservationCount: 0,
      lastExperimentId: null,
      lastUpdatedFromSessionId: null,
    },
  });
}
