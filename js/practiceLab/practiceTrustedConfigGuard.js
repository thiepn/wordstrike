export const PRACTICE_TRUSTED_CONFIGURATION_FIELDS = Object.freeze([
  "abilityChannel",
  "performanceMeasurementKind",
  "performanceReferenceChannel",
  "evaluationMeasurementKind",
  "retentionMeasurementKind",
  "assessmentBinding",
  "coachBinding",
  "researchBinding",
  "evaluationBinding",
  "protectedEvaluationBinding",
  "treatmentBinding",
]);

export function validatePracticeTrustedConfigurationBoundary(configuration = {}) {
  const errors = [];
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) return Object.freeze({ valid: true, errors: Object.freeze([]) });
  for (const field of PRACTICE_TRUSTED_CONFIGURATION_FIELDS) {
    if (Object.hasOwn(configuration, field)) errors.push(Object.freeze({ field, code: "FORBIDDEN_TRUSTED_FIELD" }));
  }
  if (configuration.targetSource === "research-plan") errors.push(Object.freeze({ field: "targetSource", code: "FORBIDDEN_RESEARCH_TARGET_SOURCE" }));
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function assertPracticeTrustedConfigurationBoundary(configuration = {}) {
  const result = validatePracticeTrustedConfigurationBoundary(configuration);
  if (result.valid) return configuration;
  const error = new TypeError("Practice session configuration contains trusted authority fields");
  error.code = "PRACTICE_SESSION_TRUSTED_CONFIGURATION_REJECTED";
  error.details = result.errors;
  throw error;
}
