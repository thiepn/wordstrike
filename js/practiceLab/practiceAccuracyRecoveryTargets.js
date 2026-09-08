import { normalizePracticeWeakKeyTarget, validateWeakKeyTarget } from "./practiceWeakKeysTargets.js";
import { normalizePracticeCombinationRepairTarget } from "./practiceCombinationRepairValidation.js";
import { inspectPracticeCombinationRepairAvailability } from "./practiceCombinationRepairGenerator.js";
import { normalizePracticeProblemWordTarget, validateProblemWordTarget } from "./practiceProblemWordsTargets.js";
import { PRACTICE_ACCURACY_RECOVERY_ENTITY_TYPES, PRACTICE_ACCURACY_RECOVERY_ERRORS } from "./practiceAccuracyRecoveryConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const baseLanguage = (value) => typeof value === "string" && value.trim() ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0] : "und";

export function normalizePracticeAccuracyRecoveryTarget({ entityType, entityKey, manualType = null, language = "en" } = {}) {
  if (baseLanguage(language) !== "en") return null;
  let resolvedType = entityType;
  if (manualType === "key") resolvedType = "key";
  else if (manualType === "word") resolvedType = "word";
  else if (manualType === "combination") {
    const normalized = typeof entityKey === "string" ? entityKey.trim().normalize("NFC").toLowerCase() : "";
    resolvedType = Array.from(normalized).length === 2 ? "bigram" : Array.from(normalized).length === 3 ? "trigram" : null;
  }
  if (!PRACTICE_ACCURACY_RECOVERY_ENTITY_TYPES.includes(resolvedType)) return null;
  if (resolvedType === "key") return normalizePracticeWeakKeyTarget({ entityType: "key", entityKey, language });
  if (resolvedType === "bigram" || resolvedType === "trigram") {
    const normalized = typeof entityKey === "string" ? entityKey.trim().normalize("NFC").toLowerCase() : "";
    return normalizePracticeCombinationRepairTarget({ entityType: resolvedType, entityKey: normalized, language });
  }
  return normalizePracticeProblemWordTarget({ entityKey, language });
}

export function createPracticeAccuracyRecoveryError(code, message, details = null) {
  const error = new Error(message || code); error.code = code; error.details = details; return error;
}

export async function validatePracticeAccuracyRecoveryTarget({ context, entityType, entityKey, manualType = null, indexProvider, contentItems = [], language = context?.dataLocale ?? "en" } = {}) {
  const target = normalizePracticeAccuracyRecoveryTarget({ entityType, entityKey, manualType, language });
  if (!target) return freezeDeep({ eligible: false, status: "unsupported", target: null, reasons: [PRACTICE_ACCURACY_RECOVERY_ERRORS.UNSUPPORTED_ACCURACY_TARGET] });
  if (target.entityType === "key") {
    const result = await validateWeakKeyTarget({ context, entityKey: target.entityKey, indexProvider, language });
    return freezeDeep({ ...result, target });
  }
  if (target.entityType === "bigram" || target.entityType === "trigram") {
    const result = await inspectPracticeCombinationRepairAvailability({ targetIndex: indexProvider, contentItems, entityType: target.entityType, entityKey: target.entityKey, language });
    return freezeDeep({ eligible: result.status === "ready", ...result, target });
  }
  const result = await validateProblemWordTarget({ context, entityKey: target.entityKey, indexProvider, language });
  return freezeDeep({ ...result, target });
}
