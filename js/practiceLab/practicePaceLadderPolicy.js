import {
  PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
  PRACTICE_PACE_LADDER_FRONTIER_MIN_STAGE_POINTS,
  PRACTICE_PACE_LADDER_PACE_BAND_SECONDS,
  PRACTICE_PACE_LADDER_POLICY_VERSION,
  PRACTICE_PACE_LADDER_RATIOS,
  PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS,
  PRACTICE_PACE_LADDER_REFERENCE_MIN_FIRST_PASS_ACCURACY,
  PRACTICE_PACE_LADDER_REFERENCE_MIN_INSERTIONS,
  PRACTICE_PACE_LADDER_RUNG_DURATION_MS,
  PRACTICE_PACE_LADDER_TARGET_PRECISION_WPM,
  PRACTICE_PACE_LADDER_TARGET_WPM_MAX,
  PRACTICE_PACE_LADDER_TARGET_WPM_MIN,
  PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
} from "./practicePaceLadderConstants.js";
import { PRACTICE_FRONTIER_POLICY_V1 } from "./practicePerformancePolicy.js";

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
  targetMinimumWpm: PRACTICE_PACE_LADDER_TARGET_WPM_MIN,
  targetMaximumWpm: PRACTICE_PACE_LADDER_TARGET_WPM_MAX,
  targetPrecisionWpm: PRACTICE_PACE_LADDER_TARGET_PRECISION_WPM,
  referenceMinimumUsableSeconds: 28,
  referenceMinimumAcceptedForwardInsertions: PRACTICE_PACE_LADDER_REFERENCE_MIN_INSERTIONS,
  referenceMinimumFirstPassAccuracy: PRACTICE_PACE_LADDER_REFERENCE_MIN_FIRST_PASS_ACCURACY,
  minimumStageUsableSeconds: 18,
  minimumStageAcceptedForwardInsertions: 30,
  minimumFrontierStages: PRACTICE_PACE_LADDER_FRONTIER_MIN_STAGE_POINTS,
  maximumStages: 9,
  pauseSampleCapacity: 128,
  longPauseThresholdMs: 1_000,
  paceBandSeconds: PRACTICE_PACE_LADDER_PACE_BAND_SECONDS,
  paceLowerRatio: 0.90,
  paceUpperRatio: 1.10,
  minimumAbsoluteAccuracy: PRACTICE_FRONTIER_POLICY_V1.minimumAbsoluteAccuracy,
  maximumAccuracyDropPp: PRACTICE_FRONTIER_POLICY_V1.maximumAccuracyDropPp,
  maximumCorrectionGrowth: PRACTICE_FRONTIER_POLICY_V1.maximumCorrectionCostIncrease,
  maximumPauseGrowth: PRACTICE_FRONTIER_POLICY_V1.maximumDisfluencyIncrease,
  maximumRhythmGrowthRatio: 0.20,
  practiceBandLowRatio: 0.90,
  practiceBandHighRatio: 1.00,
  slidingWindowGraphemes: 600,
  slidingWindowStrideGraphemes: 300,
  minimumWindowDifficultyPercentile: 15,
  maximumWindowDifficultyPercentile: 85,
  maximumWindowDifficultySpread: 0.50,
  maximumDigitRatio: 0.02,
  maximumSymbolRatio: 0.01,
  formMinimumGraphemes: 9_000,
  formMaximumGraphemes: 12_000,
  targetFormCount: 8,
  minimumReadyForms: 4,
  formMinimumAvailableModelWeight: 0.90,
  supportedLanguages: ["en"],
});

export function validatePracticePaceLadderPolicy(policy = PRACTICE_PACE_LADDER_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_PACE_LADDER_POLICY_VERSION || policy.anchorPolicyVersion !== PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION) throw new TypeError("Unsupported Pace Ladder policy version");
  if (policy.referenceDurationMs !== 30_000 || policy.rungDurationMs !== 20_000 || policy.totalActiveDurationMs !== 190_000) throw new TypeError("Pace Ladder protocol timing is invalid");
  if (JSON.stringify(policy.rungRatios) !== JSON.stringify([0.75, 0.85, 0.95, 1.05, 1.15, 1.25, 1.10, 0.90])) throw new TypeError("Pace Ladder ratio protocol is invalid");
  if (policy.referenceMinimumAcceptedForwardInsertions !== 50 || policy.referenceMinimumFirstPassAccuracy !== 0.70) throw new TypeError("Pace Ladder reference eligibility is invalid");
  if (policy.minimumFrontierStages !== 5 || policy.maximumStages !== 9) throw new TypeError("Pace Ladder stage admission is invalid");
  if (policy.paceBandSeconds !== 0.75 || policy.targetPrecisionWpm !== 0.1) throw new TypeError("Pace Ladder guide/target precision is invalid");
  if (policy.targetMinimumWpm !== 5 || policy.targetMaximumWpm !== 400) throw new TypeError("Pace Ladder target bounds are invalid");
  return true;
}
