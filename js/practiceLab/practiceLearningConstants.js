export const PRACTICE_LEARNING_MODEL_VERSION = 1;
export const PRACTICE_LEARNING_POLICY_VERSION = 1;
export const PRACTICE_LEARNING_OBSERVATION_VERSION = 1;
export const PRACTICE_LEARNING_CURVE_VERSION = 1;
export const PRACTICE_SATURATION_MODEL_VERSION = 1;
export const PRACTICE_GLOBAL_PLATEAU_MODEL_VERSION = 1;
export const PRACTICE_LEARNING_ANALYSIS_VERSION = 1;

export const PRACTICE_LEARNING_OBSERVATION_KINDS = Object.freeze(["acquisition", "transfer"]);
export const PRACTICE_LEARNING_CURVE_STATUSES = Object.freeze([
  "insufficient-data",
  "improving",
  "flat",
  "worsening",
  "uncertain",
]);
export const PRACTICE_LEARNING_CURVE_CONFIDENCE_LEVELS = Object.freeze(["none", "low", "medium", "high"]);
export const PRACTICE_MARGINAL_GAIN_STATUSES = Object.freeze(["unknown", "high", "moderate", "low", "negative"]);
export const PRACTICE_SATURATION_STATUSES = Object.freeze([
  "insufficient-data",
  "not-detected",
  "approaching",
  "possible",
  "likely",
  "supported",
  "resolved",
]);
export const PRACTICE_SATURATION_TYPES = Object.freeze([
  "acquisition-plateau",
  "reacquisition-loop",
  "transfer-limited",
  "mixed",
  "unknown",
]);
export const PRACTICE_SATURATION_REASON_CODES = Object.freeze([
  "insufficient-entry-points",
  "insufficient-days",
  "insufficient-dose",
  "curve-improving",
  "curve-flat",
  "curve-worsening",
  "marginal-gain-low",
  "practice-gain-low",
  "practice-gain-high",
  "transfer-unverified",
  "transfer-flat",
  "transfer-improving",
  "high-quality-ceiling",
  "possible-overload",
  "limiter-remains",
  "mastery-acquired",
]);
export const PRACTICE_GLOBAL_PLATEAU_STATUSES = Object.freeze([
  "insufficient-data",
  "not-detected",
  "possible",
  "supported",
]);
export const PRACTICE_GLOBAL_PLATEAU_TYPES = Object.freeze(["motor", "control", "transfer", "mixed", "unknown"]);
export const PRACTICE_ABILITY_CURVE_STATUSES = Object.freeze([
  "insufficient-data",
  "improving",
  "stable",
  "declining",
  "uncertain",
]);

export const PRACTICE_SATURATION_STATUS_RANK = Object.freeze({
  "insufficient-data": 0,
  "not-detected": 1,
  approaching: 2,
  possible: 3,
  likely: 4,
  supported: 5,
  resolved: 1,
});
