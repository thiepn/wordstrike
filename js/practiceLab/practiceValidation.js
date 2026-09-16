export * from "./practiceValidationLegacy.js";

import {
  normalizePracticeManifest as normalizePracticeManifestLegacy,
  normalizePracticeSettings as normalizePracticeSettingsLegacy,
  validatePracticeManifest as validatePracticeManifestLegacy,
  validatePracticeSettings as validatePracticeSettingsLegacy,
  validateSessionSummary as validateLegacySessionSummary,
} from "./practiceValidationLegacy.js";
import {
  validatePracticeRetentionReviewSummary,
  validatePracticeReviewItemV3,
} from "./practiceReviewValidation.js";
import { validatePracticeEvaluationSummary } from "./practiceEvaluationValidation.js";
import { validatePracticeAssessmentRun } from "./practiceAssessmentRun.js";
import { PRACTICE_ASSESSMENT_PROTOCOL_VERSION } from "./practiceAssessmentConstants.js";
import { validatePracticeCoachBlockBinding } from "./practiceCoachBlockBinding.js";
import { validatePracticeCustomTextRecord } from "./practiceCustomTextValidation.js";
import { validatePracticeResearchBinding } from "./practiceResearchBinding.js";

export const validateReviewItem = validatePracticeReviewItemV3;
export const validateAssessmentRun = validatePracticeAssessmentRun;
export const validateCustomText = validatePracticeCustomTextRecord;

export function normalizePracticeSettings(value = {}) {
  return {
    ...normalizePracticeSettingsLegacy(value),
    physicalKeyboardTelemetryEnabled: value?.physicalKeyboardTelemetryEnabled === true,
  };
}

export function normalizePracticeManifest(value) {
  const normalized = normalizePracticeManifestLegacy(value);
  if (!normalized) return null;
  return {
    ...normalized,
    settings: normalizePracticeSettings(value?.settings),
  };
}

export function validatePracticeSettings(settings) {
  const legacy = validatePracticeSettingsLegacy(settings);
  const errors = [...legacy.errors];
  if (settings && Object.hasOwn(settings, "physicalKeyboardTelemetryEnabled") && typeof settings.physicalKeyboardTelemetryEnabled !== "boolean") {
    errors.push({ path: "physicalKeyboardTelemetryEnabled", code: "INVALID_TYPE", message: "physicalKeyboardTelemetryEnabled must be boolean" });
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeManifest(manifest) {
  const legacy = validatePracticeManifestLegacy(manifest);
  const errors = [...legacy.errors];
  if (manifest?.settings && Object.hasOwn(manifest.settings, "physicalKeyboardTelemetryEnabled") && typeof manifest.settings.physicalKeyboardTelemetryEnabled !== "boolean") {
    errors.push({ path: "settings.physicalKeyboardTelemetryEnabled", code: "INVALID_TYPE", message: "physicalKeyboardTelemetryEnabled must be boolean" });
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeAssessmentBinding(binding) {
  const errors = [];
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return { valid: false, errors: [{ path: "assessmentBinding", code: "TYPE", message: "assessmentBinding must be an object" }] };
  if (typeof binding.assessmentRunId !== "string" || !binding.assessmentRunId.startsWith("practice-assessment_")) errors.push({ path: "assessmentRunId", code: "IDENTITY", message: "assessmentRunId is invalid" });
  if (typeof binding.blockId !== "string" || !binding.blockId) errors.push({ path: "blockId", code: "REQUIRED", message: "blockId is required" });
  if (!Number.isInteger(binding.blockOrdinal) || binding.blockOrdinal < 1 || binding.blockOrdinal > 10) errors.push({ path: "blockOrdinal", code: "RANGE", message: "blockOrdinal must be 1..10" });
  if (binding.protocolVersion !== PRACTICE_ASSESSMENT_PROTOCOL_VERSION) errors.push({ path: "protocolVersion", code: "VERSION", message: "assessment protocol version is unsupported" });
  const allowed = new Set(["assessmentRunId", "blockId", "blockOrdinal", "protocolVersion"]);
  for (const key of Object.keys(binding)) if (!allowed.has(key)) errors.push({ path: key, code: "UNEXPECTED", message: "assessmentBinding contains an unexpected field" });
  return { valid: errors.length === 0, errors };
}

export function validateSessionSummary(summary) {
  const legacy = validateLegacySessionSummary(summary);
  const errors = [...legacy.errors];
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return { valid: false, errors };
  if (!Object.hasOwn(summary, "retentionReviewSummary")) errors.push({ path: "retentionReviewSummary", code: "REQUIRED", message: "retentionReviewSummary must be present" });
  else if (summary.retentionReviewSummary != null) {
    const retention = validatePracticeRetentionReviewSummary(summary.retentionReviewSummary);
    errors.push(...retention.errors.map((entry) => ({ ...entry, path: `retentionReviewSummary.${entry.path}` })));
  }
  if (!Object.hasOwn(summary, "evaluationSummary")) errors.push({ path: "evaluationSummary", code: "REQUIRED", message: "evaluationSummary must be present" });
  else if (summary.evaluationSummary != null) {
    const evaluation = validatePracticeEvaluationSummary(summary.evaluationSummary);
    errors.push(...evaluation.errors.map((entry) => ({ ...entry, path: `evaluationSummary.${entry.path}` })));
  }
  if (!Object.hasOwn(summary, "assessmentBinding")) errors.push({ path: "assessmentBinding", code: "REQUIRED", message: "assessmentBinding must be present" });
  else if (summary.assessmentBinding != null) {
    const assessment = validatePracticeAssessmentBinding(summary.assessmentBinding);
    errors.push(...assessment.errors.map((entry) => ({ ...entry, path: `assessmentBinding.${entry.path}` })));
  }
  if (!Object.hasOwn(summary, "coachBinding")) errors.push({ path: "coachBinding", code: "REQUIRED", message: "coachBinding must be present" });
  else if (summary.coachBinding != null) {
    const coach = validatePracticeCoachBlockBinding(summary.coachBinding);
    errors.push(...coach.errors.map((entry) => ({ ...entry, path: `coachBinding.${entry.path}` })));
  }
  if (!Object.hasOwn(summary, "researchBinding")) errors.push({ path: "researchBinding", code: "REQUIRED", message: "researchBinding must be present" });
  else if (summary.researchBinding != null) {
    const research = validatePracticeResearchBinding(summary.researchBinding);
    errors.push(...research.errors.map((entry) => ({ path: "researchBinding", code: "INVALID_RESEARCH_BINDING", message: String(entry) })));
  }
  return { valid: errors.length === 0, errors };
}
