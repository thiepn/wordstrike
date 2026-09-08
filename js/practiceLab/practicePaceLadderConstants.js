export const PRACTICE_PACE_LADDER_VERSION = 1;
export const PRACTICE_PACE_LADDER_POLICY_VERSION = 1;
export const PRACTICE_PACE_LADDER_FORM_SCHEMA_VERSION = 1;
export const PRACTICE_PACE_LADDER_GENERATOR_VERSION = 1;
export const PRACTICE_PACE_LADDER_ANCHOR_POLICY_VERSION = 1;
export const PRACTICE_PACE_LADDER_STAGE_VERSION = 1;
export const PRACTICE_PACE_GUIDE_VERSION = 1;
export const PRACTICE_PACE_LADDER_RESULT_VERSION = 1;
export const PRACTICE_PACE_LADDER_EXPERIMENT_ID = "pace-ladder";
export const PRACTICE_PACE_LADDER_EXPERIMENT_VERSION = 1;
export const PRACTICE_PACE_LADDER_FORM_SET_ID = "WS-PACE-EN-1";
export const PRACTICE_PACE_LADDER_FORM_SET_VERSION = 1;
export const PRACTICE_PACE_LADDER_SELECTION_VERSION = 1;
export const PRACTICE_PACE_LADDER_REFERENCE_DURATION_MS = 30_000;
export const PRACTICE_PACE_LADDER_RUNG_DURATION_MS = 20_000;
export const PRACTICE_PACE_LADDER_TOTAL_ACTIVE_DURATION_MS = 190_000;
export const PRACTICE_PACE_LADDER_RATIOS = Object.freeze([0.75, 0.85, 0.95, 1.05, 1.15, 1.25, 1.10, 0.90]);
export const PRACTICE_PACE_LADDER_STAGE_IDS = Object.freeze(["reference", "rung-1", "rung-2", "rung-3", "rung-4", "rung-5", "rung-6", "rung-7", "rung-8"]);
export const PRACTICE_PACE_GUIDE_STATUSES = Object.freeze(["behind", "on-pace", "ahead"]);
export const PRACTICE_PACE_LADDER_ANCHOR_SOURCES = Object.freeze(["control-frontier", "in-session-calibration"]);
export const PRACTICE_PACE_LADDER_STAGE_INVALID_REASONS = Object.freeze([
  "duration", "too-few-characters", "accuracy-floor", "visibility-interruption",
  "protocol-interruption", "content-exhausted", "measurement-corruption",
]);
