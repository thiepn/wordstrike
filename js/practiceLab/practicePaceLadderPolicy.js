import {
  PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
  PRACTICE_PACE_LADDER_POLICY_VERSION,
  PRACTICE_PACE_LADDER_RATIOS,
  PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
  PRACTICE_PACE_LADDER_RUNG_DURATION_MS,
  PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
} from "./practicePaceLadderConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export const PRACTICE_PACE_LADDER_POLICY_V1 = freezeDeep({
  version: PRACTICE_PACE_LADDER_POLICY_VERSION,
  anchorPolicyVersion: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
  referenceDurationMs: PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
  rungDurationMs: PRACTICE_PACE_LADDER_RUNG_DURATION_MS,
  totalActiveDurationMs: PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
  rungRatios: [...PRACTICE_PACE_LADDER_RATIOS],
  frontierMaximumAgeMs: 45 * 24 * 60 * 60 * 1000,
  frontierEligibleStatuses: ["bracketed", "lower-bound"],
  frontierEligibleConfidences: ["medium", "high"],
  calibrationMinimumForwardCharacters: 50,
  calibrationMinimumFirstPassAccuracy: 70,
  targetMinimumWpm: 5,
  targetMaximumWpm: 400,
  onPaceToleranceSeconds: 0.75,
  minimumStageDurationMs: 15_000,
  minimumStageForwardCharacters: 25,
  minimumStageFirstPassAccuracy: 70,
  minimumStageTimingTransitions: 10,
  minimumFrontierStages: 5,
  maximumStages: 9,
  maximumPaceSamplesPerStage: 800,
  maximumLatencySamplesPerStage: 800,
  formMinimumGraphemes: 9_000,
  formMaximumGraphemes: 12_000,
  targetFormCount: 8,
  minimumReadyForms: 4,
  formMinimumAvailableModelWeight: 0.90,
  slidingWindowGraphemes: 600,
  slidingWindowStrideGraphemes: 300,
  maximumWindowDifficultySpread: 0.60,
  minimumWindowDifficultyPercentile: 15,
  maximumWindowDifficultyPercentile: 85,
  maximumDigitRatio: 0.02,
  maximumSymbolRatio: 0.01,
  supportedLanguages: ["en"],
});

export function validatePracticePaceLadderPolicy(policy = PRACTICE_PACE_LADDER_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_PACE_LADDER_POLICY_VERSION || policy.anchorPolicyVersion !== PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION) throw new TypeError("Unsupported Pace Ladder policy version");
  if (policy.referenceDurationMs !== 30_000 || policy.rungDurationMs !== 20_000 || policy.totalActiveDurationMs !== 190_000) throw new TypeError("Pace Ladder protocol timing is invalid");
  if (JSON.stringify(policy.rungRatios) !== JSON.stringify(PRACTICE_PACE_LADDER_RATIOS)) throw new TypeError("Pace Ladder ratio protocol is invalid");
  if (policy.frontierMaximumAgeMs <= 0 || policy.calibrationMinimumForwardCharacters < 1 || policy.calibrationMinimumFirstPassAccuracy < 0 || policy.calibrationMinimumFirstPassAccuracy > 100) throw new TypeError("Pace Ladder anchor policy is invalid");
  if (policy.targetMinimumWpm <= 0 || policy.targetMaximumWpm <= policy.targetMinimumWpm || policy.onPaceToleranceSeconds <= 0) throw new TypeError("Pace Ladder guide policy is invalid");
  if (policy.minimumStageDurationMs <= 0 || policy.minimumStageForwardCharacters < 1 || policy.minimumFrontierStages < 5 || policy.maximumStages !== 9) throw new TypeError("Pace Ladder stage policy is invalid");
  return true;
}
