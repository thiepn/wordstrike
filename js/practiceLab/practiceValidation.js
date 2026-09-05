export * from "./practiceValidationLegacy.js";

import {
  validateSessionSummary as validateLegacySessionSummary,
} from "./practiceValidationLegacy.js";
import {
  validatePracticeRetentionReviewSummary,
  validatePracticeReviewItemV3,
} from "./practiceReviewValidation.js";

export const validateReviewItem = validatePracticeReviewItemV3;

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
  return { valid: errors.length === 0, errors };
}
