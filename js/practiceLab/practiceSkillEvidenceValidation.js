import {
  CONFIDENCE_LEVELS,
  ENTITY_TYPES,
  LATENCY_HISTOGRAM_BOUNDS_MS,
  MASTERY_STATES,
  PRACTICE_LIMITS,
  PRACTICE_RECORD_VERSIONS,
} from "./practiceConstants.js";
import { confidenceLevelForScore } from "./practiceEvidenceConfidence.js";
import { createSkillStatId, isPracticeId } from "./practiceIds.js";
import {
  PRACTICE_EVIDENCE_ACCURACY_SCOPES,
  PRACTICE_EVIDENCE_ROLES,
  PRACTICE_SKILL_EVIDENCE_POLICY_V1,
  PRACTICE_SKILL_EVIDENCE_VERSION,
} from "./practiceSkillEvidencePolicy.js";

const structuralKeys = ["substitution", "insertion", "omission", "transposition", "compound", "unknown"];
const finite = (value) => Number.isFinite(value);
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const push = (errors, path, code, message) => errors.push({ path, code, message });
const validTimestamp = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));

function validEntity(type, key) {
  if (typeof key !== "string" || !key) return false;
  const points = [...key];
  if (type === "key") return points.length === 1;
  if (type === "bigram") return points.length === 2;
  if (type === "trigram") return points.length === 3;
  if (type === "word") return /^[\p{L}\p{M}'-]{1,64}$/u.test(key);
  if (["punctuation-transition", "number-pattern", "symbol-pattern"].includes(type)) return /^[a-z0-9][a-z0-9-]{0,79}$/.test(key);
  return false;
}

function validateAggregate(value, path, errors, { allowNegative = false, recentLimit = 64 } = {}) {
  if (!isObject(value)) return push(errors, path, "INVALID_TYPE", `${path} must be an object`);
  if (!Number.isInteger(value.count) || value.count < 0) push(errors, `${path}.count`, "OUT_OF_RANGE", "count must be a non-negative integer");
  if (!finite(value.meanMs) || (!allowNegative && value.meanMs < 0)) push(errors, `${path}.meanMs`, "OUT_OF_RANGE", "meanMs is invalid");
  if (!finite(value.m2) || value.m2 < -1e-8) push(errors, `${path}.m2`, "OUT_OF_RANGE", "m2 is invalid");
  if (value.count === 0) {
    if (value.meanMs !== 0 || value.m2 !== 0 || value.minMs != null || value.maxMs != null || !Array.isArray(value.recentSamples) || value.recentSamples.length) push(errors, path, "EMPTY_AGGREGATE", "zero-count aggregate must use mean=0, m2=0, null min/max and empty samples");
  } else {
    if (!finite(value.minMs) || !finite(value.maxMs) || value.minMs > value.maxMs) push(errors, path, "MIN_MAX", "aggregate min/max are invalid");
    if (!allowNegative && (value.minMs < 0 || value.maxMs < 0)) push(errors, path, "OUT_OF_RANGE", "aggregate may not contain negative samples");
  }
  if (!Array.isArray(value.recentSamples) || value.recentSamples.length > recentLimit || value.recentSamples.some((sample) => !finite(sample) || (!allowNegative && sample < 0))) push(errors, `${path}.recentSamples`, "ARRAY_LIMIT", "recent samples are invalid");
}

function validateTiming(value, path, errors, { nullable = false } = {}) {
  if (nullable && value == null) return;
  if (!isObject(value)) return push(errors, path, "INVALID_TYPE", `${path} must be a timing object`);
  for (const key of ["eligibleCount", "fluentCount", "disfluentCount", "completeTraceSessionCount", "retainedWindowSessionCount"]) if (!Number.isInteger(value[key]) || value[key] < 0) push(errors, `${path}.${key}`, "OUT_OF_RANGE", `${key} must be non-negative integer`);
  if (value.eligibleCount !== value.fluentCount + value.disfluentCount) push(errors, path, "COUNT_MISMATCH", "eligibleCount must equal fluent + disfluent");
  validateAggregate(value.fluentLatency, `${path}.fluentLatency`, errors);
  validateAggregate(value.fluentResidual, `${path}.fluentResidual`, errors, { allowNegative: true });
  validateAggregate(value.disfluentResidual, `${path}.disfluentResidual`, errors, { allowNegative: true });
  if (value.fluentLatency?.count !== value.fluentCount) push(errors, `${path}.fluentLatency.count`, "COUNT_MISMATCH", "fluentLatency.count must equal fluentCount");
  if ((value.fluentResidual?.count ?? 0) > value.fluentCount) push(errors, `${path}.fluentResidual.count`, "COUNT_MISMATCH", "fluentResidual exceeds fluentCount");
  if ((value.disfluentResidual?.count ?? 0) > value.disfluentCount) push(errors, `${path}.disfluentResidual.count`, "COUNT_MISMATCH", "disfluentResidual exceeds disfluentCount");
}

function validateLegacy(value, errors) {
  if (value == null) return;
  if (!isObject(value)) return push(errors, "legacyEvidenceV2", "INVALID_TYPE", "legacyEvidenceV2 must be null or a fixed object");
  const allowed = new Set(["sampleCount", "correctCount", "errorCount", "correctedErrorCount", "uncorrectedErrorCount", "latencyCount", "latencyMeanMs", "latencyM2", "latencyMinMs", "latencyMaxMs", "latencyEmaMs", "latencyHistogram", "recentLatencySamples"]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) push(errors, `legacyEvidenceV2.${key}`, "UNKNOWN_FIELD", "legacyEvidenceV2 contains an unsupported field");
  for (const key of ["sampleCount", "correctCount", "errorCount", "correctedErrorCount", "uncorrectedErrorCount", "latencyCount"]) if (!Number.isInteger(value[key]) || value[key] < 0) push(errors, `legacyEvidenceV2.${key}`, "OUT_OF_RANGE", "legacy count is invalid");
  for (const key of ["latencyMeanMs", "latencyM2"]) if (!finite(value[key]) || value[key] < 0) push(errors, `legacyEvidenceV2.${key}`, "OUT_OF_RANGE", "legacy latency field is invalid");
  for (const key of ["latencyMinMs", "latencyMaxMs", "latencyEmaMs"]) if (value[key] != null && (!finite(value[key]) || value[key] < 0)) push(errors, `legacyEvidenceV2.${key}`, "OUT_OF_RANGE", "legacy latency field is invalid");
  if (!Array.isArray(value.latencyHistogram) || value.latencyHistogram.length !== LATENCY_HISTOGRAM_BOUNDS_MS.length || value.latencyHistogram.some((entry) => !Number.isInteger(entry) || entry < 0)) push(errors, "legacyEvidenceV2.latencyHistogram", "INVALID_HISTOGRAM", "legacy histogram is invalid");
  if (!Array.isArray(value.recentLatencySamples) || value.recentLatencySamples.length > PRACTICE_LIMITS.recentLatencySamples || value.recentLatencySamples.some((entry) => !finite(entry) || entry < 0)) push(errors, "legacyEvidenceV2.recentLatencySamples", "ARRAY_LIMIT", "legacy recent samples are invalid");
}

export function validatePracticeSkillStatV3(stat) {
  const errors = [];
  if (!isObject(stat)) return { valid: false, errors: [{ path: "skillStat", code: "INVALID_TYPE", message: "skillStat must be an object" }] };
  if (!isPracticeId(stat.profileId, "profile")) push(errors, "profileId", "INVALID_ID", "invalid profileId");
  if (!isPracticeId(stat.contextId, "context")) push(errors, "contextId", "INVALID_ID", "invalid contextId");
  if (!ENTITY_TYPES.includes(stat.entityType) || !validEntity(stat.entityType, stat.entityKey)) push(errors, "entityKey", "INVALID_ENTITY", "invalid Practice skill entity");
  if (stat.statId !== createSkillStatId(stat.profileId, stat.contextId, stat.entityType, stat.entityKey)) push(errors, "statId", "IDENTITY_MISMATCH", "statId does not match identity");
  if (stat.recordVersion !== PRACTICE_RECORD_VERSIONS.skillStat) push(errors, "recordVersion", "UNSUPPORTED_VERSION", `skillStat recordVersion must equal ${PRACTICE_RECORD_VERSIONS.skillStat}`);
  if (!validTimestamp(stat.createdAt) || !validTimestamp(stat.updatedAt)) push(errors, "updatedAt", "INVALID_TIMESTAMP", "createdAt/updatedAt must be ISO timestamps");
  if (stat.evidenceVersion !== PRACTICE_SKILL_EVIDENCE_VERSION) push(errors, "evidenceVersion", "UNSUPPORTED_VERSION", "unsupported evidence version");
  const evidence = stat.evidence;
  if (!isObject(evidence)) push(errors, "evidence", "INVALID_TYPE", "evidence must be an object");
  else {
    const opp = evidence.opportunities;
    for (const key of ["count", "correctCount", "errorCount", "directTargetedCount", "incidentalCount"]) if (!Number.isInteger(opp?.[key]) || opp[key] < 0) push(errors, `evidence.opportunities.${key}`, "OUT_OF_RANGE", "opportunity count is invalid");
    if (opp && opp.correctCount + opp.errorCount !== opp.count) push(errors, "evidence.opportunities", "COUNT_MISMATCH", "correct + error must equal count");
    if (opp && opp.directTargetedCount + opp.incidentalCount !== opp.count) push(errors, "evidence.opportunities", "TARGETING_MISMATCH", "direct + incidental must equal count");
    const observation = evidence.observation;
    for (const key of ["sessionCount", "completedSessionCount", "abandonedSessionCount", "dayCount", "targetedSessionCount", "breadthEvidencePoints"]) if (!Number.isInteger(observation?.[key]) || observation[key] < 0) push(errors, `evidence.observation.${key}`, "OUT_OF_RANGE", "observation count is invalid");
    if ((observation?.completedSessionCount ?? 0) + (observation?.abandonedSessionCount ?? 0) > (observation?.sessionCount ?? 0)) push(errors, "evidence.observation", "COUNT_MISMATCH", "status session counts exceed sessionCount");
    for (const key of ["firstObservedAt", "lastObservedAt"]) if (observation?.[key] != null && !validTimestamp(observation[key])) push(errors, `evidence.observation.${key}`, "INVALID_TIMESTAMP", "observation timestamp invalid");
    if (observation?.lastObservedDayKey != null && !/^\d{4}-\d{2}-\d{2}$/.test(observation.lastObservedDayKey)) push(errors, "evidence.observation.lastObservedDayKey", "INVALID_DAY", "last observed day invalid");
    validateTiming(evidence.timing, "evidence.timing", errors);
    validateTiming(evidence.launchTiming, "evidence.launchTiming", errors, { nullable: true });
    if (stat.entityType === "word" && evidence.launchTiming == null) push(errors, "evidence.launchTiming", "REQUIRED", "word stat requires launchTiming");
    if (stat.entityType !== "word" && evidence.launchTiming != null) push(errors, "evidence.launchTiming", "FORBIDDEN", "non-word launchTiming must be null");
    const err = evidence.errors;
    for (const key of ["primaryEpisodeCount", "correctedEpisodeCount", "uncorrectedEpisodeCount", "correctCharactersRemovedCount"]) if (!Number.isInteger(err?.[key]) || err[key] < 0) push(errors, `evidence.errors.${key}`, "OUT_OF_RANGE", "error count invalid");
    if (err && err.correctedEpisodeCount + err.uncorrectedEpisodeCount !== err.primaryEpisodeCount) push(errors, "evidence.errors", "COUNT_MISMATCH", "corrected + uncorrected must equal primary episodes");
    let structuralTotal = 0;
    for (const key of structuralKeys) {
      if (!Number.isInteger(err?.structuralCounts?.[key]) || err.structuralCounts[key] < 0) push(errors, `evidence.errors.structuralCounts.${key}`, "OUT_OF_RANGE", "structural count invalid");
      else structuralTotal += err.structuralCounts[key];
    }
    if (structuralTotal !== (err?.primaryEpisodeCount ?? 0)) push(errors, "evidence.errors.structuralCounts", "COUNT_MISMATCH", "structural counts must equal primary episodes");
    validateAggregate(err?.correctionInitiation, "evidence.errors.correctionInitiation", errors);
    validateAggregate(err?.errorToRepair, "evidence.errors.errorToRepair", errors);
    if (!isObject(evidence.roles) || Object.keys(evidence.roles).some((role) => !PRACTICE_EVIDENCE_ROLES.includes(role)) || Object.keys(evidence.roles).length > PRACTICE_EVIDENCE_ROLES.length) push(errors, "evidence.roles", "INVALID_ROLE", "roles contain unsupported keys");
    let roleOpportunityTotal = 0;
    for (const [role, lane] of Object.entries(evidence.roles ?? {})) {
      for (const key of ["opportunityCount", "correctCount", "errorCount", "timingEligibleCount", "fluentCount", "disfluentCount", "fluentResidualCount", "primaryErrorEpisodeCount", "sessionCount"]) if (!Number.isInteger(lane?.[key]) || lane[key] < 0) push(errors, `evidence.roles.${role}.${key}`, "OUT_OF_RANGE", "role count invalid");
      if (lane?.correctCount + lane?.errorCount !== lane?.opportunityCount) push(errors, `evidence.roles.${role}`, "COUNT_MISMATCH", "role correct + error must equal opportunities");
      if (lane?.fluentCount + lane?.disfluentCount !== lane?.timingEligibleCount) push(errors, `evidence.roles.${role}`, "COUNT_MISMATCH", "role timing counts do not sum");
      if (lane?.fluentResidualCount > lane?.fluentCount) push(errors, `evidence.roles.${role}.fluentResidualCount`, "COUNT_MISMATCH", "role residual count exceeds fluent count");
      if (!finite(lane?.fluentResidualMeanMs) || !finite(lane?.fluentResidualM2) || lane.fluentResidualM2 < -1e-8) push(errors, `evidence.roles.${role}.fluentResidualMeanMs`, "OUT_OF_RANGE", "role residual aggregate invalid");
      if (lane?.fluentResidualCount === 0 && (lane?.fluentResidualMeanMs !== 0 || lane?.fluentResidualM2 !== 0)) push(errors, `evidence.roles.${role}`, "EMPTY_AGGREGATE", "empty role residual aggregate must be zero");
      if (!Array.isArray(lane?.recentResidualSamples) || lane.recentResidualSamples.length > PRACTICE_SKILL_EVIDENCE_POLICY_V1.maxRoleRecentSamples || lane.recentResidualSamples.some((entry) => !finite(entry))) push(errors, `evidence.roles.${role}.recentResidualSamples`, "ARRAY_LIMIT", "role recent residual samples invalid");
      if (lane?.lastObservedAt != null && !validTimestamp(lane.lastObservedAt)) push(errors, `evidence.roles.${role}.lastObservedAt`, "INVALID_TIMESTAMP", "role lastObservedAt invalid");
      roleOpportunityTotal += Number(lane?.opportunityCount || 0);
    }
    if (roleOpportunityTotal !== (opp?.count ?? 0)) push(errors, "evidence.roles", "COUNT_MISMATCH", "sum(role opportunities) must equal overall opportunity count");
    const coverage = evidence.coverage;
    if (!PRACTICE_EVIDENCE_ACCURACY_SCOPES.includes(coverage?.accuracyScope)) push(errors, "evidence.coverage.accuracyScope", "INVALID_ENUM", "invalid accuracy scope");
    for (const key of ["completeTimingSessionCount", "retainedWindowTimingSessionCount", "evidenceTruncatedSessionCount", "omittedObservationCount"]) if (!Number.isInteger(coverage?.[key]) || coverage[key] < 0) push(errors, `evidence.coverage.${key}`, "OUT_OF_RANGE", "coverage count invalid");
  }
  if (!finite(stat.confidenceScore) || stat.confidenceScore < 0 || stat.confidenceScore > 100) push(errors, "confidenceScore", "OUT_OF_RANGE", "confidenceScore must be 0..100");
  if (!CONFIDENCE_LEVELS.includes(stat.confidenceLevel)) push(errors, "confidenceLevel", "INVALID_ENUM", "invalid confidenceLevel");
  else if (finite(stat.confidenceScore) && confidenceLevelForScore(stat.confidenceScore) !== stat.confidenceLevel) push(errors, "confidenceLevel", "CONFIDENCE_MISMATCH", "confidenceLevel does not match score policy");
  for (const key of ["lastObservedAt", "lastPractisedAt"]) if (stat[key] != null && !validTimestamp(stat[key])) push(errors, key, "INVALID_TIMESTAMP", `${key} invalid`);
  if (!finite(stat.weaknessScore) || stat.weaknessScore < 0 || !finite(stat.priority) || stat.priority < 0) push(errors, "weaknessScore", "OUT_OF_RANGE", "judgment fields must remain non-negative");
  if (!MASTERY_STATES.includes(stat.masteryState)) push(errors, "masteryState", "INVALID_ENUM", "invalid masteryState");
  for (const key of ["successfulReviewCount", "failedReviewCount"]) if (!Number.isInteger(stat[key]) || stat[key] < 0) push(errors, key, "OUT_OF_RANGE", "review count invalid");
  validateLegacy(stat.legacyEvidenceV2, errors);
  const forbidden = ["sampleCount", "correctCount", "errorCount", "correctedErrorCount", "uncorrectedErrorCount", "latencyCount", "latencyMeanMs", "latencyM2", "latencyMinMs", "latencyMaxMs", "latencyEmaMs", "latencyHistogram", "recentLatencySamples"];
  for (const field of forbidden) if (Object.hasOwn(stat, field)) push(errors, field, "LEGACY_TOP_LEVEL", "legacy v2 accumulators are not canonical v3 fields");
  try {
    if (new TextEncoder().encode(JSON.stringify(stat)).byteLength > PRACTICE_LIMITS.skillStatBytes) push(errors, "skillStat", "SERIALIZED_SIZE", "skillStat exceeds its size limit");
  } catch { push(errors, "skillStat", "UNSERIALIZABLE", "skillStat is not JSON-safe"); }
  return { valid: errors.length === 0, errors };
}
