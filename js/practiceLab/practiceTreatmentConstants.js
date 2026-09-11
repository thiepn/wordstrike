export const PRACTICE_TREATMENT_TRACKING_VERSION = 1;
export const PRACTICE_TREATMENT_REGISTRY_VERSION = 1;
export const PRACTICE_TREATMENT_EPISODE_VERSION = 1;
export const PRACTICE_TREATMENT_BASELINE_POLICY_VERSION = 1;
export const PRACTICE_TREATMENT_OUTCOME_POLICY_VERSION = 1;
export const PRACTICE_TREATMENT_CONTAMINATION_POLICY_VERSION = 1;
export const PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION = 1;
export const PRACTICE_TREATMENT_RESPONSE_STATE_VERSION = 1;

export const PRACTICE_TREATMENT_CLASSES = Object.freeze(["targeted", "broad", "hybrid"]);
export const PRACTICE_TREATMENT_ASSIGNMENT_KINDS = Object.freeze(["manual", "coach"]);
export const PRACTICE_TREATMENT_EPISODE_STATUSES = Object.freeze(["prepared", "tracking", "closed", "invalid"]);
export const PRACTICE_TREATMENT_BASELINE_STATUSES = Object.freeze(["pending", "available", "missing", "ineligible"]);
export const PRACTICE_TREATMENT_OUTCOME_STATUSES = Object.freeze(["pending", "observed", "contaminated", "expired", "incompatible", "not-applicable"]);
export const PRACTICE_TREATMENT_CONTAMINATION_LEVELS = Object.freeze(["none", "background", "uncertain", "material"]);
export const PRACTICE_TREATMENT_EVIDENCE_GRADES = Object.freeze(["prospective-recorded-clean", "background-practice", "hybrid-measurement", "recorded-confounded", "incompatible", "insufficient"]);
export const PRACTICE_TREATMENT_DELAY_BUCKETS = Object.freeze(["next-day", "short", "long"]);
export const PRACTICE_TREATMENT_RESPONSE_PATTERNS = Object.freeze(["insufficient", "positive-signal", "little-signal", "negative-signal", "mixed"]);
export const PRACTICE_TREATMENT_EVIDENCE_DEPTHS = Object.freeze(["insufficient", "low", "medium", "high"]);
export const PRACTICE_TREATMENT_MEASUREMENT_GRADES = Object.freeze(["independent", "hybrid"]);
export const PRACTICE_TREATMENT_OUTCOME_SOURCE_KINDS = Object.freeze([
  "target-baseline-retest",
  "retention-review",
  "cold-transfer",
  "ability-observation",
  "consistency-result",
  "control-frontier",
]);

export const PRACTICE_TREATMENT_OUTCOME_KEYS = Object.freeze({
  SAME_PROTOCOL_RETEST: "same-protocol-retest",
  RETENTION_REVIEW: "retention-review",
  COLD_TRANSFER: "cold-transfer",
  ABILITY: "ability",
  CONSISTENCY: "consistency",
  CONTROL_FRONTIER: "control-frontier",
});

export const PRACTICE_TREATMENT_OUTCOME_DOMAINS = Object.freeze([
  "entity-target",
  "cold-natural-text",
  "common-words",
  "control-frontier",
  "burst",
  "consistency",
  "endurance",
  "punctuation",
  "numbers-symbols",
]);

export const PRACTICE_TREATMENT_POLICY = Object.freeze({
  preparedTtlMs: 24 * 60 * 60 * 1000,
  minimumDelayedMs: 12 * 60 * 60 * 1000,
  hybridMinimumDelayedMs: 24 * 60 * 60 * 1000,
  retestMaximumMs: 14 * 24 * 60 * 60 * 1000,
  abilityMaximumMs: 30 * 24 * 60 * 60 * 1000,
  retentionMaximumMs: 60 * 24 * 60 * 60 * 1000,
  transferMaximumMs: 30 * 24 * 60 * 60 * 1000,
  consistencyBaselineMaximumAgeMs: 30 * 24 * 60 * 60 * 1000,
  consistencyMaximumMs: 30 * 24 * 60 * 60 * 1000,
  frontierMaximumMs: 30 * 24 * 60 * 60 * 1000,
  baselineQualityCoverageMinimum: 0.60,
  relatedTargetIdMaximum: 8,
  responseSamplesMaximum: 64,
  episodeOutcomeMaximum: 4,
});

export const PRACTICE_TREATMENT_THRESHOLDS = Object.freeze({
  targetQualityPoints: 5,
  abilityPercent: 2,
  frontierPercent: 3,
  consistencyVariationPp: 1.5,
  abilityZ: 0.75,
});

export const PRACTICE_TREATMENT_DELAY_BOUNDARIES = Object.freeze({
  nextDayMaximumMs: 3 * 24 * 60 * 60 * 1000,
  shortMaximumMs: 14 * 24 * 60 * 60 * 1000,
});
