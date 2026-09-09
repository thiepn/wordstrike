import { createPracticeReferenceFrequencyProvider } from "../../js/practiceLab/practiceReferenceFrequency.js";
import { extractPracticeTextDifficultyFeatures } from "../../js/practiceLab/practiceTextDifficultyFeatures.js";
import {
  PRACTICE_TYPABILITY_MODEL_FEATURES,
  PRACTICE_TYPABILITY_WEIGHTS_V1,
  scorePracticeTextTypability,
  validatePracticeTypabilityReference,
} from "../../js/practiceLab/practiceTypabilityModel.js";
import { PRACTICE_COMMON_WORD_CHECK_MATCHING } from "../../js/practiceLab/practiceCommonWordsConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const spread = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? Math.max(...finite) - Math.min(...finite) : Infinity;
};

function buildCentroid(rows) {
  return Object.fromEntries(PRACTICE_TYPABILITY_MODEL_FEATURES.map((feature) => {
    const values = rows
      .map((row) => row.textDifficulty.standardizedFeatures?.[feature])
      .filter(Number.isFinite);
    return [feature, values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null];
  }));
}

function weightedRmsDistance(standardizedFeatures, centroid) {
  let weightedSquaredDistance = 0;
  let availableWeight = 0;
  for (const feature of PRACTICE_TYPABILITY_MODEL_FEATURES) {
    const value = standardizedFeatures?.[feature];
    const center = centroid?.[feature];
    const weight = PRACTICE_TYPABILITY_WEIGHTS_V1[feature];
    if (!Number.isFinite(value) || !Number.isFinite(center) || !Number.isFinite(weight) || weight <= 0) continue;
    weightedSquaredDistance += weight * ((value - center) ** 2);
    availableWeight += weight;
  }
  return availableWeight > 0 ? Math.sqrt(weightedSquaredDistance / availableWeight) : Infinity;
}

export function evaluatePracticeCommonWordCheckTypability({
  forms,
  typabilityReference,
  frequencyReference,
  matching = PRACTICE_COMMON_WORD_CHECK_MATCHING,
} = {}) {
  if (!Array.isArray(forms) || !forms.length) throw new TypeError("Common-word Check matching requires forms");
  const referenceValidation = validatePracticeTypabilityReference(typabilityReference);
  if (!referenceValidation.valid) throw new TypeError("Common-word Check matching requires a valid PL10 typability reference");
  const frequencyProvider = createPracticeReferenceFrequencyProvider(frequencyReference);
  const rows = forms.map((form) => {
    const separator = typeof form?.separator === "string" ? form.separator : " ";
    const text = (form?.words ?? []).map((word) => word.lexicalKey).join(separator);
    const features = extractPracticeTextDifficultyFeatures({
      text,
      language: "en",
      frequencyProvider,
    });
    const textDifficulty = scorePracticeTextTypability({
      features,
      reference: typabilityReference,
      language: "en",
      includePercentile: true,
    });
    return {
      formId: form?.formId ?? null,
      features,
      textDifficulty,
    };
  });

  const centroid = buildCentroid(rows);
  const perForm = rows.map((row) => ({
    ...row,
    weightedRmsDistanceFromCentroid: weightedRmsDistance(row.textDifficulty.standardizedFeatures, centroid),
  }));
  const difficultySpread = spread(perForm.map((row) => row.textDifficulty.difficultyIndex));
  const relativePercentileSpread = spread(perForm.map((row) => row.textDifficulty.relativeDifficultyPercentile));
  const maximumWeightedRmsDistance = Math.max(...perForm.map((row) => row.weightedRmsDistanceFromCentroid));
  const minimumAvailableModelWeight = Math.min(...perForm.map((row) => row.textDifficulty.availableModelWeight));

  const reasons = [];
  if (perForm.some((row) => row.textDifficulty.status !== "full")) reasons.push("typability-status");
  if (minimumAvailableModelWeight < matching.minimumTypabilityCoverage) reasons.push("typability-coverage");
  if (difficultySpread > matching.maximumDifficultySpread) reasons.push("difficulty-spread");
  if (maximumWeightedRmsDistance > matching.maximumFeatureRmsDistance) reasons.push("feature-rms-distance");
  if (relativePercentileSpread > matching.maximumRelativePercentileSpread) reasons.push("relative-percentile-spread");

  return freezeDeep({
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    minimumAvailableModelWeight,
    difficultySpread,
    maximumWeightedRmsDistance,
    relativePercentileSpread,
    centroid,
    forms: perForm,
  });
}

export function assertPracticeCommonWordCheckTypability(input = {}) {
  const evaluation = evaluatePracticeCommonWordCheckTypability(input);
  if (!evaluation.valid) {
    const error = new Error(`Common-word Check PL10 matching failed: ${evaluation.reasons.join(", ")}`);
    error.code = "COMMON_WORD_CHECK_TYPOABILITY_MISMATCH";
    error.details = evaluation;
    throw error;
  }
  return evaluation;
}
