import test from "node:test";
import assert from "node:assert/strict";
import { analyzePracticeText } from "../js/practiceLab/practiceTextAnalysis.js";
import { assemblePracticePartitionIndexes } from "../js/practiceLab/practiceIndexAssembler.js";

function record({ contentId, familyId, text, partition = "training" }) {
  return {
    content: {
      contentId,
      familyId,
      sourceId: "source-test",
      contentType: "sentence",
      partition,
      language: "en",
      corpusVersion: 1,
      contentHash: `sha256-${"a".repeat(64)}`,
    },
    analysis: analyzePracticeText({ text, language: "en" }),
  };
}

function target(assembled, type, key) {
  return assembled.targetEntries.find((entry) => entry.entityType === type && entry.entityKey === key);
}

test("bigram-to-word index uses only within-word relationships", () => {
  const assembled = assemblePracticePartitionIndexes({
    corpusId: "practice-en-v1",
    partition: "training",
    records: [record({ contentId: "c1", familyId: "f1", text: "bright bridge, br" })],
  });
  const br = target(assembled, "bigram", "br");
  assert.equal(br.corpusOccurrenceCount, 3);
  assert.equal(br.contentCoverageCount, 1);
  assert.equal(br.familyCoverageCount, 1);
  assert.deepEqual(br.wordKeys, ["br", "bridge", "bright"]);
  assert.deepEqual(br.contents[0].positions, [0, 7, 15]);
});

test("content coverage and family coverage remain distinct", () => {
  const assembled = assemblePracticePartitionIndexes({
    corpusId: "practice-en-v1",
    partition: "training",
    records: [
      record({ contentId: "c1", familyId: "shared", text: "bright" }),
      record({ contentId: "c2", familyId: "shared", text: "bridge" }),
    ],
  });
  const br = target(assembled, "bigram", "br");
  assert.equal(br.corpusOccurrenceCount, 2);
  assert.equal(br.contentCoverageCount, 2);
  assert.equal(br.familyCoverageCount, 1);
});

test("repeated targets aggregate one content reference with count and positions", () => {
  const assembled = assemblePracticePartitionIndexes({
    corpusId: "practice-en-v1",
    partition: "training",
    records: [record({ contentId: "c1", familyId: "f1", text: "br br br" })],
  });
  const br = target(assembled, "bigram", "br");
  assert.equal(br.corpusOccurrenceCount, 3);
  assert.equal(br.contentCoverageCount, 1);
  assert.equal(br.familyCoverageCount, 1);
  assert.equal(br.contents.length, 1);
  assert.equal(br.contents[0].count, 3);
  assert.deepEqual(br.contents[0].positions, [0, 3, 6]);
});

test("word lexicon groups case-insensitive lexical identity while retaining surface forms", () => {
  const assembled = assemblePracticePartitionIndexes({
    corpusId: "practice-en-v1",
    partition: "training",
    records: [record({ contentId: "c1", familyId: "f1", text: "The the THE" })],
  });
  const word = assembled.wordEntries.find((entry) => entry.lexicalKey === "the");
  assert.equal(word.corpusOccurrenceCount, 3);
  assert.deepEqual(word.surfaceForms.map((form) => form.surfaceText), ["the", "The", "THE"]);
  assert.equal(word.contentCoverageCount, 1);
  assert.equal(word.familyCoverageCount, 1);
});

test("over-limit or non-word Practice lexical units never become invalid word entities", () => {
  const longWord = "a".repeat(65);
  const assembled = assemblePracticePartitionIndexes({
    corpusId: "practice-en-v1",
    partition: "training",
    records: [record({ contentId: "c1", familyId: "f1", text: `${longWord} 123` })],
  });
  assert.equal(assembled.wordEntries.some((entry) => entry.lexicalKey === longWord), false);
  assert.equal(assembled.wordEntries.some((entry) => entry.lexicalKey === "123"), false);
  assert.ok(assembled.diagnostics.invalidWordKeyCount >= 2);
  assert.ok(assembled.targetEntries.some((entry) => entry.entityType === "bigram" && entry.entityKey === "aa"));
});

import { intersectPracticeContentRefs, unionPracticeContentRefs } from "../js/practiceLab/practiceTargetIndex.js";

test("content-reference set helpers combine candidate IDs without pedagogical ranking", () => {
  const a = [{ contentId: "c1", count: 1, positions: [0] }, { contentId: "c2", count: 1, positions: [1] }];
  const b = [{ contentId: "c2", count: 2, positions: [2, 4] }, { contentId: "c3", count: 1, positions: [0] }];
  assert.deepEqual(intersectPracticeContentRefs(a, b).map((entry) => entry.contentId), ["c2"]);
  assert.deepEqual(unionPracticeContentRefs(a, b).map((entry) => entry.contentId), ["c1", "c2", "c3"]);
});
