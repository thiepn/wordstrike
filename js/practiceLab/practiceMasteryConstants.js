export const PRACTICE_MASTERY_SNAPSHOT_VERSION = 1;
export const PRACTICE_MASTERY_MODEL_VERSION = 1;
export const PRACTICE_MASTERY_POLICY_VERSION = 1;
export const PRACTICE_AUTOMATICITY_MODEL_VERSION = 1;
export const PRACTICE_CONTEXT_ROBUSTNESS_VERSION = 1;
export const PRACTICE_TRANSFER_MODEL_VERSION = 1;
export const PRACTICE_MASTERY_HIERARCHY_VERSION = 1;

export const PRACTICE_DERIVED_MASTERY_STAGES = Object.freeze([
  "unmeasured",
  "learning",
  "acquired",
  "transferred",
  "robust",
  "retained",
]);

export const PRACTICE_DERIVED_MASTERY_STAGE_LABELS = Object.freeze({
  unmeasured: "Unmeasured",
  learning: "Learning",
  acquired: "Acquired",
  transferred: "Transferred",
  robust: "Robust",
  retained: "Retained",
});

export const PRACTICE_MASTERY_STAGE_RANK = Object.freeze(
  Object.fromEntries(PRACTICE_DERIVED_MASTERY_STAGES.map((stage, index) => [stage, index])),
);

export const PRACTICE_AUTOMATICITY_STATUSES = Object.freeze([
  "unmeasured",
  "developing",
  "emerging",
  "established",
  "strong",
]);

export const PRACTICE_MASTERY_DIMENSION_STATUSES = Object.freeze([
  "unmeasured",
  "insufficient",
  "developing",
  "strong",
]);

export const PRACTICE_MASTERY_SNAPSHOT_STATUSES = Object.freeze([
  "ready",
  "partial",
  "insufficient-data",
]);

export const PRACTICE_RETENTION_STATUSES = Object.freeze([
  "unavailable",
  "unverified",
  "verified",
  "failed",
]);
