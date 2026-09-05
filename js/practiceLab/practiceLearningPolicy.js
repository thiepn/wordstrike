import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";
import { PRACTICE_LEARNING_POLICY_VERSION } from "./practiceLearningConstants.js";

export const PRACTICE_LEARNING_POLICY_V1 = Object.freeze({
  version: PRACTICE_LEARNING_POLICY_VERSION,
  doseScales: Object.freeze({ key: 80, bigram: 50, trigram: 35, word: 15 }),
  quality: Object.freeze({
    weights: PRACTICE_MASTERY_POLICY_V1.roleQuality.weights,
    minimumAvailableWeight: PRACTICE_MASTERY_POLICY_V1.roleQuality.minimumAvailableWeight,
  }),
  phase: Object.freeze({
    minimumSessionOpportunities: Object.freeze({ key: 12, bigram: 9, trigram: 6, word: 6 }),
    minimumPhaseSize: Object.freeze({ key: 4, bigram: 3, trigram: 2, word: 2 }),
    maxDirectTargets: 32,
  }),
  transfer: Object.freeze({
    minimumOpportunities: Object.freeze({ key: 15, bigram: 10, trigram: 6, word: 3 }),
    maxObservationsPerSession: 256,
  }),
  rings: Object.freeze({ acquisition: 24, transfer: 16 }),
  acquisitionCurve: Object.freeze({
    historicalWindow: 12,
    recentWindow: 5,
    recentMinimumPoints: 4,
    minimumPoints: 4,
    minimumDays: 2,
    minimumDoseSpan: 1,
    meaningfulGainPerDose: 2,
    flatGainPerDose: 1,
    improvingPairFraction: 0.65,
    worseningPairFraction: 0.65,
    medium: Object.freeze({ points: 6, days: 2, doseSpan: 1.5, maxResidualMad: 15 }),
    high: Object.freeze({ points: 8, days: 3, doseSpan: 2.5, maxResidualMad: 10 }),
  }),
  transferCurve: Object.freeze({
    historicalWindow: 12,
    recentWindow: 5,
    recentMinimumPoints: 3,
    minimumPoints: 3,
    minimumDays: 2,
    minimumDoseSpan: 1,
    meaningfulGainPerDose: 2,
    flatGainPerDose: 1,
    improvingPairFraction: 0.65,
    worseningPairFraction: 0.65,
    medium: Object.freeze({ points: 4, days: 2, doseSpan: 1.5, maxResidualMad: 15 }),
    high: Object.freeze({ points: 6, days: 3, doseSpan: 2.5, maxResidualMad: 10 }),
  }),
  marginalGain: Object.freeze({ high: 4, moderate: 2, negative: -1 }),
  practiceGain: Object.freeze({ window: 5, minimumPoints: 3, reacquisitionThreshold: 5, acquisitionPlateauMaximum: 3 }),
  saturation: Object.freeze({
    resolvedQuality: 80,
    highQualityCeiling: 90,
    highQualityCeilingSessions: 3,
    possible: Object.freeze({ observations: 5, days: 2, doseSpan: 1.5, recentGainMaximum: 1, qualityMaximum: 80 }),
    likely: Object.freeze({ observations: 6, days: 3, doseSpan: 2.5, recentGainMinimum: -1, recentGainMaximum: 1 }),
    supportedTransfer: Object.freeze({ observations: 3, days: 2, qualityMaximum: 80, gainMaximum: 1 }),
    transferLimitedQuality: 70,
    overload: Object.freeze({ entryMedianBelow: 40, exitMedianBelow: 50, recentWindow: 3 }),
  }),
  abilityCurve: Object.freeze({
    minimumObservations: 6,
    minimumDays: 3,
    minimumSpanDays: 7,
    improvingWeeklyRelativeGain: 0.01,
    decliningWeeklyRelativeGain: -0.01,
    stableWeeklyRelativeGain: 0.005,
    pairFraction: 0.65,
    medium: Object.freeze({ observations: 6, days: 3, spanDays: 7, maxMedianSigmaLog: 0.15 }),
    high: Object.freeze({ observations: 8, days: 4, spanDays: 14, maxMedianSigmaLog: 0.12 }),
  }),
  globalPlateau: Object.freeze({
    recentDoseDays: 14,
    possibleDoseUnits: 5,
    possibleTrainingDays: 3,
    supportedDoseUnits: 8,
    supportedTrainingDays: 4,
    supportedMinimumEntitySignals: 2,
  }),
  snapshot: Object.freeze({ maxSaturationCandidates: 16 }),
});

export function validatePracticeLearningPolicy(policy = PRACTICE_LEARNING_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_LEARNING_POLICY_VERSION) throw new TypeError("Unsupported Practice learning policy version");
  if (Object.values(policy.doseScales ?? {}).some((value) => !Number.isFinite(value) || value <= 0)) throw new TypeError("Practice learning dose scales must be positive");
  const qualityWeight = Object.values(policy.quality?.weights ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (Math.abs(qualityWeight - 1) > 1e-12) throw new TypeError("Practice learning quality weights must sum to one");
  if (policy.quality.minimumAvailableWeight !== 0.60) throw new TypeError("Practice learning quality coverage threshold must remain 0.60 in v1");
  return policy;
}
