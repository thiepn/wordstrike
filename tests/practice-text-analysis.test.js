import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePracticeText,
  getPracticeNgramOccurrences,
  normalizePracticeTarget,
  verifyPracticeContentAnnotations,
} from "../js/practiceLab/practiceTextAnalysis.js";

function asAnnotation(analysis, overrides = {}) {
  return {
    contentId: "practice-en-test-analysis",
    familyId: "family-analysis",
    sourceId: "source-analysis",
    corpusId: "practice-en-v1",
    corpusVersion: 1,
    partition: "training",
    language: "en",
    contentHash: "sha256-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    segmentationVersion: analysis.segmentationVersion,
    tokenizationVersion: analysis.tokenizationVersion,
    graphemeCount: analysis.graphemeCount,
    wordCount: analysis.wordCount,
    words: analysis.words,
    keyOccurrences: analysis.keyOccurrences,
    bigramOccurrences: analysis.bigramOccurrences,
    trigramOccurrences: analysis.trigramOccurrences,
    structuralCounts: analysis.structuralCounts,
    ...overrides,
  };
}

test("PL7 bigrams/trigrams match adjacent Practice grapheme windows including spaces", () => {
  const analysis = analyzePracticeText({ text: "the cat", language: "en" });
  assert.deepEqual(analysis.bigramOccurrences.map((entry) => entry.target), ["th", "he", "e ", " c", "ca", "at"]);
  assert.deepEqual(analysis.trigramOccurrences.map((entry) => entry.target), ["the", "he ", "e c", " ca", "cat"]);
  assert.equal(analysis.bigramOccurrences[2].contextClass, "word-boundary");
  assert.equal(analysis.bigramOccurrences[3].contextClass, "word-boundary");
});

test("overlapping n-grams and future chunk-ready N analysis preserve every adjacent window", () => {
  const analysis = analyzePracticeText({ text: "aaaa", language: "en" });
  assert.deepEqual(analysis.bigramOccurrences.map(({ target, startIndex }) => [target, startIndex]), [["aa", 0], ["aa", 1], ["aa", 2]]);
  assert.deepEqual(analysis.trigramOccurrences.map(({ target, startIndex }) => [target, startIndex]), [["aaa", 0], ["aaa", 1]]);
  assert.deepEqual(getPracticeNgramOccurrences(analysis, 4).map(({ target, startIndex }) => [target, startIndex]), [["aaaa", 0]]);
});

test("surface words, lexical keys, and capitalization remain distinct", () => {
  const analysis = analyzePracticeText({ text: "The the THE", language: "en" });
  assert.deepEqual(analysis.words.map((word) => word.surfaceText), ["The", "the", "THE"]);
  assert.deepEqual(analysis.words.map((word) => word.lexicalKey), ["the", "the", "the"]);
  assert.deepEqual(analysis.words.map((word) => word.capitalizationClass), ["initial-cap", "lower", "upper"]);
  assert.ok(analysis.bigramOccurrences.some((entry) => entry.target === "Th"));
  assert.ok(analysis.bigramOccurrences.some((entry) => entry.target === "th"));
});

test("structural occurrence classes retain punctuation, numeric, and whitespace context without pattern semantics", () => {
  const analysis = analyzePracticeText({ text: "A, 12", language: "en" });
  assert.equal(analysis.keyOccurrences.find((entry) => entry.target === ",").contextClass, "punctuation");
  assert.equal(analysis.keyOccurrences.find((entry) => entry.target === "1").contextClass, "numeric");
  assert.equal(analysis.keyOccurrences.find((entry) => entry.target === " ").contextClass, "whitespace");
  assert.equal(analysis.bigramOccurrences.find((entry) => entry.target === "A,").contextClass, "punctuation");
});

test("selected-content verification reconstructs every indexed range and fails on drift", () => {
  const text = "bright bridge";
  const analysis = analyzePracticeText({ text, language: "en" });
  const annotation = asAnnotation(analysis);
  assert.equal(verifyPracticeContentAnnotations({ annotation, text }), true);
  const malformed = structuredClone(annotation);
  malformed.bigramOccurrences[0].startIndex = 1;
  assert.throws(() => verifyPracticeContentAnnotations({ annotation: malformed, text }), (error) => error.code === "POSITION_MISMATCH");
  assert.throws(() => verifyPracticeContentAnnotations({ annotation, text, contentHash: "sha256-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }), (error) => error.code === "CORPUS_MISMATCH");
});

test("target normalization preserves raw motor case and NFC while word lookup is explicit lexical normalization", () => {
  assert.equal(normalizePracticeTarget({ entityType: "bigram", entityKey: "Th", language: "en" }), "Th");
  assert.equal(normalizePracticeTarget({ entityType: "word", entityKey: "CAFÉ", language: "fr" }), "café");
  assert.throws(() => normalizePracticeTarget({ entityType: "bigram", entityKey: "t", language: "en" }), (error) => error.code === "TARGET_INVALID");
});
