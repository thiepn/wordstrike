import {
  PRACTICE_WEAK_KEYS_AVAILABILITY,
  PRACTICE_WEAK_KEYS_ERRORS,
} from "./practiceWeakKeysConstants.js";
import { PRACTICE_WEAK_KEYS_POLICY_V1 } from "./practiceWeakKeysPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function baseLanguage(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0]
    : "und";
}

function languageFrom(context, explicitLanguage) {
  return baseLanguage(explicitLanguage ?? context?.dataLocale ?? "und");
}

export function normalizePracticeWeakKeyTarget({ entityType = "key", entityKey, language = "en" } = {}) {
  const base = baseLanguage(language);
  if (entityType !== "key" || base !== "en" || typeof entityKey !== "string") return null;
  let normalized;
  try { normalized = entityKey.trim().normalize("NFC").toLocaleLowerCase("en"); }
  catch { normalized = entityKey.trim().normalize("NFC").toLowerCase(); }
  return /^[a-z]$/.test(normalized)
    ? Object.freeze({ entityType: "key", entityKey: normalized })
    : null;
}

export function createPracticeWeakKeysError(code, message, details = null) {
  if (!Object.values(PRACTICE_WEAK_KEYS_ERRORS).includes(code)) throw new TypeError(`Unknown Weak Keys error: ${code}`);
  const error = new Error(message || code);
  error.code = code;
  error.details = details;
  return error;
}

function availability(status, target, reasons, extra = {}) {
  if (!PRACTICE_WEAK_KEYS_AVAILABILITY.includes(status)) throw new TypeError(`Invalid Weak Keys availability status: ${status}`);
  return freezeDeep({
    eligible: status === "ready",
    status,
    entityType: "key",
    entityKey: target?.entityKey ?? null,
    trainingEvidence: Object.freeze({
      targetWordCount: Number(extra.targetWordCount || 0),
      targetContentCount: Number(extra.targetContentCount || 0),
      familyCount: Number(extra.familyCount || 0),
    }),
    contextCoverage: extra.contextCoverage ?? null,
    reasons: Object.freeze([...(reasons || [])]),
  });
}

export async function validateWeakKeyTarget({
  context = null,
  entityKey,
  entityType = "key",
  indexProvider = null,
  language = null,
  policy = PRACTICE_WEAK_KEYS_POLICY_V1,
} = {}) {
  const resolvedLanguage = languageFrom(context, language);
  const target = normalizePracticeWeakKeyTarget({ entityType, entityKey, language: resolvedLanguage });
  if (!target) return availability("unsupported", null, [PRACTICE_WEAK_KEYS_ERRORS.UNSUPPORTED_KEY_TARGET]);
  if (!indexProvider || typeof indexProvider.getTargetContentRefs !== "function" || typeof indexProvider.getTargetWordRefs !== "function") {
    return availability("unavailable", target, [PRACTICE_WEAK_KEYS_ERRORS.KEY_INDEX_NOT_FOUND]);
  }

  let contentRefs;
  let wordRefs;
  try {
    [contentRefs, wordRefs] = await Promise.all([
      indexProvider.getTargetContentRefs({
        partition: "training",
        entityType: "key",
        entityKey: target.entityKey,
        purpose: "training",
      }),
      indexProvider.getTargetWordRefs({
        partition: "training",
        entityType: "key",
        entityKey: target.entityKey,
        purpose: "training",
      }),
    ]);
  } catch (error) {
    return availability("unavailable", target, [error?.code || PRACTICE_WEAK_KEYS_ERRORS.KEY_INDEX_NOT_FOUND]);
  }

  const words = Array.isArray(wordRefs) ? wordRefs : [];
  const refs = Array.isArray(contentRefs) ? contentRefs : [];
  if (!words.length && !refs.length) return availability("unavailable", target, [PRACTICE_WEAK_KEYS_ERRORS.KEY_INDEX_NOT_FOUND]);
  const familyCount = new Set(refs.map((ref) => ref?.familyId).filter(Boolean)).size;
  const limitedReasons = [];
  if (words.length < policy.content.hardMinimumTargetWords) limitedReasons.push(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_WORDS);
  if (!refs.length) limitedReasons.push(PRACTICE_WEAK_KEYS_ERRORS.INSUFFICIENT_KEY_CONTENT);
  return availability(limitedReasons.length ? "limited-content" : "ready", target, limitedReasons, {
    targetWordCount: words.length,
    targetContentCount: refs.length,
    familyCount,
  });
}

export function getPracticeWeakKeysLanguageSupport(contextOrLanguage) {
  const language = typeof contextOrLanguage === "string"
    ? baseLanguage(contextOrLanguage)
    : baseLanguage(contextOrLanguage?.dataLocale);
  return Object.freeze({ language, supported: language === "en", version: 1 });
}
