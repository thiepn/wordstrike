import { PRACTICE_CORPUS_PARTITIONS } from "./practiceCorpusConstants.js";

export const PRACTICE_INDEX_MANIFEST_VERSION = 1;
export const PRACTICE_INDEX_SCHEMA_VERSION = 1;
export const PRACTICE_INDEX_GENERATOR_VERSION = 1;
export const PRACTICE_TEXT_SEGMENTATION_VERSION = 1;
export const PRACTICE_TOKENIZATION_VERSION = 1;
export const PRACTICE_INDEX_SHARD_POLICY_VERSION = 1;

export const PRACTICE_INDEX_TARGET_TYPES = Object.freeze(["key", "bigram", "trigram", "word"]);
export const PRACTICE_INDEX_RAW_TARGET_TYPES = Object.freeze(["key", "bigram", "trigram"]);
export const PRACTICE_INDEX_CONTEXT_CLASSES = Object.freeze([
  "within-word", "word-boundary", "whitespace", "punctuation", "numeric", "mixed",
]);
export const PRACTICE_INDEX_REVERSE_PARTITIONS = Object.freeze(["training", "diagnostic"]);
export const PRACTICE_INDEX_ANNOTATION_PARTITIONS = PRACTICE_CORPUS_PARTITIONS;
export const PRACTICE_INDEX_ARTIFACT_TYPES = Object.freeze(["content", "annotations", "targets", "words"]);

export const PRACTICE_INDEX_SHARD_POLICY = Object.freeze({
  version: PRACTICE_INDEX_SHARD_POLICY_VERSION,
  salt: "wordstrike-practice-index-shard-v1",
  shardCount: 16,
});

export const PRACTICE_INDEX_LIMITS = Object.freeze({
  idLength: 160,
  targetLength: 128,
  maxTargetEntriesPerShard: 250_000,
  maxContentRecordsPerShard: 100_000,
  maxShardBytes: 2 * 1024 * 1024,
  maxContentIndexBytes: 4 * 1024 * 1024,
  cacheEntries: 16,
  coverageWarnings: 100,
  requiredCoverageTargets: 128,
});

export const PRACTICE_INDEX_COVERAGE_POLICY = Object.freeze({
  minimumWordCoverageForWarning: 3,
  minimumFamilyCoverageForWarning: 3,
});

export const PRACTICE_INDEX_ERROR_CODES = Object.freeze({
  INDEX_NOT_FOUND: "INDEX_NOT_FOUND",
  INDEX_VERSION_MISMATCH: "INDEX_VERSION_MISMATCH",
  CORPUS_MISMATCH: "CORPUS_MISMATCH",
  SHARD_INVALID: "SHARD_INVALID",
  CONTENT_NOT_FOUND: "CONTENT_NOT_FOUND",
  PROTECTED_REVERSE_LOOKUP: "PROTECTED_REVERSE_LOOKUP",
  POSITION_MISMATCH: "POSITION_MISMATCH",
  TARGET_INVALID: "TARGET_INVALID",
  ARTIFACT_CHECKSUM_MISMATCH: "ARTIFACT_CHECKSUM_MISMATCH",
});
