import assert from "node:assert/strict";
import { test } from "node:test";
import { createPracticeReferenceFrequencyProvider } from "../js/practiceLab/practiceReferenceFrequency.js";
import { extractPracticeTextDifficultyFeatures } from "../js/practiceLab/practiceTextDifficultyFeatures.js";

function frequencyProvider({ words = {}, bigrams = {} } = {}) {
  return createPracticeReferenceFrequencyProvider({
    referenceVersion: 1,
    referenceId: "fixture-frequency-v1",
    language: "en",
    checksum: `sha256-${"a".repeat(64)}`,
    sourceIds: ["fixture-source"],
    usageApproval: "statistical-reference",
    wordFrequencies: words,
    bigramFrequencies: bigrams,
    thresholds: { high: 100, medium: 50, low: 10 },
  });
}

test("PL10 text features use Practice graphemes and PL7 word segmentation", () => {
  const text = "A😊 bé.";
  const features = extractPracticeTextDifficultyFeatures({ text, language: "en" });
  assert.equal(features.featureVersion, 1);
  assert.equal(features.graphemeCount, 6);
  assert.equal(features.wordCount, 2);
  assert.ok(features.graphemeCount < text.length);
  assert.ok(features.uppercaseRatio > 0);
  assert.ok(features.punctuationRatio > 0);
});

test("PL10 p90 word length uses the PL8 R-7 quantile convention", () => {
  const features = extractPracticeTextDifficultyFeatures({ text: "a ab abc abcd abcde", language: "en" });
  assert.equal(features.meanWordLength, 3);
  assert.ok(Math.abs(features.p90WordLength - 4.6) < 1e-12);
});

test("PL10 complexity ratios use the non-whitespace grapheme denominator and stay nullable on empty text", () => {
  const features = extractPracticeTextDifficultyFeatures({ text: "A 9! $", language: "en" });
  assert.equal(features.nonWhitespaceGraphemeCount, 4);
  assert.equal(features.uppercaseRatio, 0.25);
  assert.equal(features.digitRatio, 0.25);
  assert.equal(features.punctuationRatio, 0.25);
  assert.equal(features.symbolRatio, 0.25);
  const empty = extractPracticeTextDifficultyFeatures({ text: "   ", language: "en" });
  for (const key of ["uppercaseRatio", "punctuationRatio", "digitRatio", "symbolRatio"]) assert.equal(empty[key], null);
});

test("PL10 production-style missing frequency evidence stays unknown rather than rare", () => {
  const features = extractPracticeTextDifficultyFeatures({ text: "the qzx", language: "en" });
  assert.equal(features.lexicalRarityScore, null);
  assert.equal(features.bigramRarityScore, null);
  assert.equal(features.frequencyCoverage.knownWordCount, 0);
  assert.equal(features.frequencyCoverage.wordFrequencyCoverageRate, 0);
  assert.equal(features.frequencyCoverage.knownBigramCount, 0);
  assert.equal(features.frequencyFeatureCoverage, 0);
});

test("PL10 fixture frequency provider yields full known coverage when every eligible unit exists", () => {
  const provider = frequencyProvider({ words: { aa: 1 }, bigrams: { aa: 1 } });
  const features = extractPracticeTextDifficultyFeatures({ text: "aa", language: "en", frequencyProvider: provider });
  assert.equal(features.lexicalRarityScore, 1);
  assert.equal(features.bigramRarityScore, 1);
  assert.equal(features.frequencyCoverage.wordFrequencyCoverageRate, 1);
  assert.equal(features.frequencyCoverage.bigramFrequencyCoverageRate, 1);
  assert.equal(features.frequencyFeatureCoverage, 1);
});

test("PL10 unknown frequency entries do not dilute known rarity as if they were rare", () => {
  const provider = frequencyProvider({ words: { the: 1000 }, bigrams: { th: 1000 } });
  const features = extractPracticeTextDifficultyFeatures({ text: "the qzx", language: "en", frequencyProvider: provider });
  assert.equal(features.lexicalRarityScore, 0);
  assert.ok(features.frequencyCoverage.wordFrequencyCoverageRate > 0 && features.frequencyCoverage.wordFrequencyCoverageRate < 1);
});
