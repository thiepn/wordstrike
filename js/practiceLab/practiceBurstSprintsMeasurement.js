import {
  PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT,
  PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS,
  PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS,
} from "./practiceBurstSprintsConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function selectPracticeBurstEstimatorSprints(result) {
  if (!result || result.status !== "complete" || result.interrupted) return [];
  const eligible = (result.sprints ?? []).filter((sprint) => sprint?.eligible === true && Number.isFinite(sprint.correctedWpm) && sprint.correctedWpm > 0);
  if (eligible.length < PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS) return [];
  return eligible
    .slice()
    .sort((left, right) => right.correctedWpm - left.correctedWpm || left.sprintOrdinal - right.sprintOrdinal)
    .slice(0, PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT);
}

export function buildPracticeBurstAbilityMeasurement(result) {
  const selected = selectPracticeBurstEstimatorSprints(result);
  if (selected.length !== PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT) return null;
  const correctedWpm = median(selected.map((sprint) => sprint.correctedWpm));
  const rawWpm = median(selected.map((sprint) => sprint.rawWpm));
  if (!Number.isFinite(correctedWpm) || correctedWpm <= 0) return null;
  const totalTyped = selected.reduce((sum, sprint) => sum + sprint.acceptedInsertions, 0);
  const totalCorrect = selected.reduce((sum, sprint) => sum + sprint.correctInsertions, 0);
  const accuracy = totalTyped > 0 ? Math.max(0, Math.min(100, (totalCorrect / totalTyped) * 100)) : null;
  if (!Number.isFinite(accuracy)) return null;
  const equivalentTypedCharacters = Math.max(25, Math.round(correctedWpm * 5 * (PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS / 60_000)));
  return freezeDeep({
    measurementVersion: 1,
    estimator: "median-of-top-three-controlled-sprints",
    wpm: correctedWpm,
    rawWpm: Number.isFinite(rawWpm) ? rawWpm : correctedWpm,
    accuracy,
    activeDurationMs: PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS,
    typedCharacterCount: equivalentTypedCharacters,
    selectedSprintIds: selected.map((sprint) => sprint.sprintId),
    selectedSprintWpms: selected.map((sprint) => sprint.correctedWpm),
    observedSprintCount: result.sprints?.length ?? 0,
    eligibleSprintCount: result.eligibleSprintCount ?? selected.length,
  });
}
