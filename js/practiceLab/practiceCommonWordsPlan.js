import { createPracticeContentPlan } from "./practiceSessionContract.js";
import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_COMMON_WORDS_VERSION,
  PRACTICE_COMMON_WORD_REFERENCE_VERSION,
  PRACTICE_COMMON_WORD_BANK_VERSION,
  PRACTICE_COMMON_WORD_PRACTICE_GENERATOR_VERSION,
  PRACTICE_COMMON_WORD_BANDS,
} from "./practiceCommonWordsConstants.js";
import { selectPracticeCommonWords } from "./practiceCommonWordsSelection.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const canonicalWordId = (word) => word?.wordId ?? `word:${word?.lexicalKey ?? ""}`;

function buildWordUnits(words) {
  let cursor = 0;
  return words.map((word, index) => {
    const startIndex = cursor;
    const length = Array.from(word.lexicalKey).length;
    const endIndex = startIndex + length;
    cursor = endIndex + (index < words.length - 1 ? 1 : 0);
    return {
      unitId: `common-word_${index + 1}`,
      type: "word",
      startIndex,
      endIndex,
      text: word.lexicalKey,
      metadata: { commonWords: { wordId: canonicalWordId(word), lexicalKey: word.lexicalKey, rank: word.rank, band: word.band, ordinal: index + 1 } },
    };
  });
}

export function createPracticeCommonWordsPlan({ sessionId, profileId, contextId, bank, skillStats = [], wordCount = 160 } = {}) {
  if (!sessionId || !profileId || !contextId) throw new TypeError("Common Words plan requires session identity");
  const selection = selectPracticeCommonWords({ bank, skillStats, wordCount, sessionId });
  const words = selection.words;
  const text = words.map((word) => word.lexicalKey).join(" ");
  const units = buildWordUnits(words);
  const bandCounts = Object.fromEntries(PRACTICE_COMMON_WORD_BANDS.map((band) => [band, words.filter((word) => word.band === band).length]));
  const wordIds = words.map(canonicalWordId);
  const lexicalKeys = words.map((word) => word.lexicalKey);
  const exactOrder = words.map((word) => ({ wordId: canonicalWordId(word), lexicalKey: word.lexicalKey, rank: word.rank, band: word.band }));
  const planBinding = {
    commonWordsVersion: PRACTICE_COMMON_WORDS_VERSION,
    referenceVersion: PRACTICE_COMMON_WORD_REFERENCE_VERSION,
    bankVersion: PRACTICE_COMMON_WORD_BANK_VERSION,
    generatorVersion: PRACTICE_COMMON_WORD_PRACTICE_GENERATOR_VERSION,
    sessionId,
    wordCount,
    wordIds,
    lexicalKeys,
    exactOrder,
    separator: " ",
  };
  const planHash = hashPracticeContent(JSON.stringify(planBinding));
  const plan = freezeDeep({
    version: 1,
    flow: "practice",
    sessionId,
    profileId,
    contextId,
    referenceId: bank.referenceId,
    referenceVersion: PRACTICE_COMMON_WORD_REFERENCE_VERSION,
    bankId: bank.bankId,
    bankVersion: PRACTICE_COMMON_WORD_BANK_VERSION,
    generatorVersion: PRACTICE_COMMON_WORD_PRACTICE_GENERATOR_VERSION,
    wordCount,
    bandCounts,
    wordIds,
    lexicalKeys,
    planHash,
    preSessionExposure: selection.preSession,
  });
  const contentPlan = createPracticeContentPlan({
    contentId: `practice-content_common-words-${sessionId.replace(/[^a-z0-9._-]/gi, "-")}`,
    contentGeneratorVersion: PRACTICE_COMMON_WORD_PRACTICE_GENERATOR_VERSION,
    text,
    units,
    targetEntities: [],
    completion: { mode: "word-count", value: wordCount },
    metadata: {
      partition: "training",
      evidenceRole: "training",
      sourceType: "common-words-practice",
      commonWords: {
        flow: "practice", planHash, wordCount, bandCounts,
        referenceId: bank.referenceId, referenceVersion: PRACTICE_COMMON_WORD_REFERENCE_VERSION,
        bankId: bank.bankId, bankVersion: PRACTICE_COMMON_WORD_BANK_VERSION,
        generatorVersion: PRACTICE_COMMON_WORD_PRACTICE_GENERATOR_VERSION,
        resumable: false,
      },
    },
  });
  return freezeDeep({ plan, contentPlan, words });
}
