import {
  PRACTICE_RETENTION_ANALYSIS_VERSION,
  PRACTICE_RETENTION_ANALYSIS_STATUSES,
  PRACTICE_RETENTION_MEASUREMENT_STATUSES,
  PRACTICE_RETENTION_NOVELTY_STATUSES,
  PRACTICE_RETENTION_OUTCOMES,
  PRACTICE_RETENTION_REVIEW_DELTA_VERSION,
} from "./practiceReviewConstants.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";
import { buildPracticeRetentionProbeResults } from "./practiceRetentionProbe.js";

const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function createEmptyPracticeRetentionAnalysis() {
  return freezeDeep({
    version: PRACTICE_RETENTION_ANALYSIS_VERSION,
    measurementKind: null,
    status: "not-requested",
    summary: null,
    probeResults: [],
    reviewDeltas: [],
  });
}

function buildSummary(probeResults) {
  const results = Array.isArray(probeResults) ? probeResults : [];
  const count = (predicate) => results.filter(predicate).length;
  return freezeDeep({
    analysisVersion: PRACTICE_RETENTION_ANALYSIS_VERSION,
    probeVersion: results[0]?.probeVersion ?? 1,
    targetCount: results.length,
    measuredCount: count((result) => result.probeQuality != null),
    verificationEligibleCount: count((result) => result.verificationEligible),
    strongCount: count((result) => result.outcome === "strong"),
    passCount: count((result) => result.outcome === "pass"),
    fragileCount: count((result) => result.outcome === "fragile"),
    failCount: count((result) => result.outcome === "fail"),
    prematureCount: count((result) => result.measurementStatus === "premature"),
    insufficientCount: count((result) => result.measurementStatus === "insufficient"),
    nonVerifyingCount: count((result) => result.measurementStatus === "non-verifying"),
  });
}

export function buildPracticeRetentionAnalysis({
  foundationAnalysis,
  experiment,
  contentPlan,
  reviewPlan = null,
  session,
  traceMetadata = {},
  restoredFromCheckpoint = false,
  planCurrent = true,
  segmenter = null,
  policy = PRACTICE_REVIEW_POLICY_V1,
} = {}) {
  const measurementKind = experiment?.retentionMeasurementKind ?? null;
  if (measurementKind == null) return createEmptyPracticeRetentionAnalysis();
  if (measurementKind !== "entity-review" || !reviewPlan || !Array.isArray(reviewPlan.bindings) || reviewPlan.bindings.length === 0) {
    return freezeDeep({
      version: PRACTICE_RETENTION_ANALYSIS_VERSION,
      measurementKind,
      status: "not-eligible",
      summary: null,
      probeResults: [],
      reviewDeltas: [],
    });
  }
  try {
    const measured = buildPracticeRetentionProbeResults({
      foundationAnalysis,
      contentPlan,
      reviewPlan,
      session,
      traceMetadata,
      restoredFromCheckpoint,
      planCurrent,
      segmenter,
      reviewPolicy: policy,
    });
    const summary = buildSummary(measured.probeResults);
    const partial = measured.probeResults.some((result) => result.measurementStatus !== "measured");
    return freezeDeep({
      version: PRACTICE_RETENTION_ANALYSIS_VERSION,
      measurementKind,
      status: partial ? "partial" : "measured",
      summary,
      probeResults: measured.probeResults,
      reviewDeltas: measured.reviewDeltas,
    });
  } catch {
    return freezeDeep({
      version: PRACTICE_RETENTION_ANALYSIS_VERSION,
      measurementKind,
      status: "measurement-failed",
      summary: null,
      probeResults: [],
      reviewDeltas: [],
    });
  }
}

