import {
  PRACTICE_COMMON_WORDS_POLICY_VERSION,
  PRACTICE_COMMON_WORD_BANDS,
  PRACTICE_COMMON_WORD_BAND_RANGES,
  PRACTICE_COMMON_WORD_PRACTICE_SIZES,
  PRACTICE_COMMON_WORD_PRACTICE_DEFAULT_SIZE,
  PRACTICE_COMMON_WORD_PRACTICE_READY_MINIMUMS,
  PRACTICE_COMMON_WORD_CHECK_READY_MINIMUMS,
  PRACTICE_COMMON_WORD_CHECK_WORD_COUNT,
  PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND,
  PRACTICE_COMMON_WORD_CHECK_FORM_COUNT,
  PRACTICE_COMMON_WORD_CHECK_MIN_READY_FORMS,
  PRACTICE_COMMON_WORD_CHECK_MATCHING,
} from "./practiceCommonWordsConstants.js";

export const PRACTICE_COMMON_WORDS_POLICY_V1 = Object.freeze({
  version: PRACTICE_COMMON_WORDS_POLICY_VERSION,
  language: "en",
  lexicalPolicy: Object.freeze({
    normalization: "NFC",
    lowercase: true,
    alphabeticOnly: true,
    minimumGraphemes: 1,
    maximumGraphemes: 15,
    allowOneLetter: Object.freeze(["a", "i"]),
    contractions: false,
    hyphens: false,
    digits: false,
    symbols: false,
    capitals: false,
  }),
  bands: PRACTICE_COMMON_WORD_BAND_RANGES,
  practice: Object.freeze({
    sizes: PRACTICE_COMMON_WORD_PRACTICE_SIZES,
    defaultSize: PRACTICE_COMMON_WORD_PRACTICE_DEFAULT_SIZE,
    perMicroblockPerBand: 5,
    maximumSameBandRun: 2,
    correctionBehavior: "allow",
    resumable: false,
    targetEntities: 0,
    abilityObservations: 0,
    directAcquisitionDose: 0,
    readyMinimums: PRACTICE_COMMON_WORD_PRACTICE_READY_MINIMUMS,
  }),
  check: Object.freeze({
    wordCount: PRACTICE_COMMON_WORD_CHECK_WORD_COUNT,
    wordsPerBand: PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND,
    formCount: PRACTICE_COMMON_WORD_CHECK_FORM_COUNT,
    minimumReadyForms: PRACTICE_COMMON_WORD_CHECK_MIN_READY_FORMS,
    correctionBehavior: "allow",
    resumable: false,
    targetEntities: 0,
    evidenceRole: "diagnostic",
    abilityChannel: "common-words",
    matching: PRACTICE_COMMON_WORD_CHECK_MATCHING,
    readyMinimums: PRACTICE_COMMON_WORD_CHECK_READY_MINIMUMS,
  }),
  breadth: Object.freeze({
    repeatedMinimumOpportunities: 3,
    repeatedMinimumSessions: 2,
    automaticMinimumScore: 75,
    automaticMinimumConfidence: "medium",
    strongMinimumScore: 90,
    strongMinimumConfidence: "high",
  }),
});

export function practiceCommonWordBandForRank(rank) {
  if (!Number.isInteger(rank) || rank < 1 || rank > 1200) return null;
  return PRACTICE_COMMON_WORD_BANDS.find((band) => {
    const range = PRACTICE_COMMON_WORD_BAND_RANGES[band];
    return rank >= range.minimumRank && rank <= range.maximumRank;
  }) ?? null;
}

export function isPracticeCommonWordEnglishV1LexicalKey(value) {
  if (typeof value !== "string" || value !== value.normalize("NFC") || value !== value.toLowerCase()) return false;
  const graphemeCount = Array.from(value).length;
  if (graphemeCount < 1 || graphemeCount > 15) return false;
  return /^[a-z]+$/.test(value);
}

export function validatePracticeCommonWordsPolicy(policy = PRACTICE_COMMON_WORDS_POLICY_V1) {
  if (!policy || policy.version !== 1 || policy.language !== "en") return false;
  if (policy.practice?.defaultSize !== 160 || policy.check?.wordCount !== 200 || policy.check?.wordsPerBand !== 50) return false;
  if (!Array.isArray(policy.practice?.sizes) || policy.practice.sizes.join(",") !== "80,160,240") return false;
  return PRACTICE_COMMON_WORD_BANDS.every((band) => policy.bands?.[band]?.size > 0);
}
