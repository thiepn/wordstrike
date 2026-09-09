import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = async (relative) => JSON.parse(await fs.readFile(new URL(`../${relative}`, import.meta.url), "utf8"));

async function loadAll() {
  const [reference, practice, check, corpus, index, typabilityManifest, typabilityReference, frequencyReference] = await Promise.all([
    read("data/practice/common-words/en-v1/WS-COMMON-EN-1.reference.json"),
    read("data/practice/common-words/en-v1/WS-COMMON-PRACTICE-EN-1.manifest.json"),
    read("data/practice/common-words/en-v1/WS-COMMON-CHECK-EN-1.manifest.json"),
    read("data/practice/manifests/en-v1.manifest.json"),
    read("data/practice/indexes/en-v1/manifest.json"),
    read("data/practice/models/en-v1/manifest.json"),
    read("data/practice/models/en-v1/typability-v1.reference.json"),
    read("data/practice/provenance/frequency/en-v1.frequency.json"),
  ]);
  return { reference, practice, check, corpus, index, typabilityManifest, typabilityReference, frequencyReference };
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

test("PL28 Practice and Check artifacts bind to the same canonical reference and foundation snapshot", async () => {
  const loaded = await loadAll();
  for (const artifact of [loaded.practice, loaded.check]) {
    assertFoundationBindings(artifact.bindings, loaded);
    assert.equal(artifact.bindings.commonWordReferenceId, loaded.reference.referenceId);
    assert.equal(artifact.bindings.commonWordReferenceVersion, loaded.reference.referenceVersion);
    assert.equal(artifact.bindings.commonWordReferenceChecksum, loaded.reference.checksum);
    assert.equal(artifact.bindings.sourceChecksum, loaded.reference.checksum);
    assert.equal(artifact.referenceId, loaded.reference.referenceId);
    assert.equal(artifact.referenceVersion, loaded.reference.referenceVersion);
  }
});

test("PL28 Practice and Check preserve independent display partitions while sharing only canonical lexical identity", async () => {
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
}