import { getPracticeDifficultyAdjustment } from "./practiceAdjustedPerformance.js";
import {
  PRACTICE_CONTROL_METRIC_COVERAGE,
  PRACTICE_FRONTIER_BATCH_VERSION,
  PRACTICE_FRONTIER_MODEL_VERSION,
  PRACTICE_FRONTIER_OBSERVATION_VERSION,
  PRACTICE_FRONTIER_STATUSES,
  PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS,
} from "./practicePerformanceConstants.js";
import { PRACTICE_FRONTIER_POLICY_V1 } from "./practicePerformancePolicy.js";
import { practiceMedian } from "./practiceRobustStats.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const STAGE_KEYS = new Set(["stageId", "stageOrdinal", "plannedPaceWpm", "observedWpm", "accuracy", "disfluencyRate", "correctionCostRate", "correctionCostMs", "activeDurationMs", "typedCharacterCount", "interrupted", "majorPauseCount"]);
const finiteOrNull = (value) => value == null || Number.isFinite(value);

function validateCandidate(candidate, index) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new TypeError(`Frontier stage ${index} must be an object`);
  for (const key of Object.keys(candidate)) if (!STAGE_KEYS.has(key)) throw new TypeError(`Frontier stage ${index} contains unsupported field ${key}`);
  if (!(typeof candidate.stageId === "string" || Number.isInteger(candidate.stageId)) || String(candidate.stageId).length < 1 || String(candidate.stageId).length > 80) throw new TypeError(`Frontier stage ${index} has invalid stageId`);
  if (!Number.isInteger(candidate.stageOrdinal) || candidate.stageOrdinal < 0) throw new TypeError(`Frontier stage ${index} has invalid stageOrdinal`);
  for (const key of ["observedWpm", "accuracy", "activeDurationMs"]) if (!Number.isFinite(candidate[key])) throw new TypeError(`Frontier stage ${index} ${key} must be finite`);
  if (candidate.observedWpm <= 0 || candidate.accuracy < 0 || candidate.accuracy > 100 || candidate.activeDurationMs < 0) throw new TypeError(`Frontier stage ${index} has invalid primary metrics`);
  if (!Number.isInteger(candidate.typedCharacterCount) || candidate.typedCharacterCount < 0) throw new TypeError(`Frontier stage ${index} has invalid typedCharacterCount`);
  for (const key of ["plannedPaceWpm", "disfluencyRate", "correctionCostRate", "correctionCostMs"]) if (!finiteOrNull(candidate[key])) throw new TypeError(`Frontier stage ${index} ${key} must be finite or null`);
  if (candidate.plannedPaceWpm != null && candidate.plannedPaceWpm <= 0) throw new TypeError(`Frontier stage ${index} planned pace must be positive`);
  if (candidate.disfluencyRate != null && (candidate.disfluencyRate < 0 || candidate.disfluencyRate > 1)) throw new TypeError(`Frontier stage ${index} disfluency rate must be 0..1`);
  if (candidate.correctionCostRate != null && (candidate.correctionCostRate < 0 || candidate.correctionCostRate > 1)) throw new TypeError(`Frontier stage ${index} correction rate must be 0..1`);
  if (candidate.correctionCostMs != null && candidate.correctionCostMs < 0) throw new TypeError(`Frontier stage ${index} correction cost must be non-negative`);
}

export function validatePracticeFrontierMeasurementCandidate(value, policy = PRACTICE_FRONTIER_POLICY_V1) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Frontier measurement callback must return an object");
  if (Object.keys(value).some((key) => key !== "stages")) throw new TypeError("Frontier measurement callback may return only stages");
  if (!Array.isArray(value.stages) || value.stages.length > policy.maximumStagesPerSession) throw new TypeError("Frontier measurement stages are missing or exceed the session cap");
  const ids = new Set();
  let previousOrdinal = -1;
  value.stages.forEach((stage, index) => {
    validateCandidate(stage, index);
    const id = String(stage.stageId);
    if (ids.has(id)) throw new TypeError("Frontier stage IDs must be unique within a session");
    ids.add(id);
    if (stage.stageOrdinal <= previousOrdinal) throw new TypeError("Frontier stage ordinals must be strictly increasing");
    previousOrdinal = stage.stageOrdinal;
  });
  return value;
}

