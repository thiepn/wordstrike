export const PRACTICE_PROBLEM_WORDS_VERSION = 1;
export const PRACTICE_PROBLEM_WORDS_POLICY_VERSION = 1;
export const PRACTICE_PROBLEM_WORDS_GENERATOR_VERSION = 1;
export const PRACTICE_PROBLEM_WORDS_SELECTION_VERSION = 1;
export const PRACTICE_PROBLEM_WORDS_RESULT_VERSION = 1;
export const PRACTICE_PROBLEM_WORDS_EXPERIMENT_VERSION = 1;
export const PRACTICE_PROBLEM_WORDS_EXPERIMENT_ID = "problem-words";

export const PRACTICE_PROBLEM_WORDS_PHASE_IDS = Object.freeze([
  "entry-probe",
  "focus",
  "context",
  "interleave",
  "exit-probe",
]);

export const PRACTICE_PROBLEM_WORDS_PHASE_LABELS = Object.freeze({
  "entry-probe": "Baseline",
  focus: "Focus",
  context: "Context",
  interleave: "Mix",
  "exit-probe": "Check",
});

export const PRACTICE_PROBLEM_WORDS_PHASE_CUES = Object.freeze({
  "entry-probe": "none",
  focus: "strong-word",
  context: "subtle-word",
  interleave: "none",
  "exit-probe": "none",
});

export const PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS = Object.freeze({
  "entry-probe": 3,
  focus: 4,
  context: 3,
  interleave: 2,
  "exit-probe": 3,
  total: 15,
});

export const PRACTICE_PROBLEM_WORDS_TARGET_SOURCES = Object.freeze([
  "recommended",
  "manual",
  "external-plan",
]);

export const PRACTICE_PROBLEM_WORDS_AVAILABILITY = Object.freeze([
  "ready",
  "limited-content",
  "unsupported",
  "unavailable",
]);

export const PRACTICE_PROBLEM_WORDS_ERRORS = Object.freeze({
  UNSUPPORTED_WORD_TARGET: "UNSUPPORTED_WORD_TARGET",
  WORD_INDEX_NOT_FOUND: "WORD_INDEX_NOT_FOUND",
  WORD_NOT_IN_TRAINING_CORPUS: "WORD_NOT_IN_TRAINING_CORPUS",
  INSUFFICIENT_WORD_CONTEXTS: "INSUFFICIENT_WORD_CONTEXTS",
  INSUFFICIENT_TARGET_FAMILIES: "INSUFFICIENT_TARGET_FAMILIES",
  INSUFFICIENT_NEUTRAL_CONTENT: "INSUFFICIENT_NEUTRAL_CONTENT",
  INSUFFICIENT_PROBE_MATCH: "INSUFFICIENT_PROBE_MATCH",
  TRAINING_CORPUS_NOT_READY: "TRAINING_CORPUS_NOT_READY",
  CORPUS_VERSION_MISMATCH: "CORPUS_VERSION_MISMATCH",
  INDEX_VERSION_MISMATCH: "INDEX_VERSION_MISMATCH",
  CONTENT_HASH_MISMATCH: "CONTENT_HASH_MISMATCH",
});

export const PRACTICE_PROBLEM_WORDS_MIN_QUALITY_COVERAGE = 0.60;
export const PRACTICE_PROBLEM_WORDS_MIN_GRAPHEMES = 2;
export const PRACTICE_PROBLEM_WORDS_MAX_GRAPHEMES = 24;
export const PRACTICE_PROBLEM_WORDS_ESTIMATED_DURATION = Object.freeze({ minimum: 4, recommended: 5, maximum: 6 });