export function validatePracticeRetentionReviewDelta(delta, { sessionId = null, profileId = null, contextId = null } = {}, policy = PRACTICE_REVIEW_POLICY_V1) {
  const errors = [];
  const fail = (path, message) => errors.push({ path, code: "INVALID_RETENTION_DELTA", message });
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return { valid: false, errors: [{ path: "delta", code: "INVALID_RETENTION_DELTA", message: "delta must be object" }] };
  if (delta.deltaVersion !== PRACTICE_RETENTION_REVIEW_DELTA_VERSION) fail("deltaVersion", "unsupported delta version");
  for (const key of ["sessionId", "profileId", "contextId", "reviewItemId", "entityType", "entityKey", "expectedReferenceAtUtc", "reviewedAtUtc", "localDayKey"]) if (typeof delta[key] !== "string" || !delta[key]) fail(key, `${key} is required`);
  if (sessionId && delta.sessionId !== sessionId) fail("sessionId", "session identity mismatch");
  if (profileId && delta.profileId !== profileId) fail("profileId", "profile identity mismatch");
  if (contextId && delta.contextId !== contextId) fail("contextId", "context identity mismatch");
  if (!Number.isInteger(delta.cycleId) || delta.cycleId < 1) fail("cycleId", "cycleId must be positive integer");
  if (!PRACTICE_RETENTION_MEASUREMENT_STATUSES.includes(delta.measurementStatus)) fail("measurementStatus", "unsupported measurement status");
  if (!PRACTICE_RETENTION_NOVELTY_STATUSES.includes(delta.noveltyStatus)) fail("noveltyStatus", "unsupported novelty status");
  if (delta.outcome != null && !PRACTICE_RETENTION_OUTCOMES.includes(delta.outcome)) fail("outcome", "unsupported outcome");
  for (const [key, min, max] of [["probeQuality", 0, 100], ["referenceQuality", 0, 100], ["retentionScore", 0, 100], ["qualityCoverage", 0, 1]]) {
    if (delta[key] != null && (!finite(delta[key]) || delta[key] < min || delta[key] > max)) fail(key, `${key} is out of range`);
  }
  if (!Number.isInteger(delta.opportunityCount) || delta.opportunityCount < 0) fail("opportunityCount", "opportunityCount must be non-negative integer");
  if (!finite(delta.plannedIntervalDays) || delta.plannedIntervalDays <= 0) fail("plannedIntervalDays", "plannedIntervalDays must be positive");
  if (delta.elapsedDays != null && (!finite(delta.elapsedDays) || delta.elapsedDays < 0)) fail("elapsedDays", "elapsedDays must be non-negative");
  if (typeof delta.mature !== "boolean" || typeof delta.verificationEligible !== "boolean") fail("verificationEligible", "maturity/eligibility booleans are required");
  if (!Array.isArray(delta.familyIds) || delta.familyIds.length > policy.probe.maxFamilyIds || delta.familyIds.some((value) => typeof value !== "string" || !value || value.length > 120)) fail("familyIds", "familyIds are invalid");
  if (delta.verificationEligible) {
    if (!delta.mature || delta.noveltyStatus !== "fresh" || delta.measurementStatus !== "measured" || !finite(delta.probeQuality) || !finite(delta.retentionScore) || !PRACTICE_RETENTION_OUTCOMES.includes(delta.outcome)) fail("verificationEligible", "eligible verification guards are inconsistent");
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeRetentionReviewDeltaBatch(deltas, identity = {}, policy = PRACTICE_REVIEW_POLICY_V1) {
  const errors = [];
  if (!Array.isArray(deltas) || deltas.length > policy.plan.maxBindings) return { valid: false, errors: [{ path: "reviewDeltas", code: "ARRAY_LIMIT", message: "retention review delta batch exceeds limit" }] };
  const seen = new Set();
  for (const [index, delta] of deltas.entries()) {
    if (seen.has(delta?.reviewItemId)) errors.push({ path: `reviewDeltas[${index}].reviewItemId`, code: "DUPLICATE", message: "one retention delta per review item is allowed" });
    seen.add(delta?.reviewItemId);
    const validation = validatePracticeRetentionReviewDelta(delta, identity, policy);
    errors.push(...validation.errors.map((entry) => ({ ...entry, path: `reviewDeltas[${index}].${entry.path}` })));
  }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeRetentionAnalysis(analysis) {
  const errors = [];
  if (!analysis || analysis.version !== PRACTICE_RETENTION_ANALYSIS_VERSION) errors.push({ path: "version", code: "INVALID_VERSION", message: "retention analysis version is invalid" });
  if (!PRACTICE_RETENTION_ANALYSIS_STATUSES.includes(analysis?.status)) errors.push({ path: "status", code: "INVALID_ENUM", message: "retention analysis status is invalid" });
  if (!Array.isArray(analysis?.probeResults) || !Array.isArray(analysis?.reviewDeltas)) errors.push({ path: "probeResults", code: "INVALID_TYPE", message: "retention analysis arrays are required" });
  return { valid: errors.length === 0, errors };
}
