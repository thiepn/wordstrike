import {
  PRACTICE_FRONTIER_POLICY_VERSION,
  PRACTICE_PERFORMANCE_STATE_POLICY_VERSION,
} from "./practicePerformanceConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export const PRACTICE_STATE_PROBE_POLICY_V1 = freezeDeep({
  version: PRACTICE_PERFORMANCE_STATE_POLICY_VERSION,
  stateTtlMs: 4 * 60 * 60 * 1000,
  minimumDurationMs: 20_000,
  maximumDurationMs: 120_000,
  minimumTypedCharacters: 50,
  minimumAccuracy: 70,
  requiresUntargetedContent: true,
  requiresCorrectionAllowed: true,
  allowedCompletionReasons: ["time-complete", "content-complete"],
  allowedEvidenceRoles: ["training", "diagnostic", "transfer", "benchmark"],
  maximumCombinedSigmaLogForClassification: 0.20,
  minimumStateRelativeDelta: 0.03,
  stateZThreshold: 0.75,
  personalAccuracyObservationLimit: 16,
  minimumPersonalAccuracyObservations: 3,
  maximumPreservedAccuracyDropPp: 2,
  minimumPreservedAccuracy: 85,
});

export const PRACTICE_WARMUP_POLICY_V1 = freezeDeep({
  version: 1,
  minimumProbeDurationMs: 45_000,
  windowDurationMs: 15_000,
  maximumAnalysisDurationMs: 90_000,
  minimumFirstPassAttemptsPerWindow: 10,
  lateWindowCount: 2,
  maximumObservationsPerChannel: 24,
  minimumModelObservations: 4,
  minimumModelDays: 3,
  minimumMeaningfulWarmupGain: 0.02,
  maximumCleanAccuracyDropPp: 2,
  stablePaceRelativeTolerance: 0.03,
  stableAccuracyDropPp: 1,
  highConfidenceObservations: 8,
  highConfidenceDays: 5,
  highConfidenceMaximumGainMadLog: 0.03,
  highConfidenceMinimumPlateauFraction: 0.60,
});

export const PRACTICE_FRONTIER_POLICY_V1 = freezeDeep({
  version: PRACTICE_FRONTIER_POLICY_VERSION,
  channel: "controlled-speed",
  minimumStageDurationMs: 10_000,
  minimumStageCharacters: 25,
  minimumStageAccuracy: 70,
  maximumStagesPerSession: 12,
  maximumPersistedPoints: 64,
  minimumValidPoints: 5,
  minimumAbsoluteSpeedRangeWpm: 15,
  minimumRelativeSpeedRange: 0.15,
  speedBinWpm: 5,
  lowSpeedBaselineFraction: 0.40,
  minimumBaselineBins: 2,
  minimumBaselineAccuracy: 85,
  maximumAccuracyDropPp: 2,
  maximumDisfluencyIncrease: 0.05,
  maximumCorrectionCostIncrease: 0.05,
  minimumAbsoluteAccuracy: 90,
  sustainedFailureBins: 2,
  allowedEvidenceRoles: ["diagnostic", "benchmark", "training"],
  highConfidenceMinimumPoints: 8,
  highConfidenceMinimumSessions: 2,
  highConfidenceMinimumSpeedRangeWpm: 25,
  mediumConfidenceMinimumPoints: 5,
  mediumConfidenceMinimumSpeedRangeWpm: 15,
});

export function validatePracticePerformancePolicies({
  state = PRACTICE_STATE_PROBE_POLICY_V1,
  warmup = PRACTICE_WARMUP_POLICY_V1,
  frontier = PRACTICE_FRONTIER_POLICY_V1,
} = {}) {
  if (state?.version !== PRACTICE_PERFORMANCE_STATE_POLICY_VERSION) throw new TypeError("Unsupported Practice performance-state policy version");
  if (state.stateTtlMs <= 0 || state.minimumDurationMs <= 0 || state.maximumDurationMs <= state.minimumDurationMs || state.minimumTypedCharacters < 1 || state.minimumAccuracy < 0 || state.minimumAccuracy > 100) throw new TypeError("Practice state-probe policy bounds are invalid");
  if (state.maximumCombinedSigmaLogForClassification <= 0 || state.minimumStateRelativeDelta < 0 || state.stateZThreshold <= 0) throw new TypeError("Practice state classification policy is invalid");
  if (state.minimumPersonalAccuracyObservations < 1 || state.personalAccuracyObservationLimit < state.minimumPersonalAccuracyObservations || state.maximumPreservedAccuracyDropPp < 0 || state.minimumPreservedAccuracy < 0 || state.minimumPreservedAccuracy > 100) throw new TypeError("Practice state control policy is invalid");
  if (warmup?.version !== 1 || warmup.minimumProbeDurationMs < warmup.windowDurationMs * 2 || warmup.maximumAnalysisDurationMs < warmup.minimumProbeDurationMs || warmup.minimumFirstPassAttemptsPerWindow < 1 || warmup.maximumObservationsPerChannel < warmup.minimumModelObservations) throw new TypeError("Practice warm-up policy is invalid");
  if (warmup.minimumModelDays < 1 || warmup.minimumMeaningfulWarmupGain < 0 || warmup.stablePaceRelativeTolerance < 0 || warmup.maximumCleanAccuracyDropPp < 0) throw new TypeError("Practice warm-up model policy is invalid");
  if (frontier?.version !== PRACTICE_FRONTIER_POLICY_VERSION || frontier.channel !== "controlled-speed") throw new TypeError("Unsupported Practice frontier policy version/channel");
  if (frontier.minimumStageDurationMs <= 0 || frontier.minimumStageCharacters < 1 || frontier.maximumStagesPerSession < 1 || frontier.maximumPersistedPoints < frontier.minimumValidPoints) throw new TypeError("Practice frontier stage policy is invalid");
  if (frontier.minimumAbsoluteSpeedRangeWpm <= 0 || frontier.minimumRelativeSpeedRange <= 0 || frontier.speedBinWpm <= 0 || frontier.lowSpeedBaselineFraction <= 0 || frontier.lowSpeedBaselineFraction > 1) throw new TypeError("Practice frontier range policy is invalid");
  if (frontier.maximumAccuracyDropPp <= 0 || frontier.maximumDisfluencyIncrease <= 0 || frontier.maximumCorrectionCostIncrease <= 0 || frontier.minimumAbsoluteAccuracy < 0 || frontier.minimumAbsoluteAccuracy > 100) throw new TypeError("Practice frontier control policy is invalid");
  return true;
}
