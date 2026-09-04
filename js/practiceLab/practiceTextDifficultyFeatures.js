import { analyzePracticeText } from "./practiceTextAnalysis.js";
import { practiceQuantile } from "./practiceRobustStats.js";
import { createUnavailablePracticeReferenceFrequencyProvider } from "./practiceReferenceFrequency.js";

export const PRACTICE_TEXT_FEATURE_VERSION = 1;

const LETTER = /\p{L}/u;
const DIGIT = /\p{N}/u;
const PUNCTUATION = /\p{P}/u;
const SYMBOL = /\p{S}/u;
const WHITESPACE = /\s/u;

const RARITY_SCORE = Object.freeze({
  high: 0,
  medium: 1 / 3,
  low: 2 / 3,
  rare: 1,
});

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function safeRatio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function isUppercaseLetter(grapheme, language) {
  if (!LETTER.test(grapheme)) return false;
  let upper;
  let lower;
  try {
    upper = grapheme.toLocaleUpperCase(language || undefined);
    lower = grapheme.toLocaleLowerCase(language || undefined);
  } catch {
    upper = grapheme.toUpperCase();
    lower = grapheme.toLowerCase();
  }
  return upper !== lower && grapheme === upper;
}

function rarityAggregate(values) {
  const knownScores = values
    .filter((entry) => entry?.known && Object.hasOwn(RARITY_SCORE, entry.band))
    .map((entry) => RARITY_SCORE[entry.band]);
  return knownScores.length
    ? knownScores.reduce((sum, value) => sum + value, 0) / knownScores.length
    : null;
}

function lowercaseBigram(value, language) {
  try {
    return value.normalize("NFC").toLocaleLowerCase(language || undefined);
  } catch {
    return value.normalize("NFC").toLowerCase();
  }
}

export function extractPracticeTextDifficultyFeatures({
  text = "",
  language = "en",
  segmenter = null,
  analysis = null,
  frequencyProvider = null,
} = {}) {
  const textAnalysis = analysis ?? analyzePracticeText({ text, language, segmenter });
  const provider = frequencyProvider ?? createUnavailablePracticeReferenceFrequencyProvider({ language });
  const graphemes = textAnalysis.graphemes;
  const wordLengths = textAnalysis.words.map((word) => Math.max(0, word.endIndex - word.startIndex));
  const nonWhitespace = graphemes.filter((grapheme) => !WHITESPACE.test(grapheme));
  const nonWhitespaceCount = nonWhitespace.length;
  const uppercaseCount = nonWhitespace.filter((grapheme) => isUppercaseLetter(grapheme, language)).length;
  const punctuationCount = nonWhitespace.filter((grapheme) => PUNCTUATION.test(grapheme)).length;
  const digitCount = nonWhitespace.filter((grapheme) => DIGIT.test(grapheme)).length;
  const symbolCount = nonWhitespace.filter((grapheme) => SYMBOL.test(grapheme)).length;

  const wordLookups = textAnalysis.words.map((word) => provider.lookupWord(word.lexicalKey));
  const eligibleBigrams = textAnalysis.bigramOccurrences.filter((occurrence) => occurrence.contextClass === "within-word");
  const bigramLookups = eligibleBigrams.map((occurrence) => provider.lookupBigram(lowercaseBigram(occurrence.target, language)));
  const knownWordCount = wordLookups.filter((entry) => entry.known).length;
  const knownBigramCount = bigramLookups.filter((entry) => entry.known).length;
  const wordEligibleCount = wordLookups.length;
  const bigramEligibleCount = bigramLookups.length;
  const frequencyEligibleCount = wordEligibleCount + bigramEligibleCount;
  const frequencyKnownCount = knownWordCount + knownBigramCount;

  const value = {
    featureVersion: PRACTICE_TEXT_FEATURE_VERSION,
    language,
    graphemeCount: graphemes.length,
    wordCount: textAnalysis.words.length,
    nonWhitespaceGraphemeCount: nonWhitespaceCount,
    meanWordLength: wordLengths.length
      ? wordLengths.reduce((sum, length) => sum + length, 0) / wordLengths.length
      : null,
    p90WordLength: wordLengths.length ? practiceQuantile(wordLengths, 0.9) : null,
    uppercaseRatio: safeRatio(uppercaseCount, nonWhitespaceCount),
    punctuationRatio: safeRatio(punctuationCount, nonWhitespaceCount),
    digitRatio: safeRatio(digitCount, nonWhitespaceCount),
    symbolRatio: safeRatio(symbolCount, nonWhitespaceCount),
    lexicalRarityScore: rarityAggregate(wordLookups),
    bigramRarityScore: rarityAggregate(bigramLookups),
    frequencyFeatureCoverage: safeRatio(frequencyKnownCount, frequencyEligibleCount),
    frequencyCoverage: {
      wordEligibleCount,
      knownWordCount,
      wordFrequencyCoverageRate: safeRatio(knownWordCount, wordEligibleCount),
      bigramEligibleCount,
      knownBigramCount,
      bigramFrequencyCoverageRate: safeRatio(knownBigramCount, bigramEligibleCount),
      frequencyEligibleCount,
      frequencyKnownCount,
    },
  };
  return freezeDeep(value);
}
