export const PRACTICE_PACE_LADDER_VERSION = 1;
export const PRACTICE_PACE_LADDER_POLICY_VERSION = 1;
export const PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION = 1;
export const PRACTICE_PACE_LADDER_GENERATOR_VERSION = 1;
export const PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION = 1;
export const PRACTICE_PACE_LADDER_STAGE_VERSION = 1;
export const PRACTICE_PACE_GUIDE_VERSION = 1;
export const PRACTICE_PACE_LADDER_RESULT_VERSION = 1;
export const PRACTICE_PACE_LADDER_ARTIFACT_VERSION = 1;
export const PRACTICE_PACE_LADDER_EXPERIMENT_ID = "pace-ladder";
export const PRACTICE_PACE_LADDER_EXPERIMENT_VERSION = 1;
export const PRACTICE_PACE_LADDER_FORM_SET_ID = "WS-PACE-EN-1";
export const PRACTICE_PACE_LADDER_FORM_SET_VERSION = 1;
export const PRACTICE_PACE_LADDER_SELECTION_VERSION = 1;

export const PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS = 25_000;
export const PRACTICE_PACE_LADDER_STAGE_DURATION_MS = 25_000;
export const PRACTICE_PACE_LADDER_VALIDATION_DURATION_MS = 40_000;
export const PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS = 190_000;
export const PRACTICE_PACE_LADDER_RATIOS = Object.freeze([0.85, 0.95, 1.05, 1.15, 1.25]);
export const PRACTICE_PACE_LADDER_STAGE_IDS = Object.freeze(["calibration", "stage-1", "stage-2", "stage-3", "stage-4", "stage-5", "validation"]);
export const PRACTICE_PACE_LADDER_MAIN_STAGE_IDS = Object.freeze(["stage-1", "stage-2", "stage-3", "stage-4", "stage-5"]);

// Compatibility aliases for the early PL26 spike. They now resolve to the frozen protocol.
export const PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS = PRACTICE_PACE_LADDER_CALIBRATION_DURATION_MS;
export const PRACTICE_PACE_LADDER_RUNG_DURATION_MS = PRACTICE_PACE_LADDER_STAGE_DURATION_MS;

export const PRACTICE_PACE_GUIDE_STATUSES = Object.freeze(["behind", "on-pace", "ahead"]);
export const PRACTICE_PACE_LADDER_ANCHOR_SOURCES = Object.freeze(["user-selected", "ordinary-performance", "unavailable"]);
export const PRACTICE_PACE_LADDER_RESULT_STATUSES = Object.freeze(["complete", "insufficient-measurement", "unavailable", "interrupted"]);
export const PRACTICE_PACE_LADDER_STAGE_INVALID_REASONS = Object.freeze([
  "duration", "too-few-characters", "coverage", "protocol-interruption", "measurement-corruption",
]);
export const PRACTICE_PACE_LADDER_EVIDENCE_BOUNDARY = Object.freeze({
  supportsPaceControl: true,
  supportsMaxSpeed: false,
  supportsEndurance: false,
  supportsLatentAbility: false,
});
