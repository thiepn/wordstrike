import { PRACTICE_LIMITS, PRACTICE_RECORD_VERSIONS } from "./practiceConstants.js";
import {
  PRACTICE_TREATMENT_ASSIGNMENT_KINDS,
  PRACTICE_TREATMENT_BASELINE_STATUSES,
  PRACTICE_TREATMENT_CLASSES,
  PRACTICE_TREATMENT_DELAY_BUCKETS,
  PRACTICE_TREATMENT_EPISODE_STATUSES,
  PRACTICE_TREATMENT_EPISODE_VERSION,
  PRACTICE_TREATMENT_EVIDENCE_DEPTHS,
  PRACTICE_TREATMENT_EVIDENCE_GRADES,
  PRACTICE_TREATMENT_OUTCOME_DOMAINS,
  PRACTICE_TREATMENT_OUTCOME_STATUSES,
  PRACTICE_TREATMENT_POLICY,
  PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
  PRACTICE_TREATMENT_RESPONSE_PATTERNS,
  PRACTICE_TREATMENT_RESPONSE_STATE_VERSION,
  PRACTICE_TREATMENT_TRACKING_VERSION,
} from "./practiceTreatmentConstants.js";

const finite = Number.isFinite;
const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const text = (value, maximum = 300) => typeof value === "string" && value.length > 0 && value.length <= maximum;
const nullableText = (value, maximum = 300) => value == null || text(value, maximum);
const FORBIDDEN_KEYS = new Set(["sourceText", "passageText", "eventTrace", "rawEvents", "contentPlan", "typedBuffer", "accessToken", "submissionPayload"]);

function errorsForForbidden(value, path = "record", errors = [], depth = 0) {
  if (!value || typeof value !== "object" || depth > 8) return errors;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => errorsForForbidden(entry, `${path}[${index}]`, errors, depth + 1));
    return errors;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) errors.push({ path: `${path}.${key}`, code: "FORBIDDEN_DERIVED_FIELD", message: `${key} must not be persisted in Treatment Response records` });
    else errorsForForbidden(entry, `${path}.${key}`, errors, depth + 1);
  }
  return errors;
}

function outcomeErrors(outcome, path, errors) {
  if (!outcome || typeof outcome !== "object" || Array.isArray(outcome)) { errors.push({ path, code: "INVALID_OUTCOME", message: "outcome must be an object" }); return; }
  if (!text(outcome.outcomeKey, 100)) errors.push({ path: `${path}.outcomeKey`, code: "INVALID_ID", message: "outcomeKey is required" });
  if (!PRACTICE_TREATMENT_OUTCOME_STATUSES.includes(outcome.status)) errors.push({ path: `${path}.status`, code: "INVALID_ENUM", message: "unsupported outcome status" });
  if (outcome.evidenceGrade != null && !PRACTICE_TREATMENT_EVIDENCE_GRADES.includes(outcome.evidenceGrade)) errors.push({ path: `${path}.evidenceGrade`, code: "INVALID_ENUM", message: "unsupported evidence grade" });
  if (outcome.delayBucket != null && !PRACTICE_TREATMENT_DELAY_BUCKETS.includes(outcome.delayBucket)) errors.push({ path: `${path}.delayBucket`, code: "INVALID_ENUM", message: "unsupported delay bucket" });
  if (outcome.observedAt != null && !iso(outcome.observedAt)) errors.push({ path: `${path}.observedAt`, code: "INVALID_TIME", message: "observedAt must be ISO time" });
  if (outcome.delayMs != null && (!finite(outcome.delayMs) || outcome.delayMs < 0)) errors.push({ path: `${path}.delayMs`, code: "INVALID_NUMBER", message: "delayMs must be non-negative" });
  if (outcome.response?.responseValue != null && !finite(outcome.response.responseValue)) errors.push({ path: `${path}.response.responseValue`, code: "INVALID_NUMBER", message: "response value must be finite" });
}

