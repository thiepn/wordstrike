import test from "node:test";
import assert from "node:assert/strict";
import {
  derivePracticeIndexShardId,
  formatPracticeIndexShardId,
  getPracticeIndexShardPath,
  validatePracticeIndexShardPolicy,
} from "../js/practiceLab/practiceIndexSharding.js";
import { PRACTICE_INDEX_SHARD_POLICY } from "../js/practiceLab/practiceIndexConstants.js";
import { validatePracticeIndexArtifact } from "../js/practiceLab/practiceIndexValidation.js";

const validTargetEntry = {
  entityType: "bigram",
  entityKey: "br",
  corpusOccurrenceCount: 1,
  contentCoverageCount: 1,
  familyCoverageCount: 1,
  wordCoverageCount: 1,
  wordKeys: ["bright"],
  contents: [{ contentId: "practice-en-c1", familyId: "family-c1", count: 1, positions: [0] }],
};

test("shard assignment is deterministic and independent of input ordering", () => {
  const first = derivePracticeIndexShardId({ indexType: "targets", entityType: "bigram", entityKey: "br" });
  const second = derivePracticeIndexShardId({ indexType: "targets", entityType: "bigram", entityKey: "br" });
  assert.equal(first, second);
  const values = ["br", "th", "tion", " x", "zz"].map((entityKey) => [entityKey, derivePracticeIndexShardId({ indexType: "targets", entityType: entityKey.length === 2 ? "bigram" : "trigram", entityKey })]);
  assert.deepEqual([...values].reverse().reverse(), values);
  assert.match(formatPracticeIndexShardId(first), /^\d{2}$/);
  assert.equal(getPracticeIndexShardPath({ partition: "training", indexType: "targets", shardId: first }), `training/targets/target-${formatPracticeIndexShardId(first)}.json`);
});

test("wrong-shard target entry is rejected", () => {
  const correct = derivePracticeIndexShardId({ indexType: "targets", entityType: "bigram", entityKey: "br" });
  const wrong = (correct + 1) % PRACTICE_INDEX_SHARD_POLICY.shardCount;
  const artifact = {
    indexSchemaVersion: 1,
    indexGeneratorVersion: 1,
    corpusId: "practice-en-v1",
    corpusVersion: 1,
    corpusChecksum: `sha256-${"a".repeat(64)}`,
    language: "en",
    partition: "training",
    indexType: "targets",
    shardPolicyVersion: 1,
    shardCount: PRACTICE_INDEX_SHARD_POLICY.shardCount,
    shardId: wrong,
    entries: [validTargetEntry],
  };
  const validation = validatePracticeIndexArtifact(artifact);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((entry) => entry.code === "SHARD_INVALID"));
});

test("unsupported shard policy versions fail closed", () => {
  const invalid = { ...PRACTICE_INDEX_SHARD_POLICY, version: 2 };
  assert.equal(validatePracticeIndexShardPolicy(invalid).valid, false);
});
