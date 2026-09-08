import { PRACTICE_ABILITY_POLICY_V1 } from "./practiceAbilityPolicy.js";
import { PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION } from "./practicePaceLadderConstants.js";
import { PRACTICE_PACE_LADDER_POLICY_V1 } from "./practicePaceLadderPolicy.js";

const freeze = (value) => Object.freeze(value);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function ageMs(updatedAt, now) {
  const updated = Date.parse(updatedAt ?? "");
  const currentValue = typeof now === "function" ? now() : now;
  const current = (currentValue instanceof Date ? currentValue : new Date(currentValue ?? Date.now())).getTime();
  return Number.isFinite(updated) && Number.isFinite(current) ? Math.max(0, current - updated) : Infinity;
}

export function calculatePracticePaceLadderDifficultyAdjustment(formTypability) {
  const status = formTypability?.status ?? "insufficient";
  const difficultyIndex = Number.isFinite(formTypability?.difficultyIndex) ? formTypability.difficultyIndex : null;
  const coverage = Number.isFinite(formTypability?.availableModelWeight) ? clamp(formTypability.availableModelWeight, 0, 1) : 0;
  if (!["full", "partial"].includes(status) || difficultyIndex == null || coverage <= 0) {
    return freeze({ status: "unadjusted", adjustmentLog: 0, difficultyIndex, coverage });
  }
  const adjustmentLog = clamp(
    PRACTICE_ABILITY_POLICY_V1.difficulty.logCoefficient * difficultyIndex * coverage,
    -PRACTICE_ABILITY_POLICY_V1.difficulty.maxAbsoluteLogAdjustment,
    PRACTICE_ABILITY_POLICY_V1.difficulty.maxAbsoluteLogAdjustment,
  );
  return freeze({ status: "adjusted", adjustmentLog, difficultyIndex, coverage });
}

export function resolvePracticePaceLadderAnchor({
  controlFrontier = null,
  formTypability = null,
  now = () => new Date(),
  policy = PRACTICE_PACE_LADDER_POLICY_V1,
} = {}) {
  const eligible = policy.frontierEligibleStatuses.includes(controlFrontier?.status)
    && policy.frontierEligibleConfidences.includes(controlFrontier?.confidence)
    && Number.isFinite(controlFrontier?.frontierWpm)
    && controlFrontier.frontierWpm > 0
    && ageMs(controlFrontier.updatedAt, now) <= policy.frontierMaximumAgeMs;
  if (!eligible) return freeze({
    version: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
    source: "in-session-calibration",
    frontierStatus: controlFrontier?.status ?? "unmeasured",
    frontierConfidence: controlFrontier?.confidence ?? "none",
    frontierUpdatedAt: controlFrontier?.updatedAt ?? null,
    adjustedReferenceWpm: null,
    rawReferenceWpm: null,
    difficultyAdjustmentStatus: "pending-calibration",
    difficultyAdjustmentLog: null,
  });
  const adjustment = calculatePracticePaceLadderDifficultyAdjustment(formTypability);
  const canAdjust = formTypability?.availableModelWeight >= policy.formMinimumAvailableModelWeight && adjustment.status === "adjusted";
  const adjustmentLog = canAdjust ? adjustment.adjustmentLog : 0;
  return freeze({
    version: PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION,
    source: "control-frontier",
    frontierStatus: controlFrontier.status,
    frontierConfidence: controlFrontier.confidence,
    frontierUpdatedAt: controlFrontier.updatedAt ?? null,
    adjustedReferenceWpm: controlFrontier.frontierWpm,
    rawReferenceWpm: controlFrontier.frontierWpm * Math.exp(-adjustmentLog),
    difficultyAdjustmentStatus: canAdjust ? "adjusted" : "unadjusted",
    difficultyAdjustmentLog: adjustmentLog,
  });
}

export function resolvePracticePaceLadderCalibration({
  acceptedForwardCharacters,
  correctFirstPassAttempts,
  allFirstPassAttempts,
  activeDurationMs,
  policy = PRACTICE_PACE_LADDER_POLICY_V1,
} = {}) {
  const firstPassAccuracy = allFirstPassAttempts > 0 ? 100 * correctFirstPassAttempts / allFirstPassAttempts : null;
  const grossForwardWpm = activeDurationMs > 0
    ? (acceptedForwardCharacters / 5) / (activeDurationMs / 60_000)
    : null;
  const eligible = Number.isInteger(acceptedForwardCharacters)
    && acceptedForwardCharacters >= policy.calibrationMinimumForwardCharacters
    && Number.isFinite(firstPassAccuracy)
    && firstPassAccuracy >= policy.calibrationMinimumFirstPassAccuracy
    && Number.isFinite(grossForwardWpm)
    && grossForwardWpm > 0;
  return freeze({
    eligible,
    status: eligible ? "resolved" : "calibration-insufficient",
    acceptedForwardCharacters: Number.isInteger(acceptedForwardCharacters) ? acceptedForwardCharacters : 0,
    firstPassAccuracy,
    rawReferenceWpm: eligible ? grossForwardWpm : null,
  });
}
