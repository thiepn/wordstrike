import {
  PRACTICE_PROBLEM_WORDS_ERRORS,
  PRACTICE_PROBLEM_WORDS_MAX_GRAPHEMES,
  PRACTICE_PROBLEM_WORDS_MIN_GRAPHEMES,
} from "./practiceProblemWordsConstants.js";
import { PRACTICE_PROBLEM_WORDS_POLICY_V1 } from "./practiceProblemWordsPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const baseLanguage = (value) => typeof value === "string" && value.trim()
  ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0]
  : "und";

export function createPracticeProblemWordsError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

export function normalizePracticeProblemWordInput(value, language = "en", policy = PRACTICE_PROBLEM_WORDS_POLICY_V1) {
  const normalizedValue = typeof value === "string" ? value.trim().normalize("NFC").toLowerCase() : "";
  if (baseLanguage(language) !== "en") return freezeDeep({
    valid: false,
    status: "unsupported",
    normalizedValue,
    target: null,
    reasonCode: PRACTICE_PROBLEM_WORDS_ERRORS.UNSUPPORTED_WORD_TARGET,
    message: "Problem Words currently supports English v1 only.",
  });
  const graphemeCount = Array.from(normalizedValue).length;
  const validLength = graphemeCount >= (policy?.target?.minimumGraphemes ?? PRACTICE_PROBLEM_WORDS_MIN_GRAPHEMES)
    && graphemeCount <= (policy?.target?.maximumGraphemes ?? PRACTICE_PROBLEM_WORDS_MAX_GRAPHEMES);
  if (!normalizedValue || !validLength || !/^[a-z]+$/u.test(normalizedValue)) return freezeDeep({
    valid: false,
    status: "unsupported",
    normalizedValue,
    target: null,
    reasonCode: PRACTICE_PROBLEM_WORDS_ERRORS.UNSUPPORTED_WORD_TARGET,
    message: "Enter one lowercase alphabetic English word from 2 to 24 letters. Spaces, apostrophes, hyphens, digits, and symbols are unsupported in v1.",
  });
  return freezeDeep({
    valid: true,
    status: "ready",
    normalizedValue,
    target: { entityType: "word", entityKey: normalizedValue },
    graphemeCount,
    reasonCode: null,
    message: null,
  });
}

export function normalizePracticeProblemWordTarget({ entityKey, language = "en", policy = PRACTICE_PROBLEM_WORDS_POLICY_V1 } = {}) {
  return normalizePracticeProblemWordInput(entityKey, language, policy).target;
}

export async function validateProblemWordTarget({
  context,
  entityKey,
  indexProvider,
  corpusRegistry = null,
  language = context?.dataLocale ?? "en",
  policy = PRACTICE_PROBLEM_WORDS_POLICY_V1,
} = {}) {
  const normalized = normalizePracticeProblemWordInput(entityKey, language, policy);
  if (!normalized.valid) return freezeDeep({
    eligible: false,
    status: "unsupported",
    entityType: "word",
    entityKey: normalized.normalizedValue || null,
    graphemeCount: Array.from(normalized.normalizedValue || "").length,
    trainingEvidence: { contentCount: 0, familyCount: 0, occurrenceCount: 0 },
    naturalContextEvidence: { contentCount: 0, familyCount: 0 },
    reasons: [normalized.reasonCode],
  });
  if (!indexProvider || typeof indexProvider.getWordSummary !== "function") return freezeDeep({
    eligible: false,
    status: "unavailable",
    entityType: "word",
    entityKey: normalized.target.entityKey,
    graphemeCount: normalized.graphemeCount,
    trainingEvidence: { contentCount: 0, familyCount: 0, occurrenceCount: 0 },
    naturalContextEvidence: { contentCount: 0, familyCount: 0 },
    reasons: [PRACTICE_PROBLEM_WORDS_ERRORS.WORD_INDEX_NOT_FOUND],
  });
  try {
    const summary = await indexProvider.getWordSummary({
      partition: "training",
      lexicalKey: normalized.target.entityKey,
      purpose: "training",
    });
    const refs = Array.isArray(summary?.contents) ? summary.contents : [];
    const families = new Set(refs.map((ref) => ref?.familyId).filter(Boolean));
    const occurrenceCount = refs.reduce((sum, ref) => sum + Number(ref?.count || ref?.positions?.length || 0), 0);
    if (!summary || summary.lexicalKey !== normalized.target.entityKey || refs.length === 0) return freezeDeep({
      eligible: false,
      status: "unavailable",
      entityType: "word",
      entityKey: normalized.target.entityKey,
      graphemeCount: normalized.graphemeCount,
      trainingEvidence: { contentCount: 0, familyCount: 0, occurrenceCount: 0 },
      naturalContextEvidence: { contentCount: 0, familyCount: 0 },
      reasons: [PRACTICE_PROBLEM_WORDS_ERRORS.WORD_NOT_IN_TRAINING_CORPUS],
    });
    return freezeDeep({
      eligible: true,
      status: "ready",
      entityType: "word",
      entityKey: normalized.target.entityKey,
      graphemeCount: normalized.graphemeCount,
      trainingEvidence: { contentCount: refs.length, familyCount: families.size, occurrenceCount },
      naturalContextEvidence: { contentCount: refs.length, familyCount: families.size },
      corpusReady: corpusRegistry == null ? null : true,
      reasons: [],
    });
  } catch (error) {
    return freezeDeep({
      eligible: false,
      status: "unavailable",
      entityType: "word",
      entityKey: normalized.target.entityKey,
      graphemeCount: normalized.graphemeCount,
      trainingEvidence: { contentCount: 0, familyCount: 0, occurrenceCount: 0 },
      naturalContextEvidence: { contentCount: 0, familyCount: 0 },
      reasons: [error?.code || PRACTICE_PROBLEM_WORDS_ERRORS.WORD_INDEX_NOT_FOUND],
    });
  }
}
