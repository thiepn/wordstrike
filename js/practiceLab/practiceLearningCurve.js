import { practiceMad, practiceMedian, practiceQuantile } from "./practiceRobustStats.js";
import { PRACTICE_LEARNING_CURVE_VERSION } from "./practiceLearningConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const DAY_MS = 86_400_000;
const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function buildPracticeTheilSenFit(points) {
  const source = (Array.isArray(points) ? points : []).filter((point) => finite(point?.x) && finite(point?.y));
  const slopes = [];
  for (let left = 0; left < source.length; left += 1) {
    for (let right = left + 1; right < source.length; right += 1) {
      const dx = source[right].x - source[left].x;
      if (!finite(dx) || Math.abs(dx) < 1e-12) continue;
      slopes.push((source[right].y - source[left].y) / dx);
    }
  }
  if (!slopes.length) return freezeDeep({
    pointCount: source.length,
    pairCount: 0,
    medianSlope: null,
    slopeP10: null,
    slopeP90: null,
    improvingPairFraction: null,
    worseningPairFraction: null,
    intercept: null,
    residualMad: null,
  });
  const medianSlope = practiceMedian(slopes);
  const intercept = practiceMedian(source.map((point) => point.y - medianSlope * point.x));
  const residuals = source.map((point) => point.y - (intercept + medianSlope * point.x));
  return freezeDeep({
    pointCount: source.length,
    pairCount: slopes.length,
    medianSlope,
    slopeP10: practiceQuantile(slopes, 0.10),
    slopeP90: practiceQuantile(slopes, 0.90),
    improvingPairFraction: slopes.filter((value) => value > 0).length / slopes.length,
    worseningPairFraction: slopes.filter((value) => value < 0).length / slopes.length,
    intercept,
    residualMad: practiceMad(residuals),
  });
}

function distinctDays(points) {
  return new Set(points.map((point) => point.localDayKey).filter((value) => typeof value === "string")).size;
}

function confidenceFor(fit, points, curvePolicy) {
  const dayCount = distinctDays(points);
  const minimumDose = points.length ? Math.min(...points.map((point) => point.x)) : null;
  const maximumDose = points.length ? Math.max(...points.map((point) => point.x)) : null;
  const doseSpan = finite(minimumDose) && finite(maximumDose) ? maximumDose - minimumDose : 0;
  if (points.length < curvePolicy.minimumPoints || dayCount < curvePolicy.minimumDays || doseSpan < curvePolicy.minimumDoseSpan || !finite(fit.medianSlope)) return "none";
  const high = curvePolicy.high;
  if (points.length >= high.points && dayCount >= high.days && doseSpan >= high.doseSpan && finite(fit.residualMad) && fit.residualMad <= high.maxResidualMad) return "high";
  const medium = curvePolicy.medium;
  if (points.length >= medium.points && dayCount >= medium.days && doseSpan >= medium.doseSpan && finite(fit.residualMad) && fit.residualMad <= medium.maxResidualMad) return "medium";
  return "low";
}

function statusFor(fit, confidence, curvePolicy) {
  if (confidence === "none" || !finite(fit.medianSlope)) return "insufficient-data";
  if (fit.medianSlope >= curvePolicy.meaningfulGainPerDose && fit.improvingPairFraction >= curvePolicy.improvingPairFraction) return "improving";
  if (fit.medianSlope <= -curvePolicy.meaningfulGainPerDose && fit.worseningPairFraction >= curvePolicy.worseningPairFraction) return "worsening";
  if (Math.abs(fit.medianSlope) <= curvePolicy.flatGainPerDose && ["medium", "high"].includes(confidence)) return "flat";
  return "uncertain";
}

function marginalGainStatus(recentSlope, recentConfidence, policy) {
  if (!finite(recentSlope) || recentConfidence === "none") return "unknown";
  if (recentSlope >= policy.marginalGain.high) return "high";
  if (recentSlope >= policy.marginalGain.moderate) return "moderate";
  if (recentSlope <= policy.marginalGain.negative) return "negative";
  return "low";
}

function practiceGainSummary(observations, policy) {
  const recent = observations
    .filter((observation) => finite(observation?.practiceGain))
    .slice(-policy.practiceGain.window)
    .map((observation) => observation.practiceGain);
  if (recent.length < policy.practiceGain.minimumPoints) return { median: null, mad: null };
  return { median: practiceMedian(recent), mad: practiceMad(recent) };
}

