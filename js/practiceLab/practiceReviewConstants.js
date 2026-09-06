export const PRACTICE_REVIEW_MODEL_VERSION = 1;
export const PRACTICE_REVIEW_POLICY_VERSION = 1;
export const PRACTICE_REVIEW_PLAN_VERSION = 1;
export const PRACTICE_RETENTION_PROBE_VERSION = 1;
export const PRACTICE_RETENTION_MODEL_VERSION = 1;
export const PRACTICE_RETENTION_POLICY_VERSION = 1;
export const PRACTICE_REVIEW_VALUE_VERSION = 1;
export const PRACTICE_RETENTION_ANALYSIS_VERSION = 1;
export const PRACTICE_RETENTION_REVIEW_DELTA_VERSION = 1;

export const PRACTICE_REVIEW_ITEM_STATES = Object.freeze([
  "inactive",
  "active",
  "suspended",
]);

export const PRACTICE_REVIEW_DUE_STATUSES = Object.freeze([
  "not-mature",
  "scheduled",
  "due",
  "overdue",
  "suspended",
  "inactive",
]);

export const PRACTICE_RETENTION_MEASUREMENT_KINDS = Object.freeze([
  null,
  "entity-review",
]);

export const PRACTICE_RETENTION_ANALYSIS_STATUSES = Object.freeze([
  "not-requested",
  "not-eligible",
  "measured",
  "partial",
  "measurement-failed",
]);

export const PRACTICE_RETENTION_MEASUREMENT_STATUSES = Object.freeze([
  "premature",
  "insufficient",
  "non-verifying",
  "measured",
]);

export const PRACTICE_RETENTION_NOVELTY_STATUSES = Object.freeze([
  "fresh",
  "repeated",
  "unknown",
]);

export const PRACTICE_RETENTION_OUTCOMES = Object.freeze([
  "strong",
  "pass",
  "fragile",
  "fail",
]);

export const PRACTICE_RETENTION_PROVIDER_STATUSES = Object.freeze([
  "unavailable",
  "unverified",
  "verified",
  "failed",
]);

export const PRACTICE_REVIEW_VALUE_BANDS = Object.freeze([
  "urgent",
  "high",
  "medium",
  "low",
  "not-actionable",
]);

export const PRACTICE_REVIEW_SUSPENSION_REASONS = Object.freeze([
  "legacy-unverified",
  "retention-failed",
  "mastery-below-acquired",
]);
