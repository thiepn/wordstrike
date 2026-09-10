export const PRACTICE_COMMON_WORDS_VERSION = 1;
export const PRACTICE_COMMON_WORDS_POLICY_VERSION = 1;
export const PRACTICE_COMMON_WORD_REFERENCE_VERSION = 1;
export const PRACTICE_COMMON_WORD_BANK_VERSION = 1;
export const PRACTICE_COMMON_WORD_PRACTICE_GENERATOR_VERSION = 1;
export const PRACTICE_COMMON_WORD_CHECK_SCHEMA_VERSION = 1;
export const PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION = 1;
export const PRACTICE_COMMON_WORD_BREADTH_MODEL_VERSION = 1;
export const PRACTICE_COMMON_WORD_RESULT_VERSION = 1;

export const PRACTICE_COMMON_WORD_REFERENCE_ID = "WS-COMMON-EN-1";
export const PRACTICE_COMMON_WORD_PRACTICE_BANK_ID = "WS-COMMON-PRACTICE-EN-1";
export const PRACTICE_COMMON_WORD_CHECK_FORM_SET_ID = "WS-COMMON-CHECK-EN-1";
export const PRACTICE_COMMON_WORDS_EXPERIMENT_ID = "common-words";
export const PRACTICE_COMMON_WORD_CHECK_EXPERIMENT_ID = "common-words-check";

export const PRACTICE_COMMON_WORD_BANDS = Object.freeze(["core", "frequent", "common", "broad"]);
export const PRACTICE_COMMON_WORD_BAND_LABELS = Object.freeze({ core: "Core", frequent: "Frequent", common: "Common", broad: "Broad" });
export const PRACTICE_COMMON_WORD_BAND_RANGES = Object.freeze({
  core: Object.freeze({ minimumRank: 1, maximumRank: 100, size: 100 }),
  frequent: Object.freeze({ minimumRank: 101, maximumRank: 300, size: 200 }),
  common: Object.freeze({ minimumRank: 301, maximumRank: 700, size: 400 }),
  broad: Object.freeze({ minimumRank: 701, maximumRank: 1200, size: 500 }),
});
export const PRACTICE_COMMON_WORD_REFERENCE_SIZE = 1200;
export const PRACTICE_COMMON_WORD_PRACTICE_SIZES = Object.freeze([80, 160, 240]);
export const PRACTICE_COMMON_WORD_PRACTICE_DEFAULT_SIZE = 160;
export const PRACTICE_COMMON_WORD_MICROBLOCK_SIZE = 20;
export const PRACTICE_COMMON_WORDS_PER_BAND_PER_MICROBLOCK = 5;
export const PRACTICE_COMMON_WORD_CHECK_WORD_COUNT = 200;
export const PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND = 50;
export const PRACTICE_COMMON_WORD_CHECK_FORM_COUNT = 8;
export const PRACTICE_COMMON_WORD_CHECK_MIN_READY_FORMS = 4;

export const PRACTICE_COMMON_WORD_PRACTICE_READY_MINIMUMS = Object.freeze({ core: 80, frequent: 160, common: 320, broad: 400 });
export const PRACTICE_COMMON_WORD_CHECK_READY_MINIMUMS = Object.freeze({ core: 90, frequent: 160, common: 300, broad: 350 });

export const PRACTICE_COMMON_WORD_CHECK_MATCHING = Object.freeze({
  totalGraphemeToleranceRatio: 0.05,
  meanWordLengthSpread: 0.25,
  p90WordLengthSpread: 1,
  bandMeanWordLengthSpread: 0.35,
  minimumTypabilityCoverage: 0.90,
  maximumDifficultySpread: 0.40,
  maximumFeatureRmsDistance: 0.60,
  maximumRelativePercentileSpread: 12,
  maximumPairwiseLexicalOverlapRatio: 0.30,
});

export const PRACTICE_COMMON_WORD_BREADTH_STATES = Object.freeze(["unobserved", "observed", "repeated-evidence", "automatic", "strong"]);
export const PRACTICE_COMMON_WORD_CONFIDENCE_RANK = Object.freeze({ none: 0, low: 1, medium: 2, high: 3 });
