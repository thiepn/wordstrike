import {
  PRACTICE_BURST_EFFECTIVE_SAMPLE_N,
  PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT,
  PRACTICE_BURST_ESTIMATOR_VERSION,
  PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS,
  PRACTICE_BURST_MIN_SPREAD_SIGMA,
  PRACTICE_BURST_SELECTION_PENALTY_SIGMA,
  PRACTICE_BURST_SIGMA_MAX,
  PRACTICE_BURST_SIGMA_MIN,
  PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS,
} from "./practiceBurstSprintsConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const median = (values) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return null; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
const mad = (values) => { const center = median(values); return Number.isFinite(center) ? median(values.map((value) => Math.abs(value - center))) : null; };

export function selectPracticeBurstEstimatorSprints(result, { difficultyAdjustmentLog = 0 } = {}) {
  if (!result || result.status !== "complete" || result.interrupted) return [];
  const adjustment = Number.isFinite(difficultyAdjustmentLog) ? difficultyAdjustmentLog : 0;
  const eligible = (result.sprints ?? []).filter((sprint) => sprint?.eligible === true && Number.isFinite(sprint.burstEffectiveWpm) && sprint.burstEffectiveWpm > 0)
    .map((sprint) => ({ ...sprint, adjustedLogPerformance: Math.log(sprint.burstEffectiveWpm) + adjustment }));
  if (eligible.length < PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS) return [];
  return eligible.slice().sort((left, right) => right.adjustedLogPerformance - left.adjustedLogPerformance || left.sprintOrdinal - right.sprintOrdinal).slice(0, PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT);
}

export function calculatePracticeBurstSessionSigma(selected, individualSigmas = {}) {
  if (!Array.isArray(selected) || selected.length !== PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT) return null;
  const sigmaIndividual = median(selected.map((sprint) => individualSigmas[sprint.sprintId]).filter(Number.isFinite));
  if (!Number.isFinite(sigmaIndividual)) return null;
  const ys = selected.map((sprint) => sprint.adjustedLogPerformance);
  const sigmaSpread = Math.max(1.4826 * (mad(ys) ?? 0), PRACTICE_BURST_MIN_SPREAD_SIGMA);
  const sigmaBurst = clamp(Math.sqrt((sigmaIndividual ** 2) / PRACTICE_BURST_EFFECTIVE_SAMPLE_N + sigmaSpread ** 2 + PRACTICE_BURST_SELECTION_PENALTY_SIGMA ** 2), PRACTICE_BURST_SIGMA_MIN, PRACTICE_BURST_SIGMA_MAX);
  return freezeDeep({ sigmaIndividual, sigmaSpread, selectionPenalty: PRACTICE_BURST_SELECTION_PENALTY_SIGMA, effectiveSampleN: PRACTICE_BURST_EFFECTIVE_SAMPLE_N, measurementSigmaLog: sigmaBurst });
}

export function buildPracticeBurstAbilityMeasurement(result, { difficultyAdjustmentLog = 0, difficultyIndex = null, difficultyModelStatus = "insufficient", difficultyCoverage = 0, individualSigmas = {} } = {}) {
  const selected = selectPracticeBurstEstimatorSprints(result, { difficultyAdjustmentLog });
  if (selected.length !== PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT) return null;
  const adjustedLogPerformance = median(selected.map((sprint) => sprint.adjustedLogPerformance));
  const sigma = calculatePracticeBurstSessionSigma(selected, individualSigmas);
  if (!Number.isFinite(adjustedLogPerformance) || !sigma) return null;
  const adjustedWpm = Math.exp(adjustedLogPerformance);
  const rawSessionLog = median(selected.map((sprint) => Math.log(sprint.burstEffectiveWpm)));
  const wpm = Math.exp(rawSessionLog);
  const totalOpportunities = selected.reduce((sum, sprint) => sum + sprint.firstPassOpportunityCount, 0);
  const totalCorrect = selected.reduce((sum, sprint) => sum + sprint.correctFirstPassAttempts, 0);
  const accuracy = totalOpportunities > 0 ? clamp((totalCorrect / totalOpportunities) * 100, 0, 100) : null;
  if (!Number.isFinite(accuracy)) return null;
  const equivalentTypedCharacters = Math.max(30, Math.round(wpm * 5 * (PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS / 60_000)));
  const reliabilityWeight = clamp((0.12 / sigma.measurementSigmaLog) ** 2, 0.1, 4);
  return freezeDeep({
    measurementVersion: PRACTICE_BURST_ESTIMATOR_VERSION,
    estimator: "median-of-top-three-adjusted-burst-effective-logs",
    wpm,
    rawWpm: wpm,
    adjustedWpm,
    adjustedLogPerformance,
    accuracy,
    activeDurationMs: PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS,
    typedCharacterCount: equivalentTypedCharacters,
    difficultyIndex: Number.isFinite(difficultyIndex) ? difficultyIndex : null,
    difficultyAdjustmentLog: Number.isFinite(difficultyAdjustmentLog) ? difficultyAdjustmentLog : 0,
    difficultyModelStatus,
    difficultyCoverage: Number.isFinite(difficultyCoverage) ? difficultyCoverage : 0,
    measurementSigmaLog: sigma.measurementSigmaLog,
    measurementVarianceLog: sigma.measurementSigmaLog ** 2,
    reliabilityWeight,
    sigmaIndividual: sigma.sigmaIndividual,
    sigmaSpread: sigma.sigmaSpread,
    selectionPenaltySigma: sigma.selectionPenalty,
    effectiveSampleN: sigma.effectiveSampleN,
    selectedSprintIds: selected.map((sprint) => sprint.sprintId),
    selectedSprintWpms: selected.map((sprint) => sprint.burstEffectiveWpm),
    selectedAdjustedLogs: selected.map((sprint) => sprint.adjustedLogPerformance),
    observedSprintCount: result.sprints?.length ?? 0,
    eligibleSprintCount: result.eligibleSprintCount ?? selected.length,
  });
}
