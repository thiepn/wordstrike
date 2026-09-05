import {
  PRACTICE_PREVALENCE_MODEL_VERSION,
  PRACTICE_LIMITER_POLICY_V1,
} from "./practiceLimiterPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function normalizePracticePrevalenceLanguage(locale) {
  const value = String(locale ?? "").trim().toLowerCase();
  if (!value) return null;
  return value.split(/[-_]/u)[0] || null;
}

function unavailable(language, entityType, entityKey) {
  return freezeDeep({
    status: "unavailable",
    language,
    entityType,
    entityKey,
    opportunitiesPer1000Graphemes: null,
    quality: 0,
    sourceId: null,
    sourceApproval: null,
    sourceChecksum: null,
    referenceVersion: PRACTICE_PREVALENCE_MODEL_VERSION,
    segmentationVersion: null,
    tokenizationVersion: null,
  });
}

function normalizeResult(result, { language, entityType, entityKey, status, quality }) {
  if (!result || !Number.isFinite(result.opportunitiesPer1000Graphemes) || result.opportunitiesPer1000Graphemes < 0) return null;
  return freezeDeep({
    status,
    language,
    entityType,
    entityKey,
    opportunitiesPer1000Graphemes: result.opportunitiesPer1000Graphemes,
    quality,
    sourceId: result.sourceId ?? null,
    sourceApproval: result.sourceApproval ?? null,
    sourceChecksum: result.sourceChecksum ?? null,
    referenceVersion: result.referenceVersion ?? PRACTICE_PREVALENCE_MODEL_VERSION,
    segmentationVersion: result.segmentationVersion ?? null,
    tokenizationVersion: result.tokenizationVersion ?? null,
  });
}

export function createPracticeEntityPrevalenceProvider({
  referenceLookup = null,
  proxyLookup = null,
  fingerprint = `prevalence-v${PRACTICE_PREVALENCE_MODEL_VERSION}`,
  policy = PRACTICE_LIMITER_POLICY_V1,
} = {}) {
  if (referenceLookup != null && typeof referenceLookup !== "function") throw new TypeError("Practice prevalence reference lookup must be a function");
  if (proxyLookup != null && typeof proxyLookup !== "function") throw new TypeError("Practice prevalence proxy lookup must be a function");
  const cache = new Map();

  const getEntityPrevalence = async ({ language, entityType, entityKey } = {}) => {
    const normalizedLanguage = normalizePracticePrevalenceLanguage(language);
    if (!normalizedLanguage || !["key", "bigram", "trigram", "word"].includes(entityType) || typeof entityKey !== "string" || !entityKey) return unavailable(normalizedLanguage, entityType, entityKey);
    const key = `${normalizedLanguage}|${entityType}|${entityKey}`;
    if (cache.has(key)) return cache.get(key);
    let value = null;
    if (referenceLookup) {
      const result = await referenceLookup({ language: normalizedLanguage, entityType, entityKey });
      const approved = result?.sourceType === "statistical-reference"
        && ["statistical-only", "practice-display-approved"].includes(result?.usageApproval);
      if (approved) value = normalizeResult({ ...result, sourceApproval: result.usageApproval }, {
        language: normalizedLanguage,
        entityType,
        entityKey,
        status: "reference",
        quality: policy.prevalenceQualityWeights.reference,
      });
    }
    if (!value && proxyLookup) {
      const result = await proxyLookup({ language: normalizedLanguage, entityType, entityKey });
      value = normalizeResult(result, {
        language: normalizedLanguage,
        entityType,
        entityKey,
        status: "practice-proxy",
        quality: policy.prevalenceQualityWeights["practice-proxy"],
      });
    }
    value ??= unavailable(normalizedLanguage, entityType, entityKey);
    cache.set(key, value);
    return value;
  };

  return Object.freeze({
    getEntityPrevalence,
    getFingerprint() { return String(fingerprint); },
    clear() { cache.clear(); },
    getCacheSize() { return cache.size; },
  });
}

export function createPracticeTargetIndexPrevalenceProvider({
  targetIndex,
  language,
  trainingGraphemeCount,
  corpusId,
  corpusVersion,
  indexChecksum,
  segmentationVersion = null,
  tokenizationVersion = null,
  policy = PRACTICE_LIMITER_POLICY_V1,
} = {}) {
  if (!targetIndex || typeof targetIndex.getTargetSummary !== "function") throw new TypeError("Practice proxy prevalence requires a PL7 target index");
  const normalizedLanguage = normalizePracticePrevalenceLanguage(language);
  if (!normalizedLanguage || !Number.isFinite(trainingGraphemeCount) || trainingGraphemeCount <= 0) throw new TypeError("Practice proxy prevalence requires language and positive training grapheme count");
  const proxySourceId = `${corpusId || "practice-corpus"}-v${corpusVersion || 1}:training`;
  return createPracticeEntityPrevalenceProvider({
    policy,
    fingerprint: ["practice-proxy", PRACTICE_PREVALENCE_MODEL_VERSION, normalizedLanguage, corpusId ?? "", corpusVersion ?? "", indexChecksum ?? "", trainingGraphemeCount].join("|"),
    proxyLookup: async ({ language: requestedLanguage, entityType, entityKey }) => {
      if (requestedLanguage !== normalizedLanguage) return null;
      const summary = await targetIndex.getTargetSummary({ partition: "training", entityType, entityKey, purpose: "training" });
      const count = Number(summary?.corpusOccurrenceCount);
      if (!Number.isFinite(count) || count <= 0) return null;
      return {
        opportunitiesPer1000Graphemes: 1000 * count / trainingGraphemeCount,
        sourceId: proxySourceId,
        sourceApproval: "training-partition-practice-proxy",
        sourceChecksum: indexChecksum ?? null,
        referenceVersion: PRACTICE_PREVALENCE_MODEL_VERSION,
        segmentationVersion,
        tokenizationVersion,
      };
    },
  });
}
