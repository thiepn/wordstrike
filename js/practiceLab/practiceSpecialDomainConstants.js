export const PRACTICE_SPECIAL_DOMAIN_ANNOTATION_VERSION = 1;
export const PRACTICE_SPECIAL_DOMAIN_ACCUMULATOR_VERSION = 1;
export const PRACTICE_SPECIAL_DOMAIN_CHECK_VERSION = 1;

export const PRACTICE_SPECIAL_DOMAIN_TIMING_MINIMUM = 5;
export const PRACTICE_SPECIAL_DOMAIN_TIMING_SAMPLE_CAP = 64;
export const PRACTICE_SPECIAL_DOMAIN_RUN_TIMING_SAMPLE_CAP = 128;
export const PRACTICE_SPECIAL_DOMAIN_DOMAIN_ACCURACY_FLOOR = 0.60;
export const PRACTICE_SPECIAL_DOMAIN_OVERALL_ACCURACY_FLOOR = 0.70;
export const PRACTICE_SPECIAL_DOMAIN_PROTOCOL_SIGMA_PENALTY_LOG = 0.04;
export const PRACTICE_SPECIAL_DOMAIN_SIGMA_FLOOR_LOG = 0.05;
export const PRACTICE_SPECIAL_DOMAIN_SIGMA_CEILING_LOG = 0.25;
export const PRACTICE_SPECIAL_DOMAIN_REQUIRED_MODEL_WEIGHT = 0.90;

export const PRACTICE_PUNCTUATION_PRIMARY_CATEGORIES = Object.freeze([
  "capital-letter",
  "comma",
  "terminal-mark",
  "colon-semicolon",
  "quote-apostrophe",
  "bracket-dash",
]);

export const PRACTICE_NUMBERS_PRIMARY_CATEGORIES = Object.freeze([
  "digit",
  "operator-symbol",
  "identifier-symbol",
  "commerce-percent-symbol",
]);

export const PRACTICE_PUNCTUATION_CHARACTER_SET = Object.freeze([
  ".", ",", "?", "!", ":", ";", "'", "\"", "(", ")", "-",
]);

export const PRACTICE_NUMBERS_DIGITS = Object.freeze(["0","1","2","3","4","5","6","7","8","9"]);
export const PRACTICE_NUMBERS_OPERATOR_SYMBOLS = Object.freeze(["+", "-", "*", "/", "="]);
export const PRACTICE_NUMBERS_IDENTIFIER_SYMBOLS = Object.freeze(["@", "#", "_"]);
export const PRACTICE_NUMBERS_COMMERCE_PERCENT_SYMBOLS = Object.freeze(["$", "%", "&"]);
export const PRACTICE_NUMBERS_SYMBOL_SET = Object.freeze([
  ...PRACTICE_NUMBERS_OPERATOR_SYMBOLS,
  ...PRACTICE_NUMBERS_IDENTIFIER_SYMBOLS,
  ...PRACTICE_NUMBERS_COMMERCE_PERCENT_SYMBOLS,
]);
