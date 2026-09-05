import { PRACTICE_SESSION_LIMITS } from "./practiceSessionConstants.js";
import {
  practiceMad,
  practiceMedian,
  practiceQuantile,
  practiceRobustScale,
} from "./practiceRobustStats.js";

export const PRACTICE_LATENCY_ANALYSIS_VERSION = 1;
export const PRACTICE_LATENCY_CLASSIFIER_VERSION = 1;
export const PRACTICE_LATENCY_POLICY_VERSION = 1;

export const PRACTICE_LATENCY_CLASSES = Object.freeze([
  "fluent", "disfluent", "interruption", "excluded",
]);
export const PRACTICE_LATENCY_CALIBRATION_STATUSES = Object.freeze(["insufficient-data", "adaptive"]);
export const PRACTICE_LATENCY_TRACE_SCOPES = Object.freeze(["complete-session", "retained-window"]);
export const PRACTICE_LATENCY_CONFIDENCE_LEVELS = Object.freeze(["none", "low", "medium", "high"]);

export const PRACTICE_LATENCY_POLICY_V1 = Object.freeze({
  version: PRACTICE_LATENCY_POLICY_VERSION,
  minimumCalibrationSamples: 20,
  hardInterruptionMs: PRACTICE_SESSION_LIMITS.inactiveTransitionMs,
  minimumAdaptiveThresholdMs: 250,
  medianMultiplier: 2.5,
  robustSigmaMultiplier: 4,
  maximumAdaptiveThresholdMs: 1500,
  longHesitationMs: PRACTICE_SESSION_LIMITS.longHesitationMs,
  mediumConfidenceSamples: 50,
  highConfidenceSamples: 200,
});

const INSERTION_TYPES = new Set(["character", "space"]);
const CORRECTION_TYPES = new Set(["backspace", "word-delete"]);

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function validatePolicy(policy) {
  if (!policy || typeof policy !== "object") throw new TypeError("Practice latency policy must be an object");
  if (policy.version !== PRACTICE_LATENCY_POLICY_VERSION) throw new TypeError("Unsupported Practice latency policy version");
  for (const key of ["minimumCalibrationSamples", "hardInterruptionMs", "minimumAdaptiveThresholdMs", "medianMultiplier", "robustSigmaMultiplier", "maximumAdaptiveThresholdMs", "longHesitationMs", "mediumConfidenceSamples", "highConfidenceSamples"]) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0) throw new TypeError(`Practice latency policy ${key} is invalid`);
  }
  if (!Number.isInteger(policy.minimumCalibrationSamples) || policy.minimumCalibrationSamples < 1) throw new TypeError("minimumCalibrationSamples must be a positive integer");
  if (policy.minimumAdaptiveThresholdMs >= policy.hardInterruptionMs) throw new TypeError("minimum adaptive threshold must remain below hard interruption");
  if (policy.maximumAdaptiveThresholdMs < policy.minimumAdaptiveThresholdMs || policy.maximumAdaptiveThresholdMs >= policy.hardInterruptionMs) throw new TypeError("maximum adaptive threshold must remain within the comparable timing region");
  if (policy.mediumConfidenceSamples < policy.minimumCalibrationSamples || policy.highConfidenceSamples < policy.mediumConfidenceSamples) throw new TypeError("Practice latency confidence thresholds are invalid");
  return policy;
}

function normalizedTraceMetadata(events, traceMetadata = {}) {
  const retainedEventCount = Number.isInteger(traceMetadata.retainedEventCount)
    ? Math.max(0, traceMetadata.retainedEventCount)
    : events.length;
  const totalEventCount = Number.isInteger(traceMetadata.totalEventCount)
    ? Math.max(retainedEventCount, traceMetadata.totalEventCount)
    : retainedEventCount;
  const capacity = Number.isInteger(traceMetadata.capacity) && traceMetadata.capacity > 0
    ? traceMetadata.capacity
    : retainedEventCount;
  const truncated = Boolean(traceMetadata.truncated || totalEventCount > retainedEventCount);
  return freezeDeep({
    capacity,
    retainedEventCount,
    totalEventCount,
    truncated,
    scope: truncated ? "retained-window" : "complete-session",
  });
}

