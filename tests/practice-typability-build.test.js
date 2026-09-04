import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  PRACTICE_TYPABILITY_FIT_PARTITIONS,
  PRACTICE_TYPABILITY_PROTECTED_FIT_EXCLUSIONS,
  buildPracticeTypabilityArtifacts,
} from "../scripts/lib/practiceTypabilityBuildCore.mjs";
import { extractPracticeTextDifficultyFeatures } from "../js/practiceLab/practiceTextDifficultyFeatures.js";
import { scorePracticeTextTypability } from "../js/practiceLab/practiceTypabilityModel.js";

const readJson = async (relative) => JSON.parse(await readFile(new URL(`../${relative}`, import.meta.url), "utf8"));

async function inputs() {
  const corpusManifest = await readJson("data/practice/manifests/en-v1.manifest.json");
  const indexManifest = await readJson("data/practice/indexes/en-v1/manifest.json");
  const sourceRegistry = await readJson("data/practice/provenance/sources.json");
  const partitionArtifacts = {};
  for (const partition of ["training", "transfer", "benchmark", "diagnostic", "research-holdout"]) {
    partitionArtifacts[partition] = await readJson(`data/practice/${partition}/en-v1.json`);
  }
  return { corpusManifest, indexManifest, sourceRegistry, partitionArtifacts };
}

test("PL10 typability build is deterministic and binds exact PL6/PL7 checksums", async () => {
  const source = await inputs();
  const first = buildPracticeTypabilityArtifacts(source);
  const second = buildPracticeTypabilityArtifacts(structuredClone(source));
  assert.deepEqual(first, second);
  assert.equal(first.reference.corpusChecksum, source.corpusManifest.buildChecksum);
  assert.equal(first.reference.indexChecksum, source.indexManifest.indexChecksum);
  assert.equal(first.reference.referenceItemCount, 2);
  assert.equal(first.frequencyMetadata.referenceVersion, null);
  assert.deepEqual(first.diagnostics.fitPartitions, ["training"]);
  assert.deepEqual(PRACTICE_TYPABILITY_FIT_PARTITIONS, ["training"]);
  for (const partition of ["transfer", "benchmark", "diagnostic", "research-holdout"]) {
    assert.ok(PRACTICE_TYPABILITY_PROTECTED_FIT_EXCLUSIONS.includes(partition));
  }
  assert.equal(first.diagnostics.researchHoldoutScored, false);
  assert.equal(Object.hasOwn(first.scores, "research-holdout"), false);
});

test("PL10 production foundation model is partial at 0.62 because no governed frequency reference exists", async () => {
  const build = buildPracticeTypabilityArtifacts(await inputs());
  for (const partition of ["training", "transfer", "benchmark", "diagnostic"]) {
    for (const row of build.scores[partition]) {
      assert.equal(row.textDifficulty.status, "partial");
      assert.equal(row.textDifficulty.availableModelWeight, 0.62);
      assert.equal(row.features.lexicalRarityScore, null);
      assert.equal(row.features.bigramRarityScore, null);
    }
  }
});

test("PL10 protected partitions cannot influence reference fitting", async () => {
  const source = await inputs();
  const baseline = buildPracticeTypabilityArtifacts(source).reference;
  const changed = structuredClone(source);
  for (const partition of ["transfer", "benchmark", "diagnostic", "research-holdout"]) {
    changed.partitionArtifacts[partition].items = changed.partitionArtifacts[partition].items.map((item) => ({
      ...item,
      text: `${item.text} EXTREME 9999 !!! $$$ exceptionallylongsynthetictoken`,
    }));
  }
  const after = buildPracticeTypabilityArtifacts(changed).reference;
  assert.deepEqual(after, baseline);
});

test("PL10 static scores equal runtime feature extraction and scoring for the same current text", async () => {
  const source = await inputs();
  const build = buildPracticeTypabilityArtifacts(source);
  const item = source.partitionArtifacts.training.items[0];
  const staticRow = build.scores.training.find((row) => row.contentId === item.contentId);
  const dynamicFeatures = extractPracticeTextDifficultyFeatures({ text: item.text, language: item.language });
  const dynamicScore = scorePracticeTextTypability({ features: dynamicFeatures, reference: build.reference, language: item.language });
  assert.deepEqual(staticRow.features, dynamicFeatures);
  assert.deepEqual(staticRow.textDifficulty, dynamicScore);
  const serialized = JSON.stringify(staticRow);
  assert.equal(serialized.includes(item.text), false);
});

test("PL10 checked-in model manifest advertises training-only fit and no normal holdout scoring", async () => {
  const manifest = await readJson("data/practice/models/en-v1/manifest.json");
  assert.deepEqual(manifest.fitPartitions, ["training"]);
  assert.equal(manifest.referencePartition, "training");
  assert.equal(manifest.researchHoldoutScored, false);
  assert.equal(manifest.frequencyReferenceVersion, null);
  assert.equal(manifest.indexChecksum, "sha256-bb198244a6b6cefcae5cb908bf3dee6e9e52259f9ef41576ec69c429a423ff32");
});
