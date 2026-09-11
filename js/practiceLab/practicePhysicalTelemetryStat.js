import { hashPracticeContent } from "./practiceIds.js";
import {
  PRACTICE_PHYSICAL_ENTITY_TYPES,
  PRACTICE_PHYSICAL_LIMITS,
  PRACTICE_PHYSICAL_SESSION_STATUSES,
  PRACTICE_PHYSICAL_SESSION_VERSION,
  PRACTICE_PHYSICAL_STAT_VERSION,
  PRACTICE_PHYSICAL_TELEMETRY_POLICY_VERSION,
  PRACTICE_PHYSICAL_TELEMETRY_VERSION,
} from "./practicePhysicalTelemetryConstants.js";
import { isPracticePhysicalTextCode } from "./practicePhysicalCodeMap.js";
import { parsePracticePhysicalModifierRouteKey } from "./practicePhysicalTelemetryEvent.js";

const iso = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const nonNegativeInt = (value) => Number.isInteger(value) && value >= 0;
const count = (value) => Math.max(0, Number.isInteger(value) ? value : 0);
const finiteSamples = (values) => (Array.isArray(values) ? values : []).filter(Number.isFinite).map(Number);
const ring = (left, right) => [...finiteSamples(left), ...finiteSamples(right)].slice(-PRACTICE_PHYSICAL_LIMITS.recentSamplesPerEntity);
const byteSize = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function createPracticePhysicalTelemetryStatId(profileId, contextId, entityType, entityKey, telemetryVersion = PRACTICE_PHYSICAL_TELEMETRY_VERSION) {
  const digest = hashPracticeContent(JSON.stringify([profileId, contextId, telemetryVersion, entityType, entityKey]));
  return `practice-physical-stat_${digest}`;
}

export function validatePracticePhysicalEntityKey(entityType, entityKey) {
  if (entityType === "physical-key") return isPracticePhysicalTextCode(entityKey);
  if (entityType === "physical-transition") {
    const parts = String(entityKey ?? "").split(">");
    return parts.length === 2 && isPracticePhysicalTextCode(parts[0]) && isPracticePhysicalTextCode(parts[1]);
  }
  if (entityType === "modifier-route") return Boolean(parsePracticePhysicalModifierRouteKey(entityKey));
  return false;
}

export function mergePracticePhysicalTelemetryStat(existing, { profileId, contextId, entityType, entityKey, delta, nowUtc } = {}) {
  if (!PRACTICE_PHYSICAL_ENTITY_TYPES.includes(entityType) || !validatePracticePhysicalEntityKey(entityType, entityKey)) throw new TypeError("Invalid physical telemetry entity");
  const timestamp = iso(nowUtc) ? nowUtc : new Date().toISOString();
  const base = existing && existing.entityType === entityType && existing.entityKey === entityKey ? existing : null;
  const prior = base?.observation ?? {};
  const observation = entityType === "physical-key" ? {
    activationCount: count(prior.activationCount) + count(delta.activationCount),
    firstPassActivationCount: count(prior.firstPassActivationCount) + count(delta.firstPassActivationCount),
    firstPassCorrectActivationCount: count(prior.firstPassCorrectActivationCount) + count(delta.firstPassCorrectActivationCount),
    firstPassErrorOriginCount: count(prior.firstPassErrorOriginCount) + count(delta.firstPassErrorOriginCount),
    timingEligibleCount: count(prior.timingEligibleCount) + count(delta.timingEligibleCount),
    fluentCount: count(prior.fluentCount) + count(delta.fluentCount),
    disfluentCount: count(prior.disfluentCount) + count(delta.disfluentCount),
    distinctSessionCount: count(prior.distinctSessionCount) + 1,
  } : entityType === "physical-transition" ? {
    timingEligibleCount: count(prior.timingEligibleCount) + count(delta.timingEligibleCount),
    fluentCount: count(prior.fluentCount) + count(delta.fluentCount),
    disfluentCount: count(prior.disfluentCount) + count(delta.disfluentCount),
    distinctSessionCount: count(prior.distinctSessionCount) + 1,
  } : {
    opportunityCount: count(prior.opportunityCount) + count(delta.opportunityCount),
    timingEligibleCount: count(prior.timingEligibleCount) + count(delta.timingEligibleCount),
    distinctSessionCount: count(prior.distinctSessionCount) + 1,
  };
  return Object.freeze({
    physicalTelemetryStatId: base?.physicalTelemetryStatId ?? createPracticePhysicalTelemetryStatId(profileId, contextId, entityType, entityKey),
    profileId,
    contextId,
    recordVersion: PRACTICE_PHYSICAL_STAT_VERSION,
    telemetryVersion: PRACTICE_PHYSICAL_TELEMETRY_VERSION,
    policyVersion: PRACTICE_PHYSICAL_TELEMETRY_POLICY_VERSION,
    entityType,
    entityKey,
    observation: Object.freeze(observation),
    timing: Object.freeze({ normalization: "PL10-residual-when-available", eligibilityOwnedBy: "PL8" }),
    recent: Object.freeze({ residualMs: Object.freeze(ring(base?.recent?.residualMs, delta.residualSamples)), fluentLatencyMs: Object.freeze(ring(base?.recent?.fluentLatencyMs, delta.fluentLatencySamples)) }),
    createdAt: base?.createdAt ?? timestamp,
    updatedAt: timestamp,
    lastObservedAt: timestamp,
  });
}

export function validatePracticePhysicalTelemetryStat(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) errors.push("record");
  else {
    if (record.recordVersion !== PRACTICE_PHYSICAL_STAT_VERSION) errors.push("recordVersion");
    if (record.telemetryVersion !== PRACTICE_PHYSICAL_TELEMETRY_VERSION) errors.push("telemetryVersion");
    if (!PRACTICE_PHYSICAL_ENTITY_TYPES.includes(record.entityType) || !validatePracticePhysicalEntityKey(record.entityType, record.entityKey)) errors.push("entity");
    if (typeof record.profileId !== "string" || typeof record.contextId !== "string") errors.push("identity");
    if (typeof record.physicalTelemetryStatId !== "string" || !record.physicalTelemetryStatId.startsWith("practice-physical-stat_")) errors.push("id");
    if (!iso(record.createdAt) || !iso(record.updatedAt) || !iso(record.lastObservedAt)) errors.push("timestamps");
    if (byteSize(record) > PRACTICE_PHYSICAL_LIMITS.maxStatBytes) errors.push("size");
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

export function validatePracticePhysicalTelemetrySession(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) errors.push("record");
  else {
    if (record.recordVersion !== PRACTICE_PHYSICAL_SESSION_VERSION) errors.push("recordVersion");
    if (record.telemetryVersion !== PRACTICE_PHYSICAL_TELEMETRY_VERSION) errors.push("telemetryVersion");
    if (!PRACTICE_PHYSICAL_SESSION_STATUSES.includes(record.status)) errors.push("status");
    if (!["sessionId", "profileId", "contextId"].every((key) => typeof record[key] === "string" && record[key])) errors.push("identity");
    if (!["eligibleTextEventCount", "validCodeEventCount", "keyEntityCount", "transitionEntityCount", "modifierRouteCount"].every((key) => nonNegativeInt(record[key]))) errors.push("counts");
    if (!Number.isFinite(record.codeCoverage) || record.codeCoverage < 0 || record.codeCoverage > 1) errors.push("coverage");
  }
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}