function timingSegmentId(event) {
  return Number.isInteger(event?.timingSegmentId) && event.timingSegmentId >= 0 ? event.timingSegmentId : 1;
}

function isCorrectInsertion(event) {
  return event?.correctness === "correct" || event?.correctness === true;
}

function adaptiveConfidence(sampleCount, coverage) {
  let value = "none";
  if (sampleCount > 0) value = "low";
  if (sampleCount >= PRACTICE_LATENCY_POLICY_V1.mediumConfidenceSamples) value = "medium";
  if (sampleCount >= PRACTICE_LATENCY_POLICY_V1.highConfidenceSamples) value = "high";
  if (coverage.scope === "retained-window" && value === "high") value = "medium";
  return value;
}

function confidenceForPolicy(sampleCount, coverage, policy) {
  let value = "none";
  if (sampleCount > 0) value = "low";
  if (sampleCount >= policy.mediumConfidenceSamples) value = "medium";
  if (sampleCount >= policy.highConfidenceSamples) value = "high";
  if (coverage.scope === "retained-window" && value === "high") value = "medium";
  return value;
}

function transitionRecord(event, latencyMs, classification, reason) {
  return {
    eventIndex: Number.isInteger(event?.eventIndex) ? event.eventIndex : null,
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : null,
    classification,
    reason,
    textPosition: Number.isInteger(event?.textPosition) ? event.textPosition : null,
    expected: typeof event?.expected === "string" ? event.expected : null,
    timingSegmentId: timingSegmentId(event),
    correctness: event?.correctness ?? null,
    isFirstAttempt: event?.isFirstAttempt === true,
  };
}

function deriveCandidates(events, policy) {
  const candidates = [];
  const calibrationLatencies = [];
  let priorInsertion = null;
  let correctionSincePrior = false;

  for (const event of events) {
    if (CORRECTION_TYPES.has(event?.type)) {
      correctionSincePrior = true;
      continue;
    }
    if (!INSERTION_TYPES.has(event?.type)) continue;

    const latency = event?.latencyFromPriorInsertionMs;
    const segment = timingSegmentId(event);
    const priorSegment = priorInsertion ? timingSegmentId(priorInsertion) : null;
    let exclusionReason = null;
    let hardInterruption = false;

    if (!priorInsertion) exclusionReason = "segment-start";
    else if (segment !== priorSegment) {
      exclusionReason = event?.timingSegmentStartReason === "restore" ? "segment-start" : "timing-boundary";
    } else if (correctionSincePrior) exclusionReason = "post-correction";
    else if (!Number.isFinite(latency) || latency < 0) exclusionReason = "invalid-latency";
    else if (latency >= policy.hardInterruptionMs) hardInterruption = true;
    else if (!isCorrectInsertion(event) || !isCorrectInsertion(priorInsertion)) exclusionReason = "correctness";

    const baselineEligible = !exclusionReason && !hardInterruption;
    if (baselineEligible) calibrationLatencies.push(latency);

    candidates.push({ event, latency, exclusionReason, hardInterruption, baselineEligible });
    priorInsertion = event;
    correctionSincePrior = false;
  }

  return { candidates, calibrationLatencies };
}

function thresholdFromCalibration(values, policy) {
  const median = practiceMedian(values, { min: 0, max: policy.hardInterruptionMs });
  const mad = practiceMad(values, { min: 0, max: policy.hardInterruptionMs });
  const robustScale = practiceRobustScale(values, { min: 0, max: policy.hardInterruptionMs });
  if (median == null || mad == null || robustScale == null) return { median, mad, robustScale, threshold: null };
  const raw = Math.max(
    policy.minimumAdaptiveThresholdMs,
    policy.medianMultiplier * median,
    median + policy.robustSigmaMultiplier * robustScale,
  );
  const threshold = Math.min(policy.maximumAdaptiveThresholdMs, Math.max(policy.minimumAdaptiveThresholdMs, raw));
  return { median, mad, robustScale, threshold };
}

