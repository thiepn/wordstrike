export const PRACTICE_ACCURACY_RECOVERY_VERSION = 1;
export const PRACTICE_ACCURACY_RECOVERY_POLICY_VERSION = 1;
export const PRACTICE_ACCURACY_RECOVERY_GENERATOR_VERSION = 1;
export const PRACTICE_ACCURACY_RECOVERY_SELECTION_VERSION = 1;
export const PRACTICE_ACCURACY_RECOVERY_FEEDBACK_VERSION = 1;
export const PRACTICE_ACCURACY_RECOVERY_RESULT_VERSION = 1;
export const PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_VERSION = 1;
export const PRACTICE_ACCURACY_RECOVERY_EXPERIMENT_ID = "accuracy-control";

export const PRACTICE_ACCURACY_RECOVERY_ENTITY_TYPES = Object.freeze(["key", "bigram", "trigram", "word"]);
export const PRACTICE_ACCURACY_RECOVERY_TARGET_SOURCES = Object.freeze(["recommended", "manual", "external-plan"]);
export const PRACTICE_ACCURACY_RECOVERY_PHASE_IDS = Object.freeze(["baseline", "control", "repair", "mix", "check"]);
export const PRACTICE_ACCURACY_RECOVERY_PHASE_LABELS = Object.freeze({ baseline: "Baseline", control: "Control", repair: "Repair", mix: "Mix", check: "Check" });
export const PRACTICE_ACCURACY_RECOVERY_PHASE_CUES = Object.freeze({ baseline: "none", control: "subtle", repair: "subtle", mix: "none", check: "none" });
export const PRACTICE_ACCURACY_RECOVERY_PHASE_QUOTAS = Object.freeze({
  key: Object.freeze({ baseline: 8, control: 24, repair: 20, mix: 20, check: 8, total: 80 }),
  bigram: Object.freeze({ baseline: 5, control: 15, repair: 12, mix: 13, check: 5, total: 50 }),
  trigram: Object.freeze({ baseline: 4, control: 10, repair: 9, mix: 8, check: 4, total: 35 }),
  word: Object.freeze({ baseline: 3, control: 4, repair: 3, mix: 2, check: 3, total: 15 }),
});
export const PRACTICE_ACCURACY_RECOVERY_FEEDBACK_CODES = Object.freeze(["repair-clean", "repair-extra-deletion", "repair-complete"]);
export const PRACTICE_ACCURACY_RECOVERY_RECOVERY_COVERAGE = Object.freeze(["none", "limited", "usable"]);
export const PRACTICE_ACCURACY_RECOVERY_ERRORS = Object.freeze({
  UNSUPPORTED_ACCURACY_TARGET: "UNSUPPORTED_ACCURACY_TARGET",
  TARGET_NOT_AVAILABLE: "TARGET_NOT_AVAILABLE",
  INSUFFICIENT_TARGET_CONTENT: "INSUFFICIENT_TARGET_CONTENT",
  INSUFFICIENT_NEUTRAL_CONTENT: "INSUFFICIENT_NEUTRAL_CONTENT",
  INSUFFICIENT_PROBE_MATCH: "INSUFFICIENT_PROBE_MATCH",
  TRAINING_CORPUS_NOT_READY: "TRAINING_CORPUS_NOT_READY",
  INDEX_VERSION_MISMATCH: "INDEX_VERSION_MISMATCH",
  CORPUS_VERSION_MISMATCH: "CORPUS_VERSION_MISMATCH",
  CONTENT_HASH_MISMATCH: "CONTENT_HASH_MISMATCH",
});
export const PRACTICE_ACCURACY_RECOVERY_ESTIMATED_DURATION = Object.freeze({ minimum: 4, recommended: 5, maximum: 6 });
