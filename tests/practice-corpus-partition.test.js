import test from "node:test";
import assert from "node:assert/strict";
import {
  PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY,
  PRACTICE_CORPUS_PARTITIONS,
} from "../js/practiceLab/practiceCorpusConstants.js";
import {
  assertPracticeFamilyIsolation,
  derivePracticeFamilyPartition,
  resolvePracticeFamilyPartition,
  validatePracticeCorpusPartitionPolicy,
} from "../js/practiceLab/practiceCorpusPartition.js";

test("PL6 partition policy is canonical, deterministic, order-independent, and distributed", () => {
  assert.equal(validatePracticeCorpusPartitionPolicy(PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY).valid, true);
  assert.equal(Object.values(PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY.weights).reduce((a, b) => a + b, 0), 100);
  const familyIds = Array.from({ length: 1000 }, (_, index) => `family-${String(index).padStart(4, "0")}`);
  const first = Object.fromEntries(familyIds.map((familyId) => [familyId, derivePracticeFamilyPartition({ familyId, corpusVersion: 1 }).partition]));
  const reversed = Object.fromEntries([...familyIds].reverse().map((familyId) => [familyId, derivePracticeFamilyPartition({ familyId, corpusVersion: 1 }).partition]));
  assert.deepEqual(first, reversed);
  for (const familyId of familyIds.slice(0, 50)) assert.equal(derivePracticeFamilyPartition({ familyId, corpusVersion: 1 }).partition, first[familyId]);
  const seen = new Set(Object.values(first));
  for (const partition of PRACTICE_CORPUS_PARTITIONS) assert.equal(seen.has(partition), true, `expected deterministic sample to include ${partition}`);
});

test("family locks apply to the whole family and conflicting family partitions fail", () => {
  const locked = resolvePracticeFamilyPartition({ familyId: "diagnostic-family", corpusVersion: 1, partitionLock: "diagnostic" });
  assert.deepEqual(locked, { partition: "diagnostic", bucket: null, assignment: "locked" });
  assert.throws(() => resolvePracticeFamilyPartition({ familyId: "bad-lock", corpusVersion: 1, partitionLock: "train" }), /Invalid Practice corpus partition lock/);
  assert.doesNotThrow(() => assertPracticeFamilyIsolation([
    { familyId: "family-a", partition: "training" },
    { familyId: "family-a", partition: "training" },
    { familyId: "family-b", partition: "benchmark" },
  ]));
  assert.throws(() => assertPracticeFamilyIsolation([
    { familyId: "family-a", partition: "training" },
    { familyId: "family-a", partition: "benchmark" },
  ]), (error) => error.code === "PRACTICE_CORPUS_FAMILY_PARTITION_CONFLICT");
});

test("invalid partition policies fail closed", () => {
  assert.equal(validatePracticeCorpusPartitionPolicy({ ...PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY, weights: { ...PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY.weights, training: 64 } }).valid, false);
  assert.equal(validatePracticeCorpusPartitionPolicy({ ...PRACTICE_CORPUS_DEFAULT_PARTITION_POLICY, version: 99 }).valid, false);
});
