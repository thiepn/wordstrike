import { PRACTICE_TREATMENT_THRESHOLDS } from "./practiceTreatmentConstants.js";

const finite = Number.isFinite;
const value = (input) => finite(input) ? input : null;

export function estimatePracticeTargetResponse(baselineMetrics, outcomeMetrics) {
  const qualityDelta = finite(baselineMetrics?.quality) && finite(outcomeMetrics?.quality) ? outcomeMetrics.quality - baselineMetrics.quality : null;
  const accuracyDeltaPp = finite(baselineMetrics?.firstPassAccuracy) && finite(outcomeMetrics?.firstPassAccuracy)
    ? 100 * (outcomeMetrics.firstPassAccuracy - baselineMetrics.firstPassAccuracy) : null;
  const residualDeltaMs = finite(baselineMetrics?.normalizedResidualMedianMs) && finite(outcomeMetrics?.normalizedResidualMedianMs)
    ? outcomeMetrics.normalizedResidualMedianMs - baselineMetrics.normalizedResidualMedianMs : null;
  const disfluencyDeltaPp = finite(baselineMetrics?.disfluencyRate) && finite(outcomeMetrics?.disfluencyRate)
    ? 100 * (outcomeMetrics.disfluencyRate - baselineMetrics.disfluencyRate) : null;
  const launchResidualDeltaMs = finite(baselineMetrics?.launchResidualMedianMs) && finite(outcomeMetrics?.launchResidualMedianMs)
    ? outcomeMetrics.launchResidualMedianMs - baselineMetrics.launchResidualMedianMs : null;
  const internalResidualDeltaMs = finite(baselineMetrics?.internalResidualMedianMs) && finite(outcomeMetrics?.internalResidualMedianMs)
    ? outcomeMetrics.internalResidualMedianMs - baselineMetrics.internalResidualMedianMs : null;
  return Object.freeze({
    responseValue: qualityDelta,
    responseUnit: "quality-points",
    practicalThreshold: PRACTICE_TREATMENT_THRESHOLDS.targetQualityPoints,
    qualityDelta,
    accuracyDeltaPp,
    residualDeltaMs,
    disfluencyDeltaPp,
    launchResidualDeltaMs,
    internalResidualDeltaMs,
  });
}

export function estimatePracticeAbilityResponse(baselineAbility, observation) {
  const mu0 = value(baselineAbility?.muLog);
  const p0 = value(baselineAbility?.variance);
  const y = value(observation?.adjustedLogPerformance);
  const sigma = value(observation?.measurementSigmaLog);
  if (mu0 == null || p0 == null || p0 < 0 || y == null || sigma == null || sigma < 0) return null;
  const d = y - mu0;
  const responsePercent = 100 * (Math.exp(d) - 1);
  const measurementVariance = finite(observation?.measurementVarianceLog) ? observation.measurementVarianceLog : sigma ** 2;
  const sigmaD = Math.sqrt(p0 + measurementVariance);
  const z = sigmaD > 0 ? d / sigmaD : null;
  let classification = "uncertain";
  if (Math.abs(responsePercent) < PRACTICE_TREATMENT_THRESHOLDS.abilityPercent) classification = "similar";
  else if (responsePercent >= PRACTICE_TREATMENT_THRESHOLDS.abilityPercent && z != null && z >= PRACTICE_TREATMENT_THRESHOLDS.abilityZ) classification = "above-baseline";
  else if (responsePercent <= -PRACTICE_TREATMENT_THRESHOLDS.abilityPercent && z != null && z <= -PRACTICE_TREATMENT_THRESHOLDS.abilityZ) classification = "below-baseline";
  return Object.freeze({
    responseValue: responsePercent,
    responseUnit: "percent",
    practicalThreshold: PRACTICE_TREATMENT_THRESHOLDS.abilityPercent,
    d,
    observedResponsePercent: responsePercent,
    sigmaD,
    z,
    classification,
  });
}

export function estimatePracticeConsistencyResponse(baseline, outcome) {
  if (!finite(baseline?.paceVariationPercent) || !finite(outcome?.paceVariationPercent)) return null;
  const variationResponsePp = baseline.paceVariationPercent - outcome.paceVariationPercent;
  const driftResponsePp = finite(baseline?.paceDriftPercent) && finite(outcome?.paceDriftPercent)
    ? Math.abs(baseline.paceDriftPercent) - Math.abs(outcome.paceDriftPercent) : null;
  const paceChangePercent = finite(baseline?.medianAdjustedGrossWpm) && baseline.medianAdjustedGrossWpm > 0 && finite(outcome?.medianAdjustedGrossWpm)
    ? 100 * (outcome.medianAdjustedGrossWpm / baseline.medianAdjustedGrossWpm - 1) : null;
  const accuracyFallPp = finite(baseline?.firstPassAccuracyMedian) && finite(outcome?.firstPassAccuracyMedian)
    ? 100 * (baseline.firstPassAccuracyMedian - outcome.firstPassAccuracyMedian) : 0;
  const disfluencyRisePp = finite(baseline?.disfluencyMedian) && finite(outcome?.disfluencyMedian)
    ? 100 * (outcome.disfluencyMedian - baseline.disfluencyMedian) : 0;
  const correctionRisePp = finite(baseline?.correctionCostMedian) && finite(outcome?.correctionCostMedian)
    ? 100 * (outcome.correctionCostMedian - baseline.correctionCostMedian) : 0;
  const tradeoff = (paceChangePercent != null && paceChangePercent <= -5) || accuracyFallPp > 2 || disfluencyRisePp > 5 || correctionRisePp > 5;
  return Object.freeze({
    responseValue: variationResponsePp,
    responseUnit: "percentage-points",
    practicalThreshold: PRACTICE_TREATMENT_THRESHOLDS.consistencyVariationPp,
    variationResponsePp,
    driftResponsePp,
    paceChangePercent,
    tradeoff,
    tradeoffDimensions: Object.freeze({ accuracyFallPp, disfluencyRisePp, correctionRisePp }),
  });
}

export function estimatePracticeFrontierResponse(baseline, outcome) {
  if (!baseline || !outcome) return null;
  if (baseline.status !== "bracketed" || outcome.status !== "bracketed" || !finite(baseline.frontierWpm) || !finite(outcome.frontierWpm) || baseline.frontierWpm <= 0) {
    return Object.freeze({
      responseValue: null,
      responseUnit: "percent",
      practicalThreshold: PRACTICE_TREATMENT_THRESHOLDS.frontierPercent,
      responseKind: "interval-only",
      baselineLowerBoundWpm: value(baseline.lowerBoundWpm ?? baseline.frontierWpm),
      outcomeLowerBoundWpm: value(outcome.lowerBoundWpm ?? outcome.frontierWpm),
    });
  }
  const frontierResponsePercent = 100 * (outcome.frontierWpm / baseline.frontierWpm - 1);
  return Object.freeze({
    responseValue: frontierResponsePercent,
    responseUnit: "percent",
    practicalThreshold: PRACTICE_TREATMENT_THRESHOLDS.frontierPercent,
    responseKind: "scalar",
    frontierResponsePercent,
  });
}
