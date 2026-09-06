import {
  CONFIDENCE_LEVELS,
  ENTITY_TYPES,
  PRACTICE_LIMITS,
  PRACTICE_RECORD_VERSIONS,
} from "./practiceConstants.js";
import {
  PRACTICE_RETENTION_OUTCOMES,
  PRACTICE_RETENTION_PROVIDER_STATUSES,
  PRACTICE_REVIEW_ITEM_STATES,
} from "./practiceReviewConstants.js";
import { isValidPracticeUtcIso } from "./practiceTime.js";

const finite = Number.isFinite;
const plain = (value) => value && typeof value === "object" && !Array.isArray(value);
const byteLength = (value) => new TextEncoder().encode(JSON.stringify(value)).length;
const err = (errors, path, code, message) => errors.push({ path, code, message });
const nullableIso = (value) => value == null || isValidPracticeUtcIso(value);
const nullableScore = (value) => value == null || (finite(value) && value >= 0 && value <= 100);

function validateCycle(cycle, errors) {
  if (!plain(cycle)) return err(errors, "cycle", "INVALID_TYPE", "cycle must be an object");
  if (!Number.isInteger(cycle.cycleId) || cycle.cycleId < 1) err(errors, "cycle.cycleId", "OUT_OF_RANGE", "cycleId must be positive integer");
  for (const key of ["startedAt", "referenceAtUtc"]) if (!isValidPracticeUtcIso(cycle[key])) err(errors, `cycle.${key}`, "INVALID_TIMESTAMP", `${key} must be UTC ISO`);
  if (typeof cycle.resetReason !== "string" || !cycle.resetReason || cycle.resetReason.length > 80) err(errors, "cycle.resetReason", "INVALID_STRING", "resetReason is invalid");
  if (!nullableScore(cycle.referenceQuality) || cycle.referenceQuality == null) err(errors, "cycle.referenceQuality", "OUT_OF_RANGE", "referenceQuality must be 0..100");
  if (!["acquired", "transferred", "robust", "retained"].includes(cycle.initialMasteryStage)) err(errors, "cycle.initialMasteryStage", "INVALID_ENUM", "initial mastery stage is invalid");
  if (!finite(cycle.initialIntervalDays) || cycle.initialIntervalDays <= 0) err(errors, "cycle.initialIntervalDays", "OUT_OF_RANGE", "initial interval must be positive");
}

function validateRecentProbe(probe, index, errors) {
  const path = `retention.recentProbes[${index}]`;
  if (!plain(probe)) return err(errors, path, "INVALID_TYPE", "recent probe must be an object");
  for (const key of ["sessionId", "reviewedAtUtc", "localDayKey", "measurementStatus", "noveltyStatus"]) if (typeof probe[key] !== "string" || !probe[key]) err(errors, `${path}.${key}`, "INVALID_STRING", `${key} is required`);
  if (!Number.isInteger(probe.cycleId) || probe.cycleId < 1) err(errors, `${path}.cycleId`, "OUT_OF_RANGE", "cycleId must be positive");
  if (!nullableScore(probe.probeQuality) || !nullableScore(probe.retentionScore)) err(errors, `${path}.score`, "OUT_OF_RANGE", "probe scores must be nullable 0..100");
  if (probe.outcome != null && !PRACTICE_RETENTION_OUTCOMES.includes(probe.outcome)) err(errors, `${path}.outcome`, "INVALID_ENUM", "outcome is invalid");
  if (!Number.isInteger(probe.opportunityCount) || probe.opportunityCount < 0) err(errors, `${path}.opportunityCount`, "OUT_OF_RANGE", "opportunity count is invalid");
  if (probe.elapsedDays != null && (!finite(probe.elapsedDays) || probe.elapsedDays < 0)) err(errors, `${path}.elapsedDays`, "OUT_OF_RANGE", "elapsedDays is invalid");
  if (typeof probe.mature !== "boolean" || typeof probe.verificationEligible !== "boolean") err(errors, path, "INVALID_BOOLEAN", "mature and verificationEligible are required");
  if (!Array.isArray(probe.familyIds) || probe.familyIds.length > 4 || probe.familyIds.some((value) => typeof value !== "string" || !value || value.length > 120)) err(errors, `${path}.familyIds`, "ARRAY_LIMIT", "familyIds are invalid");
}

