import { buildPracticeBurstAbilityMeasurement } from "./practiceBurstSprintsMeasurement.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const round = (value, digits = 1) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;

export function analyzePracticeBurstSprintsResult({ burstResult, plan, foundationAnalysis = null } = {}) {
  const measurement = buildPracticeBurstAbilityMeasurement(burstResult);
  const referenceWpm = Number.isFinite(plan?.referenceControlledWpm) && plan.referenceControlledWpm > 0 ? plan.referenceControlledWpm : null;
  const reserveWpm = measurement && referenceWpm ? measurement.wpm - referenceWpm : null;
  const reservePercent = measurement && referenceWpm ? (reserveWpm / referenceWpm) * 100 : null;
  const eligible = (burstResult?.sprints ?? []).filter((sprint) => sprint?.eligible);
  const mean = eligible.length ? eligible.reduce((sum, sprint) => sum + sprint.correctedWpm, 0) / eligible.length : null;
  const variance = eligible.length && Number.isFinite(mean)
    ? eligible.reduce((sum, sprint) => sum + (sprint.correctedWpm - mean) ** 2, 0) / eligible.length
    : null;
  const coefficientOfVariation = Number.isFinite(mean) && mean > 0 && Number.isFinite(variance) ? Math.sqrt(variance) / mean : null;

  const trainingQuality = freezeDeep({
    artifactVersion: 1,
    kind: "burst-sprints",
    status: burstResult?.status ?? "incomplete",
    validMeasurement: Boolean(measurement),
    burstEstimateWpm: round(measurement?.wpm),
    rawBurstEstimateWpm: round(measurement?.rawWpm),
    burstAccuracy: round(measurement?.accuracy),
    selectedSprintIds: measurement?.selectedSprintIds ?? [],
    selectedSprintWpms: measurement?.selectedSprintWpms?.map((value) => round(value)) ?? [],
    eligibleSprintCount: burstResult?.eligibleSprintCount ?? 0,
    completedSprintCount: burstResult?.completedSprintCount ?? 0,
    referenceControlledWpm: round(referenceWpm),
    burstReserveWpm: round(reserveWpm),
    burstReservePercent: round(reservePercent),
    eligibleSprintCv: round(coefficientOfVariation, 3),
    abilityStatus: foundationAnalysis?.ability?.status ?? null,
    abilityReasons: foundationAnalysis?.ability?.reasons ?? [],
    sprints: (burstResult?.sprints ?? []).map((sprint) => freezeDeep({
      sprintId: sprint.sprintId,
      sprintOrdinal: sprint.sprintOrdinal,
      correctedWpm: round(sprint.correctedWpm),
      rawWpm: round(sprint.rawWpm),
      strictAccuracy: round(sprint.strictAccuracy),
      correctionOverheadRate: round(sprint.correctionOverheadRate, 3),
      acceptedInsertions: sprint.acceptedInsertions,
      completed: sprint.completed,
      eligible: sprint.eligible,
    })),
    interpretation: measurement
      ? "Burst estimate is the median of the three fastest eligible controlled 10-second sprints. It is not a single-sprint personal best."
      : "No burst ability observation was admitted because the complete protocol did not contain at least three eligible controlled sprints.",
  });

  return freezeDeep({
    trainingQuality,
    recommendationIds: measurement ? ["burst-control"] : ["burst-repeat-clean"],
  });
}
