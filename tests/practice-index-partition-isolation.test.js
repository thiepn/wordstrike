import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createPracticeIndexLoader } from "../js/practiceLab/practiceIndexLoader.js";
import { createPracticeTargetIndex } from "../js/practiceLab/practiceTargetIndex.js";

const hashText = async (value) => `sha256-${createHash("sha256").update(String(value), "utf8").digest("hex")}`;
const fetchFromRepo = async (url) => {
  try {
    const text = await readFile(new URL(`../${url}`, import.meta.url), "utf8");
    return { ok: true, status: 200, async text() { return text; } };
  } catch {
    return { ok: false, status: 404, async text() { return ""; } };
  }
};

test("protected partitions have annotations but cannot be target-selected through runtime API", async () => {
  const corpusManifest = JSON.parse(await readFile(new URL("../data/practice/manifests/en-v1.manifest.json", import.meta.url), "utf8"));
  const indexManifest = JSON.parse(await readFile(new URL("../data/practice/indexes/en-v1/manifest.json", import.meta.url), "utf8"));
  const loader = createPracticeIndexLoader({ fetchImpl: fetchFromRepo, hashText });
  const index = createPracticeTargetIndex({ loader, corpusManifest, indexManifest });

  const trainingRefs = await index.getTargetContentRefs({ partition: "training", entityType: "key", entityKey: "a", purpose: "training" });
  assert.ok(trainingRefs.length > 0);
  assert.ok(trainingRefs.every((ref) => ref.contentId.includes("practice-en-")));

  const diagnosticRefs = await index.getTargetContentRefs({ partition: "diagnostic", entityType: "key", entityKey: "a", purpose: "diagnostic" });
  assert.ok(diagnosticRefs.length > 0);

  await assert.rejects(index.getTargetContentRefs({ partition: "transfer", entityType: "bigram", entityKey: "tr", purpose: "cold-transfer" }), (error) => error.code === "PROTECTED_REVERSE_LOOKUP");
  await assert.rejects(index.getTargetContentRefs({ partition: "benchmark", entityType: "key", entityKey: "a", purpose: "benchmark" }), (error) => error.code === "PROTECTED_REVERSE_LOOKUP");

  const transferContent = JSON.parse(await readFile(new URL("../data/practice/transfer/en-v1.json", import.meta.url), "utf8")).items[0];
  const transferAnnotation = await index.getContentAnnotations({ partition: "transfer", contentId: transferContent.contentId, purpose: "cold-transfer", content: transferContent });
  assert.equal(transferAnnotation.contentId, transferContent.contentId);

  const benchmarkContent = JSON.parse(await readFile(new URL("../data/practice/benchmark/en-v1.json", import.meta.url), "utf8")).items[0];
  const benchmarkAnnotation = await index.getContentAnnotations({ partition: "benchmark", contentId: benchmarkContent.contentId, purpose: "benchmark", content: benchmarkContent });
  assert.equal(benchmarkAnnotation.contentId, benchmarkContent.contentId);
});

test("training and diagnostic reverse lookups never return references from another partition", async () => {
  const corpusManifest = JSON.parse(await readFile(new URL("../data/practice/manifests/en-v1.manifest.json", import.meta.url), "utf8"));
  const indexManifest = JSON.parse(await readFile(new URL("../data/practice/indexes/en-v1/manifest.json", import.meta.url), "utf8"));
  const loader = createPracticeIndexLoader({ fetchImpl: fetchFromRepo, hashText });
  const index = createPracticeTargetIndex({ loader, corpusManifest, indexManifest });
  const training = new Set(JSON.parse(await readFile(new URL("../data/practice/training/en-v1.json", import.meta.url), "utf8")).items.map((item) => item.contentId));
  const diagnostic = new Set(JSON.parse(await readFile(new URL("../data/practice/diagnostic/en-v1.json", import.meta.url), "utf8")).items.map((item) => item.contentId));
  const trainingRefs = await index.getTargetContentRefs({ partition: "training", entityType: "key", entityKey: "a", purpose: "training" });
  const diagnosticRefs = await index.getTargetContentRefs({ partition: "diagnostic", entityType: "key", entityKey: "a", purpose: "diagnostic" });
  assert.ok(trainingRefs.every((ref) => training.has(ref.contentId)));
  assert.ok(diagnosticRefs.every((ref) => diagnostic.has(ref.contentId)));
});
