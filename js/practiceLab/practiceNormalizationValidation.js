import {
  PRACTICE_CONTEXT_MODEL_VERSION,
  PRACTICE_CONTEXT_POLICY_VERSION,
  PRACTICE_KEYBOARD_GEOMETRY_VERSION,
  PRACTICE_NORMALIZATION_ANALYSIS_VERSION,
  PRACTICE_NORMALIZATION_TRANSITION_STATUSES,
  PRACTICE_TEXT_FEATURE_VERSION,
  PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1,
  PRACTICE_TYPABILITY_MODEL_KIND,
  PRACTICE_TYPABILITY_MODEL_VERSION,
  PRACTICE_TYPABILITY_REFERENCE_VERSION,
  PRACTICE_TYPABILITY_STATUSES,
} from "./practiceNormalizationConstants.js";

const INPUT_METHODS = Object.freeze(["unknown", "physical", "software"]);
const TRACE_SCOPES = Object.freeze(["complete-session", "retained-window"]);

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function add(errors, path, code, message) { errors.push({ path, code, message }); }
function finite(errors, value, path, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) add(errors, path, "OUT_OF_RANGE", `${path} is outside its allowed range`);
}
function nullableFinite(errors, value, path, bounds = {}) { if (value != null) finite(errors, value, path, bounds); }
function oneOf(errors, value, path, values) { if (!values.includes(value)) add(errors, path, "INVALID_ENUM", `${path} has an unsupported value`); }
function requiredString(errors, value, path, max = 500) {
  if (typeof value !== "string" || !value) add(errors, path, "REQUIRED", `${path} must be a non-empty string`);
  else if (value.length > max) add(errors, path, "TOO_LONG", `${path} exceeds its limit`);
}
function nullableString(errors, value, path, max = 500) { if (value != null) requiredString(errors, value, path, max); }

