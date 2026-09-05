import { practiceMedian } from "./practiceRobustStats.js";
import { PRACTICE_MASTERY_STAGE_RANK } from "./practiceMasteryConstants.js";
import { PRACTICE_SATURATION_MODEL_VERSION } from "./practiceLearningConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const finite = Number.isFinite;
const CONFIDENCE_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const confidenceAtLeast = (level, required) => (CONFIDENCE_RANK[level] ?? 0) >= (CONFIDENCE_RANK[required] ?? 0);

function mechanismFamily(primaryLimiterType) {
  if (["slow", "launch-limited"].includes(primaryLimiterType)) return "motor-speed";
  if (["inaccurate", "hesitant", "recovery-heavy", "unstable"].includes(primaryLimiterType)) return "control";
  if (primaryLimiterType === "mixed") return "mixed";
  return "unknown";
}

function recentPhaseMedians(observations, window) {
  const recent = (observations ?? []).slice(-window);
  return {
    entry: practiceMedian(recent.map((observation) => observation.entryQuality)),
    exit: practiceMedian(recent.map((observation) => observation.exitQuality)),
  };
}

function highQualityCeiling(observations, required) {
  const complete = (observations ?? [])
    .filter((observation) => finite(observation.entryQuality) && finite(observation.exitQuality))
    .slice(-required);
  return complete.length >= required && complete.every((observation) => observation.entryQuality >= 90 && observation.exitQuality >= 90);
}

function transferLimitedEvidence(transfer, acquisition, policy) {
  const curve = transfer?.curve;
  const acquisitionStrong = Number(acquisition?.curve?.recentQuality || 0) >= 80 || acquisition?.curve?.status === "improving";
  return acquisitionStrong
    && Number(curve?.recentQuality || 100) < policy.saturation.transferLimitedQuality
    && ["flat", "worsening"].includes(curve?.status)
    && confidenceAtLeast(curve?.confidence, "medium");
}

