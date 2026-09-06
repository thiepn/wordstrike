export const PRACTICE_ABILITY_ESTIMATOR_VERSION = 1;
export const PRACTICE_ABILITY_POLICY_VERSION = 1;
export const PRACTICE_ABILITY_OBSERVATION_VERSION = 1;
export const PRACTICE_ABILITY_UNCERTAINTY_VERSION = 1;
export const PRACTICE_ABILITY_ANALYSIS_VERSION = 1;

export const PRACTICE_ABILITY_CHANNELS = Object.freeze([
  "cold-natural-text",
  "controlled-speed",
  "common-words",
  "burst",
  "endurance",
  "punctuation",
  "numbers-symbols",
]);

export const PRACTICE_ABILITY_STATUSES = Object.freeze([
  "unmeasured",
  "provisional",
  "established",
]);

export const PRACTICE_ABILITY_CONFIDENCE_LEVELS = Object.freeze([
  "none",
  "low",
  "medium",
  "high",
]);

export const PRACTICE_ABILITY_ASSESSMENT_STATUSES = Object.freeze([
  "not-requested",
  "not-eligible",
  "eligible",
]);

export const PRACTICE_ABILITY_REASON_CODES = Object.freeze([
  "wrong-session-status",
  "manual-stop",
  "role-not-allowed",
  "targeted-content",
  "correction-policy",
  "duration-too-short",
  "duration-too-long",
  "insufficient-characters",
  "accuracy-too-low",
  "invalid-wpm",
  "context-mismatch",
  "invalid-normalization",
  "evaluation-not-fresh",
]);

export const PRACTICE_ABILITY_SOURCE_ROLES = Object.freeze([
  "training",
  "transfer",
  "benchmark",
  "diagnostic",
  "custom",
  "unclassified",
]);

export const PRACTICE_ABILITY_MEASUREMENT_COMPLETION_REASONS = Object.freeze([
  "time-complete",
  "content-complete",
  "word-target-complete",
]);

export const PRACTICE_ABILITY_ERROR_CODES = Object.freeze({
  INVALID_CHANNEL: "PRACTICE_ABILITY_INVALID_CHANNEL",
  INVALID_OBSERVATION: "PRACTICE_ABILITY_INVALID_OBSERVATION",
  INVALID_STATE: "PRACTICE_ABILITY_INVALID_STATE",
  OUT_OF_ORDER_OBSERVATION: "OUT_OF_ORDER_ABILITY_OBSERVATION",
  VERSION_MISMATCH: "PRACTICE_ABILITY_VERSION_MISMATCH",
});
