export const PRACTICE_WEAK_KEYS_VERSION = 1;
export const PRACTICE_WEAK_KEYS_POLICY_VERSION = 1;
export const PRACTICE_WEAK_KEYS_GENERATOR_VERSION = 1;
export const PRACTICE_WEAK_KEYS_SELECTION_VERSION = 1;
export const PRACTICE_WEAK_KEYS_RESULT_VERSION = 1;

export const PRACTICE_WEAK_KEYS_EXPERIMENT_ID = "weak-keys";
export const PRACTICE_WEAK_KEYS_EXPERIMENT_VERSION = 1;

export const PRACTICE_WEAK_KEYS_ENTITY_TYPES = Object.freeze(["key"]);
export const PRACTICE_WEAK_KEYS_TARGET_SOURCES = Object.freeze(["recommended", "manual", "external-plan"]);
export const PRACTICE_WEAK_KEYS_AVAILABILITY = Object.freeze(["ready", "limited-content", "unsupported", "unavailable"]);

export const PRACTICE_WEAK_KEYS_PHASES = Object.freeze([
  Object.freeze({ id: "entry-probe", label: "Baseline", cue: "none" }),
  Object.freeze({ id: "focus", label: "Focus", cue: "strong" }),
  Object.freeze({ id: "context", label: "Context", cue: "subtle" }),
  Object.freeze({ id: "interleave", label: "Mix", cue: "none" }),
  Object.freeze({ id: "exit-probe", label: "Check", cue: "none" }),
]);

export const PRACTICE_WEAK_KEYS_PHASE_QUOTAS = Object.freeze({
  "entry-probe": 8,
  focus: 24,
  context: 20,
  interleave: 20,
  "exit-probe": 8,
  total: 80,
});

export const PRACTICE_WEAK_KEYS_MAX_RECOMMENDATIONS = 8;
export const PRACTICE_WEAK_KEYS_MAX_TARGET_CANDIDATES = 256;
export const PRACTICE_WEAK_KEYS_MAX_NEUTRAL_CANDIDATES = 128;
export const PRACTICE_WEAK_KEYS_PROBE_TYPOABILITY_DELTA_MAX = 0.35;
export const PRACTICE_WEAK_KEYS_PROBE_FEATURE_RMS_MAX = 0.75;
export const PRACTICE_WEAK_KEYS_PROBE_POSITION_TV_MAX = 0.25;
export const PRACTICE_WEAK_KEYS_PROBE_GEOMETRY_TV_MAX = 0.35;
export const PRACTICE_WEAK_KEYS_MIN_QUALITY_COVERAGE = 0.60;

export const PRACTICE_WEAK_KEYS_ERRORS = Object.freeze({
  UNSUPPORTED_KEY_TARGET: "UNSUPPORTED_KEY_TARGET",
  KEY_INDEX_NOT_FOUND: "KEY_INDEX_NOT_FOUND",
  INSUFFICIENT_KEY_WORDS: "INSUFFICIENT_KEY_WORDS",
  INSUFFICIENT_KEY_CONTENT: "INSUFFICIENT_KEY_CONTENT",
  INSUFFICIENT_POSITION_VARIETY: "INSUFFICIENT_POSITION_VARIETY",
  INSUFFICIENT_NEUTRAL_CONTENT: "INSUFFICIENT_NEUTRAL_CONTENT",
  INSUFFICIENT_PROBE_MATCH: "INSUFFICIENT_PROBE_MATCH",
  TRAINING_CORPUS_NOT_READY: "TRAINING_CORPUS_NOT_READY",
  CORPUS_VERSION_MISMATCH: "CORPUS_VERSION_MISMATCH",
  INDEX_VERSION_MISMATCH: "INDEX_VERSION_MISMATCH",
  CONTENT_HASH_MISMATCH: "CONTENT_HASH_MISMATCH",
});
