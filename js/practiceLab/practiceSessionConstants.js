export const PRACTICE_SESSION_STATES = Object.freeze([
  "created", "ready", "active", "paused", "completed",
  "abandoned", "interrupted", "destroyed",
]);

export const PRACTICE_SESSION_TRANSITIONS = Object.freeze({
  created: Object.freeze(["ready"]),
  ready: Object.freeze(["active", "abandoned", "destroyed"]),
  active: Object.freeze(["paused", "completed", "abandoned", "interrupted", "destroyed"]),
  paused: Object.freeze(["active", "completed", "abandoned", "interrupted", "destroyed"]),
  completed: Object.freeze(["destroyed"]),
  abandoned: Object.freeze(["destroyed"]),
  interrupted: Object.freeze(["destroyed"]),
  destroyed: Object.freeze([]),
});

export const PRACTICE_CORRECTION_POLICIES = Object.freeze(["allow", "ignore", "disabled"]);
export const PRACTICE_TIMING_MODES = Object.freeze(["on-start", "on-first-input"]);
export const PRACTICE_COMPLETION_MODES = Object.freeze(["content", "duration", "word-count", "manual"]);
export const PRACTICE_INPUT_TYPES = Object.freeze(["character", "space", "backspace", "word-delete"]);

export const PRACTICE_SESSION_LIMITS = Object.freeze({
  contentGraphemes: 500_000,
  eventBuffer: 20_000,
  checkpointRecentEvents: 32,
  checkpointIntervalMs: 15_000,
  checkpointCharacterThreshold: 50,
  inactiveTransitionMs: 2_000,
  longHesitationMs: 750,
  consistencyMinimumSamples: 10,
  snapshotTypedWindow: 2_000,
  analysisBytes: 32 * 1024,
});

export const PRACTICE_SESSION_ERROR_CODES = Object.freeze({
  INVALID_STATE: "PRACTICE_SESSION_INVALID_STATE",
  INVALID_CONFIGURATION: "PRACTICE_SESSION_INVALID_CONFIGURATION",
  INVALID_CONTENT: "PRACTICE_SESSION_INVALID_CONTENT",
  INVALID_INPUT: "PRACTICE_SESSION_INVALID_INPUT",
  NOT_ACTIVE: "PRACTICE_SESSION_NOT_ACTIVE",
  ALREADY_FINALIZED: "PRACTICE_SESSION_ALREADY_FINALIZED",
  CHECKPOINT_FAILED: "PRACTICE_SESSION_CHECKPOINT_FAILED",
  RESTORE_FAILED: "PRACTICE_SESSION_RESTORE_FAILED",
  CONTENT_MISMATCH: "PRACTICE_SESSION_CONTENT_MISMATCH",
  ANALYSIS_FAILED: "PRACTICE_SESSION_ANALYSIS_FAILED",
  COMMIT_FAILED: "PRACTICE_SESSION_COMMIT_FAILED",
  DESTROYED: "PRACTICE_SESSION_DESTROYED",
});

export const PRACTICE_SESSION_SCHEMA_VERSION = 1;
export const PRACTICE_CONTENT_PLAN_VERSION = 1;

