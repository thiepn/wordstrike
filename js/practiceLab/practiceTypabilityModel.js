import {
  practiceMad,
  practiceMedian,
  practiceRobustScale,
} from "./practiceRobustStats.js";
import { PRACTICE_TEXT_FEATURE_VERSION } from "./practiceTextDifficultyFeatures.js";

export const PRACTICE_TYPABILITY_MODEL_VERSION = 1;
export const PRACTICE_TYPABILITY_REFERENCE_VERSION = 1;
export const PRACTICE_TYPABILITY_MODEL_KIND = "heuristic-relative-v1";
export const PRACTICE_TYPABILITY_PERCENTILE_METHOD = "empirical-midrank-v1";

export const PRACTICE_TYPABILITY_STATUSES = Object.freeze([
  "full",
  "partial",
  "insufficient",
  "unsupported-language",
]);

export const PRACTICE_TYPABILITY_MODEL_FEATURES = Object.freeze([
  "meanWordLength",
  "p90WordLength",
  "uppercaseRatio",
  "punctuationRatio",
  "digitRatio",
  "symbolRatio",
  "lexicalRarityScore",
  "bigramRarityScore",
]);

export const PRACTICE_TYPABILITY_WEIGHTS_V1 = Object.freeze({
  meanWordLength: 0.16,
  p90WordLength: 0.08,
  uppercaseRatio: 0.10,
  punctuationRatio: 0.12,
  digitRatio: 0.08,
  symbolRatio: 0.08,
  lexicalRarityScore: 0.19,
  bigramRarityScore: 0.19,
});

export const PRACTICE_TYPABILITY_DIRECTIONS_V1 = Object.freeze(Object.fromEntries(
  PRACTICE_TYPABILITY_MODEL_FEATURES.map((feature) => [feature, 1]),
));

export const PRACTICE_TYPABILITY_SCALE_EPSILONS_V1 = Object.freeze({
  meanWordLength: 0.25,
  p90WordLength: 0.50,
  uppercaseRatio: 0.01,
  punctuationRatio: 0.01,
  digitRatio: 0.01,
  symbolRatio: 0.01,
  lexicalRarityScore: 0.05,
  bigramRarityScore: 0.05,
});

export const PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1 = Object.freeze({
  full: 0.90,
  partial: 0.50,
});

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const roundedWeight = (value) => Number(value.toFixed(12));

function languageBase(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0]
    : "und";
}

function statusForWeight(weight) {
  if (weight >= PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1.full) return "full";
  if (weight >= PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1.partial) return "partial";
  return "insufficient";
}

function validateWeights(weights) {
  const total = PRACTICE_TYPABILITY_MODEL_FEATURES.reduce((sum, key) => sum + Number(weights?.[key] ?? NaN), 0);
  if (!PRACTICE_TYPABILITY_MODEL_FEATURES.every((key) => Number.isFinite(weights?.[key]) && weights[key] >= 0)) {
    throw new TypeError("Practice typability weights must be finite non-negative values");
  }
  if (Math.abs(total - 1) > 1e-12) throw new TypeError("Practice typability weights must sum to 1");
}

export function calculatePracticeDifficultyPercentile(score, referenceScores) {
  if (!Number.isFinite(score) || !Array.isArray(referenceScores) || !referenceScores.length) return null;
  const values = referenceScores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return null;
  let less = 0;
  let equal = 0;
  for (const value of values) {
    if (value < score) less += 1;
    else if (value === score) equal += 1;
  }
  return clamp(100 * (less + 0.5 * equal) / values.length, 0, 100);
}

function robustStatsForFeature(trainingFeatures, feature) {
  const values = trainingFeatures.map((row) => row?.[feature]).filter(Number.isFinite);
  if (!values.length) return Object.freeze({ sampleCount: 0, median: null, mad: null, robustScale: null, epsilon: PRACTICE_TYPABILITY_SCALE_EPSILONS_V1[feature] });
  return Object.freeze({
    sampleCount: values.length,
    median: practiceMedian(values),
    mad: practiceMad(values),
    robustScale: practiceRobustScale(values),
    epsilon: PRACTICE_TYPABILITY_SCALE_EPSILONS_V1[feature],
  });
}