export function buildPracticeFrontierObservationBatch({
  measurement,
  session,
  foundationAnalysis,
  evidenceRole,
  policy = PRACTICE_FRONTIER_POLICY_V1,
} = {}) {
  validatePracticeFrontierMeasurementCandidate(measurement, policy);
  if (!policy.allowedEvidenceRoles.includes(evidenceRole)) throw new TypeError("Frontier source role is not allowed by v1 policy");
  const difficulty = getPracticeDifficultyAdjustment(foundationAnalysis);
  const points = measurement.stages.map((stage) => {
    const correctionCostRate = Number.isFinite(stage.correctionCostRate)
      ? stage.correctionCostRate
      : Number.isFinite(stage.correctionCostMs) && stage.activeDurationMs > 0
        ? clamp(stage.correctionCostMs / stage.activeDurationMs, 0, 1)
        : null;
    const adjustedWpm = Math.exp(Math.log(stage.observedWpm) + difficulty.adjustment);
    const valid = stage.activeDurationMs >= policy.minimumStageDurationMs
      && stage.typedCharacterCount >= policy.minimumStageCharacters
      && stage.accuracy >= policy.minimumStageAccuracy
      && stage.interrupted !== true
      && !(Number.isFinite(stage.majorPauseCount) && stage.majorPauseCount > 0);
    return freezeDeep({
      observationVersion: PRACTICE_FRONTIER_OBSERVATION_VERSION,
      sessionId: session.sessionId,
      stageId: String(stage.stageId),
      stageOrdinal: stage.stageOrdinal,
      profileId: session.profileId,
      contextId: session.contextId,
      completedAtUtc: session.completedAtUtc,
      plannedPaceWpm: Number.isFinite(stage.plannedPaceWpm) ? stage.plannedPaceWpm : null,
      observedWpm: stage.observedWpm,
      adjustedWpm,
      accuracy: stage.accuracy,
      disfluencyRate: Number.isFinite(stage.disfluencyRate) ? stage.disfluencyRate : null,
      correctionCostRate,
      activeDurationMs: stage.activeDurationMs,
      typedCharacterCount: stage.typedCharacterCount,
      sourceRole: evidenceRole,
      difficultyAdjustmentLog: difficulty.adjustment,
      valid,
    });
  });
  return freezeDeep({
    batchVersion: PRACTICE_FRONTIER_BATCH_VERSION,
    sessionId: session.sessionId,
    profileId: session.profileId,
    contextId: session.contextId,
    channel: policy.channel,
    points,
  });
}

function coverageFor(points) {
  if (!points.length) return { status: "none", disfluencyPointFraction: 0, correctionPointFraction: 0 };
  const disfluency = points.filter((point) => Number.isFinite(point.disfluencyRate)).length / points.length;
  const correction = points.filter((point) => Number.isFinite(point.correctionCostRate)).length / points.length;
  return {
    status: disfluency === 1 && correction === 1 ? "full" : "partial",
    disfluencyPointFraction: disfluency,
    correctionPointFraction: correction,
  };
}

function baseModel({ status = "unmeasured", confidence = "none", points = [], range = null, coverage = null, updatedAt = null } = {}) {
  return {
    modelVersion: PRACTICE_FRONTIER_MODEL_VERSION,
    policyVersion: PRACTICE_FRONTIER_POLICY_V1.version,
    status,
    confidence,
    channel: PRACTICE_FRONTIER_POLICY_V1.channel,
    validPointCount: points.length,
    sessionCount: new Set(points.map((point) => point.sessionId)).size,
    minimumObservedWpm: points.length ? Math.min(...points.map((point) => point.adjustedWpm)) : null,
    maximumObservedWpm: points.length ? Math.max(...points.map((point) => point.adjustedWpm)) : null,
    observedSpeedRangeWpm: range,
    baselineAccuracy: null,
    baselineDisfluencyRate: null,
    baselineCorrectionCostRate: null,
    frontierWpm: null,
    frontierLowerWpm: null,
    frontierUpperWpm: null,
    frontierIsLowerBound: false,
    controlMetricCoverage: coverage ?? coverageFor(points),
    updatedAt,
  };
}