export function validatePracticeTreatmentEpisode(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return { valid: false, errors: [{ path: "record", code: "INVALID_TYPE", message: "Treatment Episode must be an object" }] };
  if (!text(record.treatmentEpisodeId, 500)) errors.push({ path: "treatmentEpisodeId", code: "INVALID_ID", message: "Treatment Episode ID is required" });
  if (!text(record.profileId, 300) || !text(record.contextId, 300)) errors.push({ path: "profileId", code: "INVALID_ID", message: "profile/context identity is required" });
  if (record.recordVersion !== PRACTICE_RECORD_VERSIONS.treatmentEpisode) errors.push({ path: "recordVersion", code: "INVALID_VERSION", message: "unsupported Treatment Episode record version" });
  if (record.episodeVersion !== PRACTICE_TREATMENT_EPISODE_VERSION || record.trackingVersion !== PRACTICE_TREATMENT_TRACKING_VERSION || record.responseModelVersion !== PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION) errors.push({ path: "version", code: "INVALID_VERSION", message: "unsupported Treatment Response model version" });
  if (!PRACTICE_TREATMENT_EPISODE_STATUSES.includes(record.status)) errors.push({ path: "status", code: "INVALID_ENUM", message: "unsupported episode status" });
  if (!PRACTICE_TREATMENT_ASSIGNMENT_KINDS.includes(record.assignmentKind)) errors.push({ path: "assignmentKind", code: "INVALID_ENUM", message: "unsupported assignment kind" });

  const treatment = record.treatment;
  if (!treatment || typeof treatment !== "object") errors.push({ path: "treatment", code: "INVALID_TYPE", message: "treatment identity is required" });
  else {
    for (const key of ["treatmentSessionId", "experimentId", "treatmentFamilyKey", "protocolFingerprint", "protocolVariant", "outcomeDomain"]) if (!text(treatment[key], 500)) errors.push({ path: `treatment.${key}`, code: "INVALID_ID", message: `${key} is required` });
    if (!PRACTICE_TREATMENT_CLASSES.includes(treatment.treatmentClass)) errors.push({ path: "treatment.treatmentClass", code: "INVALID_ENUM", message: "unsupported treatment class" });
    if (!PRACTICE_TREATMENT_OUTCOME_DOMAINS.includes(treatment.outcomeDomain)) errors.push({ path: "treatment.outcomeDomain", code: "INVALID_ENUM", message: "unsupported outcome domain" });
    if (!nullableText(treatment.targetEntityType, 100) || !nullableText(treatment.targetEntityKey, 300) || !nullableText(treatment.targetStatId, 600)) errors.push({ path: "treatment.target", code: "INVALID_TARGET", message: "target identity is invalid" });
    for (const key of ["plannedAt", "exposureStartedAt", "completedAt"]) if (treatment[key] != null && !iso(treatment[key])) errors.push({ path: `treatment.${key}`, code: "INVALID_TIME", message: `${key} must be ISO time` });
  }

  if (!record.baseline || !PRACTICE_TREATMENT_BASELINE_STATUSES.includes(record.baseline.status)) errors.push({ path: "baseline.status", code: "INVALID_ENUM", message: "unsupported baseline status" });
  if (record.baseline?.observedAt != null && !iso(record.baseline.observedAt)) errors.push({ path: "baseline.observedAt", code: "INVALID_TIME", message: "baseline observedAt must be ISO time" });
  if (!Array.isArray(record.outcomeContracts) || record.outcomeContracts.length > PRACTICE_TREATMENT_POLICY.episodeOutcomeMaximum) errors.push({ path: "outcomeContracts", code: "ARRAY_LIMIT", message: "outcome contracts are invalid" });
  if (!Array.isArray(record.outcomes) || record.outcomes.length > PRACTICE_TREATMENT_POLICY.episodeOutcomeMaximum) errors.push({ path: "outcomes", code: "ARRAY_LIMIT", message: "outcomes are invalid" });
  else {
    const keys = new Set();
    record.outcomes.forEach((outcome, index) => { outcomeErrors(outcome, `outcomes[${index}]`, errors); if (keys.has(outcome?.outcomeKey)) errors.push({ path: `outcomes[${index}].outcomeKey`, code: "DUPLICATE", message: "outcome keys must be unique" }); keys.add(outcome?.outcomeKey); });
  }
  for (const key of ["createdAt", "updatedAt", "closedAt"]) if (record[key] != null && !iso(record[key])) errors.push({ path: key, code: "INVALID_TIME", message: `${key} must be ISO time` });
  if (byteLength(record) > PRACTICE_LIMITS.treatmentEpisodeBytes) errors.push({ path: "record", code: "BYTE_LIMIT", message: "Treatment Episode exceeds byte limit" });
  errorsForForbidden(record, "record", errors);
  return { valid: errors.length === 0, errors };
}

