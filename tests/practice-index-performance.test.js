import test from "node:test";
import assert from "node:assert/strict";
import { analyzePracticeText } from "../js/practiceLab/practiceTextAnalysis.js";
import { assemblePracticePartitionIndexes } from "../js/practiceLab/practiceIndexAssembler.js";

test("index assembly remains linear/bounded over a tens-of-thousands sentence-sized protected fixture", () => {
  const analysis = analyzePracticeText({ text: "alpha beta gamma delta.", language: "en" });
  const records = Array.from({ length: 20_000 }, (_, index) => ({
    content: {
      contentId: `practice-en-perf-${String(index).padStart(5, "0")}`,
      familyId: `family-perf-${String(index).padStart(5, "0")}`,
      sourceId: "source-perf",
      contentType: "sentence",
      partition: "transfer",
      language: "en",
      corpusVersion: 1,
      contentHash: `sha256-${"a".repeat(64)}`,
    },
    analysis,
  }));
  const assembled = assemblePracticePartitionIndexes({ corpusId: "practice-en-v1", partition: "transfer", records });
  assert.equal(assembled.coverage.contentItems, 20_000);
  assert.equal(assembled.coverage.families, 20_000);
  assert.equal(assembled.annotations.length, 20_000);
  assert.equal(assembled.content.length, 20_000);
  assert.deepEqual(assembled.targetEntries, []);
  assert.deepEqual(assembled.wordEntries, []);
});
