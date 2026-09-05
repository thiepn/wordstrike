import { createSkillStatId, isPracticeId } from "./practiceIds.js";
import {
  PRACTICE_EVIDENCE_ACCURACY_SCOPES,
  PRACTICE_EVIDENCE_ROLES,
  PRACTICE_EVIDENCE_TIMING_SCOPES,
  PRACTICE_SKILL_EVIDENCE_DELTA_VERSION,
  PRACTICE_SKILL_EVIDENCE_POLICY_V1,
} from "./practiceSkillEvidencePolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = (value) => Number.isFinite(value);

export function createEmptyPracticeWelfordAggregate() {
  return { count: 0, meanMs: 0, m2: 0, minMs: null, maxMs: null, recentSamples: [] };
}

export function selectPracticeSessionSamples(values, limit = PRACTICE_SKILL_EVIDENCE_POLICY_V1.maxRecentSamplesPerEntityPerSession) {
  const source = Array.isArray(values) ? values.filter(finite) : [];
  if (source.length <= limit) return [...source];
  const result = [];
  const used = new Set();
  for (let i = 0; i < limit; i += 1) {
    let index = Math.floor(((i + 0.5) * source.length) / limit);
    index = Math.max(0, Math.min(source.length - 1, index));
    while (used.has(index) && index + 1 < source.length) index += 1;
    while (used.has(index) && index > 0) index -= 1;
    if (!used.has(index)) {
      used.add(index);
      result.push(source[index]);
    }
  }
  return result;
}

export function createPracticeWelfordAggregate(values = [], { sampleLimit = PRACTICE_SKILL_EVIDENCE_POLICY_V1.maxRecentSamplesPerEntityPerSession } = {}) {
  const source = Array.isArray(values) ? values.filter(finite) : [];
  let count = 0;
  let meanMs = 0;
  let m2 = 0;
  let minMs = null;
  let maxMs = null;
  for (const value of source) {
    count += 1;
    const delta = value - meanMs;
    meanMs += delta / count;
    m2 += delta * (value - meanMs);
    minMs = minMs == null ? value : Math.min(minMs, value);
    maxMs = maxMs == null ? value : Math.max(maxMs, value);
  }
  return freezeDeep({ count, meanMs: count ? meanMs : 0, m2: count ? m2 : 0, minMs, maxMs, recentSamples: selectPracticeSessionSamples(source, sampleLimit) });
}

export function mergePracticeWelfordAggregates(left, right, { ringLimit = PRACTICE_SKILL_EVIDENCE_POLICY_V1.maxRecentSamples } = {}) {
  const a = left ?? createEmptyPracticeWelfordAggregate();
  const b = right ?? createEmptyPracticeWelfordAggregate();
  const n1 = Number(a.count || 0);
  const n2 = Number(b.count || 0);
  if (!n1 && !n2) return freezeDeep(createEmptyPracticeWelfordAggregate());
  if (!n1) return freezeDeep({ ...b, recentSamples: [...(b.recentSamples ?? [])].slice(-ringLimit) });
  if (!n2) return freezeDeep({ ...a, recentSamples: [...(a.recentSamples ?? [])].slice(-ringLimit) });
  const n = n1 + n2;
  const delta = b.meanMs - a.meanMs;
  const meanMs = a.meanMs + delta * n2 / n;
  const m2 = a.m2 + b.m2 + delta * delta * n1 * n2 / n;
  return freezeDeep({
    count: n,
    meanMs,
    m2,
    minMs: a.minMs == null ? b.minMs : b.minMs == null ? a.minMs : Math.min(a.minMs, b.minMs),
    maxMs: a.maxMs == null ? b.maxMs : b.maxMs == null ? a.maxMs : Math.max(a.maxMs, b.maxMs),
    recentSamples: [...(a.recentSamples ?? []), ...(b.recentSamples ?? [])].slice(-ringLimit),
  });
}

