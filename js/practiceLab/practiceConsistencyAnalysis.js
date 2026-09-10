import { PRACTICE_CONSISTENCY_ANALYSIS_VERSION, PRACTICE_CONSISTENCY_RESULT_VERSION } from "./practiceConsistencyConstants.js";
import { PRACTICE_CONSISTENCY_POLICY_V1 } from "./practiceConsistencyPolicy.js";
import { analyzePracticeSustainedWindows, robustMadPp, summarizePracticeSustainedVariation } from "./practiceSustainedAnalysisCore.js";
import { practiceSustainedMedian } from "./practiceSustainedMath.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const finite = Number.isFinite;

function pacePattern(variation, drift, policy) {
  if (!finite(variation) || !finite(drift)) return "insufficient";
  const absDrift = Math.abs(drift);
  if (variation <= policy.lowVariationMaximum && absDrift <= policy.smallDriftMaximum) return "steady";
  if (variation >= policy.highVariationMinimum && absDrift >= policy.materialDriftMinimum) return "mixed";
  if (drift >= policy.materialDriftMinimum && variation < policy.highVariationMinimum) return "drifting-faster";
  if (drift <= -policy.materialDriftMinimum && variation < policy.highVariationMinimum) return "drifting-slower";
  if (variation >= policy.highVariationMinimum && absDrift < policy.materialDriftMinimum) return "variable";
  return "borderline";
}

function controlStability(metrics, policy) {
  const available = [metrics.accuracyMADpp, metrics.disfluencyMADpp, metrics.correctionCostMADpp].filter(finite);
  if (!available.length) return "insufficient";
  if ((finite(metrics.accuracyMADpp) && metrics.accuracyMADpp >= policy.controlVariable.accuracyMADpp) || (finite(metrics.disfluencyMADpp) && metrics.disfluencyMADpp >= policy.controlVariable.disfluencyMADpp) || (finite(metrics.correctionCostMADpp) && metrics.correctionCostMADpp >= policy.controlVariable.correctionCostMADpp)) return "variable";
  const reliable = finite(metrics.accuracyMADpp) && finite(metrics.disfluencyMADpp) && finite(metrics.correctionCostMADpp);
  if (reliable && metrics.accuracyMADpp <= policy.controlStable.accuracyMADpp && metrics.disfluencyMADpp <= policy.controlStable.disfluencyMADpp && metrics.correctionCostMADpp <= policy.controlStable.correctionCostMADpp) return "stable";
  return "partial";
}

export function analyzePracticeConsistency({ windowSnapshot, calibration = null, scoreRange = null, durationMs = 0, policy = PRACTICE_CONSISTENCY_POLICY_V1 } = {}) {
  const windows = analyzePracticeSustainedWindows({ snapshot: windowSnapshot, scoreRange, structuralMinimumWindowMs: policy.structuralMinimumWindowMs, structuralMinimumFirstPassOpportunities: policy.structuralMinimumFirstPassOpportunities, paceCoordinate: "gross" });
  const valid = windows.filter((window) => window.structuralValid);
  const pace = summarizePracticeSustainedVariation(windows);
  const control = {
    firstPassAccuracyMedian: practiceSustainedMedian(valid.map((window) => window.firstPassAccuracy)),
    accuracyMADpp: robustMadPp(valid.map((window) => window.firstPassAccuracy)),
    disfluencyMedian: practiceSustainedMedian(valid.map((window) => window.disfluencyRate)),
    disfluencyMADpp: robustMadPp(valid.map((window) => window.disfluencyRate)),
    correctionCostMedian: practiceSustainedMedian(valid.map((window) => window.correctionCostRate)),
    correctionCostMADpp: robustMadPp(valid.map((window) => window.correctionCostRate)),
  };
  control.stability = valid.length >= policy.minimumValidWindows ? controlStability(control, policy) : "insufficient";
  const sufficient = pace.validWindowCount >= policy.minimumValidWindows;
  return freezeDeep({
    resultVersion: PRACTICE_CONSISTENCY_RESULT_VERSION,
    analysisVersion: PRACTICE_CONSISTENCY_ANALYSIS_VERSION,
    status: sufficient ? "complete" : "insufficient-consistency-coverage",
    durationMs,
    calibration: { available: Boolean(calibration?.available), anchorGrossWpm: calibration?.anchorGrossWpm ?? null },
    validWindowCount: pace.validWindowCount,
    pace: { medianAdjustedGrossWpm: pace.medianAdjustedWpm, variationPercent: pace.variationPercent, driftPercent: pace.driftPercent, slopeLogPerMinute: pace.slopeLogPerMinute, pattern: sufficient ? pacePattern(pace.variation, pace.drift, policy) : "insufficient" },
    control,
  });
}
