export const PRACTICE_FREQUENCY_PROVIDER_VERSION = 1;
export const PRACTICE_FREQUENCY_BANDS = Object.freeze([
  "high",
  "medium",
  "low",
  "rare",
  "unknown",
]);

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function normalizeLanguage(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/_/g, "-").toLowerCase()
    : "und";
}

function normalizeKey(value, language) {
  if (typeof value !== "string" || !value) return null;
  try {
    return value.normalize("NFC").toLocaleLowerCase(language === "und" ? undefined : language);
  } catch {
    return value.normalize("NFC").toLowerCase();
  }
}

function validateThresholds(thresholds) {
  const value = thresholds ?? { high: 1000, medium: 100, low: 10 };
  if (![value.high, value.medium, value.low].every((entry) => Number.isFinite(entry) && entry >= 0)) {
    throw new TypeError("Practice frequency thresholds must be finite non-negative values");
  }
  if (!(value.high >= value.medium && value.medium >= value.low)) {
    throw new TypeError("Practice frequency thresholds must be descending");
  }
  return Object.freeze({ high: value.high, medium: value.medium, low: value.low });
}

function normalizeEntries(entries, language) {
  if (entries == null) return new Map();
  if (entries instanceof Map) return new Map(entries);
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) throw new TypeError("Practice frequency entries must be an object or Map");
  const result = new Map();
  for (const [rawKey, rawValue] of Object.entries(entries)) {
    const key = normalizeKey(rawKey, language);
    if (!key) continue;
    if (typeof rawValue === "number" && Number.isFinite(rawValue) && rawValue >= 0) result.set(key, rawValue);
    else if (rawValue && typeof rawValue === "object" && PRACTICE_FREQUENCY_BANDS.includes(rawValue.band)) {
      result.set(key, Object.freeze({ band: rawValue.band, frequency: Number.isFinite(rawValue.frequency) ? Math.max(0, rawValue.frequency) : null }));
    }
  }
  return result;
}

function lookup(map, rawKey, language, thresholds) {
  const key = normalizeKey(rawKey, language);
  if (!key || !map.has(key)) return Object.freeze({ known: false, band: "unknown", frequency: null });
  const value = map.get(key);
  if (value && typeof value === "object") return Object.freeze({ known: value.band !== "unknown", band: value.band, frequency: value.frequency });
  const frequency = value;
  const band = frequency >= thresholds.high
    ? "high"
    : frequency >= thresholds.medium
      ? "medium"
      : frequency >= thresholds.low
        ? "low"
        : "rare";
  return Object.freeze({ known: true, band, frequency });
}

export function createPracticeReferenceFrequencyProvider({
  referenceVersion,
  referenceId,
  language = "und",
  checksum,
  sourceIds = [],
  usageApproval = null,
  wordFrequencies = {},
  bigramFrequencies = {},
  thresholds = null,
} = {}) {
  if (!Number.isInteger(referenceVersion) || referenceVersion < 1) throw new TypeError("Practice frequency referenceVersion must be a positive integer");
  if (typeof referenceId !== "string" || !referenceId) throw new TypeError("Practice frequency referenceId is required");
  if (typeof checksum !== "string" || !/^sha256-[a-f0-9]{64}$/.test(checksum)) throw new TypeError("Practice frequency reference checksum must be SHA-256");
  if (!Array.isArray(sourceIds) || sourceIds.some((value) => typeof value !== "string" || !value)) throw new TypeError("Practice frequency sourceIds must be strings");
  if (usageApproval !== "statistical-reference") throw new TypeError("Practice frequency reference requires explicit statistical-reference approval");
  const normalizedLanguage = normalizeLanguage(language);
  const normalizedThresholds = validateThresholds(thresholds);
  const words = normalizeEntries(wordFrequencies, normalizedLanguage);
  const bigrams = normalizeEntries(bigramFrequencies, normalizedLanguage);
  const metadata = freezeDeep({
    providerVersion: PRACTICE_FREQUENCY_PROVIDER_VERSION,
    referenceVersion,
    referenceId,
    language: normalizedLanguage,
    checksum,
    sourceIds: [...sourceIds],
    usageApproval,
    wordEntryCount: words.size,
    bigramEntryCount: bigrams.size,
    thresholds: normalizedThresholds,
  });
  return Object.freeze({
    metadata,
    lookupWord(value) { return lookup(words, value, normalizedLanguage, normalizedThresholds); },
    lookupBigram(value) { return lookup(bigrams, value, normalizedLanguage, normalizedThresholds); },
  });
}

export function createUnavailablePracticeReferenceFrequencyProvider({ language = "und" } = {}) {
  const normalizedLanguage = normalizeLanguage(language);
  const unknown = Object.freeze({ known: false, band: "unknown", frequency: null });
  return Object.freeze({
    metadata: freezeDeep({
      providerVersion: PRACTICE_FREQUENCY_PROVIDER_VERSION,
      referenceVersion: null,
      referenceId: null,
      language: normalizedLanguage,
      checksum: null,
      sourceIds: [],
      usageApproval: null,
      wordEntryCount: 0,
      bigramEntryCount: 0,
      thresholds: null,
    }),
    lookupWord() { return unknown; },
    lookupBigram() { return unknown; },
  });
}