export function scorePracticeTextTypability({
  features,
  reference,
  language = features?.language,
  includePercentile = true,
} = {}) {
  if (!features || typeof features !== "object") throw new TypeError("Practice typability scoring requires features");
  if (!reference || typeof reference !== "object") return freezeDeep({
    status: languageBase(language) === "en" ? "insufficient" : "unsupported-language",
    modelKind: PRACTICE_TYPABILITY_MODEL_KIND,
    modelVersion: PRACTICE_TYPABILITY_MODEL_VERSION,
    referenceVersion: PRACTICE_TYPABILITY_REFERENCE_VERSION,
    difficultyIndex: null,
    relativeDifficultyPercentile: null,
    availableModelWeight: 0,
    effectiveWeights: {},
    standardizedFeatures: {},
    contributions: {},
    referenceItemCount: 0,
    percentileMethod: PRACTICE_TYPABILITY_PERCENTILE_METHOD,
  });
  if (languageBase(language) !== languageBase(reference.language)) return freezeDeep({
    status: "unsupported-language",
    modelKind: PRACTICE_TYPABILITY_MODEL_KIND,
    modelVersion: PRACTICE_TYPABILITY_MODEL_VERSION,
    referenceVersion: reference.referenceVersion,
    difficultyIndex: null,
    relativeDifficultyPercentile: null,
    availableModelWeight: 0,
    effectiveWeights: {},
    standardizedFeatures: {},
    contributions: {},
    referenceItemCount: reference.referenceItemCount ?? 0,
    percentileMethod: PRACTICE_TYPABILITY_PERCENTILE_METHOD,
  });

  const available = [];
  for (const feature of PRACTICE_TYPABILITY_MODEL_FEATURES) {
    const stat = reference.featureStats?.[feature];
    if (Number.isFinite(features[feature]) && Number.isFinite(stat?.median)) available.push(feature);
  }
  const availableModelWeight = roundedWeight(available.reduce((sum, feature) => sum + PRACTICE_TYPABILITY_WEIGHTS_V1[feature], 0));
  const status = statusForWeight(availableModelWeight);
  if (status === "insufficient" || availableModelWeight <= 0) return freezeDeep({
    status,
    modelKind: PRACTICE_TYPABILITY_MODEL_KIND,
    modelVersion: PRACTICE_TYPABILITY_MODEL_VERSION,
    referenceVersion: reference.referenceVersion,
    difficultyIndex: null,
    relativeDifficultyPercentile: null,
    availableModelWeight,
    effectiveWeights: {},
    standardizedFeatures: {},
    contributions: {},
    referenceItemCount: reference.referenceItemCount ?? 0,
    percentileMethod: PRACTICE_TYPABILITY_PERCENTILE_METHOD,
  });

  const effectiveWeights = {};
  const standardizedFeatures = {};
  const contributions = {};
  let difficulty = 0;
  for (const feature of available) {
    const stat = reference.featureStats[feature];
    const denominator = Math.max(Number(stat.robustScale) || 0, Number(stat.epsilon) || PRACTICE_TYPABILITY_SCALE_EPSILONS_V1[feature]);
    const z = clamp(((features[feature] - stat.median) / denominator) * PRACTICE_TYPABILITY_DIRECTIONS_V1[feature], -4, 4);
    const effectiveWeight = PRACTICE_TYPABILITY_WEIGHTS_V1[feature] / availableModelWeight;
    effectiveWeights[feature] = effectiveWeight;
    standardizedFeatures[feature] = z;
    contributions[feature] = effectiveWeight * z;
    difficulty += contributions[feature];
  }
  const difficultyIndex = clamp(difficulty, -4, 4);
  const relativeDifficultyPercentile = includePercentile
    ? calculatePracticeDifficultyPercentile(difficultyIndex, reference.trainingDifficultyScores)
    : null;
  return freezeDeep({
    status,
    modelKind: PRACTICE_TYPABILITY_MODEL_KIND,
    modelVersion: PRACTICE_TYPABILITY_MODEL_VERSION,
    referenceVersion: reference.referenceVersion,
    difficultyIndex,
    relativeDifficultyPercentile,
    availableModelWeight,
    effectiveWeights,
    standardizedFeatures,
    contributions,
    referenceItemCount: reference.referenceItemCount ?? 0,
    percentileMethod: PRACTICE_TYPABILITY_PERCENTILE_METHOD,
  });
}