function aggregateBins(points, policy) {
  const groups = new Map();
  for (const point of points) {
    const lower = Math.floor(point.adjustedWpm / policy.speedBinWpm) * policy.speedBinWpm;
    if (!groups.has(lower)) groups.set(lower, []);
    groups.get(lower).push(point);
  }
  return [...groups.entries()].sort(([a], [b]) => a - b).map(([binLowerWpm, items]) => {
    const values = (key) => items.map((item) => item[key]).filter(Number.isFinite);
    return {
      binLowerWpm,
      binUpperWpm: binLowerWpm + policy.speedBinWpm,
      speedWpm: practiceMedian(values("adjustedWpm")),
      accuracy: practiceMedian(values("accuracy")),
      disfluencyRate: values("disfluencyRate").length ? practiceMedian(values("disfluencyRate")) : null,
      correctionCostRate: values("correctionCostRate").length ? practiceMedian(values("correctionCostRate")) : null,
      pointCount: items.length,
      sessionCount: new Set(items.map((item) => item.sessionId)).size,
    };
  });
}

function applyControlLoss(bin, baseline, policy) {
  const accuracyDrop = baseline.accuracy - bin.accuracy;
  const accuracyLoss = Math.max(0, accuracyDrop / policy.maximumAccuracyDropPp);
  const disfluencyIncrease = Number.isFinite(bin.disfluencyRate) && Number.isFinite(baseline.disfluencyRate) ? bin.disfluencyRate - baseline.disfluencyRate : null;
  const disfluencyLoss = Number.isFinite(disfluencyIncrease) ? Math.max(0, disfluencyIncrease / policy.maximumDisfluencyIncrease) : null;
  const correctionIncrease = Number.isFinite(bin.correctionCostRate) && Number.isFinite(baseline.correctionCostRate) ? bin.correctionCostRate - baseline.correctionCostRate : null;
  const correctionLoss = Number.isFinite(correctionIncrease) ? Math.max(0, correctionIncrease / policy.maximumCorrectionCostIncrease) : null;
  const available = [accuracyLoss, disfluencyLoss, correctionLoss].filter(Number.isFinite);
  const controlLoss = Math.max(...available);
  const controlled = bin.accuracy >= policy.minimumAbsoluteAccuracy && controlLoss <= 1;
  return { ...bin, accuracyDrop, disfluencyIncrease, correctionIncrease, controlLoss, controlled };
}