export function classifyPracticeLatencyEvents({
  events = [],
  traceMetadata = {},
  policy = PRACTICE_LATENCY_POLICY_V1,
} = {}) {
  if (!Array.isArray(events)) throw new TypeError("Practice latency classification requires an event array");
  validatePolicy(policy);
  const coverage = normalizedTraceMetadata(events, traceMetadata);
  const { candidates, calibrationLatencies } = deriveCandidates(events, policy);
  const calibrationStats = thresholdFromCalibration(calibrationLatencies, policy);
  const adaptive = calibrationLatencies.length >= policy.minimumCalibrationSamples;
  const thresholdMs = adaptive ? calibrationStats.threshold : null;
  const classifiedTransitions = [];

  for (const candidate of candidates) {
    if (candidate.exclusionReason) {
      classifiedTransitions.push(transitionRecord(candidate.event, candidate.latency, "excluded", candidate.exclusionReason));
      continue;
    }
    if (candidate.hardInterruption) {
      classifiedTransitions.push(transitionRecord(candidate.event, candidate.latency, "interruption", "hard-interruption"));
      continue;
    }
    if (!adaptive) {
      classifiedTransitions.push(transitionRecord(candidate.event, candidate.latency, "excluded", "insufficient-data"));
      continue;
    }
    classifiedTransitions.push(transitionRecord(
      candidate.event,
      candidate.latency,
      candidate.latency <= thresholdMs ? "fluent" : "disfluent",
      candidate.latency <= thresholdMs ? null : "adaptive-threshold",
    ));
  }

  const calibration = {
    status: adaptive ? "adaptive" : "insufficient-data",
    sampleCount: calibrationLatencies.length,
    confidence: confidenceForPolicy(calibrationLatencies.length, coverage, policy),
    baselineMedianMs: calibrationStats.median,
    baselineMadMs: calibrationStats.mad,
    robustScaleMs: calibrationStats.robustScale,
  };

  return freezeDeep({
    analysisVersion: PRACTICE_LATENCY_ANALYSIS_VERSION,
    classifierVersion: PRACTICE_LATENCY_CLASSIFIER_VERSION,
    policyVersion: policy.version,
    coverage,
    calibration,
    thresholdMs,
    classifiedTransitions,
  });
}

function countExcluded(classifiedTransitions) {
  const counts = {
    segmentStart: 0,
    timingBoundary: 0,
    postCorrection: 0,
    invalidLatency: 0,
    correctness: 0,
    insufficientData: 0,
    other: 0,
  };
  for (const item of classifiedTransitions) {
    if (item.classification !== "excluded") continue;
    if (item.reason === "segment-start") counts.segmentStart += 1;
    else if (item.reason === "timing-boundary") counts.timingBoundary += 1;
    else if (item.reason === "post-correction") counts.postCorrection += 1;
    else if (item.reason === "invalid-latency") counts.invalidLatency += 1;
    else if (item.reason === "correctness") counts.correctness += 1;
    else if (item.reason === "insufficient-data") counts.insufficientData += 1;
    else counts.other += 1;
  }
  return counts;
}

