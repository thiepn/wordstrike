import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { PRACTICE_CORPUS_PARTITIONS } from "../js/practiceLab/practiceCorpusConstants.js";
import {
  buildPracticeIndexesFromCorpus,
  finalizePracticeIndexManifest,
  stablePracticeIndexStringify,
} from "../scripts/lib/practiceIndexBuildCore.mjs";
import { assertPracticeIndexCompatibility } from "../js/practiceLab/practiceIndexValidation.js";
import { verifyPracticeContentAnnotations } from "../js/practiceLab/practiceTextAnalysis.js";

const hashText = (value) => `sha256-${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
const jsonText = (value) => `${JSON.stringify(value, null, 2)}\n`;

async function loadCorpus() {
  const manifest = JSON.parse(await readFile(new URL("../data/practice/manifests/en-v1.manifest.json", import.meta.url), "utf8"));
  const artifacts = {};
  for (const partition of PRACTICE_CORPUS_PARTITIONS) artifacts[partition] = JSON.parse(await readFile(new URL(`../data/practice/${partition}/en-v1.json`, import.meta.url), "utf8"));
  return { manifest, artifacts };
}

function finalize(build) {
  const artifactTexts = new Map();
  for (const [path, artifact] of build.files) artifactTexts.set(path, { text: jsonText(artifact), indexType: artifact.indexType, partition: artifact.partition, shardId: artifact.shardId ?? null });
  return finalizePracticeIndexManifest({ manifestBase: build.manifestBase, artifactTexts, hashText });
}

test("PL7 build is deterministic and emits reverse shards only for training/diagnostic", async () => {
  const { manifest, artifacts } = await loadCorpus();
  const first = buildPracticeIndexesFromCorpus({ corpusManifest: manifest, partitionArtifacts: artifacts, hashText });
  const second = buildPracticeIndexesFromCorpus({ corpusManifest: manifest, partitionArtifacts: Object.fromEntries([...PRACTICE_CORPUS_PARTITIONS].reverse().map((partition) => [partition, artifacts[partition]])), hashText });
  assert.equal(stablePracticeIndexStringify([...first.files]), stablePracticeIndexStringify([...second.files]));
  const indexManifest = finalize(first);
  assert.equal(indexManifest.corpusChecksum, manifest.buildChecksum);
  assert.ok(indexManifest.generatedPartitions.training.targetShards.length > 0);
  assert.ok(indexManifest.generatedPartitions.diagnostic.targetShards.length > 0);
  for (const partition of ["transfer", "benchmark", "research-holdout"]) {
    assert.deepEqual(indexManifest.generatedPartitions[partition].targetShards, []);
    assert.deepEqual(indexManifest.generatedPartitions[partition].wordShards, []);
    assert.ok(indexManifest.generatedPartitions[partition].annotationShards.length > 0);
    assert.equal([...first.files.keys()].some((path) => path.startsWith(`${partition}/targets/`) || path.startsWith(`${partition}/words/`)), false);
  }
});

test("checked-in PL7 index artifacts validate without rewriting", () => {
  const result = spawnSync(process.execPath, [new URL("../scripts/buildPracticeIndexes.mjs", import.meta.url).pathname, "--validate"], { encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Practice indexes validated: practice-en-v1 v1/);
});

test("stale corpus binding and stale content hashes fail closed", async () => {
  const { manifest, artifacts } = await loadCorpus();
  const indexManifest = JSON.parse(await readFile(new URL("../data/practice/indexes/en-v1/manifest.json", import.meta.url), "utf8"));
  const staleManifest = { ...manifest, buildChecksum: `sha256-${"f".repeat(64)}` };
  assert.throws(() => assertPracticeIndexCompatibility({ indexManifest, corpusManifest: staleManifest }), (error) => error.code === "CORPUS_MISMATCH");

  const changed = structuredClone(artifacts);
  changed.training.items[0].text += " changed";
  assert.throws(() => buildPracticeIndexesFromCorpus({ corpusManifest: manifest, partitionArtifacts: changed, hashText }));
});

test("build-time annotations bind positions and hashes to their exact PL6 content", async () => {
  const { manifest, artifacts } = await loadCorpus();
  const build = buildPracticeIndexesFromCorpus({ corpusManifest: manifest, partitionArtifacts: artifacts, hashText });
  const annotation = build.assembledByPartition.training.annotations[0];
  const content = artifacts.training.items.find((item) => item.contentId === annotation.contentId);
  assert.equal(annotation.contentHash, content.contentHash);
  assert.equal(verifyPracticeContentAnnotations({ annotation, text: content.text, contentHash: content.contentHash }), true);
  const malformed = structuredClone(annotation);
  malformed.words[0].startIndex += 1;
  assert.throws(() => verifyPracticeContentAnnotations({ annotation: malformed, text: content.text, contentHash: content.contentHash }), (error) => error.code === "POSITION_MISMATCH");
});

test("index manifest counts match the foundation corpus and generated artifact inventory", async () => {
  const manifest = JSON.parse(await readFile(new URL("../data/practice/indexes/en-v1/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.diagnostics.contentAnalyzed, 7);
  assert.equal(manifest.counts.training.contentItems, 2);
  assert.equal(manifest.counts.transfer.contentItems, 1);
  assert.equal(manifest.counts.benchmark.contentItems, 1);
  assert.equal(manifest.counts.diagnostic.contentItems, 2);
  assert.equal(manifest.counts["research-holdout"].contentItems, 1);
  assert.ok(manifest.artifactChecksums.length > 5);
  assert.match(manifest.indexChecksum, /^sha256-[a-f0-9]{64}$/);
});
