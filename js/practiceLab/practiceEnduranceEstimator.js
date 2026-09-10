import { PRACTICE_ENDURANCE_ESTIMATOR_VERSION } from "./practiceEnduranceConstants.js";
import { PRACTICE_ENDURANCE_POLICY_V1 } from "./practiceEndurancePolicy.js";
import { analyzePracticeSustainedWindows, calculatePracticeEnduranceWindowSigma, pooledRatio } from "./practiceSustainedAnalysisCore.js";
import { clampPracticeSustained, practiceSustainedMad, practiceSustainedMedian } from "./practiceSustainedMath.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finite = Number.isFinite;

export function estimatePracticeEnduranceAbility({ windowSnapshot, scoreRange = null, policy = PRACTICE_ENDURANCE_POLICY_V1 } = {}) {
  const windows = analyzePracticeSustainedWindows({ snapshot: windowSnapshot, scoreRange, structuralMinimumWindowMs: policy.structuralMinimumWindowMs, structuralMinimumFirstPassOpportunities: policy.structuralMinimumFirstPassOpportunities, paceCoordinate: "effective" });
  const late = windows.filter((window) => policy.checkAbilityWindowOrdinals.includes(window.ordinal) && window.structuralValid && finite(window.adjustedLogPace));
  const pooledAccuracy = pooledRatio(late, "firstPassCorrectCount", "firstPassOpportunityCount");
  if (late.length < policy.minimumAbilityValidWindows || !finite(pooledAccuracy) || pooledAccuracy < policy.minimumAbilityPooledFirstPassAccuracy) {
    return freezeDeep({ estimatorVersion: PRACTICE_ENDURANCE_ESTIMATOR_VERSION, eligible: false, reason: late.length < policy.minimumAbilityValidWindows ? "insufficient-windows" : "accuracy-floor", validWindowCount: late.length, pooledFirstPassAccuracy: pooledAccuracy, windowOrdinals: late.map((window) => window.ordinal) });
  }
  const adjustedLogs = late.map((window) => window.adjustedLogPace);
  const adjustedLogPerformance = practiceSustainedMedian(adjustedLogs);
  const effectiveWpm = Math.exp(adjustedLogPerformance);
  const rawEffectiveWpm = practiceSustainedMedian(late.map((window) => window.firstPassEffectiveWpm));
  const sigmas = late.map(calculatePracticeEnduranceWindowSigma).filter(finite);
  const sigmaIndividual = practiceSustainedMedian(sigmas);
  const mad = practiceSustainedMad(adjustedLogs);
  const sigmaSpread = Math.max(1.4826 * (mad ?? 0), policy.uncertainty.spreadFloorLog);
  const sigmaEndurance = clampPracticeSustained(Math.sqrt((sigmaIndividual ** 2) / policy.uncertainty.effectiveSampleCount + sigmaSpread ** 2 + policy.uncertainty.protocolPenaltyLog ** 2), policy.uncertainty.sigmaFloorLog, policy.uncertainty.sigmaCeilingLog);
  const typedCharacterCount = Math.round(late.reduce((sum, window) => sum + window.firstPassOpportunityCount, 0));
  const difficultyCoverage = practiceSustainedMedian(late.map((window) => window.difficulty?.coverage).filter(finite)) ?? 0;
  const difficultyAdjustmentLog = finite(rawEffectiveWpm) && rawEffectiveWpm > 0 ? adjustedLogPerformance - Math.log(rawEffectiveWpm) : 0;
  return freezeDeep({
    estimatorVersion: PRACTICE_ENDURANCE_ESTIMATOR_VERSION,
    eligible: true,
    reason: null,
    validWindowCount: late.length,
    windowOrdinals: late.map((window) => window.ordinal),
    pooledFirstPassAccuracy: pooledAccuracy,
    adjustedLogPerformance,
    effectiveWpm,
    rawEffectiveWpm,
    typedCharacterCount,
    sigmaIndividual,
    sigmaSpread,
    measurementSigmaLog: sigmaEndurance,
    difficultyCoverage,
    difficultyAdjustmentLog,
    windows: late,
  });
}
