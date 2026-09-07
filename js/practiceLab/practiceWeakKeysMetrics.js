import { practiceMedian } from "./practiceRobustStats.js";
import { buildPracticeSessionExecutionQuality } from "./practiceExecutionQuality.js";
import { PRACTICE_WEAK_KEYS_MIN_QUALITY_COVERAGE } from "./practiceWeakKeysConstants.js";

const INSERTION_TYPES = new Set(["character", "space"]);
const POSITION_KEYS = Object.freeze(["word-start", "word-middle", "word-end", "single-character-word", "non-word", "unknown"]);
const GEOMETRY_KEYS = Object.freeze(["same-key", "same-side-near", "same-side-far", "cross-side", "unknown"]);
const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const mean = (values) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const correct = (event) => event?.correctness === "correct" || event?.correctness === true;

function counts(keys) { return Object.fromEntries(keys.map((key) => [key, 0])); }
function increment(target, key, keys) { target[keys.includes(key) ? key : "unknown"] += 1; }

function firstAttemptsByPosition(eventTrace) {
  const result = new Map();
  for (const event of Array.isArray(eventTrace) ? eventTrace : []) {
    if (!INSERTION_TYPES.has(event?.type) || event?.isFirstAttempt !== true || !Number.isInteger(event?.textPosition)) continue;
    if (!result.has(event.textPosition)) result.set(event.textPosition, event);
  }
  return result;
}

function normalizedByPosition(foundationAnalysis) {
  const result = new Map();
  for (const transition of foundationAnalysis?.normalization?.normalizedTransitions ?? []) {
    if (!Number.isInteger(transition?.textPosition) || transition?.isFirstAttempt !== true) continue;
    if (!result.has(transition.textPosition)) result.set(transition.textPosition, transition);
  }
  return result;
}

function compactCoverage(positionCounts, geometryCounts) {
  const knownPositionCount = POSITION_KEYS.filter((key) => key !== "unknown").reduce((sum, key) => sum + positionCounts[key], 0);
  const positionTotal = knownPositionCount + positionCounts.unknown;
  const knownGeometryCount = GEOMETRY_KEYS.filter((key) => key !== "unknown").reduce((sum, key) => sum + geometryCounts[key], 0);
  const geometryTotal = knownGeometryCount + geometryCounts.unknown;
  return {
    positionCoverage: {
      status: knownPositionCount ? "available" : "unavailable",
      knownCount: knownPositionCount,
      totalCount: positionTotal,
      coverageRate: positionTotal ? knownPositionCount / positionTotal : null,
      classCount: POSITION_KEYS.filter((key) => !["unknown", "non-word"].includes(key) && positionCounts[key] > 0).length,
      counts: positionCounts,
    },
    incomingGeometryCoverage: {
      status: knownGeometryCount ? "available" : "unavailable",
      knownCount: knownGeometryCount,
      totalCount: geometryTotal,
      coverageRate: geometryTotal ? knownGeometryCount / geometryTotal : null,
      classCount: GEOMETRY_KEYS.filter((key) => key !== "unknown" && geometryCounts[key] > 0).length,
      counts: geometryCounts,
    },
  };
}

export function buildPracticeWeakKeysProbeMetrics({
  eventTrace = [],
  foundationAnalysis = null,
  targetPositions = [],
  expectedEntityKey,
} = {}) {
  const positions = [...new Set((Array.isArray(targetPositions) ? targetPositions : []).filter(Number.isInteger))].sort((a, b) => a - b);
  const firstAttempts = firstAttemptsByPosition(eventTrace);
  const normalized = normalizedByPosition(foundationAnalysis);
  let observed = 0;
  let errorCount = 0;
  let timingEligibleCount = 0;
  let disfluentCount = 0;
  const fluentLatencies = [];
  const residuals = [];
  const positionCounts = counts(POSITION_KEYS);
  const geometryCounts = counts(GEOMETRY_KEYS);

  for (const position of positions) {
    const event = firstAttempts.get(position);
    if (!event || event.expected !== expectedEntityKey) continue;
    observed += 1;
    if (!correct(event)) errorCount += 1;
    const transition = normalized.get(position);
    if (!transition) {
      increment(positionCounts, "unknown", POSITION_KEYS);
      increment(geometryCounts, "unknown", GEOMETRY_KEYS);
      continue;
    }
    increment(positionCounts, transition.features?.wordPositionClass ?? "unknown", POSITION_KEYS);
    increment(geometryCounts, transition.features?.geometryKnown ? transition.features?.geometryClass : "unknown", GEOMETRY_KEYS);
    if (["fluent", "disfluent"].includes(transition.latencyClass)) {
      timingEligibleCount += 1;
      if (transition.latencyClass === "disfluent") disfluentCount += 1;
    }
    if (correct(event) && transition.latencyClass === "fluent" && finite(transition.observedLatencyMs)) {
      fluentLatencies.push(transition.observedLatencyMs);
      if (finite(transition.residualLatencyMs)) residuals.push(transition.residualLatencyMs);
    }
  }

  const quality = buildPracticeSessionExecutionQuality({
    entityType: "key",
    opportunityCount: observed,
    errorCount,
    timingEligibleCount,
    disfluentCount,
    fluentLatencyMeanMs: mean(fluentLatencies),
    fluentResidualMeanMs: mean(residuals),
    fluentResidualCount: residuals.length,
    minimumAvailableWeight: PRACTICE_WEAK_KEYS_MIN_QUALITY_COVERAGE,
  });
  const coverage = compactCoverage(positionCounts, geometryCounts);
  return freezeDeep({
    opportunityCount: observed,
    quality: quality.quality,
    qualityCoverage: quality.availableQualityWeight,
    firstPassAccuracy: observed ? (observed - errorCount) / observed : null,
    normalizedResidualMedianMs: residuals.length ? practiceMedian(residuals) : null,
    normalizedResidualMeanMs: mean(residuals),
    disfluencyRate: timingEligibleCount ? disfluentCount / timingEligibleCount : null,
    positionCoverage: coverage.positionCoverage,
    incomingGeometryCoverage: coverage.incomingGeometryCoverage,
    qualityComponents: quality.components,
  });
}
