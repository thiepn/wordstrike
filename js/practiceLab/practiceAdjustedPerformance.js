import { PRACTICE_ABILITY_POLICY_V1, validatePracticeAbilityPolicy } from "./practiceAbilityPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function getPracticeDifficultyAdjustment(foundationAnalysis, policy = PRACTICE_ABILITY_POLICY_V1) {
  validatePracticeAbilityPolicy(policy);
  const summary = foundationAnalysis?.normalization?.sessionSummary?.textDifficulty
    ?? foundationAnalysis?.normalization?.textDifficulty?.score
    ?? null;
  const status = typeof summary?.status === "string" ? summary.status : "insufficient";
  const difficultyIndex = Number.isFinite(summary?.difficultyIndex) ? summary.difficultyIndex : null;
  const coverage = Number.isFinite(summary?.availableModelWeight) ? clamp(summary.availableModelWeight, 0, 1) : 0;
  let adjustment = 0;
  if (["full", "partial"].includes(status) && difficultyIndex != null) {
    adjustment = clamp(
      policy.difficulty.logCoefficient * difficultyIndex * coverage,
      -policy.difficulty.maxAbsoluteLogAdjustment,
      policy.difficulty.maxAbsoluteLogAdjustment,
    );
  }
  return freezeDeep({ status, difficultyIndex, coverage, adjustment });
}

export function calculatePracticeMeasurementUncertainty({
  activeDurationMs,
  accuracy,
  channelPolicy,
  difficulty,
  latencySummary,
  policy = PRACTICE_ABILITY_POLICY_V1,
} = {}) {
  validatePracticeAbilityPolicy(policy);
  if (!channelPolicy || !Number.isFinite(channelPolicy.durationReferenceFloorSeconds)) throw new TypeError("Adjusted Practice performance requires a channel uncertainty policy");
  const uncertainty = policy.uncertainty;
  const durationSeconds = activeDurationMs / 1000;
  const durationForSigma = clamp(
    durationSeconds,
    channelPolicy.durationReferenceFloorSeconds,
    uncertainty.durationReferenceCeilingSeconds,
  );
  const durationSigma = uncertainty.baseSigmaLogAt60Seconds
    * Math.sqrt(uncertainty.durationReferenceSeconds / durationForSigma);
  const accuracyRatio = clamp(accuracy / 100, 0, 1);
  const accuracyPenalty = 1 + uncertainty.accuracyPenaltySlope * Math.max(0, uncertainty.accuracyReference - accuracyRatio);
  const fluentMedian = latencySummary?.fluentMedianMs;
  const fluentMad = latencySummary?.fluentMadMs;
  const rhythmPenalty = Number.isFinite(fluentMedian) && fluentMedian > 0 && Number.isFinite(fluentMad) && fluentMad >= 0
    ? 1 + Math.min(uncertainty.maximumRhythmPenaltyExtra, fluentMad / fluentMedian)
    : uncertainty.missingRhythmPenalty;
  const difficultyPenalty = uncertainty.difficultyPenalties[difficulty.status] ?? uncertainty.difficultyPenalties.insufficient;
  const interruptionRate = latencySummary?.interruptionRate;
  const interruptionPenalty = Number.isFinite(interruptionRate) && interruptionRate >= 0
    ? 1 + Math.min(uncertainty.maximumInterruptionPenaltyExtra, uncertainty.interruptionPenaltySlope * interruptionRate)
    : 1;
  const tracePenalty = latencySummary?.coverage?.scope === "retained-window"
    ? uncertainty.tracePartialPenalty
    : 1;
  const sigma = clamp(
    durationSigma * accuracyPenalty * rhythmPenalty * difficultyPenalty * interruptionPenalty * tracePenalty,
    uncertainty.sigmaFloor,
    uncertainty.sigmaCeiling,
  );
  const reliabilityWeight = clamp(
    (uncertainty.reliabilityReferenceSigma / sigma) ** 2,
    uncertainty.reliabilityMinimum,
    uncertainty.reliabilityMaximum,
  );
  return freezeDeep({
    measurementSigmaLog: sigma,
    measurementVarianceLog: sigma ** 2,
    reliabilityWeight,
    components: {
      durationSigmaLog: durationSigma,
      accuracyPenalty,
      rhythmPenalty,
      difficultyPenalty,
      interruptionPenalty,
      tracePenalty,
    },
  });
}

export function buildPracticeAdjustedPerformanceObservation({
  wpm,
  rawWpm = null,
  accuracy,
  activeDurationMs,
  typedCharacterCount,
  foundationAnalysis,
  channelPolicy,
  policy = PRACTICE_ABILITY_POLICY_V1,
} = {}) {
  validatePracticeAbilityPolicy(policy);
  if (!Number.isFinite(wpm) || wpm <= 0) throw new TypeError("Adjusted Practice performance requires positive WPM");
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) throw new TypeError("Adjusted Practice performance requires bounded accuracy");
  if (!Number.isFinite(activeDurationMs) || activeDurationMs <= 0) throw new TypeError("Adjusted Practice performance requires positive active duration");
  if (!Number.isInteger(typedCharacterCount) || typedCharacterCount < 0) throw new TypeError("Adjusted Practice performance requires a non-negative typed-character count");
  const difficulty = getPracticeDifficultyAdjustment(foundationAnalysis, policy);
  const observedLogWpm = Math.log(wpm);
  const adjustedLogPerformance = observedLogWpm + difficulty.adjustment;
  const uncertainty = calculatePracticeMeasurementUncertainty({
    activeDurationMs,
    accuracy,
    channelPolicy,
    difficulty,
    latencySummary: foundationAnalysis?.latency?.sessionSummary ?? null,
    policy,
  });
  return freezeDeep({
    rawWpm: Number.isFinite(rawWpm) ? rawWpm : null,
    wpm,
    adjustedWpm: Math.exp(adjustedLogPerformance),
    adjustedLogPerformance,
    accuracy,
    activeDurationMs,
    typedCharacterCount,
    difficultyIndex: difficulty.difficultyIndex,
    difficultyAdjustmentLog: difficulty.adjustment,
    difficultyModelStatus: difficulty.status,
    difficultyCoverage: difficulty.coverage,
    measurementSigmaLog: uncertainty.measurementSigmaLog,
    measurementVarianceLog: uncertainty.measurementVarianceLog,
    reliabilityWeight: uncertainty.reliabilityWeight,
    uncertaintyComponents: uncertainty.components,
  });
}
