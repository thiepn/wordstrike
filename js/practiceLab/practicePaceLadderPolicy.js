import {
  PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
  PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS,
  PRACTICE_PACE_LADDER_POLICY_VERSION,
  PRACTICE_PACE_LADDER_RATIOS,
  PRACTICE_PACE_LADDER_STAGE_DURATION_MS,
  PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
  PRACTICE_PACE_LADDER_VALIDATION_DURATION_MS,
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
  calibrationDurationMs: PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS,
  referenceDurationMs: PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS,
  stageDurationMs: PRACTICE_PACE_LADDER_STAGE_DURATION_MS,
  rungDurationMs: PRACTICE_PACE_LADDER_STAGE_DURATION_MS,
  validationDurationMs: PRACTICE_PACE_LADDER_VALIDATION_DURATION_MS,
  totalActiveDurationMs: PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS,
  rungRatios: [...PRACTICE_PACE_LADDER_RATIOS],
  targetMinimumWpm: 5,
  targetMaximumWpm: 400,
  calibrationMinimumUsableSeconds: 20,
  calibrationMinimumCorrectedCharacters: 80,
  minimumStageUsableSeconds: 20,
  minimumStageCorrectedCharacters: 80,
  minimumFrontierStages: 5,
  maximumStages: 7,
  pauseSampleCapacity: 128,
  longPauseThresholdMs: 1_000,
  paceLowerRatio: 0.90,
  paceUpperRatio: 1.10,
  minimumAbsoluteAccuracy: PRACTICE_FRONTIER_POLICY_V1.minimumAbsoluteAccuracy,
  maximumAccuracyDropPp: PRACTICE_FRONTIER_POLICY_V1.maximumAccuracyDropPp,
  maximumCorrectionGrowth: PRACTICE_FRONTIER_POLICY_V1.maximumCorrectionCostIncrease,
  maximumPauseGrowth: PRACTICE_FRONTIER_POLICY_V1.maximumDisfluencyIncrease,
  maximumRhythmGrowthRatio: 0.20,
  practiceBandLowRatio: 0.90,
  practiceBandHighRatio: 1.00,
  formMinimumGraphemes: 2_500,
  formMaximumGraphemes: 12_000,
  targetFormCount: 8,
  minimumReadyForms: 8,
  formMinimumAvailableModelWeight: 0.90,
  supportedLanguages: ["en"],
});

export function validatePracticePaceLadderPolicy(policy = PRACTICE_PACE_LADDER_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_PACE_LADDER_POLICY_VERSION || policy.anchorPolicyVersion !== PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION) throw new TypeError("Unsupported Pace Ladder policy version");
  if (policy.calibrationDurationMs !== 25_000 || policy.stageDurationMs !== 25_000 || policy.validationDurationMs !== 40_000 || policy.totalActiveDurationMs !== 190_000) throw new TypeError("Pace Ladder protocol timing is invalid");
  if (JSON.stringify(policy.rungRatios) !== JSON.stringify([0.85, 0.95, 1.05, 1.15, 1.25])) throw new TypeError("Pace Ladder ratio protocol is invalid");
  if (Math.max(...policy.rungRatios) > 1.25 || policy.rungRatios.length !== 5) throw new TypeError("Pace Ladder must contain five bounded main stages");
  if (policy.calibrationMinimumUsableSeconds !== 20 || policy.calibrationMinimumCorrectedCharacters !== 80) throw new TypeError("Pace Ladder calibration eligibility is invalid");
  if (policy.minimumFrontierStages !== 5 || policy.maximumStages !== 7) throw new TypeError("Pace Ladder stage admission is invalid");
  if (policy.targetMinimumWpm <= 0 || policy.targetMaximumWpm <= policy.targetMinimumWpm) throw new TypeError("Pace Ladder target bounds are invalid");
  return true;
}