function buildCurve({ observations, observationCount, kind, policy }) {
  const curvePolicy = kind === "transfer" ? policy.transferCurve : policy.acquisitionCurve;
  const valid = (Array.isArray(observations) ? observations : [])
    .map((observation) => ({
      observation,
      x: kind === "transfer" ? observation.cumulativeDoseAtObservation : observation.cumulativeDoseBefore,
      y: kind === "transfer" ? observation.quality : observation.entryQuality,
      localDayKey: observation.localDayKey,
    }))
    .filter((point) => finite(point.x) && finite(point.y));
  const historicalPoints = valid.slice(-curvePolicy.historicalWindow);
  const fit = buildPracticeTheilSenFit(historicalPoints);
  const confidence = confidenceFor(fit, historicalPoints, curvePolicy);
  const status = statusFor(fit, confidence, curvePolicy);
  const recentPoints = valid.slice(-curvePolicy.recentWindow);
  const recentFit = recentPoints.length >= curvePolicy.recentMinimumPoints ? buildPracticeTheilSenFit(recentPoints) : null;
  const recentConfidence = recentFit ? confidenceFor(recentFit, recentPoints, {
    ...curvePolicy,
    minimumPoints: curvePolicy.recentMinimumPoints,
  }) : "none";
  const recentSlope = recentFit?.medianSlope ?? null;
  const minimumDose = historicalPoints.length ? Math.min(...historicalPoints.map((point) => point.x)) : null;
  const maximumDose = historicalPoints.length ? Math.max(...historicalPoints.map((point) => point.x)) : null;
  const gains = kind === "acquisition" ? practiceGainSummary(observations, policy) : { median: null, mad: null };
  const scope = Number(observationCount || 0) > (kind === "transfer" ? policy.rings.transfer : policy.rings.acquisition)
    ? "recent-window"
    : "full-history";
  return freezeDeep({
    curveVersion: PRACTICE_LEARNING_CURVE_VERSION,
    status,
    confidence,
    scope,
    pointCount: historicalPoints.length,
    sessionCount: new Set(historicalPoints.map((point) => point.observation.sessionId)).size,
    dayCount: distinctDays(historicalPoints),
    minimumDose,
    maximumDose,
    doseSpan: finite(minimumDose) && finite(maximumDose) ? maximumDose - minimumDose : 0,
    medianSlopePointsPerDose: fit.medianSlope,
    slopeP10: fit.slopeP10,
    slopeP90: fit.slopeP90,
    improvingPairFraction: fit.improvingPairFraction,
    worseningPairFraction: fit.worseningPairFraction,
    fitResidualMad: fit.residualMad,
    firstQuality: historicalPoints[0]?.y ?? null,
    recentQuality: historicalPoints.at(-1)?.y ?? null,
    recentSlopePointsPerDose: recentSlope,
    recentConfidence,
    marginalGainStatus: marginalGainStatus(recentSlope, recentConfidence, policy),
    medianPracticeGain: gains.median,
    practiceGainMad: gains.mad,
  });
}

export function buildPracticeAcquisitionCurve(observations, { observationCount = observations?.length ?? 0, policy = PRACTICE_LEARNING_POLICY_V1 } = {}) {
  return buildCurve({ observations, observationCount, kind: "acquisition", policy });
}

export function buildPracticeTransferCurve(observations, { observationCount = observations?.length ?? 0, policy = PRACTICE_LEARNING_POLICY_V1 } = {}) {
  return buildCurve({ observations, observationCount, kind: "transfer", policy });
}

export function buildPracticeElapsedDayPoints(observations, valueSelector) {
  const source = (Array.isArray(observations) ? observations : [])
    .filter((observation) => Number.isFinite(Date.parse(observation?.completedAtUtc)))
    .sort((a, b) => Date.parse(a.completedAtUtc) - Date.parse(b.completedAtUtc));
  if (!source.length) return Object.freeze([]);
  const origin = Date.parse(source[0].completedAtUtc);
  return Object.freeze(source.map((observation) => Object.freeze({
    observation,
    x: (Date.parse(observation.completedAtUtc) - origin) / DAY_MS,
    y: valueSelector(observation),
    localDayKey: observation.localDayKey,
  })).filter((point) => finite(point.y)));
}
