export const PRACTICE_BURST_SPRINTS_EXPERIMENT_ID = "burst-sprints";
export const PRACTICE_BURST_SPRINTS_EXPERIMENT_VERSION = 1;
export const PRACTICE_BURST_SPRINTS_PROTOCOL_VERSION = 1;
export const PRACTICE_BURST_SPRINT_COUNT = 6;
export const PRACTICE_BURST_SPRINT_DURATION_MS = 10_000;
export const PRACTICE_BURST_RECOVERY_DURATION_MS = 15_000;
export const PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS = PRACTICE_BURST_SPRINT_COUNT * PRACTICE_BURST_SPRINT_DURATION_MS;
export const PRACTICE_BURST_TOTAL_RECOVERY_DURATION_MS = (PRACTICE_BURST_SPRINT_COUNT - 1) * PRACTICE_BURST_RECOVERY_DURATION_MS;
export const PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS = PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS + PRACTICE_BURST_TOTAL_RECOVERY_DURATION_MS;
export const PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS = 3;
export const PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT = 3;
export const PRACTICE_BURST_MIN_SPRINT_ACCURACY = 88;
export const PRACTICE_BURST_MIN_SPRINT_CHARACTERS = 25;
export const PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS = 10_000;

export const PRACTICE_BURST_SPRINT_IDS = Object.freeze(
  Array.from({ length: PRACTICE_BURST_SPRINT_COUNT }, (_, index) => `sprint-${index + 1}`),
);

export const PRACTICE_BURST_SPRINTS_POLICY_V1 = Object.freeze({
  protocolVersion: PRACTICE_BURST_SPRINTS_PROTOCOL_VERSION,
  sprintCount: PRACTICE_BURST_SPRINT_COUNT,
  sprintDurationMs: PRACTICE_BURST_SPRINT_DURATION_MS,
  recoveryDurationMs: PRACTICE_BURST_RECOVERY_DURATION_MS,
  totalActiveDurationMs: PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
  totalRecoveryDurationMs: PRACTICE_BURST_TOTAL_RECOVERY_DURATION_MS,
  totalProtocolDurationMs: PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS,
  minimumEligibleSprints: PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS,
  estimatorSprintCount: PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT,
  minimumSprintAccuracy: PRACTICE_BURST_MIN_SPRINT_ACCURACY,
  minimumSprintCharacters: PRACTICE_BURST_MIN_SPRINT_CHARACTERS,
  syntheticMeasurementDurationMs: PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS,
});

export function validatePracticeBurstSprintsPolicy(policy = PRACTICE_BURST_SPRINTS_POLICY_V1) {
  if (!policy || policy.protocolVersion !== PRACTICE_BURST_SPRINTS_PROTOCOL_VERSION) return false;
  if (policy.sprintCount !== 6 || policy.sprintDurationMs !== 10_000 || policy.recoveryDurationMs !== 15_000) return false;
  if (policy.totalActiveDurationMs !== 60_000 || policy.totalRecoveryDurationMs !== 75_000 || policy.totalProtocolDurationMs !== 135_000) return false;
  if (policy.minimumEligibleSprints !== 3 || policy.estimatorSprintCount !== 3) return false;
  if (policy.minimumSprintAccuracy !== 88 || policy.minimumSprintCharacters !== 25) return false;
  if (policy.syntheticMeasurementDurationMs !== 10_000) return false;
  return true;
}
