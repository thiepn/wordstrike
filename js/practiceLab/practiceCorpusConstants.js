export const PRACTICE_CORPUS_SCHEMA_VERSION = 1;
export const PRACTICE_CORPUS_MANIFEST_VERSION = 1;
export const PRACTICE_CORPUS_ARTIFACT_VERSION = 1;
export const PRACTICE_CORPUS_SOURCE_REGISTRY_VERSION = 1;
export const PRACTICE_CORPUS_PARTITION_POLICY_VERSION = 1;

export const PRACTICE_CORPUS_PARTITIONS = Object.freeze([
  "training",
  "transfer",
  "benchmark",
  "diagnostic",
  "research-holdout",
]);

export const PRACTICE_CORPUS_STATUSES = Object.freeze([
  "foundation", "review", "ready", "retired",
]);

export const PRACTICE_CORPUS_CONTENT_TYPES = Object.freeze([
  "word", "phrase", "sentence", "passage", "probe",
]);

export const PRACTICE_CORPUS_REVIEW_STATUSES = Object.freeze([
  "draft", "approved", "rejected",
]);

export const PRACTICE_CORPUS_SOURCE_TYPES = Object.freeze([
  "wordstrike-original",
  "cc0-import",
  "permissive-import",
  "public-domain-reviewed",
  "statistical-reference",
  "test-fixture",
]);

export const PRACTICE_CORPUS_USAGE_APPROVALS = Object.freeze([
  "practice-display-approved", "statistical-only", "test-only", "excluded",
]);

export const PRACTICE_CORPUS_PURPOSE_PARTITIONS = Object.freeze({
  training: "training",
  "cold-transfer": "transfer",
  benchmark: "benchmark",
  diagnostic: "diagnostic",
  "research-evaluation": "research-holdout",
});

export const PRACTICE_CORPUS_LIMITS = Object.freeze({
  idLength: 120,
  sourceTitleLength: 200,
  notesLength: 1000,
  metadataBytes: 8 * 1024,
  tags: 32,
  tagLength: 64,
  wordCharacters: 80,
  phraseCharacters: 240,
  sentenceCharacters: 1000,
  passageCharacters: 10_000,
  probeCharacters: 1000,
  manifestSources: 256,
  manifestFamilies: 100_000,
  manifestItems: 1_000_000,
});

export const PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY = Object.freeze({
  version: PRACTICE_CORPUS_PARTITION_POLICY_VERSION,
  salt: "wordstrike-practice-partition-v1",
  weights: Object.freeze({
    training: 65,
    transfer: 15,
    benchmark: 10,
    diagnostic: 5,
    "research-holdout": 5,
  }),
});

export const PRACTICE_CORPUS_NEAR_DUPLICATE_POLICY = Object.freeze({
  hardThreshold: 0.90,
  warningThreshold: 0.75,
  characterShingleSize: 4,
});

export const PRACTICE_CORPUS_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/;
export const PRACTICE_CORPUS_SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/;