function validateRetention(retention, errors) {
  if (!plain(retention)) return err(errors, "retention", "INVALID_TYPE", "retention must be object");
  if (!PRACTICE_RETENTION_PROVIDER_STATUSES.includes(retention.status)) err(errors, "retention.status", "INVALID_ENUM", "retention status is invalid");
  if (!nullableScore(retention.score)) err(errors, "retention.score", "OUT_OF_RANGE", "retention score is invalid");
  if (!finite(retention.confidenceScore) || retention.confidenceScore < 0 || retention.confidenceScore > 100) err(errors, "retention.confidenceScore", "OUT_OF_RANGE", "confidence score is invalid");
  if (!CONFIDENCE_LEVELS.includes(retention.confidenceLevel)) err(errors, "retention.confidenceLevel", "INVALID_ENUM", "confidence level is invalid");
  const counters = [
    "currentCycleVerificationCount", "currentCycleSuccessfulCount", "currentCycleFragileCount", "currentCycleFailedCount",
    "currentCycleDistinctReviewDays", "currentCycleDistinctSuccessfulDays", "currentCycleDistinctSuccessfulFamilies",
    "lifetimeVerificationCount", "lifetimeSuccessCount", "lifetimeFailureCount",
  ];
  for (const key of counters) if (!Number.isInteger(retention[key]) || retention[key] < 0) err(errors, `retention.${key}`, "OUT_OF_RANGE", `${key} must be a non-negative integer`);
  if (!finite(retention.currentCycleMaxSuccessfulDelayDays) || retention.currentCycleMaxSuccessfulDelayDays < 0) err(errors, "retention.currentCycleMaxSuccessfulDelayDays", "OUT_OF_RANGE", "max successful delay is invalid");
  const classified = Number(retention.currentCycleSuccessfulCount || 0) + Number(retention.currentCycleFragileCount || 0) + Number(retention.currentCycleFailedCount || 0);
  if (classified !== Number(retention.currentCycleVerificationCount || 0)) err(errors, "retention.currentCycleVerificationCount", "INVARIANT", "verified outcomes must exactly equal verification count");
  if (retention.lifetimeVerificationCount < retention.currentCycleVerificationCount) err(errors, "retention.lifetimeVerificationCount", "INVARIANT", "lifetime verification count cannot be smaller than current cycle");
  if (retention.lifetimeSuccessCount < retention.currentCycleSuccessfulCount) err(errors, "retention.lifetimeSuccessCount", "INVARIANT", "lifetime success count cannot be smaller than current cycle");
  if (retention.lifetimeFailureCount < retention.currentCycleFailedCount) err(errors, "retention.lifetimeFailureCount", "INVARIANT", "lifetime failure count cannot be smaller than current cycle");
  for (const key of ["lastProbeAt", "lastVerifiedAt"]) if (!nullableIso(retention[key])) err(errors, `retention.${key}`, "INVALID_TIMESTAMP", `${key} must be nullable UTC ISO`);
  if (retention.lastOutcome != null && !PRACTICE_RETENTION_OUTCOMES.includes(retention.lastOutcome)) err(errors, "retention.lastOutcome", "INVALID_ENUM", "lastOutcome is invalid");
  if (!Array.isArray(retention.recentProbes) || retention.recentProbes.length > 12) err(errors, "retention.recentProbes", "ARRAY_LIMIT", "recent probe ring is invalid");
  else retention.recentProbes.forEach((probe, index) => validateRecentProbe(probe, index, errors));
}

