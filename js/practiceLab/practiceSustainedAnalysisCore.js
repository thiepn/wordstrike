import { PRACTICE_ABILITY_POLICY_V1, getPracticeAbilityChannelPolicy } from "./practiceAbilityPolicy.js";
import { calculatePracticeMeasurementUncertainty } from "./practiceAdjustedPerformance.js";
import { practiceSustainedMedian, practiceSustainedMad, practiceSustainedRobustVariation, clampPracticeSustained } from "./practiceSustainedMath.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finite = Number.isFinite;

export function getPracticeSustainedDifficultyAdjustment(textDifficulty) {
  const status = textDifficulty?.status ?? "insufficient";
  const difficultyIndex = finite(textDifficulty?.difficultyIndex) ? textDifficulty.difficultyIndex : null;
  const coverage = finite(textDifficulty?.availableModelWeight) ? clampPracticeSustained(textDifficulty.availableModelWeight, 0, 1) : 0;
  if (!["full", "partial"].includes(status) || difficultyIndex == null || coverage < 0.90) return freezeDeep({ status: "unadjusted", modelStatus: status, difficultyIndex, coverage, adjustmentLog: 0 });
  const adjustmentLog = clampPracticeSustained(PRACTICE_ABILITY_POLICY_V1.difficulty.logCoefficient * difficultyIndex * coverage, -PRACTICE_ABILITY_POLICY_V1.difficulty.maxAbsoluteLogAdjustment, PRACTICE_ABILITY_POLICY_V1.difficulty.maxAbsoluteLogAdjustment);
  return freezeDeep({ status: "adjusted", modelStatus: status, difficultyIndex, coverage, adjustmentLog });
}

export function analyzePracticeSustainedWindows({ snapshot, scoreRange = null, structuralMinimumWindowMs = 25_000, structuralMinimumFirstPassOpportunities = 25, paceCoordinate = "gross" } = {}) {
  const windows = (snapshot?.windows ?? []).map((window) => {
    const durationMinutes = window.durationMs / 60_000;
    const grossForwardWpm = durationMinutes > 0 ? (window.acceptedForwardInsertions / 5) / durationMinutes : null;
    const firstPassEffectiveWpm = durationMinutes > 0 ? (window.firstPassCorrectCount / 5) / durationMinutes : null;
    const firstPassAccuracy = window.firstPassOpportunityCount > 0 ? window.firstPassCorrectCount / window.firstPassOpportunityCount : null;
    const disfluencyRate = window.timingEligibleCount >= 10 ? window.disfluentCount / window.timingEligibleCount : null;
    const correctionCostRate = window.windowActiveMs > 0 ? window.correctionCostMs / window.windowActiveMs : null;
    const structuralValid = window.durationMs >= structuralMinimumWindowMs && window.firstPassOpportunityCount >= structuralMinimumFirstPassOpportunities;
    const textDifficulty = structuralValid && typeof scoreRange === "function" && Number.isInteger(window.expectedTextStartIndex) && Number.isInteger(window.expectedTextEndIndex) && window.expectedTextEndIndex > window.expectedTextStartIndex
      ? scoreRange(window.expectedTextStartIndex, window.expectedTextEndIndex)
      : null;
    const difficulty = getPracticeSustainedDifficultyAdjustment(textDifficulty);
    const pace = paceCoordinate === "effective" ? firstPassEffectiveWpm : grossForwardWpm;
    const adjustedLogPace = structuralValid && finite(pace) && pace > 0 ? Math.log(pace) + difficulty.adjustmentLog : null;
    return freezeDeep({ ...window, structuralValid, grossForwardWpm, firstPassEffectiveWpm, firstPassAccuracy, disfluencyRate, correctionCostRate, textDifficulty, difficulty, adjustedLogPace });
  });
  return freezeDeep(windows);
}

export function summarizePracticeSustainedVariation(windows = []) {
  const valid = windows.filter((window) => window.structuralValid && finite(window.adjustedLogPace));
  const points = valid.map((window) => ({ x: (window.startMs + window.durationMs / 2) / 60_000, y: window.adjustedLogPace }));
  const variation = practiceSustainedRobustVariation(points);
  const spanMinutes = points.length > 1 ? points.at(-1).x - points[0].x : 0;
  const drift = finite(variation.slopeLogPerMinute) ? Math.exp(variation.slopeLogPerMinute * spanMinutes) - 1 : null;
  return freezeDeep({ validWindowCount: valid.length, points, ...variation, spanMinutes, drift, driftPercent: drift == null ? null : 100 * drift, medianAdjustedWpm: valid.length ? Math.exp(practiceSustainedMedian(valid.map((window) => window.adjustedLogPace))) : null });
}

export function robustMadPp(values = []) {
  const clean = values.filter(finite);
  const mad = practiceSustainedMad(clean);
  return mad == null ? null : 1.4826 * mad * 100;
}

export function pooledRatio(windows = [], numeratorKey, denominatorKey) {
  const usable = windows.filter((window) => finite(window?.[numeratorKey]) && finite(window?.[denominatorKey]) && window[denominatorKey] > 0);
  if (!usable.length) return null;
  const numerator = usable.reduce((sum, window) => sum + window[numeratorKey], 0);
  const denominator = usable.reduce((sum, window) => sum + window[denominatorKey], 0);
  return denominator > 0 ? numerator / denominator : null;
}

export function calculatePracticeEnduranceWindowSigma(window) {
  if (!window?.structuralValid || !finite(window.firstPassAccuracy)) return null;
  const channelPolicy = getPracticeAbilityChannelPolicy("endurance");
  const difficulty = { status: window.difficulty?.modelStatus ?? "insufficient" };
  const uncertainty = calculatePracticeMeasurementUncertainty({
    activeDurationMs: window.durationMs,
    accuracy: window.firstPassAccuracy * 100,
    channelPolicy,
    difficulty,
    latencySummary: { interruptionRate: 0, fluentMedianMs: null, fluentMadMs: null },
  });
  return uncertainty.measurementSigmaLog;
}
