export const PRACTICE_PERFORMANCE_ANALYSIS_VERSION = 1;
export const PRACTICE_PERFORMANCE_STATE_MODEL_VERSION = 1;
export const PRACTICE_PERFORMANCE_STATE_POLICY_VERSION = 1;
export const PRACTICE_STATE_OBSERVATION_VERSION = 1;
export const PRACTICE_WARMUP_MODEL_VERSION = 1;
export const PRACTICE_FRONTIER_MODEL_VERSION = 1;
export const PRACTICE_FRONTIER_POLICY_VERSION = 1;
export const PRACTICE_FRONTIER_OBSERVATION_VERSION = 1;
export const PRACTICE_FRONTIER_BATCH_VERSION = 1;

export const PRACTICE_PERFORMANCE_MEASUREMENT_KINDS = Object.freeze(["state-probe", "control-frontier"]);
export const PRACTICE_PERFORMANCE_MEASUREMENT_STATUSES = Object.freeze(["not-requested", "not-eligible", "measured", "measurement-failed"]);
export const PRACTICE_PACE_STATES = Object.freeze(["above-typical", "typical", "below-typical", "uncertain"]);
export const PRACTICE_CONTROL_QUALITY_STATES = Object.freeze(["preserved", "degraded", "unknown"]);
export const PRACTICE_READINESS_BANDS = Object.freeze(["elevated", "normal", "reduced", "unknown"]);
export const PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS = Object.freeze(["none", "low", "medium", "high"]);
export const PRACTICE_WARMUP_STATUSES = Object.freeze(["insufficient-data", "none-observed", "observed"]);
export const PRACTICE_FRONTIER_STATUSES = Object.freeze(["unmeasured", "insufficient-range", "insufficient-control", "provisional", "bracketed", "lower-bound"]);
export const PRACTICE_CONTROL_METRIC_COVERAGE = Object.freeze(["none", "partial", "full"]);
export const PRACTICE_BURST_RESERVE_STATUSES = Object.freeze(["unavailable", "available", "inconsistent"]);
export const PRACTICE_PERFORMANCE_DELTA_TYPES = Object.freeze(["state-probe", "frontier"]);

export const PRACTICE_PERFORMANCE_REASON_CODES = Object.freeze([
  "reference-ability-unavailable",
  "reference-confidence-low",
  "role-not-allowed",
  "targeted-content",
  "duration",
  "characters",
  "accuracy",
  "correction-policy",
  "manual-stop",
  "completion-reason",
  "wrong-session-status",
  "trace-truncated",
  "frontier-stage-invalid",
  "insufficient-frontier-points",
  "callback-failed",
  "invalid-measurement",
]);