function containsForbiddenPrivatePayload(value, depth = 0) {
  if (depth > 12 || value == null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((entry) => containsForbiddenPrivatePayload(entry, depth + 1));
  for (const [key, child] of Object.entries(value)) {
    if (["text", "contentText", "customText", "rawEvents", "eventTrace", "mistypedString", "wrongString", "typedBuffer"].includes(key)) return true;
    if (containsForbiddenPrivatePayload(child, depth + 1)) return true;
  }
  return false;
}

export function validatePracticeReviewItemV3(item) {
  const errors = [];
  if (!plain(item)) return { valid: false, errors: [{ path: "reviewItem", code: "INVALID_TYPE", message: "review item must be object" }] };
  for (const key of ["reviewItemId", "profileId", "contextId", "entityKey"]) if (typeof item[key] !== "string" || !item[key]) err(errors, key, "INVALID_STRING", `${key} is required`);
  if (item.recordVersion !== PRACTICE_RECORD_VERSIONS.reviewItem) err(errors, "recordVersion", "INVALID_VERSION", "reviewItem record version is invalid");
  if (!ENTITY_TYPES.includes(item.entityType)) err(errors, "entityType", "INVALID_ENUM", "entity type is invalid");
  for (const key of ["createdAt", "updatedAt"]) if (!isValidPracticeUtcIso(item[key])) err(errors, key, "INVALID_TIMESTAMP", `${key} must be UTC ISO`);
  if (!PRACTICE_REVIEW_ITEM_STATES.includes(item.state)) err(errors, "state", "INVALID_ENUM", "review state is invalid");
  for (const key of ["dueAtUtc", "minimumMatureAtUtc", "lastScheduledAt"]) if (!nullableIso(item[key])) err(errors, key, "INVALID_TIMESTAMP", `${key} must be nullable UTC ISO`);
  if (item.localDueDayKey != null && !/^\d{4}-\d{2}-\d{2}$/.test(item.localDueDayKey)) err(errors, "localDueDayKey", "INVALID_DAY_KEY", "local due day key is invalid");
  for (const key of ["intervalDays", "stabilityDays"]) if (item[key] != null && (!finite(item[key]) || item[key] <= 0 || item[key] > 180)) err(errors, key, "OUT_OF_RANGE", `${key} is invalid`);
  if (item.suspensionReason != null && (typeof item.suspensionReason !== "string" || !item.suspensionReason || item.suspensionReason.length > 80)) err(errors, "suspensionReason", "INVALID_STRING", "suspension reason is invalid");
  if (item.cycle != null) validateCycle(item.cycle, errors);
  validateRetention(item.retention, errors);
  if (!Array.isArray(item.recentProbeFamilyIds) || item.recentProbeFamilyIds.length > 8 || item.recentProbeFamilyIds.some((value) => typeof value !== "string" || !value || value.length > 120)) err(errors, "recentProbeFamilyIds", "ARRAY_LIMIT", "recent family ring is invalid");

  if (item.state === "active") {
    if (!plain(item.cycle)) err(errors, "cycle", "REQUIRED", "active review requires cycle");
    if (![item.dueAtUtc, item.minimumMatureAtUtc, item.localDueDayKey, item.lastScheduledAt].every((value) => value != null)) err(errors, "state", "INVARIANT", "active review requires due/maturity/schedule timestamps");
    if (!(finite(item.intervalDays) && item.intervalDays > 0 && finite(item.stabilityDays) && item.stabilityDays > 0)) err(errors, "intervalDays", "INVARIANT", "active review requires positive interval and stability");
    if (item.suspensionReason != null) err(errors, "suspensionReason", "INVARIANT", "active review cannot be suspended");
    if (plain(item.cycle) && item.minimumMatureAtUtc && item.dueAtUtc) {
      const reference = Date.parse(item.cycle.referenceAtUtc);
      const mature = Date.parse(item.minimumMatureAtUtc);
      const due = Date.parse(item.dueAtUtc);
      if (!(reference < mature && mature < due + 1e-9)) err(errors, "minimumMatureAtUtc", "INVARIANT", "active timing order is invalid");
    }
  } else if (item.state === "suspended") {
    if (item.suspensionReason == null) err(errors, "suspensionReason", "REQUIRED", "suspended review requires reason");
    if (item.dueAtUtc != null || item.localDueDayKey != null || item.minimumMatureAtUtc != null) err(errors, "dueAtUtc", "INVARIANT", "suspended review must not remain due");
  }
  if (containsForbiddenPrivatePayload(item)) err(errors, "reviewItem", "PRIVACY", "review item contains forbidden raw/private payload");
  try {
    if (byteLength(item) > PRACTICE_LIMITS.reviewItemBytes) err(errors, "reviewItem", "SIZE_LIMIT", "review item exceeds configured byte cap");
  } catch { err(errors, "reviewItem", "UNSERIALIZABLE", "review item is not serializable"); }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeRetentionReviewSummary(summary) {
  const errors = [];
  if (!plain(summary)) return { valid: false, errors: [{ path: "retentionReviewSummary", code: "INVALID_TYPE", message: "retention review summary must be object" }] };
  for (const key of ["analysisVersion", "probeVersion", "targetCount", "measuredCount", "verificationEligibleCount", "strongCount", "passCount", "fragileCount", "failCount", "prematureCount", "insufficientCount", "nonVerifyingCount"]) if (!Number.isInteger(summary[key]) || summary[key] < 0) err(errors, key, "OUT_OF_RANGE", `${key} must be non-negative integer`);
  const outcomes = summary.strongCount + summary.passCount + summary.fragileCount + summary.failCount;
  if (outcomes > summary.measuredCount || summary.measuredCount > summary.targetCount || summary.verificationEligibleCount > summary.measuredCount) err(errors, "retentionReviewSummary", "INVARIANT", "retention summary counts are inconsistent");
  return { valid: errors.length === 0, errors };
}