export function validatePracticeNormalizationSummary(summary) {
  const errors = [];
  if (!isPlainObject(summary)) return { valid: false, errors: [{ path: "normalizationSummary", code: "INVALID_TYPE", message: "normalizationSummary must be an object" }] };
  for (const [key, expected] of [
    ["analysisVersion", PRACTICE_NORMALIZATION_ANALYSIS_VERSION],
    ["contextModelVersion", PRACTICE_CONTEXT_MODEL_VERSION],
    ["contextPolicyVersion", PRACTICE_CONTEXT_POLICY_VERSION],
    ["textFeatureVersion", PRACTICE_TEXT_FEATURE_VERSION],
    ["typabilityModelVersion", PRACTICE_TYPABILITY_MODEL_VERSION],
    ["typabilityReferenceVersion", PRACTICE_TYPABILITY_REFERENCE_VERSION],
    ["keyboardGeometryVersion", PRACTICE_KEYBOARD_GEOMETRY_VERSION],
  ]) if (summary[key] !== expected) add(errors, key, "INVALID_VERSION", `${key} must equal ${expected}`);
  if (summary.frequencyReferenceVersion != null) finite(errors, summary.frequencyReferenceVersion, "frequencyReferenceVersion", { min: 1, integer: true });

  if (!isPlainObject(summary.context)) add(errors, "context", "INVALID_TYPE", "context must be an object");
  else {
    requiredString(errors, summary.context.contextFingerprint, "context.contextFingerprint", 400);
    requiredString(errors, summary.context.dataLocale, "context.dataLocale", 40);
    requiredString(errors, summary.context.keyboardLayout, "context.keyboardLayout", 40);
    oneOf(errors, summary.context.inputMethod, "context.inputMethod", INPUT_METHODS);
    for (const forbidden of ["hardwareProfileId", "hardwareNickname", "browserFingerprint", "deviceFingerprint"]) {
      if (Object.hasOwn(summary.context, forbidden)) add(errors, `context.${forbidden}`, "FORBIDDEN_FIELD", `${forbidden} is not durable normalization context`);
    }
  }

  const transition = summary.transitionNormalization;
  if (!isPlainObject(transition)) add(errors, "transitionNormalization", "INVALID_TYPE", "transitionNormalization must be an object");
  else {
    oneOf(errors, transition.status, "transitionNormalization.status", PRACTICE_NORMALIZATION_TRANSITION_STATUSES);
    nullableFinite(errors, transition.globalFluentMedianMs, "transitionNormalization.globalFluentMedianMs", { min: 0 });
    finite(errors, transition.normalizableTransitionCount, "transitionNormalization.normalizableTransitionCount", { min: 0, integer: true });
    nullableFinite(errors, transition.normalizedResidualMedianMs, "transitionNormalization.normalizedResidualMedianMs");
    nullableFinite(errors, transition.normalizedResidualP90Ms, "transitionNormalization.normalizedResidualP90Ms");
    nullableFinite(errors, transition.normalizedResidualMedianRatio, "transitionNormalization.normalizedResidualMedianRatio", { min: -0.95, max: 10 });
    nullableFinite(errors, transition.geometryCoverageRate, "transitionNormalization.geometryCoverageRate", { min: 0, max: 1 });
    nullableFinite(errors, transition.frequencyCoverageRate, "transitionNormalization.frequencyCoverageRate", { min: 0, max: 1 });
    if (!isPlainObject(transition.coverage)) add(errors, "transitionNormalization.coverage", "INVALID_TYPE", "coverage must be an object");
    else {
      oneOf(errors, transition.coverage.traceScope, "transitionNormalization.coverage.traceScope", TRACE_SCOPES);
      for (const key of ["normalizableTransitionCount", "totalClassifiableTransitionCount", "geometryKnownCount", "geometryUnknownCount", "frequencyKnownCount", "frequencyUnknownCount", "specificBucketCount", "coarseBucketCount"]) finite(errors, transition.coverage[key], `transitionNormalization.coverage.${key}`, { min: 0, integer: true });
      nullableFinite(errors, transition.coverage.normalizationCoverageRate, "transitionNormalization.coverage.normalizationCoverageRate", { min: 0, max: 1 });
      nullableFinite(errors, transition.coverage.geometryCoverageRate, "transitionNormalization.coverage.geometryCoverageRate", { min: 0, max: 1 });
      nullableFinite(errors, transition.coverage.frequencyCoverageRate, "transitionNormalization.coverage.frequencyCoverageRate", { min: 0, max: 1 });
      if (transition.coverage.normalizableTransitionCount !== transition.normalizableTransitionCount) add(errors, "transitionNormalization.normalizableTransitionCount", "IMPOSSIBLE_RELATIONSHIP", "normalizable counts disagree");
      if (transition.coverage.geometryKnownCount + transition.coverage.geometryUnknownCount !== transition.coverage.totalClassifiableTransitionCount) add(errors, "transitionNormalization.coverage.geometryKnownCount", "IMPOSSIBLE_RELATIONSHIP", "geometry coverage counts disagree");
      if (transition.coverage.frequencyKnownCount + transition.coverage.frequencyUnknownCount !== transition.coverage.totalClassifiableTransitionCount) add(errors, "transitionNormalization.coverage.frequencyKnownCount", "IMPOSSIBLE_RELATIONSHIP", "frequency coverage counts disagree");
      if (transition.coverage.totalClassifiableTransitionCount === 0 && transition.coverage.normalizationCoverageRate != null) add(errors, "transitionNormalization.coverage.normalizationCoverageRate", "IMPOSSIBLE_RELATIONSHIP", "zero denominator requires null coverage rate");
      if (transition.coverage.totalClassifiableTransitionCount > 0 && Number.isFinite(transition.coverage.normalizationCoverageRate)) {
        const expected = transition.coverage.normalizableTransitionCount / transition.coverage.totalClassifiableTransitionCount;
        if (Math.abs(expected - transition.coverage.normalizationCoverageRate) > 1e-12) add(errors, "transitionNormalization.coverage.normalizationCoverageRate", "IMPOSSIBLE_RELATIONSHIP", "normalization coverage denominator is inconsistent");
      }
    }
    if (!isPlainObject(transition.contextLevelCounts)) add(errors, "transitionNormalization.contextLevelCounts", "INVALID_TYPE", "contextLevelCounts must be an object");
    else {
      for (const key of ["global", "level1", "level2", "level3"]) finite(errors, transition.contextLevelCounts[key], `transitionNormalization.contextLevelCounts.${key}`, { min: 0, integer: true });
      const total = ["global", "level1", "level2", "level3"].reduce((sum, key) => sum + (Number.isInteger(transition.contextLevelCounts[key]) ? transition.contextLevelCounts[key] : 0), 0);
      if (total !== transition.normalizableTransitionCount) add(errors, "transitionNormalization.contextLevelCounts", "IMPOSSIBLE_RELATIONSHIP", "context level counts must equal normalizableTransitionCount");
    }
    if (transition.status === "normalized" && !Number.isFinite(transition.globalFluentMedianMs)) add(errors, "transitionNormalization.globalFluentMedianMs", "REQUIRED", "normalized status requires a PL8 fluent median");
    if (transition.status === "insufficient-data" && transition.globalFluentMedianMs != null) add(errors, "transitionNormalization.globalFluentMedianMs", "IMPOSSIBLE_RELATIONSHIP", "insufficient-data status requires null global baseline");
  }

  const difficulty = summary.textDifficulty;
  if (!isPlainObject(difficulty)) add(errors, "textDifficulty", "INVALID_TYPE", "textDifficulty must be an object");
  else {
    oneOf(errors, difficulty.status, "textDifficulty.status", PRACTICE_TYPABILITY_STATUSES);
    if (difficulty.modelKind !== PRACTICE_TYPABILITY_MODEL_KIND) add(errors, "textDifficulty.modelKind", "INVALID_VALUE", "textDifficulty modelKind is not canonical");
    nullableFinite(errors, difficulty.difficultyIndex, "textDifficulty.difficultyIndex", { min: -4, max: 4 });
    nullableFinite(errors, difficulty.relativeDifficultyPercentile, "textDifficulty.relativeDifficultyPercentile", { min: 0, max: 100 });
    finite(errors, difficulty.availableModelWeight, "textDifficulty.availableModelWeight", { min: 0, max: 1 });
    nullableFinite(errors, difficulty.wordFrequencyCoverageRate, "textDifficulty.wordFrequencyCoverageRate", { min: 0, max: 1 });
    nullableFinite(errors, difficulty.bigramFrequencyCoverageRate, "textDifficulty.bigramFrequencyCoverageRate", { min: 0, max: 1 });
    nullableString(errors, difficulty.corpusId, "textDifficulty.corpusId", 120);
    if (difficulty.corpusVersion != null) finite(errors, difficulty.corpusVersion, "textDifficulty.corpusVersion", { min: 1, integer: true });
    nullableString(errors, difficulty.contentId, "textDifficulty.contentId", 160);
    requiredString(errors, difficulty.contentHash, "textDifficulty.contentHash", 160);
    finite(errors, difficulty.referenceItemCount, "textDifficulty.referenceItemCount", { min: 0, integer: true });
    if (typeof difficulty.staticMetadataUsed !== "boolean") add(errors, "textDifficulty.staticMetadataUsed", "INVALID_TYPE", "staticMetadataUsed must be boolean");
    if (difficulty.staticMetadataUsed && (difficulty.corpusId == null || difficulty.corpusVersion == null)) add(errors, "textDifficulty.corpusId", "REQUIRED", "static metadata requires corpus binding");
    if (!difficulty.staticMetadataUsed && (difficulty.corpusId != null || difficulty.corpusVersion != null)) add(errors, "textDifficulty.corpusId", "IMPOSSIBLE_RELATIONSHIP", "dynamic/custom analysis must not claim a corpus binding");
    if (difficulty.status === "full" && difficulty.availableModelWeight < PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1.full) add(errors, "textDifficulty.availableModelWeight", "IMPOSSIBLE_RELATIONSHIP", "full status lacks feature coverage");
    if (difficulty.status === "partial" && (difficulty.availableModelWeight < PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1.partial || difficulty.availableModelWeight >= PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1.full)) add(errors, "textDifficulty.availableModelWeight", "IMPOSSIBLE_RELATIONSHIP", "partial status has inconsistent feature coverage");
    if (difficulty.status === "insufficient" && difficulty.availableModelWeight >= PRACTICE_TYPABILITY_COVERAGE_THRESHOLDS_V1.partial) add(errors, "textDifficulty.availableModelWeight", "IMPOSSIBLE_RELATIONSHIP", "insufficient status has too much feature coverage");
    if (["insufficient", "unsupported-language"].includes(difficulty.status) && (difficulty.difficultyIndex != null || difficulty.relativeDifficultyPercentile != null)) add(errors, "textDifficulty.difficultyIndex", "IMPOSSIBLE_RELATIONSHIP", "unsupported/insufficient models must not emit scalar difficulty");
    if (["full", "partial"].includes(difficulty.status) && !Number.isFinite(difficulty.difficultyIndex)) add(errors, "textDifficulty.difficultyIndex", "REQUIRED", "scored models require a finite difficulty index");
  }

  for (const forbidden of ["normalizedTransitions", "transitionModel", "featureVector", "features", "rawText", "fullText", "wordFrequencies", "bigramFrequencies", "entityResiduals", "targetResiduals"]) {
    if (Object.hasOwn(summary, forbidden)) add(errors, forbidden, "FORBIDDEN_FIELD", `${forbidden} is not durable normalization summary data`);
  }
  return { valid: errors.length === 0, errors };
}