export function buildPracticeTypabilityReference({
  trainingFeatures,
  language = "en",
  corpusId,
  corpusVersion,
  corpusChecksum,
  indexSchemaVersion,
  indexChecksum,
  segmentationVersion,
  tokenizationVersion,
  sourceIds = [],
  frequencyReferenceVersion = null,
  frequencyReferenceChecksum = null,
  frequencySourceIds = [],
} = {}) {
  if (!Array.isArray(trainingFeatures) || !trainingFeatures.length) throw new TypeError("Practice typability reference requires training features");
  validateWeights(PRACTICE_TYPABILITY_WEIGHTS_V1);
  const normalizedLanguage = languageBase(language);
  if (normalizedLanguage !== "en") throw new TypeError("PL10 v1 typability reference supports English only");
  if (trainingFeatures.some((row) => row?.featureVersion !== PRACTICE_TEXT_FEATURE_VERSION)) throw new TypeError("Practice typability training feature version mismatch");
  const featureStats = Object.fromEntries(PRACTICE_TYPABILITY_MODEL_FEATURES.map((feature) => [feature, robustStatsForFeature(trainingFeatures, feature)]));
  const base = {
    referenceVersion: PRACTICE_TYPABILITY_REFERENCE_VERSION,
    modelVersion: PRACTICE_TYPABILITY_MODEL_VERSION,
    featureVersion: PRACTICE_TEXT_FEATURE_VERSION,
    modelKind: PRACTICE_TYPABILITY_MODEL_KIND,
    language: normalizedLanguage,
    referencePartition: "training",
    percentileMethod: PRACTICE_TYPABILITY_PERCENTILE_METHOD,
    corpusId,
    corpusVersion,
    corpusChecksum,
    indexSchemaVersion,
    indexChecksum,
    segmentationVersion,
    tokenizationVersion,
    sourceIds: [...sourceIds],
    frequencyReferenceVersion,
    frequencyReferenceChecksum,
    frequencySourceIds: [...frequencySourceIds],
    weights: { ...PRACTICE_TYPABILITY_WEIGHTS_V1 },
    directions: { ...PRACTICE_TYPABILITY_DIRECTIONS_V1 },
    coverageThresholds: { ...PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1 },
    featureStats,
    referenceItemCount: trainingFeatures.length,
    trainingDifficultyScores: [],
  };
  const preliminary = freezeDeep(base);
  const trainingDifficultyScores = trainingFeatures
    .map((features) => scorePracticeTextTypability({ features, reference: preliminary, language, includePercentile: false }).difficultyIndex)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return freezeDeep({ ...base, trainingDifficultyScores });
}

export function validatePracticeTypabilityReference(reference) {
  const errors = [];
  if (!reference || typeof reference !== "object" || Array.isArray(reference)) return { valid: false, errors: [{ path: "reference", code: "INVALID_TYPE" }] };
  if (reference.referenceVersion !== PRACTICE_TYPABILITY_REFERENCE_VERSION) errors.push({ path: "referenceVersion", code: "INVALID_VERSION" });
  if (reference.modelVersion !== PRACTICE_TYPABILITY_MODEL_VERSION) errors.push({ path: "modelVersion", code: "INVALID_VERSION" });
  if (reference.featureVersion !== PRACTICE_TEXT_FEATURE_VERSION) errors.push({ path: "featureVersion", code: "INVALID_VERSION" });
  if (reference.modelKind !== PRACTICE_TYPABILITY_MODEL_KIND) errors.push({ path: "modelKind", code: "INVALID_VALUE" });
  if (reference.language !== "en") errors.push({ path: "language", code: "UNSUPPORTED_LANGUAGE" });
  if (reference.referencePartition !== "training") errors.push({ path: "referencePartition", code: "LEAKAGE_RISK" });
  if (!Number.isInteger(reference.referenceItemCount) || reference.referenceItemCount < 1) errors.push({ path: "referenceItemCount", code: "INVALID_COUNT" });
  if (!Array.isArray(reference.trainingDifficultyScores) || reference.trainingDifficultyScores.length !== reference.referenceItemCount || reference.trainingDifficultyScores.some((value) => !Number.isFinite(value))) errors.push({ path: "trainingDifficultyScores", code: "INVALID_REFERENCE_DISTRIBUTION" });
  for (const feature of PRACTICE_TYPABILITY_MODEL_FEATURES) {
    const stat = reference.featureStats?.[feature];
    if (!stat || !Number.isInteger(stat.sampleCount) || stat.sampleCount < 0 || !Number.isFinite(stat.epsilon) || stat.epsilon <= 0) errors.push({ path: `featureStats.${feature}`, code: "INVALID_STATS" });
    if (stat?.sampleCount > 0 && !Number.isFinite(stat.median)) errors.push({ path: `featureStats.${feature}.median`, code: "INVALID_STATS" });
  }
  try { validateWeights(reference.weights); } catch { errors.push({ path: "weights", code: "INVALID_WEIGHTS" }); }
  return { valid: errors.length === 0, errors };
}