export function analyzePracticeLatency({
  events = [],
  traceMetadata = {},
  policy = PRACTICE_LATENCY_POLICY_V1,
} = {}) {
  const classified = classifyPracticeLatencyEvents({ events, traceMetadata, policy });
  const fluent = classified.classifiedTransitions.filter((item) => item.classification === "fluent");
  const disfluent = classified.classifiedTransitions.filter((item) => item.classification === "disfluent");
  const interruptions = classified.classifiedTransitions.filter((item) => item.classification === "interruption");
  const excluded = classified.classifiedTransitions.filter((item) => item.classification === "excluded");
  const fluentLatencies = fluent.map((item) => item.latencyMs);
  const disfluentLatencies = disfluent.map((item) => item.latencyMs);
  const longHesitationCount = classified.classifiedTransitions.filter((item) => Number.isFinite(item.latencyMs) && item.latencyMs >= policy.longHesitationMs).length;
  const longestEligibleLatencyMs = classified.classifiedTransitions
    .filter((item) => ["fluent", "disfluent"].includes(item.classification))
    .reduce((max, item) => Math.max(max, item.latencyMs), -Infinity);
  const normalDenominator = fluent.length + disfluent.length;
  const interruptionDenominator = normalDenominator + interruptions.length;

  const sessionSummary = {
    analysisVersion: PRACTICE_LATENCY_ANALYSIS_VERSION,
    classifierVersion: PRACTICE_LATENCY_CLASSIFIER_VERSION,
    policyVersion: policy.version,
    coverage: classified.coverage,
    calibration: classified.calibration,
    classifiedInsertionTransitionCount: classified.classifiedTransitions.length,
    calibrationSampleCount: classified.calibration.sampleCount,
    eligibleTransitionCount: normalDenominator,
    fluentTransitionCount: fluent.length,
    disfluentTransitionCount: disfluent.length,
    interruptionCount: interruptions.length,
    excludedTransitionCount: excluded.length,
    excludedReasons: countExcluded(classified.classifiedTransitions),
    disfluencyRate: normalDenominator > 0 ? disfluent.length / normalDenominator : null,
    interruptionRate: interruptionDenominator > 0 ? interruptions.length / interruptionDenominator : null,
    fluentMedianMs: fluent.length ? practiceMedian(fluentLatencies) : null,
    fluentMadMs: fluent.length ? practiceMad(fluentLatencies) : null,
    fluentP90Ms: fluent.length ? practiceQuantile(fluentLatencies, 0.9) : null,
    disfluentMedianMs: disfluent.length ? practiceMedian(disfluentLatencies) : null,
    thresholdMs: classified.thresholdMs,
    longHesitationCount,
    longestEligibleLatencyMs: Number.isFinite(longestEligibleLatencyMs) ? longestEligibleLatencyMs : null,
  };

  return freezeDeep({
    ...classified,
    sessionSummary,
  });
}

export function summarizePracticeLatencyByEntity({
  classifiedEvents = [],
  entityResolver,
} = {}) {
  if (!Array.isArray(classifiedEvents) || typeof entityResolver !== "function") throw new TypeError("Practice entity latency summary requires classifiedEvents and entityResolver");
  const groups = new Map();
  for (const event of classifiedEvents) {
    const resolved = entityResolver(event);
    const entities = Array.isArray(resolved) ? resolved : resolved ? [resolved] : [];
    for (const entity of entities) {
      if (!entity || typeof entity.entityType !== "string" || typeof entity.entityKey !== "string") continue;
      const key = `${entity.entityType}\u0000${entity.entityKey}`;
      if (!groups.has(key)) groups.set(key, { entityType: entity.entityType, entityKey: entity.entityKey, fluent: [], disfluent: [], interruptions: 0, excluded: 0 });
      const group = groups.get(key);
      if (event.classification === "fluent" && Number.isFinite(event.latencyMs)) group.fluent.push(event.latencyMs);
      else if (event.classification === "disfluent" && Number.isFinite(event.latencyMs)) group.disfluent.push(event.latencyMs);
      else if (event.classification === "interruption") group.interruptions += 1;
      else if (event.classification === "excluded") group.excluded += 1;
    }
  }
  return freezeDeep([...groups.values()]
    .sort((a, b) => a.entityType.localeCompare(b.entityType) || a.entityKey.localeCompare(b.entityKey))
    .map((group) => ({
      entityType: group.entityType,
      entityKey: group.entityKey,
      fluentCount: group.fluent.length,
      disfluentCount: group.disfluent.length,
      interruptionCount: group.interruptions,
      excludedCount: group.excluded,
      fluentMedianMs: group.fluent.length ? practiceMedian(group.fluent) : null,
      fluentMadMs: group.fluent.length ? practiceMad(group.fluent) : null,
      disfluentMedianMs: group.disfluent.length ? practiceMedian(group.disfluent) : null,
    })));
}
