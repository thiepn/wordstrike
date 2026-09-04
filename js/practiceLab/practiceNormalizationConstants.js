export const PRACTICE_NORMALIZATION_ANALYSIS_VERSION = 1;
export const PRACTICE_CONTEXT_MODEL_VERSION = 1;
export const PRACTICE_CONTEXT_POLICY_VERSION = 1;
export const PRACTICE_TEXT_FEATURE_VERSION = 1;
export const PRACTICE_TYPABILITY_MODEL_VERSION = 1;
export const PRACTICE_TYPABILITY_REFERENCE_VERSION = 1;
export const PRACTICE_KEYBOARD_GEOMETRY_VERSION = 1;
export const PRACTICE_FREQUENCY_PROVIDER_VERSION = 1;

export const PRACTICE_TYPABILITY_MODEL_KIND = "heuristic-relative-v1";
export const PRACTICE_TYPABILITY_PERCENTILE_METHOD = "empirical-midrank-v1";

export const PRACTICE_NORMALIZATION_TRANSITION_STATUSES = Object.freeze([
  "normalized",
  "insufficient-data",
]);

export const PRACTICE_TYPABILITY_STATUSES = Object.freeze([
  "full",
  "partial",
  "insufficient",
  "unsupported-language",
]);

export const PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1 = Object.freeze({
  full: 0.90,
  partial: 0.50,
});
