import { PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION } from "./practiceAccuracyRecoveryConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };

export const PRACTICE_ACCURACY_RECOVERY_POLICY_V1 = freezeDeep({
  version: PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION,
  recommendations: {
    maximum: 8,
    mixedMinimumSeverity: 35,
    primaryStatuses: ["confirmed", "likely"],
    secondaryStatus: "possible",
    preferredMasteryStages: ["Learning", "Acquired"],
    deemphasizedMasteryStages: ["Robust", "Retained"],
    deemphasizedSaturation: ["likely", "supported"],
  },
  content: {
    controlTypabilityPercentile: [20, 60],
    minimumNeutralUnitsPerTargetUnit: 1,
  },
  feedback: {
    displayDurationMs: 700,
    cooldownMs: 1000,
  },
  recovery: {
    limitedMaximumCorrectedEpisodes: 2,
    usableMinimumCorrectedEpisodes: 3,
  },
  interpretation: {
    cleanerAccuracyDeltaPp: 3,
    preservedTimingRatioMaximum: 0.05,
    clearlySlowerTimingRatioMinimum: 0.10,
  },
});

export function validatePracticeAccuracyRecoveryPolicy(policy = PRACTICE_ACCURACY_RECOVERY_POLICY_V1) {
  return Boolean(policy
    && policy.version === PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION
    && policy.recommendations.maximum === 8
    && policy.feedback.displayDurationMs === 700
    && policy.feedback.cooldownMs === 1000
    && policy.recovery.usableMinimumCorrectedEpisodes === 3);
}
