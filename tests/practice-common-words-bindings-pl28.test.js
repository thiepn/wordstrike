import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import { createPracticeSourceIndex, getPracticeSourceUsageEligibility, resolvePracticeCorpusSource } from "../js/practiceLab/practiceCorpusProvenance.js";

const read = async (relative) => JSON.parse(await fs.readFile(new URL(`../${relative}`, import.meta.url), "utf8"));
const sha = (value) => `sha256-${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;

async function loadAll() {
  const [reference, practice, check, sourceSnapshot, sourceRegistry, corpus, index, typabilityManifest, typabilityReference, frequencyReference] = await Promise.all([
    read("data/practice/common-words/en-v1/WS-COMMON-EN-1.reference.json"),
    read("data/practice/common-words/en-v1/WS-COMMON-PRACTICE-EN-1.manifest.json"),
    read("data/practice/common-words/en-v1/WS-COMMON-CHECK-EN-1.manifest.json"),
    read("data/practice/common-words/en-v1/WS-COMMON-SOURCE-EN-1.snapshot.json"),
    read("data/practice/provenance/sources.json"),
    read("data/practice/manifests/en-v1.manifest.json"),
    read("data/practice/indexes/en-v1/manifest.json"),
    read("data/practice/models/en-v1/manifest.json"),
    read("data/practice/models/en-v1/typability-v1.reference.json"),
    read("data/practice/provenance/frequency/en-v1.frequency.json"),
  ]);
  return { reference, practice, check, sourceSnapshot, sourceRegistry, corpus, index, typabilityManifest, typabilityReference, frequencyReference };
}

function assertFoundationBindings(bindings, loaded) {
  assert.equal(bindings.corpusId, loaded.corpus.corpusId);
  assert.equal(bindings.corpusVersion, loaded.corpus.corpusVersion);
  assert.equal(bindings.corpusChecksum, loaded.corpus.buildChecksum);
  assert.equal(bindings.indexSchemaVersion, loaded.index.indexSchemaVersion);
  assert.equal(bindings.indexGeneratorVersion, loaded.index.indexGeneratorVersion);
  assert.equal(bindings.indexChecksum, loaded.index.indexChecksum);
  assert.equal(bindings.typabilityModelVersion, loaded.typabilityManifest.modelVersion);
  assert.equal(bindings.typabilityReferenceVersion, loaded.typabilityReference.referenceVersion);
  assert.equal(bindings.typabilityReferenceChecksum, loaded.typabilityManifest.referenceChecksum);
  assert.equal(bindings.frequencyReferenceVersion, loaded.frequencyReference.referenceVersion);
  assert.equal(bindings.frequencyReferenceChecksum, loaded.frequencyReference.checksum);
  assert.equal(bindings.builderVersion, 1);
}

test("PL28 common-word reference is bound to the exact PL4/PL7/PL10 foundation artifacts used to build it", async () => {
  const loaded = await loadAll();
  assertFoundationBindings(loaded.reference.bindings, loaded);
  assert.equal(loaded.corpus.buildChecksum, loaded.index.corpusChecksum);
  assert.equal(loaded.corpus.buildChecksum, loaded.typabilityManifest.corpusChecksum);
  assert.equal(loaded.index.indexChecksum, loaded.typabilityManifest.indexChecksum);
  assert.equal(loaded.typabilityManifest.referenceVersion, loaded.typabilityReference.referenceVersion);
  assert.equal(loaded.typabilityManifest.frequencyReferenceVersion, loaded.frequencyReference.referenceVersion);
  assert.equal(loaded.typabilityManifest.frequencyReferenceChecksum, loaded.frequencyReference.checksum);
});

test("PL28 statistical, training, and diagnostic sources are separately governed by canonical PL6 approval", async () => {
  const loaded = await loadAll();
  const index = createPracticeSourceIndex(loaded.sourceRegistry);
  const statistical = resolvePracticeCorpusSource(loaded.reference.bindings.statisticalSourceId, index);
  const training = resolvePracticeCorpusSource(loaded.practice.bindings.displaySourceId, index);
  const diagnostic = resolvePracticeCorpusSource(loaded.check.bindings.displaySourceId, index);
  assert.ok(statistical);
  assert.ok(training);
  assert.ok(diagnostic);
  assert.notEqual(training.sourceId, diagnostic.sourceId);
  assert.equal(getPracticeSourceUsageEligibility(statistical, "statistical-reference").allowed, true);
  assert.equal(getPracticeSourceUsageEligibility(statistical, "production-display").allowed, false);
  assert.equal(getPracticeSourceUsageEligibility(training, "production-display").allowed, true);
  assert.equal(getPracticeSourceUsageEligibility(diagnostic, "production-display").allowed, true);
  assert.equal(statistical.usageApproval, "statistical-only");
  assert.equal(training.usageApproval, "practice-display-approved");
  assert.equal(diagnostic.usageApproval, "practice-display-approved");
  assert.equal(statistical.sourceChecksum, loaded.reference.bindings.statisticalSourceChecksum);
  assert.equal(training.sourceChecksum, loaded.practice.bindings.displaySourceChecksum);
  assert.equal(diagnostic.sourceChecksum, loaded.check.bindings.displaySourceChecksum);
  const governedSubsetChecksum = sha({
    registryVersion: loaded.sourceRegistry.registryVersion,
    statisticalSource: statistical,
    trainingSource: training,
    diagnosticSource: diagnostic,
  });
  assert.equal(governedSubsetChecksum, loaded.reference.bindings.sourceRegistryChecksum);
  assert.equal(governedSubsetChecksum, loaded.practice.bindings.sourceRegistryChecksum);
  assert.equal(governedSubsetChecksum, loaded.check.bindings.sourceRegistryChecksum);
});

test("PL28 governed source snapshot binds reviewed upstream words and both display roles to canonical PL7 word identity", async () => {
  const loaded = await loadAll();
  assert.equal(loaded.sourceSnapshot.words.length, 1200);
  assert.equal(loaded.sourceSnapshot.checksum, loaded.reference.bindings.sourceSnapshotChecksum);
  assert.equal(loaded.sourceSnapshot.sourceRegistryVersion, loaded.sourceRegistry.registryVersion);
  assert.equal(loaded.sourceSnapshot.statisticalSourceId, loaded.reference.bindings.statisticalSourceId);
  assert.equal(loaded.sourceSnapshot.trainingSourceId, loaded.practice.bindings.displaySourceId);
  assert.equal(loaded.sourceSnapshot.trainingSourceChecksum, loaded.practice.bindings.displaySourceChecksum);
  assert.equal(loaded.sourceSnapshot.diagnosticSourceId, loaded.check.bindings.displaySourceId);
  assert.equal(loaded.sourceSnapshot.diagnosticSourceChecksum, loaded.check.bindings.displaySourceChecksum);
  const referenceByKey = new Map(loaded.reference.words.map((word) => [word.lexicalKey, word]));
  for (const word of loaded.sourceSnapshot.words) {
    assert.equal(word.wordId, `word:${word.lexicalKey}`);
    const canonical = referenceByKey.get(word.lexicalKey);
    assert.ok(canonical);
    assert.equal(canonical.wordId, word.wordId);
    assert.equal(canonical.sourceRank, word.sourceRank);
  }
});

test("PL28 Practice and Check artifacts bind to the same canonical reference and foundation snapshot", async () => {
  const loaded = await loadAll();
  for (const artifact of [loaded.practice, loaded.check]) {
    assertFoundationBindings(artifact.bindings, loaded);
    assert.equal(artifact.bindings.commonWordReferenceId, loaded.reference.referenceId);
    assert.equal(artifact.bindings.commonWordReferenceVersion, loaded.reference.referenceVersion);
    assert.equal(artifact.bindings.commonWordReferenceChecksum, loaded.reference.checksum);
    assert.equal(artifact.bindings.sourceChecksum, loaded.reference.checksum);
    assert.equal(artifact.bindings.sourceSnapshotChecksum, loaded.sourceSnapshot.checksum);
    assert.equal(artifact.referenceId, loaded.reference.referenceId);
    assert.equal(artifact.referenceVersion, loaded.reference.referenceVersion);
  }
});

test("PL28 Practice and Check preserve independent display partitions and source identities while sharing canonical lexical identity", async () => {
  const loaded = await loadAll();
  assert.equal(loaded.reference.rankingSource.usageApproval, "statistical-only");
  assert.equal(loaded.practice.partition, "training");
  assert.equal(loaded.practice.displayProvenance.partition, "training");
  assert.equal(loaded.practice.displayProvenance.usageApproval, "practice-display-approved");
  assert.equal(loaded.check.partition, "diagnostic");
  assert.equal(loaded.check.displayProvenance.partition, "diagnostic");
  assert.equal(loaded.check.displayProvenance.usageApproval, "practice-display-approved");
  assert.notEqual(loaded.practice.displayProvenance.sourceType, "statistical-reference");
  assert.notEqual(loaded.check.displayProvenance.sourceType, "statistical-reference");
  assert.equal(loaded.practice.displayProvenance.sourceId, loaded.practice.bindings.displaySourceId);
  assert.equal(loaded.check.displayProvenance.sourceId, loaded.check.bindings.displaySourceId);
  assert.notEqual(loaded.practice.bindings.displaySourceId, loaded.check.bindings.displaySourceId);
});