export function evaluatePracticeSaturation({
  learningState,
  mastery,
  limiter,
  policy = PRACTICE_LEARNING_POLICY_V1,
} = {}) {
  const acquisition = learningState?.acquisition;
  const transfer = learningState?.transfer;
  const curve = acquisition?.curve;
  const transferCurve = transfer?.curve;
  const currentQuality = curve?.recentQuality ?? null;
  const recentGain = curve?.recentSlopePointsPerDose ?? null;
  const overallGain = curve?.medianSlopePointsPerDose ?? null;
  const practiceGainMedian = curve?.medianPracticeGain ?? null;
  const transferGain = transferCurve?.recentSlopePointsPerDose ?? transferCurve?.medianSlopePointsPerDose ?? null;
  const primaryLimiterType = limiter?.primaryPhenotype ?? "none";
  const materialLimiter = ["likely", "confirmed"].includes(limiter?.status);
  const criticalLimiter = Boolean(mastery?.limiterGuard?.confirmedCritical || mastery?.limiterGuard?.likelyCritical);
  const masteryRank = PRACTICE_MASTERY_STAGE_RANK[mastery?.stage] ?? 0;
  const acquiredOrHigher = masteryRank >= PRACTICE_MASTERY_STAGE_RANK.acquired;
  const reasons = [];
  const evidence = {
    acquisitionObservationCount: Number(acquisition?.observationCount || 0),
    acquisitionDayCount: Number(acquisition?.dayCount || 0),
    acquisitionDoseSpan: Number(curve?.doseSpan || 0),
    acquisitionCurveConfidence: curve?.confidence ?? "none",
    transferObservationCount: Number(transfer?.observationCount || 0),
    transferDayCount: Number(transfer?.dayCount || 0),
    transferCurveConfidence: transferCurve?.confidence ?? "none",
  };

  if (!curve || curve.status === "insufficient-data") {
    if ((curve?.pointCount ?? 0) < policy.acquisitionCurve.minimumPoints) reasons.push("insufficient-entry-points");
    if ((curve?.dayCount ?? 0) < policy.acquisitionCurve.minimumDays) reasons.push("insufficient-days");
    if ((curve?.doseSpan ?? 0) < policy.acquisitionCurve.minimumDoseSpan) reasons.push("insufficient-dose");
    return freezeDeep({
      modelVersion: PRACTICE_SATURATION_MODEL_VERSION,
      status: "insufficient-data",
      confidence: "none",
      type: "unknown",
      currentQuality,
      marginalGainPointsPerDose: recentGain,
      overallGainPointsPerDose: overallGain,
      practiceGainMedian,
      transferGainPointsPerDose: transferGain,
      evidence,
      reasons: [...new Set(reasons)],
      diagnostics: { primaryLimiterType, plateauMechanismFamily: mechanismFamily(primaryLimiterType) },
    });
  }

  const transferLimited = transferLimitedEvidence(transfer, acquisition, policy);
  if (transferLimited) {
    reasons.push("transfer-flat");
    const supported = transfer.observationCount >= policy.saturation.supportedTransfer.observations
      && transfer.dayCount >= policy.saturation.supportedTransfer.days
      && confidenceAtLeast(transferCurve.confidence, "medium")
      && Number(transferCurve.recentQuality || 100) < policy.saturation.transferLimitedQuality
      && Number(transferGain ?? Infinity) <= policy.saturation.supportedTransfer.gainMaximum;
    return freezeDeep({
      modelVersion: PRACTICE_SATURATION_MODEL_VERSION,
      status: supported ? "supported" : "likely",
      confidence: supported ? "high" : "medium",
      type: "transfer-limited",
      currentQuality,
      marginalGainPointsPerDose: recentGain,
      overallGainPointsPerDose: overallGain,
      practiceGainMedian,
      transferGainPointsPerDose: transferGain,
      evidence,
      reasons: [...new Set(reasons)],
      diagnostics: { primaryLimiterType, plateauMechanismFamily: mechanismFamily(primaryLimiterType) },
    });
  }

  const ceiling = highQualityCeiling(acquisition?.observations, policy.saturation.highQualityCeilingSessions);
  if (acquiredOrHigher && ((Number(currentQuality || 0) >= policy.saturation.resolvedQuality && !criticalLimiter) || ceiling)) {
    reasons.push("mastery-acquired", "high-quality-ceiling");
    return freezeDeep({
      modelVersion: PRACTICE_SATURATION_MODEL_VERSION,
      status: "resolved",
      confidence: confidenceAtLeast(curve.confidence, "medium") ? curve.confidence : "low",
      type: "unknown",
      currentQuality,
      marginalGainPointsPerDose: recentGain,
      overallGainPointsPerDose: overallGain,
      practiceGainMedian,
      transferGainPointsPerDose: transferGain,
      evidence,
      reasons: [...new Set(reasons)],
      diagnostics: { primaryLimiterType, plateauMechanismFamily: mechanismFamily(primaryLimiterType) },
    });
  }

  if (finite(recentGain) && recentGain >= policy.acquisitionCurve.meaningfulGainPerDose && confidenceAtLeast(curve.confidence, "medium")) {
    reasons.push("curve-improving");
    return freezeDeep({
      modelVersion: PRACTICE_SATURATION_MODEL_VERSION,
      status: "not-detected",
      confidence: curve.confidence,
      type: "unknown",
      currentQuality,
      marginalGainPointsPerDose: recentGain,
      overallGainPointsPerDose: overallGain,
      practiceGainMedian,
      transferGainPointsPerDose: transferGain,
      evidence,
      reasons,
      diagnostics: { primaryLimiterType, plateauMechanismFamily: mechanismFamily(primaryLimiterType) },
    });
  }

  const p = policy.saturation.possible;
  const possible = acquisition.observationCount >= p.observations
    && acquisition.dayCount >= p.days
    && Number(curve.doseSpan || 0) >= p.doseSpan
    && finite(recentGain)
    && recentGain <= p.recentGainMaximum
    && Number(currentQuality || 0) < p.qualityMaximum
    && (materialLimiter || mastery?.stage === "learning");
  const l = policy.saturation.likely;
  const recentFlatOrWorse = finite(recentGain)
    && ((recentGain >= l.recentGainMinimum && recentGain <= l.recentGainMaximum) || curve.status === "worsening");
  const likely = possible
    && acquisition.observationCount >= l.observations
    && acquisition.dayCount >= l.days
    && Number(curve.doseSpan || 0) >= l.doseSpan
    && confidenceAtLeast(curve.confidence, "medium")
    && recentFlatOrWorse;
  const s = policy.saturation.supportedTransfer;
  const supported = likely
    && transfer.observationCount >= s.observations
    && transfer.dayCount >= s.days
    && confidenceAtLeast(transferCurve?.confidence, "medium")
    && Number(transferCurve?.recentQuality || 100) < s.qualityMaximum
    && finite(transferGain)
    && transferGain <= s.gainMaximum;

  const phaseMedians = recentPhaseMedians(acquisition?.observations, policy.saturation.overload.recentWindow);
  const overload = finite(phaseMedians.entry) && finite(phaseMedians.exit)
    && phaseMedians.entry < policy.saturation.overload.entryMedianBelow
    && phaseMedians.exit < policy.saturation.overload.exitMedianBelow;

  let status = supported ? "supported" : likely ? "likely" : possible ? "possible" : "not-detected";
  if (status === "not-detected" && curve.status === "improving" && finite(recentGain) && recentGain <= policy.acquisitionCurve.meaningfulGainPerDose && Number(currentQuality || 0) < policy.saturation.resolvedQuality) status = "approaching";
  if (overload && ["likely", "supported"].includes(status)) status = "possible";

  if (curve.status === "flat") reasons.push("curve-flat");
  else if (curve.status === "worsening") reasons.push("curve-worsening");
  else if (curve.status === "improving") reasons.push("curve-improving");
  if (finite(recentGain) && recentGain <= 1) reasons.push("marginal-gain-low");
  if (finite(practiceGainMedian) && practiceGainMedian >= policy.practiceGain.reacquisitionThreshold) reasons.push("practice-gain-high");
  else if (finite(practiceGainMedian) && practiceGainMedian <= policy.practiceGain.acquisitionPlateauMaximum) reasons.push("practice-gain-low");
  if (materialLimiter) reasons.push("limiter-remains");
  if (overload) reasons.push("possible-overload");
  if (!transfer.observationCount) reasons.push("transfer-unverified");
  else if (transferCurve?.status === "improving") reasons.push("transfer-improving");
  else if (["flat", "worsening"].includes(transferCurve?.status)) reasons.push("transfer-flat");

  let type = "unknown";
  const reacquisition = ["flat", "uncertain"].includes(curve.status)
    && finite(recentGain) && recentGain <= 1
    && finite(practiceGainMedian) && practiceGainMedian >= policy.practiceGain.reacquisitionThreshold
    && confidenceAtLeast(curve.confidence, "medium");
  const acquisitionPlateau = ["flat", "worsening"].includes(curve.status)
    && finite(practiceGainMedian) && practiceGainMedian <= policy.practiceGain.acquisitionPlateauMaximum
    && Number(currentQuality || 0) < policy.saturation.resolvedQuality;
  const transferPoor = ["flat", "worsening"].includes(transferCurve?.status) && Number(transferCurve?.recentQuality || 100) < 80;
  if (reacquisition && transferPoor) type = "mixed";
  else if (reacquisition) type = "reacquisition-loop";
  else if (acquisitionPlateau && transferPoor) type = "mixed";
  else if (acquisitionPlateau) type = "acquisition-plateau";

  const confidence = status === "supported" ? "high"
    : status === "likely" ? "medium"
      : status === "possible" ? "low"
        : status === "approaching" ? (confidenceAtLeast(curve.confidence, "medium") ? "medium" : curve.confidence)
          : curve.confidence;
  return freezeDeep({
    modelVersion: PRACTICE_SATURATION_MODEL_VERSION,
    status,
    confidence,
    type,
    currentQuality,
    marginalGainPointsPerDose: recentGain,
    overallGainPointsPerDose: overallGain,
    practiceGainMedian,
    transferGainPointsPerDose: transferGain,
    evidence,
    reasons: [...new Set(reasons)].slice(0, 8),
    diagnostics: { primaryLimiterType, plateauMechanismFamily: mechanismFamily(primaryLimiterType) },
  });
}