function validateAggregate(value, path, errors, { allowNegative = false, recentLimit = PRACTICE_SKILL_EVIDENCE_POLICY_V1.maxRecentSamples } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return errors.push({ path, code: "INVALID_TYPE", message: `${path} must be an aggregate object` });
  if (!Number.isInteger(value.count) || value.count < 0) errors.push({ path: `${path}.count`, code: "OUT_OF_RANGE", message: "count must be non-negative integer" });
  if (!finite(value.meanMs) || (!allowNegative && value.meanMs < 0)) errors.push({ path: `${path}.meanMs`, code: "OUT_OF_RANGE", message: "meanMs is invalid" });
  if (!finite(value.m2) || value.m2 < -1e-9) errors.push({ path: `${path}.m2`, code: "OUT_OF_RANGE", message: "m2 is invalid" });
  if (value.count === 0 && (value.meanMs !== 0 || value.m2 !== 0 || value.minMs != null || value.maxMs != null || (value.recentSamples?.length ?? 0) !== 0)) errors.push({ path, code: "EMPTY_AGGREGATE", message: "empty aggregate must use canonical zero/null semantics" });
  if (value.count > 0) {
    if (!finite(value.minMs) || !finite(value.maxMs) || value.minMs > value.maxMs) errors.push({ path, code: "MIN_MAX", message: "aggregate min/max are invalid" });
    if (!allowNegative && (value.minMs < 0 || value.maxMs < 0)) errors.push({ path, code: "OUT_OF_RANGE", message: "negative samples are not allowed" });
  }
  if (!Array.isArray(value.recentSamples) || value.recentSamples.length > recentLimit || value.recentSamples.some((sample) => !finite(sample) || (!allowNegative && sample < 0))) errors.push({ path: `${path}.recentSamples`, code: "ARRAY_LIMIT", message: "recentSamples are invalid" });
}

function validateTiming(value, path, errors, { nullable = false } = {}) {
  if (nullable && value == null) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) return errors.push({ path, code: "INVALID_TYPE", message: `${path} must be a timing object` });
  for (const key of ["eligibleCount", "fluentCount", "disfluentCount"]) if (!Number.isInteger(value[key]) || value[key] < 0) errors.push({ path: `${path}.${key}`, code: "OUT_OF_RANGE", message: `${key} must be non-negative integer` });
  if (value.eligibleCount !== value.fluentCount + value.disfluentCount) errors.push({ path, code: "COUNT_MISMATCH", message: "eligibleCount must equal fluentCount + disfluentCount" });
  validateAggregate(value.fluentLatency, `${path}.fluentLatency`, errors);
  validateAggregate(value.fluentResidual, `${path}.fluentResidual`, errors, { allowNegative: true });
  validateAggregate(value.disfluentResidual, `${path}.disfluentResidual`, errors, { allowNegative: true });
  if (value.fluentLatency?.count !== value.fluentCount) errors.push({ path: `${path}.fluentLatency.count`, code: "COUNT_MISMATCH", message: "fluent latency count must equal fluentCount" });
  if ((value.fluentResidual?.count ?? 0) > value.fluentCount) errors.push({ path: `${path}.fluentResidual.count`, code: "COUNT_MISMATCH", message: "fluent residual count exceeds fluentCount" });
  if ((value.disfluentResidual?.count ?? 0) > value.disfluentCount) errors.push({ path: `${path}.disfluentResidual.count`, code: "COUNT_MISMATCH", message: "disfluent residual count exceeds disfluentCount" });
}

