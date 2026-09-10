import { createPracticeContentPlan } from "./practiceSessionContract.js";
import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_COMMON_WORDS_VERSION,
  PRACTICE_COMMON_WORD_REFERENCE_VERSION,
  PRACTICE_COMMON_WORD_CHECK_SCHEMA_VERSION,
  PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION,
  PRACTICE_COMMON_WORD_CHECK_WORD_COUNT,
  PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND,
  PRACTICE_COMMON_WORD_BANDS,
} from "./practiceCommonWordsConstants.js";
import { validatePracticeCommonWordCheckFormSet } from "./practiceCommonWordReference.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const hash = (value) => { let state = 2166136261; for (const char of String(value)) { state ^= char.codePointAt(0); state = Math.imul(state, 16777619) >>> 0; } return state >>> 0; };
const canonicalWordId = (word) => word?.wordId ?? `word:${word?.lexicalKey ?? ""}`;

function buildUnits(words) {
  let cursor = 0;
  return words.map((word, index) => {
    const startIndex = cursor; const endIndex = startIndex + Array.from(word.lexicalKey).length;
    cursor = endIndex + (index < words.length - 1 ? 1 : 0);
    return { unitId: `breadth-word_${index + 1}`, type: "word", startIndex, endIndex, text: word.lexicalKey, metadata: { commonWords: { wordId: canonicalWordId(word), lexicalKey: word.lexicalKey, rank: word.rank, band: word.band, ordinal: index + 1 } } };
  });
}

export function selectPracticeCommonWordCheckForm({ sessionId, formSet } = {}) {
  if (!sessionId) throw new TypeError("Breadth Check form selection requires sessionId");
  const validation = validatePracticeCommonWordCheckFormSet(formSet);
  if (!validation.valid) throw Object.assign(new Error("Common-word Check form set is invalid"), { code: "COMMON_WORD_CHECK_FORM_SET_INVALID", reasons: validation.reasons });
  const forms = formSet.forms.filter((form) => form.status === "ready").slice().sort((a, b) => a.formId.localeCompare(b.formId));
  const index = hash(`${sessionId}|${formSet.formSetId}|${PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION}`) % forms.length;
  return forms[index];
}

export function createPracticeCommonWordCheckPlan({ sessionId, profileId, contextId, formSet } = {}) {
  if (!profileId || !contextId) throw new TypeError("Breadth Check plan requires profile/context");
  const form = selectPracticeCommonWordCheckForm({ sessionId, formSet });
  if (form.words.length !== PRACTICE_COMMON_WORD_CHECK_WORD_COUNT) throw new Error("Breadth Check form must contain 200 words");
  const bandCounts = Object.fromEntries(PRACTICE_COMMON_WORD_BANDS.map((band) => [band, form.words.filter((word) => word.band === band).length]));
  if (PRACTICE_COMMON_WORD_BANDS.some((band) => bandCounts[band] !== PRACTICE_COMMON_WORD_CHECK_WORDS_PER_BAND)) throw new Error("Breadth Check form is not 50/50/50/50 balanced");
  const wordIds = form.words.map(canonicalWordId);
  const lexicalKeys = form.words.map((word) => word.lexicalKey);
  const exactOrder = form.words.map((word) => ({ wordId: canonicalWordId(word), lexicalKey: word.lexicalKey, rank: word.rank, band: word.band }));
  const planBinding = {
    formId: form.formId,
    formHash: form.formHash,
    schemaVersion: PRACTICE_COMMON_WORD_CHECK_SCHEMA_VERSION,
    generatorVersion: PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION,
    referenceVersion: PRACTICE_COMMON_WORD_REFERENCE_VERSION,
    wordIds,
    lexicalKeys,
    exactOrder,
    separator: " ",
  };
  const planHash = hashPracticeContent(JSON.stringify(planBinding));
  const text = lexicalKeys.join(" ");
  const plan = freezeDeep({
    version: 1, flow: "check", sessionId, profileId, contextId,
    commonWordsVersion: PRACTICE_COMMON_WORDS_VERSION,
    referenceId: formSet.referenceId, referenceVersion: formSet.referenceVersion,
    formSetId: formSet.formSetId, formSetVersion: PRACTICE_COMMON_WORD_CHECK_SCHEMA_VERSION,
    generatorVersion: PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION,
    formId: form.formId, formHash: form.formHash, planHash,
    wordCount: PRACTICE_COMMON_WORD_CHECK_WORD_COUNT, bandCounts, wordIds, lexicalKeys,
  });
  const contentPlan = createPracticeContentPlan({
    contentId: `practice-content_common-words-check-${sessionId.replace(/[^a-z0-9._-]/gi, "-")}`,
    contentGeneratorVersion: PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION,
    text,
    units: buildUnits(form.words),
    targetEntities: [],
    completion: { mode: "word-count", value: PRACTICE_COMMON_WORD_CHECK_WORD_COUNT },
    metadata: {
      partition: "diagnostic", evidenceRole: "diagnostic", sourceType: "common-words-check",
      commonWords: { flow: "check", planHash, formSetId: formSet.formSetId, formId: form.formId, formHash: form.formHash, referenceId: formSet.referenceId, referenceVersion: formSet.referenceVersion, schemaVersion: PRACTICE_COMMON_WORD_CHECK_SCHEMA_VERSION, generatorVersion: PRACTICE_COMMON_WORD_CHECK_GENERATOR_VERSION, resumable: false },
    },
  });
  return freezeDeep({ plan, contentPlan, form });
}