function sampleErrors(sample, index, errors) {
  const path = `samples[${index}]`;
  if (!sample || typeof sample !== "object") { errors.push({ path, code: "INVALID_SAMPLE", message: "sample must be object" }); return; }
  if (!text(sample.treatmentEpisodeId, 500) || !text(sample.candidateId, 500)) errors.push({ path, code: "INVALID_ID", message: "sample identity is required" });
  if (!iso(sample.observedAt)) errors.push({ path: `${path}.observedAt`, code: "INVALID_TIME", message: "sample time is invalid" });
  if (!finite(sample.responseValue)) errors.push({ path: `${path}.responseValue`, code: "INVALID_NUMBER", message: "sample response must be finite" });
  if (!text(sample.responseUnit, 100)) errors.push({ path: `${path}.responseUnit`, code: "INVALID_UNIT", message: "sample unit is required" });
}

export function validatePracticeTreatmentResponseState(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return { valid: false, errors: [{ path: "record", code: "INVALID_TYPE", message: "Treatment Response state must be an object" }] };
  for (const key of ["treatmentResponseStateId", "profileId", "contextId", "treatmentFamilyKey", "outcomeKey", "delayBucket", "responseUnit"]) if (!text(record[key], 600)) errors.push({ path: key, code: "INVALID_ID", message: `${key} is required` });
  if (record.recordVersion !== PRACTICE_RECORD_VERSIONS.treatmentResponseState || record.stateVersion !== PRACTICE_TREATMENT_RESPONSE_STATE_VERSION || record.responseModelVersion !== PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION) errors.push({ path: "version", code: "INVALID_VERSION", message: "unsupported Treatment Response state version" });
  if (!PRACTICE_TREATMENT_DELAY_BUCKETS.includes(record.delayBucket)) errors.push({ path: "delayBucket", code: "INVALID_ENUM", message: "unsupported delay bucket" });
  if (!Array.isArray(record.samples) || record.samples.length > PRACTICE_LIMITS.treatmentResponseSamplesPerState) errors.push({ path: "samples", code: "ARRAY_LIMIT", message: "response sample ring exceeds limit" });
  else record.samples.forEach((sample, index) => sampleErrors(sample, index, errors));
  const summary = record.summary;
  if (!summary || typeof summary !== "object") errors.push({ path: "summary", code: "INVALID_TYPE", message: "response summary is required" });
  else {
    if (!PRACTICE_TREATMENT_RESPONSE_PATTERNS.includes(summary.responsePattern)) errors.push({ path: "summary.responsePattern", code: "INVALID_ENUM", message: "unsupported response pattern" });
    if (!PRACTICE_TREATMENT_EVIDENCE_DEPTHS.includes(summary.evidenceDepth)) errors.push({ path: "summary.evidenceDepth", code: "INVALID_ENUM", message: "unsupported evidence depth" });
    for (const key of ["count", "positiveCount", "negativeCount", "deadbandCount", "distinctDays", "distinctTargets", "manualCount", "coachCount", "contaminatedEpisodeCount"]) if (!Number.isInteger(summary[key]) || summary[key] < 0) errors.push({ path: `summary.${key}`, code: "INVALID_COUNT", message: `${key} must be a non-negative integer` });
    for (const key of ["median", "mad", "practicalThreshold"]) if (summary[key] != null && !finite(summary[key])) errors.push({ path: `summary.${key}`, code: "INVALID_NUMBER", message: `${key} must be finite or null` });
  }
  if (!iso(record.updatedAt)) errors.push({ path: "updatedAt", code: "INVALID_TIME", message: "updatedAt must be ISO time" });
  errorsForForbidden(record, "record", errors);
  return { valid: errors.length === 0, errors };
}
