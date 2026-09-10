import { PRACTICE_COMMON_WORD_PRACTICE_SIZES } from "./practiceCommonWordsConstants.js";
import {
  validatePracticeCommonWordReference,
  validatePracticeCommonWordPracticeBank,
  validatePracticeCommonWordCheckFormSet,
} from "./practiceCommonWordReference.js";

const integrityStatus = (value) => value && typeof value.valid === "boolean"
  ? value
  : Object.freeze({ valid: true, reasons: [] });

export function getPracticeCommonWordsAvailability({ context, artifacts } = {}) {
  const reasons = [];
  const language = String(context?.language ?? context?.locale ?? "en").toLowerCase();
  const english = language === "en" || language.startsWith("en-");
  const reference = validatePracticeCommonWordReference(artifacts?.reference);
  const practice = validatePracticeCommonWordPracticeBank(artifacts?.practiceBank);
  const check = validatePracticeCommonWordCheckFormSet(artifacts?.checkFormSet);
  const referenceIntegrity = integrityStatus(artifacts?.integrity?.reference);
  const practiceIntegrity = integrityStatus(artifacts?.integrity?.practice);
  const checkIntegrity = integrityStatus(artifacts?.integrity?.check);
  if (!english) reasons.push("COMMON_WORDS_UNSUPPORTED_LANGUAGE");
  if (!reference.valid) reasons.push(...reference.reasons.map((reason) => `REFERENCE:${reason}`));
  if (!referenceIntegrity.valid) reasons.push(...referenceIntegrity.reasons.map((reason) => `REFERENCE:${reason}`));
  if (!practice.valid) reasons.push(...practice.reasons.map((reason) => `PRACTICE:${reason}`));
  if (!practiceIntegrity.valid) reasons.push(...practiceIntegrity.reasons.map((reason) => `PRACTICE:${reason}`));
  if (!check.valid) reasons.push(...check.reasons.map((reason) => `CHECK:${reason}`));
  if (!checkIntegrity.valid) reasons.push(...checkIntegrity.reasons.map((reason) => `CHECK:${reason}`));
  const referenceReady = reference.valid && referenceIntegrity.valid;
  const practiceReady = practice.valid && practiceIntegrity.valid;
  const checkReady = check.valid && checkIntegrity.valid;
  return Object.freeze({
    practiceAvailable: english && referenceReady && practiceReady,
    practiceSizes: english && referenceReady && practiceReady ? [...PRACTICE_COMMON_WORD_PRACTICE_SIZES] : [],
    checkAvailable: english && referenceReady && checkReady,
    reasons: Object.freeze([...new Set(reasons)]),
    diagnostics: Object.freeze({
      reference,
      practice,
      check,
      integrity: Object.freeze({ reference: referenceIntegrity, practice: practiceIntegrity, check: checkIntegrity }),
    }),
  });
}
