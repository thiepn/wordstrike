export const PRACTICE_BURST_SPRINTS_EXPERIMENT_ID = "burst-sprints";
export const PRACTICE_BURST_SPRINTS_EXPERIMENT_VERSION = 2;
export const PRACTICE_BURST_SPRINTS_PROTOCOL_VERSION = 2;
export const PRACTICE_BURST_SPRINTS_POLICY_VERSION = 2;
export const PRACTICE_BURST_ESTIMATOR_VERSION = 2;
export const PRACTICE_BURST_WARMUP_DURATION_MS = 30_000;
export const PRACTICE_BURST_SPRINT_COUNT = 6;
export const PRACTICE_BURST_SPRINT_DURATION_MS = 10_000;
export const PRACTICE_BURST_PREVIEW_DURATION_MS = 2_000;
export const PRACTICE_BURST_RECOVERY_DURATION_MS = 18_000;
export const PRACTICE_BURST_RECOVERY_COUNT = 5;
export const PRACTICE_BURST_TOTAL_SPRINT_ACTIVE_DURATION_MS = PRACTICE_BURST_SPRINT_COUNT * PRACTICE_BURST_SPRINT_DURATION_MS;
export const PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS = PRACTICE_BURST_WARMUP_DURATION_MS + PRACTICE_BURST_TOTAL_SPRINT_ACTIVE_DURATION_MS;
export const PRACTICE_BURST_TOTAL_PREVIEW_DURATION_MS = PRACTICE_BURST_SPRINT_COUNT * PRACTICE_BURST_PREVIEW_DURATION_MS;
export const PRACTICE_BURST_TOTAL_RECOVERY_DURATION_MS = PRACTICE_BURST_RECOVERY_COUNT * PRACTICE_BURST_RECOVERY_DURATION_MS;
export const PRACTICE_BURST_TOTAL_PROTOCOL_INACTIVE_DURATION_MS = PRACTICE_BURST_TOTAL_PREVIEW_DURATION_MS + PRACTICE_BURST_TOTAL_RECOVERY_DURATION_MS;
export const PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS = PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS + PRACTICE_BURST_TOTAL_PROTOCOL_INACTIVE_DURATION_MS;
export const PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS = 4;
export const PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT = 3;
export const PRACTICE_BURST_MIN_SPRINT_ACCURACY = 75;
export const PRACTICE_BURST_MIN_SPRINT_CHARACTERS = 30;
export const PRACTICE_BURST_MIN_FIRST_PASS_OPPORTUNITIES = 30;
export const PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS = 10_000;
export const PRACTICE_BURST_SELECTION_PENALTY_SIGMA = 0.04;
export const PRACTICE_BURST_MIN_SPREAD_SIGMA = 0.03;
export const PRACTICE_BURST_EFFECTIVE_SAMPLE_N = 2;
export const PRACTICE_BURST_SIGMA_MIN = 0.08;
export const PRACTICE_BURST_SIGMA_MAX = 0.25;

export const PRACTICE_BURST_SPRINT_IDS = Object.freeze(Array.from({ length: PRACTICE_BURST_SPRINT_COUNT }, (_, index) => `sprint-${index + 1}`));
export const PRACTICE_BURST_LEGACY_V1 = Object.freeze({ experimentVersion: 1, protocolVersion: 1, sprintCount: 6, sprintMs: 10_000, recoveryMs: 15_000, warmupMs: 0, previewMs: 0 });

export const PRACTICE_BURST_SPRINTS_POLICY_V1 = Object.freeze({
  policyVersion: PRACTICE_BURST_SPRINTS_POLICY_VERSION,
  protocolVersion: PRACTICE_BURST_SPRINTS_PROTOCOL_VERSION,
  estimatorVersion: PRACTICE_BURST_ESTIMATOR_VERSION,
  warmupDurationMs: PRACTICE_BURST_WARMUP_DURATION_MS,
  sprintCount: PRACTICE_BURST_SPRINT_COUNT,
  sprintDurationMs: PRACTICE_BURST_SPRINT_DURATION_MS,
  previewDurationMs: PRACTICE_BURST_PREVIEW_DURATION_MS,
  recoveryDurationMs: PRACTICE_BURST_RECOVERY_DURATION_MS,
  recoveryCount: PRACTICE_BURST_RECOVERY_COUNT,
  totalActiveDurationMs: PRACTICE_BURST_TOTAL_ACTIVE_DURATION_MS,
  totalProtocolInactiveDurationMs: PRACTICE_BURST_TOTAL_PROTOCOL_INACTIVE_DURATION_MS,
  totalProtocolDurationMs: PRACTICE_BURST_TOTAL_PROTOCOL_DURATION_MS,
  minimumEligibleSprints: PRACTICE_BURST_MIN_ELIGIBLE_SPRINTS,
  estimatorSprintCount: PRACTICE_BURST_ESTIMATOR_SPRINT_COUNT,
  minimumSprintAccuracy: PRACTICE_BURST_MIN_SPRINT_ACCURACY,
  minimumSprintCharacters: PRACTICE_BURST_MIN_SPRINT_CHARACTERS,
  minimumFirstPassOpportunities: PRACTICE_BURST_MIN_FIRST_PASS_OPPORTUNITIES,
  syntheticMeasurementDurationMs: PRACTICE_BURST_SYNTHETIC_MEASUREMENT_DURATION_MS,
});

export function validatePracticeBurstSprintsPolicy(policy = PRACTICE_BURST_SPRINTS_POLICY_V1) {
  if (!policy || policy.protocolVersion !== 2 || policy.policyVersion !== 2 || policy.estimatorVersion !== 2) return false;
  if (policy.warmupDurationMs !== 30_000 || policy.sprintCount !== 6 || policy.sprintDurationMs !== 10_000 || policy.previewDurationMs !== 2_000 || policy.recoveryDurationMs !== 18_000 || policy.recoveryCount !== 5) return false;
  if (policy.totalActiveDurationMs !== 90_000 || policy.totalProtocolInactiveDurationMs !== 102_000 || policy.totalProtocolDurationMs !== 192_000) return false;
  if (policy.minimumEligibleSprints !== 4 || policy.estimatorSprintCount !== 3 || policy.minimumSprintAccuracy !== 75 || policy.minimumSprintCharacters !== 30 || policy.minimumFirstPassOpportunities !== 30) return false;
  return true;
}
