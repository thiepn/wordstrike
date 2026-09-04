import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validatePracticeIndexArtifact, validatePracticeIndexManifest, assertPracticeIndexCompatibility } from "../js/practiceLab/practiceIndexValidation.js";
import { createPracticeIndexRegistry } from "../js/practiceLab/practiceIndexRegistry.js";
import { verifyPracticeContentAnnotations } from "../js/practiceLab/practiceTextAnalysis.js";

async function loadManifest() {
  return JSON.parse(await readFile(new URL("../data/practice/indexes/en-v1/manifest.json", import.meta.url), "utf8"));
}

test("checked-in index manifest is structurally valid and corpus-compatible", async () => {
  const indexManifest = await loadManifest();
  const corpusManifest = JSON.parse(await readFile(new URL("../data/practice/manifests/en-v1.manifest.json", import.meta.url), "utf8"));
  assert.equal(validatePracticeIndexManifest(indexManifest).valid, true);
  assert.equal(assertPracticeIndexCompatibility({ indexManifest, corpusManifest }), true);
  const registry = createPracticeIndexRegistry([indexManifest]);
  assert.equal(registry.get({ corpusId: indexManifest.corpusId, corpusVersion: 1 }).indexChecksum, indexManifest.indexChecksum);
  assert.equal(registry.get({ corpusId: "unknown", corpusVersion: 1 }), null);
  assert.throws(() => registry.register(indexManifest), (error) => error.code === "DUPLICATE_INDEX_REGISTRATION");
});

test("protected reverse shard declarations are invalid", async () => {
  const manifest = await loadManifest();
  const malformed = structuredClone(manifest);
  malformed.generatedPartitions.transfer.targetShards = [0];
  assert.equal(validatePracticeIndexManifest(malformed).valid, false);
  assert.ok(validatePracticeIndexManifest(malformed).errors.some((entry) => entry.code === "PROTECTED_REVERSE_LOOKUP"));
});

test("duplicate target/content references are rejected as noncanonical generated artifacts", async () => {
  const manifest = await loadManifest();
  const shardId = manifest.generatedPartitions.training.targetShards[0];
  const name = String(shardId).padStart(2, "0");
  const artifact = JSON.parse(await readFile(new URL(`../data/practice/indexes/en-v1/training/targets/target-${name}.json`, import.meta.url), "utf8"));
  const malformed = structuredClone(artifact);
  const entry = malformed.entries.find((candidate) => candidate.contents.length > 0);
  entry.contents.push(structuredClone(entry.contents[0]));
  entry.corpusOccurrenceCount += entry.contents[0].count;
  entry.contentCoverageCount += 1;
  const validation = validatePracticeIndexArtifact(malformed);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((error) => error.code === "DUPLICATE_REF"));
});

test("stale annotation content hash and malformed selected-content ranges fail safely", async () => {
  const indexManifest = await loadManifest();
  const shardId = indexManifest.generatedPartitions.transfer.annotationShards[0];
  const name = String(shardId).padStart(2, "0");
  const artifact = JSON.parse(await readFile(new URL(`../data/practice/indexes/en-v1/transfer/annotations/annotation-${name}.json`, import.meta.url), "utf8"));
  const content = JSON.parse(await readFile(new URL("../data/practice/transfer/en-v1.json", import.meta.url), "utf8")).items[0];
  const annotation = artifact.records.find((record) => record.contentId === content.contentId);
  assert.equal(verifyPracticeContentAnnotations({ annotation, text: content.text, contentHash: content.contentHash }), true);
  assert.throws(() => verifyPracticeContentAnnotations({ annotation, text: content.text, contentHash: `sha256-${"0".repeat(64)}` }), (error) => error.code === "CORPUS_MISMATCH");
  const malformed = structuredClone(annotation);
  malformed.trigramOccurrences[0].endIndex = malformed.trigramOccurrences[0].startIndex + 2;
  const wrapped = { ...artifact, records: [malformed] };
  const validation = validatePracticeIndexArtifact(wrapped);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((entry) => entry.code === "INVALID_RANGE"));
});
