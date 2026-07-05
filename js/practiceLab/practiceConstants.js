export const PRACTICE_MANIFEST_KEY = "wordstrike.practice.manifest.v1";
export const PRACTICE_MANIFEST_BACKUP_KEY = "wordstrike.practice.manifest.backup.v1";
export const PRACTICE_MANIFEST_TEMP_KEY = "wordstrike.practice.manifest.temp.v1";
export const PRACTICE_DATABASE_NAME = "wordstrike-practice-lab";
export const PRACTICE_DATABASE_VERSION = 1;
export const PRACTICE_MANIFEST_VERSION = 1;

export const PRACTICE_RECORD_VERSIONS = Object.freeze({
  profile: 1,
  skillStat: 1,
  sessionSummary: 1,
  reviewItem: 1,
  customText: 1,
  preset: 1,
  checkpoint: 1,
  quarantine: 1,
});

export const PRACTICE_LIMITS = Object.freeze({
  manifestBytes: 64 * 1024,
  customTextCount: 20,
  customTextCharacters: 250_000,
  customTextTotalCharacters: 1_000_000,
  customTextTitleLength: 120,
  presetCount: 10,
  presetNameLength: 60,
  recentLatencySamples: 64,
  primaryLimiterIds: 8,
  recommendationIds: 20,
  targetEntities: 256,
  sessionObjectBytes: 128 * 1024,
  checkpointBytes: 512 * 1024,
  configurationDepth: 8,
  configurationBytes: 32 * 1024,
  sessionSummarySoftCap: 1_000,
  sessionSummaryHardCap: 2_000,
  sessionSummaryDays: 730,
  bigramStats: 1_500,
  trigramStats: 2_000,
  wordStats: 5_000,
  patternStats: 1_000,
  reviewItems: 5_000,
  quarantineRecords: 100,
  checkpointTtlMs: 24 * 60 * 60 * 1000,
  abandonmentCharacters: 20,
  abandonmentActiveMs: 30_000,
});

export const PRACTICE_STORE_DEFINITIONS = Object.freeze({
  meta: Object.freeze({
    keyPath: "key",
    indexes: [],
  }),
  profiles: Object.freeze({
    keyPath: "profileId",
    indexes: [
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
    ],
  }),
  skillStats: Object.freeze({
    keyPath: "statId",
    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "entityType", keyPath: "entityType" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
      Object.freeze({ name: "priority", keyPath: "priority" }),
      Object.freeze({ name: "confidenceLevel", keyPath: "confidenceLevel" }),
      Object.freeze({ name: "masteryState", keyPath: "masteryState" }),
      Object.freeze({
        name: "profileEntity",
        keyPath: ["profileId", "entityType", "entityKey"],
        options: { unique: true },
      }),
    ],
  }),
  sessionSummaries: Object.freeze({
    keyPath: "sessionId",
    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "experimentId", keyPath: "experimentId" }),
      Object.freeze({ name: "startedAtUtc", keyPath: "startedAtUtc" }),
      Object.freeze({ name: "completedAtUtc", keyPath: "completedAtUtc" }),
      Object.freeze({ name: "status", keyPath: "status" }),
      Object.freeze({ name: "localDayKey", keyPath: "localDayKey" }),
    ],
  }),
  reviewItems: Object.freeze({
    keyPath: "reviewItemId",
    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "dueAtUtc", keyPath: "dueAtUtc" }),
      Object.freeze({ name: "localDueDayKey", keyPath: "localDueDayKey" }),
      Object.freeze({ name: "state", keyPath: "state" }),
      Object.freeze({ name: "entityType", keyPath: "entityType" }),
      Object.freeze({ name: "entityKey", keyPath: "entityKey" }),
      Object.freeze({
        name: "profileEntity",
        keyPath: ["profileId", "entityType", "entityKey"],
        options: { unique: true },
      }),
    ],
  }),
  customTexts: Object.freeze({
    keyPath: "customTextId",
    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
      Object.freeze({ name: "lastUsedAt", keyPath: "lastUsedAt" }),
      Object.freeze({ name: "normalizedTitle", keyPath: "normalizedTitle" }),
    ],
  }),
  presets: Object.freeze({
    keyPath: "presetId",
    indexes: [
      Object.freeze({ name: "profileId", keyPath: "profileId" }),
      Object.freeze({ name: "experimentId", keyPath: "experimentId" }),
      Object.freeze({ name: "updatedAt", keyPath: "updatedAt" }),
    ],
  }),
  activeSessionCheckpoints: Object.freeze({
    keyPath: "profileId",
    indexes: [
      Object.freeze({ name: "sessionId", keyPath: "sessionId", options: { unique: true } }),
      Object.freeze({ name: "expiresAt", keyPath: "expiresAt" }),
    ],
  }),
  quarantine: Object.freeze({
    keyPath: "quarantineId",
    indexes: [
      Object.freeze({ name: "sourceStore", keyPath: "sourceStore" }),
      Object.freeze({ name: "detectedAt", keyPath: "detectedAt" }),
    ],
  }),
});

export const PRACTICE_STORE_NAMES = Object.freeze(Object.keys(PRACTICE_STORE_DEFINITIONS));
export const ENTITY_TYPES = Object.freeze([
  "key", "bigram", "trigram", "word",
  "punctuation-transition", "number-pattern", "symbol-pattern",
]);
export const MASTERY_STATES = Object.freeze([
  "unmeasured", "needs-data", "weak", "developing", "stable", "strong", "mastered",
]);
export const CONFIDENCE_LEVELS = Object.freeze(["none", "low", "medium", "high"]);
export const SESSION_STATUSES = Object.freeze(["completed", "abandoned", "interrupted", "invalid"]);
export const COMPLETION_REASONS = Object.freeze([
  "time-complete", "content-complete", "word-target-complete", "manual-stop",
  "navigation-away", "refresh-interruption", "error",
]);
export const REVIEW_STATES = Object.freeze([
  "new", "due", "learning", "improving", "stable", "mastered", "suspended",
]);
export const STORAGE_HEALTH_STATES = Object.freeze([
  "healthy", "degraded", "quota-warning", "quota-exceeded",
  "migration-warning", "recovery-required",
]);
export const ASSESSMENT_STATES = Object.freeze(["never-started", "incomplete", "complete", "stale"]);
export const CHECKPOINT_PHASES = Object.freeze(["created", "ready", "active", "paused", "interrupted"]);

export const LATENCY_HISTOGRAM_BOUNDS_MS = Object.freeze([
  50, 80, 120, 180, 260, 400, 650, Infinity,
]);

export const QUOTA_RECOVERY_STEPS = Object.freeze([
  "expired-checkpoints",
  "excess-session-summaries",
  "stale-review-items",
  "low-confidence-skill-stats",
  "old-quarantine",
]);

