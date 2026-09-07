export * from "./practiceValidationLegacy.js";

import {
  validateSessionSummary as validateLegacySessionSummary,
} from "./practiceValidationLegacy.js";
import {
  validatePracticeRetentionReviewSummary,
  validatePracticeReviewItemV3,
} from "./practiceReviewValidation.js";
import { validatePracticeEvaluationSummary } from "./practiceEvaluationValidation.js";
import { validatePracticeAssessmentRun } from "./practiceAssessmentRun.js";
import { PRACTICE_ASSESSMENT_PROTOCOL_VERSION } from "./practiceAssessmentConstants.js";

export const validateReviewItem = validatePracticeReviewItemV3;
export const validateAssessmentRun = validatePracticeAssessmentRun;

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
  if (!Object.hasOwn(summary, "retentionReviewSummary")) {
    errors.push({ path: "retentionReviewSummary", code: "REQUIRED", message: "retentionReviewSummary must be present" });
  } else if (summary.retentionReviewSummary != null) {
    const retention = validatePracticeRetentionReviewSummary(summary.retentionReviewSummary);
    errors.push(...retention.errors.map((entry) => ({ ...entry, path: `retentionReviewSummary.${entry.path}` })));
  }
  if (!Object.hasOwn(summary, "evaluationSummary")) {
    errors.push({ path: "evaluationSummary", code: "REQUIRED", message: "evaluationSummary must be present" });
  } else if (summary.evaluationSummary != null) {
    const evaluation = validatePracticeEvaluationSummary(summary.evaluationSummary);
    errors.push(...evaluation.errors.map((entry) => ({ ...entry, path: `evaluationSummary.${entry.path}` })));
  }
  if (!Object.hasOwn(summary, "assessmentBinding")) {
    errors.push({ path: "assessmentBinding", code: "REQUIRED", message: "assessmentBinding must be present" });
  } else if (summary.assessmentBinding != null) {
    const assessment = validatePracticeAssessmentBinding(summary.assessmentBinding);
    errors.push(...assessment.errors.map((entry) => ({ ...entry, path: `assessmentBinding.${entry.path}` })));
  }
  return { valid: errors.length === 0, errors };
}