export function validatePracticeSkillEvidenceDelta(delta) {
  const errors = [];
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) return { valid: false, errors: [{ path: "delta", code: "INVALID_TYPE", message: "delta must be an object" }] };
  if (delta.deltaVersion !== PRACTICE_SKILL_EVIDENCE_DELTA_VERSION) errors.push({ path: "deltaVersion", code: "UNSUPPORTED_VERSION", message: "unsupported skill evidence delta version" });
  if (!isPracticeId(delta.sessionId, "session")) errors.push({ path: "sessionId", code: "INVALID_ID", message: "invalid sessionId" });
  if (!isPracticeId(delta.profileId, "profile")) errors.push({ path: "profileId", code: "INVALID_ID", message: "invalid profileId" });
  if (!isPracticeId(delta.contextId, "context")) errors.push({ path: "contextId", code: "INVALID_ID", message: "invalid contextId" });
  if (!["key", "bigram", "trigram", "word"].includes(delta.entityType) || typeof delta.entityKey !== "string" || !delta.entityKey) errors.push({ path: "entityKey", code: "INVALID_ENTITY", message: "unsupported evidence entity" });
  if (typeof delta.profileId === "string" && typeof delta.contextId === "string" && typeof delta.entityType === "string" && typeof delta.entityKey === "string" && delta.statId !== createSkillStatId(delta.profileId, delta.contextId, delta.entityType, delta.entityKey)) errors.push({ path: "statId", code: "IDENTITY_MISMATCH", message: "statId does not match delta identity" });
  if (!PRACTICE_EVIDENCE_ROLES.includes(delta.evidenceRole)) errors.push({ path: "evidenceRole", code: "INVALID_ENUM", message: "invalid evidence role" });
  if (delta.evidenceRole === "custom" && delta.entityType === "word") errors.push({ path: "entityType", code: "CUSTOM_WORD_PRIVACY", message: "custom word evidence is disabled by PL11 v1" });
  if (!Number.isFinite(Date.parse(delta.observedAt))) errors.push({ path: "observedAt", code: "INVALID_TIMESTAMP", message: "observedAt must be ISO timestamp" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(delta.localDayKey ?? "")) errors.push({ path: "localDayKey", code: "INVALID_DAY", message: "localDayKey must be YYYY-MM-DD" });
  if (typeof delta.directTarget !== "boolean") errors.push({ path: "directTarget", code: "INVALID_TYPE", message: "directTarget must be boolean" });
  const opp = delta.opportunities;
  for (const key of ["count", "correctCount", "errorCount", "directTargetedCount", "incidentalCount"]) if (!Number.isInteger(opp?.[key]) || opp[key] < 0) errors.push({ path: `opportunities.${key}`, code: "OUT_OF_RANGE", message: "opportunity count is invalid" });
  if (opp && opp.correctCount + opp.errorCount !== opp.count) errors.push({ path: "opportunities", code: "COUNT_MISMATCH", message: "correct + error must equal count" });
  if (opp && opp.directTargetedCount + opp.incidentalCount !== opp.count) errors.push({ path: "opportunities", code: "TARGETING_MISMATCH", message: "targeted + incidental must equal count" });
  const observation = delta.observation;
  for (const key of ["breadthEvidencePoints", "completedSessionCount", "abandonedSessionCount", "targetedSessionCount"]) if (!Number.isInteger(observation?.[key]) || observation[key] < 0) errors.push({ path: `observation.${key}`, code: "OUT_OF_RANGE", message: "observation count is invalid" });
  validateTiming(delta.timing, "timing", errors);
  validateTiming(delta.launchTiming, "launchTiming", errors, { nullable: true });
  if (delta.entityType === "word" && delta.launchTiming == null) errors.push({ path: "launchTiming", code: "REQUIRED", message: "word evidence requires launchTiming" });
  if (delta.entityType !== "word" && delta.launchTiming != null) errors.push({ path: "launchTiming", code: "FORBIDDEN", message: "non-word launchTiming must be null" });
  const err = delta.errors;
  for (const key of ["primaryEpisodeCount", "correctedEpisodeCount", "uncorrectedEpisodeCount", "correctCharactersRemovedCount"]) if (!Number.isInteger(err?.[key]) || err[key] < 0) errors.push({ path: `errors.${key}`, code: "OUT_OF_RANGE", message: "error count is invalid" });
  if (err && err.correctedEpisodeCount + err.uncorrectedEpisodeCount !== err.primaryEpisodeCount) errors.push({ path: "errors", code: "COUNT_MISMATCH", message: "corrected + uncorrected must equal primary episodes" });
  const structuralKeys = ["substitution", "insertion", "omission", "transposition", "compound", "unknown"];
  const structuralTotal = structuralKeys.reduce((sum, key) => sum + (Number.isInteger(err?.structuralCounts?.[key]) ? err.structuralCounts[key] : 0), 0);
  if (structuralTotal !== err?.primaryEpisodeCount) errors.push({ path: "errors.structuralCounts", code: "COUNT_MISMATCH", message: "structural counts must equal primary episodes" });
  validateAggregate(err?.correctionInitiation, "errors.correctionInitiation", errors);
  validateAggregate(err?.errorToRepair, "errors.errorToRepair", errors);
  if (!PRACTICE_EVIDENCE_ACCURACY_SCOPES.includes(delta.coverage?.accuracyScope)) errors.push({ path: "coverage.accuracyScope", code: "INVALID_ENUM", message: "invalid accuracy scope" });
  if (!PRACTICE_EVIDENCE_TIMING_SCOPES.includes(delta.coverage?.timingScope)) errors.push({ path: "coverage.timingScope", code: "INVALID_ENUM", message: "invalid timing scope" });
  if (typeof delta.coverage?.evidenceTruncated !== "boolean" || !Number.isInteger(delta.coverage?.omittedObservationCount) || delta.coverage.omittedObservationCount < 0) errors.push({ path: "coverage", code: "INVALID_COVERAGE", message: "invalid evidence coverage" });
  const hasEvidence = (opp?.count ?? 0) + (delta.timing?.eligibleCount ?? 0) + (delta.launchTiming?.eligibleCount ?? 0) + (err?.primaryEpisodeCount ?? 0) > 0;
  if (!hasEvidence) errors.push({ path: "delta", code: "ZERO_EVIDENCE", message: "zero-evidence deltas are forbidden" });
  try {
    const bytes = new TextEncoder().encode(JSON.stringify(delta)).byteLength;
    if (bytes > 64 * 1024) errors.push({ path: "delta", code: "SERIALIZED_SIZE", message: "skill evidence delta exceeds 64 KiB" });
  } catch { errors.push({ path: "delta", code: "UNSERIALIZABLE", message: "delta is not JSON-safe" }); }
  return { valid: errors.length === 0, errors };
}

