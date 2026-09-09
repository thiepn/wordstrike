import { PRACTICE_COMMON_WORD_PRACTICE_SIZES } from "./practiceCommonWordsConstants.js";
import {
  validatePracticeCommonWordReference,
  validatePracticeCommonWordPracticeBank,
  validatePracticeCommonWordCheckFormSet,
} from "./practiceCommonWordReference.js";

export function getPracticeCommonWordsAvailability({ context, artifacts } = {}) {
  const reasons = [];
  const language = String(context?.language ?? context?.locale ?? "en").toLowerCase();
  const english = language === "en" || language.startsWith("en-");
  const reference = validatePracticeCommonWordReference(artifacts?.reference);
  const practice = validatePracticeCommonWordPracticeBank(artifacts?.practiceBank);
  const check = validatePracticeCommonWordCheckFormSet(artifacts?.checkFormSet);
  if (!english) reasons.push("COMMON_WORDS_UNSUPPORTED_LANGUAGE");
  if (!reference.valid) reasons.push(...reference.reasons.map((reason) => `REFERENCE:${reason}`));
  if (!practice.valid) reasons.push(...practice.reasons.map((reason) => `PRACTICE:${reason}`));
  if (!check.valid) reasons.push(...check.reasons.map((reason) => `CHECK:${reason}`));
  return Object.freeze({
    practiceAvailable: english && reference.valid && practice.valid,
    practiceSizes: english && reference.valid && practice.valid ? [...PRACTICE_COMMON_WORD_PRACTICE_SIZES] : [],
    checkAvailable: english && reference.valid && check.valid,
    reasons: Object.freeze([...new Set(reasons)]),
    diagnostics: Object.freeze({ reference, practice, check }),
  });
}
