import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  normalizePracticeCorpusText,
  validatePracticeCorpusContentRecord,
  validatePracticeCorpusManifest,
  validatePracticeCorpusPartitionArtifact,
} from "../js/practiceLab/practiceCorpusValidation.js";
import { getPracticeSourceUsageEligibility, assertPracticeSourceUsage } from "../js/practiceLab/practiceCorpusProvenance.js";
import { assertPracticeContentUse } from "../js/practiceLab/practiceCorpusUseGuard.js";
import { createPracticeCorpusRegistry } from "../js/practiceLab/practiceCorpusRegistry.js";

const hashText = (value) => `sha256-${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
const license = { name: "Reviewed test metadata", spdx: null, url: null, attributionRequired: false, notes: null };
const source = (usageApproval, sourceId = `source-${usageApproval}`) => ({
  sourceId, title: "Source", sourceType: "wordstrike-original", upstream: null, license,
  retrievedAt: null, sourceChecksum: null, snapshotPath: null, usageApproval, notes: null,
});
const registry = { registryVersion: 1, sources: [
  source("practice-display-approved"), source("statistical-only"), source("test-only"), source("excluded"),
] };

function item(overrides = {}) {
  const text = overrides.text ?? "Café rhythm stays clear.";
  return {
    contentId: "content-one", familyId: "family-one", sourceId: "source-practice-display-approved",
    language: "en", corpusVersion: 1, partition: "training", contentType: "sentence", text,
    contentHash: overrides.contentHash ?? hashText(text), reviewStatus: "approved", metadata: {}, ...overrides,
  };
}

function manifest(overrides = {}) {
  const zeroes = { training: 0, transfer: 0, benchmark: 0, diagnostic: 0, "research-holdout": 0 };
  return {
    manifestVersion: 1, corpusSchemaVersion: 1, corpusId: "practice-en-v1", language: "en", corpusVersion: 1,
    partitionPolicyVersion: 1, createdAt: "2026-09-04T00:00:00.000Z", sourceIds: ["source-practice-display-approved"],
    partitionCounts: { ...zeroes }, familyCounts: { total: 0, byPartition: { ...zeroes } },
    contentCounts: { total: 0, byPartition: { ...zeroes } }, familyAssignments: [], status: "foundation",
    buildChecksum: `sha256-${"0".repeat(64)}`, ...overrides,
  };
}

test("canonical text normalization preserves language text but removes only authoring noise", () => {
  assert.equal(normalizePracticeCorpusText("  Cafe\u0301 rhythm.\r\n", { contentType: "passage" }), "Café rhythm.");
  assert.throws(() => normalizePracticeCorpusText("bad\0text", { contentType: "sentence" }), /null byte/);
  assert.throws(() => normalizePracticeCorpusText("hidden\u202Etext", { contentType: "sentence" }), /bidi/);
  assert.throws(() => normalizePracticeCorpusText("one\ntwo", { contentType: "sentence" }), /newlines/);
  assert.throws(() => normalizePracticeCorpusText("<script>alert(1)<\/script>", { contentType: "sentence" }), /raw HTML/);
  assert.throws(() => normalizePracticeCorpusText("mail me at person@example.com", { contentType: "sentence" }), /email/);
});

test("source display approval is explicit and never inferred from source type/license", () => {
  assert.equal(getPracticeSourceUsageEligibility(source("practice-display-approved"), "production-display").allowed, true);
  for (const approval of ["statistical-only", "test-only", "excluded"]) {
    assert.equal(getPracticeSourceUsageEligibility(source(approval), "production-display").allowed, false);
    assert.throws(() => assertPracticeSourceUsage({ sourceId: `source-${approval}`, registry, requestedUse: "production-display" }), (error) => error.code === "PRACTICE_CORPUS_SOURCE_NOT_APPROVED");
  }
  assert.throws(() => assertPracticeSourceUsage({ sourceId: "unknown", registry, requestedUse: "production-display" }), (error) => error.code === "PRACTICE_CORPUS_UNKNOWN_SOURCE");
});

test("approved content and SHA-256 integrity are required", () => {
  const valid = item();
  assert.equal(validatePracticeCorpusContentRecord(valid, { hashText }).valid, true);
  assert.equal(validatePracticeCorpusContentRecord({ ...valid, reviewStatus: "draft" }, { hashText }).valid, true, "record schema accepts review states; production build owns approval gate");
  assert.equal(validatePracticeCorpusContentRecord({ ...valid, contentHash: `sha256-${"1".repeat(64)}` }, { hashText }).valid, false);
  assert.equal(validatePracticeCorpusContentRecord({ ...valid, text: "Changed text." }, { hashText }).valid, false);
  assert.equal(validatePracticeCorpusContentRecord({ ...valid, contentHash: undefined }, { hashText }).valid, false);
});

test("manifest and artifact versions remain consistent and reject unsupported versions", () => {
  assert.equal(validatePracticeCorpusManifest(manifest()).valid, true);
  assert.equal(validatePracticeCorpusManifest(manifest({ manifestVersion: 99 })).valid, false);
  assert.equal(validatePracticeCorpusManifest(manifest({ corpusVersion: 0 })).valid, false);
  const artifact = {
    artifactVersion: 1, corpusSchemaVersion: 1, corpusId: "practice-en-v1", language: "en", corpusVersion: 1,
    partitionPolicyVersion: 1, partition: "training", items: [item()],
  };
  assert.equal(validatePracticeCorpusPartitionArtifact(artifact, { hashText }).valid, true);
  assert.equal(validatePracticeCorpusPartitionArtifact({ ...artifact, items: [{ ...item(), reviewStatus: "draft" }] }, { hashText }).valid, false);
  assert.equal(validatePracticeCorpusPartitionArtifact({ ...artifact, items: [{ ...item(), corpusVersion: 2 }] }, { hashText }).valid, false);
});

test("content-use guard has no cross-partition or any-partition fallback", () => {
  assert.equal(assertPracticeContentUse({ item: { contentId: "a", partition: "training" }, purpose: "training" }).contentId, "a");
  assert.throws(() => assertPracticeContentUse({ item: { partition: "benchmark" }, purpose: "training" }), (error) => error.code === "PRACTICE_CORPUS_PARTITION_MISMATCH");
  assert.throws(() => assertPracticeContentUse({ item: { partition: "training" }, purpose: "benchmark" }), (error) => error.code === "PRACTICE_CORPUS_PARTITION_MISMATCH");
  assert.throws(() => assertPracticeContentUse({ item: { partition: "training" }, purpose: "any" }), (error) => error.code === "PRACTICE_CORPUS_UNKNOWN_PURPOSE");
});

test("corpus registry requires valid unique immutable manifests", () => {
  const first = manifest();
  const registryInstance = createPracticeCorpusRegistry({ manifests: [first] });
  assert.equal(registryInstance.getCorpusManifest("practice-en-v1").corpusId, "practice-en-v1");
  assert.equal(registryInstance.getCorpusManifest("missing"), null);
  assert.equal(Object.isFrozen(registryInstance.getCorpusManifest("practice-en-v1")), true);
  assert.throws(() => registryInstance.registerCorpusManifest(first), (error) => error.code === "PRACTICE_CORPUS_DUPLICATE_REGISTRATION");
  assert.throws(() => registryInstance.registerCorpusManifest(manifest({ corpusId: "practice-en-second", manifestVersion: 99 })), (error) => error.code === "PRACTICE_CORPUS_INVALID_MANIFEST");
  assert.throws(() => registryInstance.registerCorpusManifest(manifest({ corpusId: "practice-en-other" })), (error) => error.code === "PRACTICE_CORPUS_DUPLICATE_REGISTRATION");
});