export function buildPracticeControlFrontier(points = [], policy = PRACTICE_FRONTIER_POLICY_V1) {
  const valid = [...points].filter((point) => point?.valid === true && Number.isFinite(point.adjustedWpm) && point.adjustedWpm > 0 && Number.isFinite(point.accuracy));
  const updatedAt = valid.length ? [...valid].sort((a, b) => a.completedAtUtc.localeCompare(b.completedAtUtc)).at(-1).completedAtUtc : null;
  const coverage = coverageFor(valid);
  if (!valid.length) return freezeDeep(baseModel({ points: [], coverage, updatedAt }));
  const minimum = Math.min(...valid.map((point) => point.adjustedWpm));
  const maximum = Math.max(...valid.map((point) => point.adjustedWpm));
  const range = maximum - minimum;
  const relativeRange = minimum > 0 ? maximum / minimum - 1 : 0;
  const base = baseModel({ points: valid, range, coverage, updatedAt });
  if (valid.length < policy.minimumValidPoints || (range < policy.minimumAbsoluteSpeedRangeWpm && relativeRange < policy.minimumRelativeSpeedRange)) {
    return freezeDeep({ ...base, status: "insufficient-range" });
  }
  const bins = aggregateBins(valid, policy);
  const baselineBinCount = Math.min(bins.length, Math.max(policy.minimumBaselineBins, Math.ceil(bins.length * policy.lowSpeedBaselineFraction)));
  const baselineBins = bins.slice(0, baselineBinCount);
  const availableMedian = (key) => {
    const values = baselineBins.map((bin) => bin[key]).filter(Number.isFinite);
    return values.length ? practiceMedian(values) : null;
  };
  const baseline = {
    accuracy: availableMedian("accuracy"),
    disfluencyRate: availableMedian("disfluencyRate"),
    correctionCostRate: availableMedian("correctionCostRate"),
  };
  const withBaseline = {
    ...base,
    baselineAccuracy: baseline.accuracy,
    baselineDisfluencyRate: baseline.disfluencyRate,
    baselineCorrectionCostRate: baseline.correctionCostRate,
  };
  if (!Number.isFinite(baseline.accuracy) || baseline.accuracy < policy.minimumBaselineAccuracy) return freezeDeep({ ...withBaseline, status: "insufficient-control" });
  const classified = bins.map((bin) => applyControlLoss(bin, baseline, policy));
  const controlledBins = classified.filter((bin) => bin.controlled);
  if (!controlledBins.length) return freezeDeep({ ...withBaseline, status: "insufficient-control" });

  let failureStart = -1;
  for (let index = 0; index <= classified.length - policy.sustainedFailureBins; index += 1) {
    const run = classified.slice(index, index + policy.sustainedFailureBins);
    if (run.every((bin) => !bin.controlled) && classified.slice(0, index).some((bin) => bin.controlled)) {
      failureStart = index;
      break;
    }
  }
  let status;
  let frontierWpm = null;
  let frontierLowerWpm = null;
  let frontierUpperWpm = null;
  let frontierIsLowerBound = false;
  if (failureStart >= 0) {
    status = "bracketed";
    const lower = [...classified.slice(0, failureStart)].reverse().find((bin) => bin.controlled);
    const upper = classified[failureStart];
    frontierLowerWpm = lower.speedWpm;
    frontierUpperWpm = upper.speedWpm;
    if (Number.isFinite(lower.controlLoss) && Number.isFinite(upper.controlLoss) && lower.controlLoss < 1 && upper.controlLoss > 1 && upper.controlLoss !== lower.controlLoss && upper.speedWpm !== lower.speedWpm) {
      const ratio = clamp((1 - lower.controlLoss) / (upper.controlLoss - lower.controlLoss), 0, 1);
      frontierWpm = lower.speedWpm + ratio * (upper.speedWpm - lower.speedWpm);
    } else frontierWpm = (lower.speedWpm + upper.speedWpm) / 2;
    frontierWpm = clamp(frontierWpm, Math.min(frontierLowerWpm, frontierUpperWpm), Math.max(frontierLowerWpm, frontierUpperWpm));
  } else if (classified.every((bin) => bin.controlled)) {
    status = "lower-bound";
    const highest = classified.at(-1);
    frontierWpm = highest.speedWpm;
    frontierLowerWpm = highest.speedWpm;
    frontierUpperWpm = null;
    frontierIsLowerBound = true;
  } else status = "provisional";

  let confidence = "low";
  const sessionCount = new Set(valid.map((point) => point.sessionId)).size;
  if (status === "bracketed" && valid.length >= policy.mediumConfidenceMinimumPoints && range >= policy.mediumConfidenceMinimumSpeedRangeWpm) confidence = "medium";
  if (status === "bracketed" && valid.length >= policy.highConfidenceMinimumPoints && sessionCount >= policy.highConfidenceMinimumSessions && range >= policy.highConfidenceMinimumSpeedRangeWpm && coverage.status === "full") confidence = "high";
  if (!PRACTICE_FRONTIER_STATUSES.includes(status) || !PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(confidence) || !PRACTICE_CONTROL_METRIC_COVERAGE.includes(coverage.status)) throw new TypeError("Control frontier produced invalid model state");
  return freezeDeep({
    ...withBaseline,
    status,
    confidence,
    frontierWpm,
    frontierLowerWpm,
    frontierUpperWpm,
    frontierIsLowerBound,
  });
}
