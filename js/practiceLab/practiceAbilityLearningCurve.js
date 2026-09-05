import { practiceMedian } from "./practiceRobustStats.js";
import { buildPracticeElapsedDayPoints, buildPracticeTheilSenFit } from "./practiceLearningCurve.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";

const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function buildPracticeAbilityLearningCurve(abilityState, { policy = PRACTICE_LEARNING_POLICY_V1 } = {}) {
  const observations = (abilityState?.recentObservations ?? [])
    .filter((observation) => observation?.channel === "cold-natural-text" && finite(observation?.adjustedWpm) && observation.adjustedWpm > 0);
  const points = buildPracticeElapsedDayPoints(observations, (observation) => Math.log(observation.adjustedWpm));
  const fit = buildPracticeTheilSenFit(points);
  const dayCount = new Set(points.map((point) => point.localDayKey)).size;
  const spanDays = points.length ? points.at(-1).x - points[0].x : 0;
  const medianMeasurementSigmaLog = practiceMedian(points.map((point) => point.observation.measurementSigmaLog));
  const p = policy.abilityCurve;
  let confidence = "none";
  if (points.length >= p.minimumObservations && dayCount >= p.minimumDays && spanDays >= p.minimumSpanDays && finite(fit.medianSlope)) {
    confidence = "low";
    if (points.length >= p.high.observations && dayCount >= p.high.days && spanDays >= p.high.spanDays && finite(medianMeasurementSigmaLog) && medianMeasurementSigmaLog <= p.high.maxMedianSigmaLog) confidence = "high";
    else if (points.length >= p.medium.observations && dayCount >= p.medium.days && spanDays >= p.medium.spanDays && finite(medianMeasurementSigmaLog) && medianMeasurementSigmaLog <= p.medium.maxMedianSigmaLog) confidence = "medium";
  }
  const weeklyRelativeGain = finite(fit.medianSlope) ? Math.exp(7 * fit.medianSlope) - 1 : null;
  let status = "insufficient-data";
  if (confidence !== "none") {
    if (weeklyRelativeGain >= p.improvingWeeklyRelativeGain && fit.improvingPairFraction >= p.pairFraction) status = "improving";
    else if (weeklyRelativeGain <= p.decliningWeeklyRelativeGain && fit.worseningPairFraction >= p.pairFraction) status = "declining";
    else if (Math.abs(weeklyRelativeGain) <= p.stableWeeklyRelativeGain && ["medium", "high"].includes(confidence)) status = "stable";
    else status = "uncertain";
  }
  return freezeDeep({
    channel: "cold-natural-text",
    status,
    confidence,
    observationCount: points.length,
    dayCount,
    spanDays,
    slopeLogPerDay: fit.medianSlope,
    weeklyRelativeGain,
    improvingPairFraction: fit.improvingPairFraction,
    worseningPairFraction: fit.worseningPairFraction,
    fitResidualMadLog: fit.residualMad,
    medianMeasurementSigmaLog,
    currentAdjustedWpm: points.at(-1)?.observation?.adjustedWpm ?? null,
    source: "pl13-recent-observations",
    valueTransform: "log(adjustedWpm)",
  });
}