export function validatePracticeSkillEvidenceBatch(deltas, { sessionId, profileId, contextId, maxCount = 7000 } = {}) {
  const errors = [];
  if (!Array.isArray(deltas) || deltas.length > maxCount) return { valid: false, errors: [{ path: "skillEvidenceDeltas", code: "ARRAY_LIMIT", message: "skill evidence batch is invalid or oversized" }] };
  const seen = new Set();
  for (let index = 0; index < deltas.length; index += 1) {
    const delta = deltas[index];
    const validation = validatePracticeSkillEvidenceDelta(delta);
    for (const entry of validation.errors) errors.push({ ...entry, path: `skillEvidenceDeltas[${index}].${entry.path}` });
    if (seen.has(delta?.statId)) errors.push({ path: `skillEvidenceDeltas[${index}].statId`, code: "DUPLICATE", message: "duplicate statId in skill evidence batch" });
    seen.add(delta?.statId);
    if (sessionId != null && delta?.sessionId !== sessionId) errors.push({ path: `skillEvidenceDeltas[${index}].sessionId`, code: "SESSION_MISMATCH", message: "delta sessionId mismatch" });
    if (profileId != null && delta?.profileId !== profileId) errors.push({ path: `skillEvidenceDeltas[${index}].profileId`, code: "PROFILE_MISMATCH", message: "delta profileId mismatch" });
    if (contextId != null && delta?.contextId !== contextId) errors.push({ path: `skillEvidenceDeltas[${index}].contextId`, code: "CONTEXT_MISMATCH", message: "delta contextId mismatch" });
  }
  const roles = new Set(deltas.map((delta) => delta.evidenceRole));
  if (roles.size > 1) errors.push({ path: "skillEvidenceDeltas", code: "ROLE_MISMATCH", message: "PL11 v1 requires one evidence role per session" });
  return { valid: errors.length === 0, errors };
}
