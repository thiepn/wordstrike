export const PRACTICE_COMBINATION_REPAIR_VERSION = 1;
export const PRACTICE_COMBINATION_REPAIR_POLICY_VERSION = 1;
export const PRACTICE_COMBINATION_REPAIR_GENERATOR_VERSION = 1;
export const PRACTICE_COMBINATION_REPAIR_SELECTION_VERSION = 1;
export const PRACTICE_COMBINATION_REPAIR_RESULT_VERSION = 1;

export const PRACTICE_COMBINATION_REPAIR_EXPERIMENT_ID = "combination-repair";
export const PRACTICE_COMBINATION_REPAIR_EXPERIMENT_VERSION = 1;

export const PRACTICE_COMBINATION_REPAIR_ENTITY_TYPES = Object.freeze(["bigram", "trigram"]);
export const PRACTICE_COMBINATION_REPAIR_TARGET_SOURCES = Object.freeze(["recommended", "manual", "external-plan"]);
export const PRACTICE_COMBINATION_REPAIR_AVAILABILITY = Object.freeze(["ready", "limited-content", "unsupported", "unavailable"]);

export const PRACTICE_COMBINATION_REPAIR_PHASES = Object.freeze([
  Object.freeze({ id: "entry-probe", label: "Baseline", cue: "none" }),
  Object.freeze({ id: "acquire", label: "Focus", cue: "strong" }),
  Object.freeze({ id: "integrate", label: "Context", cue: "subtle" }),
  Object.freeze({ id: "interleave", label: "Mix", cue: "none" }),
  Object.freeze({ id: "exit-probe", label: "Check", cue: "none" }),
]);

export const PRACTICE_COMBINATION_REPAIR_PHASE_QUOTAS = Object.freeze({
  bigram: Object.freeze({ "entry-probe": 5, acquire: 15, integrate: 12, interleave: 13, "exit-probe": 5, total: 50 }),
  trigram: Object.freeze({ "entry-probe": 4, acquire: 10, integrate: 9, interleave: 8, "exit-probe": 4, total: 35 }),
});

export const PRACTICE_COMBINATION_REPAIR_MAX_RECOMMENDATIONS = 8;
export const PRACTICE_COMBINATION_REPAIR_MAX_TARGET_CONTENT_CANDIDATES = 256;
export const PRACTICE_COMBINATION_REPAIR_MAX_NEUTRAL_CANDIDATES = 64;
export const PRACTICE_COMBINATION_REPAIR_DEFAULT_UNIT_TARGET_CAP = 2;
export const PRACTICE_COMBINATION_REPAIR_ACQUIRE_UNIT_TARGET_CAP = 3;
export const PRACTICE_COMBINATION_REPAIR_PROBE_TYPOABILITY_DELTA_MAX = 0.35;
export const PRACTICE_COMBINATION_REPAIR_PROBE_FEATURE_RMS_MAX = 0.75;
export const PRACTICE_COMBINATION_REPAIR_MIN_QUALITY_COVERAGE = 0.60;

export const PRACTICE_COMBINATION_REPAIR_ERRORS = Object.freeze({
  UNSUPPORTED_COMBINATION_TARGET: "UNSUPPORTED_COMBINATION_TARGET",
  TARGET_INDEX_NOT_FOUND: "TARGET_INDEX_NOT_FOUND",
  INSUFFICIENT_TARGET_WORDS: "INSUFFICIENT_TARGET_WORDS",
  INSUFFICIENT_TARGET_CONTENT: "INSUFFICIENT_TARGET_CONTENT",
  INSUFFICIENT_PROBE_MATCH: "INSUFFICIENT_PROBE_MATCH",
  TRAINING_CORPUS_NOT_READY: "TRAINING_CORPUS_NOT_READY",
  CORPUS_VERSION_MISMATCH: "CORPUS_VERSION_MISMATCH",
  INDEX_VERSION_MISMATCH: "INDEX_VERSION_MISMATCH",
  CONTENT_HASH_MISMATCH: "CONTENT_HASH_MISMATCH",
});
