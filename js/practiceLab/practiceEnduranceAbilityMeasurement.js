import { PRACTICE_ABILITY_POLICY_V1 } from "./practiceAbilityPolicy.js";
import { estimatePracticeEnduranceAbility } from "./practiceEnduranceEstimator.js";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export function buildPracticeEnduranceAbilityMeasurement({ windowSnapshot, scoreRange = null } = {}) {
  const estimate = estimatePracticeEnduranceAbility({ windowSnapshot, scoreRange });
  if (!estimate.eligible) return null;
  const sigma = estimate.measurementSigmaLog;
  return Object.freeze({
    protocol: "endurance-check",
    wpm: estimate.effectiveWpm,
    rawWpm: estimate.rawEffectiveWpm,
    adjustedWpm: estimate.effectiveWpm,
    adjustedLogPerformance: estimate.adjustedLogPerformance,
    accuracy: estimate.pooledFirstPassAccuracy * 100,
    activeDurationMs: 180_000,
    typedCharacterCount: estimate.typedCharacterCount,
    measurementSigmaLog: sigma,
    measurementVarianceLog: sigma ** 2,
    reliabilityWeight: clamp((PRACTICE_ABILITY_POLICY_V1.uncertainty.reliabilityReferenceSigma / sigma) ** 2, PRACTICE_ABILITY_POLICY_V1.uncertainty.reliabilityMinimum, PRACTICE_ABILITY_POLICY_V1.uncertainty.reliabilityMaximum),
    difficultyIndex: null,
    difficultyAdjustmentLog: estimate.difficultyAdjustmentLog,
    difficultyModelStatus: estimate.difficultyCoverage >= 0.90 ? "full" : "insufficient",
    difficultyCoverage: estimate.difficultyCoverage,
  });
}
