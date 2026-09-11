import {
  PRACTICE_PHYSICAL_LIMITS,
  PRACTICE_PHYSICAL_SESSION_VERSION,
  PRACTICE_PHYSICAL_TELEMETRY_POLICY_VERSION,
  PRACTICE_PHYSICAL_TELEMETRY_VERSION,
} from "./practicePhysicalTelemetryConstants.js";
import { getPracticePhysicalTelemetryPersistencePolicy } from "./practicePhysicalTelemetryPolicy.js";
import {
  createPracticePhysicalTelemetryStatId,
  mergePracticePhysicalTelemetryStat,
  validatePracticePhysicalTelemetrySession,
  validatePracticePhysicalTelemetryStat,
} from "./practicePhysicalTelemetryStat.js";
import { buildPracticePhysicalTelemetrySnapshot } from "./practicePhysicalTelemetrySnapshot.js";

const DAY_MS = 86_400_000;
const nowIso = (now) => {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return date.toISOString();
};

function sessionMarker({ sessionSummary, delta, status, skipReason = null, now }) {
  const record = {
    sessionId: sessionSummary.sessionId,
    profileId: sessionSummary.profileId,
    contextId: sessionSummary.contextId,
    recordVersion: PRACTICE_PHYSICAL_SESSION_VERSION,
    telemetryVersion: PRACTICE_PHYSICAL_TELEMETRY_VERSION,
    policyVersion: PRACTICE_PHYSICAL_TELEMETRY_POLICY_VERSION,
    status,
    eligibleTextEventCount: delta?.eligibleTextEventCount ?? 0,
    validCodeEventCount: delta?.validCodeEventCount ?? 0,
    codeCoverage: delta?.codeCoverage ?? 0,
    keyEntityCount: delta?.keys?.length ?? 0,
    transitionEntityCount: delta?.transitions?.length ?? 0,
    modifierRouteCount: delta?.modifierRoutes?.length ?? 0,
    completedAt: sessionSummary.completedAtUtc ?? null,
    appliedAt: status === "applied" ? nowIso(now) : null,
    skipReason,
  };
  const validation = validatePracticePhysicalTelemetrySession(record);
  if (!validation.valid) throw new TypeError(`Physical telemetry session marker invalid: ${validation.errors.join(",")}`);
  return Object.freeze(record);
}

function capForType(type) {
  if (type === "physical-key") return PRACTICE_PHYSICAL_LIMITS.keyStatsPerContext;
  if (type === "physical-transition") return PRACTICE_PHYSICAL_LIMITS.transitionStatsPerContext;
  return PRACTICE_PHYSICAL_LIMITS.modifierStatsPerContext;
}

function choosePruned(records, type) {
  const cap = capForType(type);
  if (records.length <= cap) return [];
  if (type === "physical-key") return records.slice().sort((a, b) => Number(a.observation?.activationCount || 0) - Number(b.observation?.activationCount || 0) || String(a.lastObservedAt).localeCompare(String(b.lastObservedAt)) || a.entityKey.localeCompare(b.entityKey)).slice(0, records.length - cap);
  const measure = type === "physical-transition" ? "timingEligibleCount" : "opportunityCount";
  return records.slice().sort((a, b) => Number(a.observation?.[measure] || 0) - Number(b.observation?.[measure] || 0) || String(a.lastObservedAt).localeCompare(String(b.lastObservedAt)) || a.entityKey.localeCompare(b.entityKey)).slice(0, records.length - cap);
}

export function createPracticePhysicalTelemetryRepositoryFacade({ dataStore, now = Date.now } = {}) {
  if (!dataStore) throw new TypeError("Physical telemetry repository requires a data store");

  async function getPhysicalTelemetrySession(sessionId) {
    return dataStore.get("physicalTelemetrySessions", sessionId);
  }

  async function listPhysicalTelemetryStats(profileId, contextId = null) {
    const records = contextId
      ? await dataStore.query("physicalTelemetryStats", "contextId", contextId)
      : await dataStore.query("physicalTelemetryStats", "profileId", profileId);
    return records.filter((record) => record.profileId === profileId && (!contextId || record.contextId === contextId) && validatePracticePhysicalTelemetryStat(record).valid);
  }

  async function listPhysicalTelemetrySessions(profileId, contextId = null) {
    const records = contextId
      ? await dataStore.query("physicalTelemetrySessions", "contextId", contextId)
      : await dataStore.query("physicalTelemetrySessions", "profileId", profileId);
    return records.filter((record) => record.profileId === profileId && (!contextId || record.contextId === contextId) && validatePracticePhysicalTelemetrySession(record).valid);
  }

  async function applyPhysicalTelemetrySession({ sessionSummary, delta, settings, context, evidenceRole, contentPlan }) {
    const existing = await getPhysicalTelemetrySession(sessionSummary.sessionId);
    if (existing?.status === "applied") return Object.freeze({ applied: false, idempotent: true, marker: existing });
    const policy = getPracticePhysicalTelemetryPersistencePolicy({
      settings,
      inputMethod: context?.inputMethod,
      sessionStatus: sessionSummary.status,
      eligibleTextEventCount: delta?.eligibleTextEventCount,
      validCodeEventCount: delta?.validCodeEventCount,
      evidenceRole,
      contentPlan,
    });
    const privacyOrGateFailure = policy.reasons.some((reason) => ["telemetry-disabled", "context-not-physical", "session-not-completed", "role-not-eligible"].includes(reason) || reason.startsWith("excluded-role:") || reason.startsWith("excluded-partition:"));
    if (privacyOrGateFailure) return Object.freeze({ applied: false, skipped: true, marker: null, policy });
    if (!policy.eligible) {
      const marker = sessionMarker({ sessionSummary, delta, status: "insufficient", skipReason: policy.reasons.join(","), now });
      await dataStore.put("physicalTelemetrySessions", marker);
      return Object.freeze({ applied: false, insufficient: true, marker, policy });
    }

    const timestamp = nowIso(now);
    const allDeltas = [...(delta.keys || []), ...(delta.transitions || []), ...(delta.modifierRoutes || [])];
    const marker = await dataStore.runTransaction(["physicalTelemetryStats", "physicalTelemetrySessions"], "readwrite", async (tx) => {
      const duplicate = await tx.get("physicalTelemetrySessions", sessionSummary.sessionId);
      if (duplicate?.status === "applied") return duplicate;
      for (const item of allDeltas) {
        const id = createPracticePhysicalTelemetryStatId(sessionSummary.profileId, sessionSummary.contextId, item.entityType, item.entityKey);
        const prior = await tx.get("physicalTelemetryStats", id);
        const merged = mergePracticePhysicalTelemetryStat(prior, { profileId: sessionSummary.profileId, contextId: sessionSummary.contextId, entityType: item.entityType, entityKey: item.entityKey, delta: item, nowUtc: timestamp });
        if (!validatePracticePhysicalTelemetryStat(merged).valid) throw new TypeError("Physical telemetry stat merge failed validation");
        await tx.put("physicalTelemetryStats", merged);
      }
      const contextStats = await tx.query("physicalTelemetryStats", "contextId", sessionSummary.contextId);
      for (const type of ["physical-key", "physical-transition", "modifier-route"]) {
        const same = contextStats.filter((record) => record.profileId === sessionSummary.profileId && record.entityType === type);
        for (const record of choosePruned(same, type)) await tx.delete("physicalTelemetryStats", record.physicalTelemetryStatId);
      }
      const appliedMarker = sessionMarker({ sessionSummary, delta, status: "applied", now });
      await tx.put("physicalTelemetrySessions", appliedMarker);
      return appliedMarker;
    });
    await prunePhysicalTelemetry(sessionSummary.profileId).catch(() => null);
    return Object.freeze({ applied: marker.status === "applied", idempotent: marker !== null && marker.appliedAt !== timestamp, marker, policy });
  }

  async function prunePhysicalTelemetry(profileId) {
    const current = Date.parse(nowIso(now));
    const sessions = await dataStore.query("physicalTelemetrySessions", "profileId", profileId);
    const ordered = sessions.filter((item) => item.profileId === profileId).sort((a, b) => String(a.completedAt ?? a.appliedAt ?? "").localeCompare(String(b.completedAt ?? b.appliedAt ?? "")) || a.sessionId.localeCompare(b.sessionId));
    const remove = new Set(ordered.filter((item) => {
      const reference = Date.parse(item.completedAt ?? item.appliedAt ?? "");
      return Number.isFinite(reference) && current - reference > PRACTICE_PHYSICAL_LIMITS.sessionMarkerRetentionDays * DAY_MS;
    }).map((item) => item.sessionId));
    const survivors = ordered.filter((item) => !remove.has(item.sessionId));
    const excess = Math.max(0, survivors.length - PRACTICE_PHYSICAL_LIMITS.sessionMarkersPerProfile);
    survivors.slice(0, excess).forEach((item) => remove.add(item.sessionId));
    for (const id of remove) await dataStore.delete("physicalTelemetrySessions", id);
    return Object.freeze({ deletedSessionIds: Object.freeze([...remove]) });
  }

  async function clearPhysicalTelemetry(profileId, { contextId = null } = {}) {
    const stats = await listPhysicalTelemetryStats(profileId, contextId);
    const sessions = await listPhysicalTelemetrySessions(profileId, contextId);
    await dataStore.runTransaction(["physicalTelemetryStats", "physicalTelemetrySessions"], "readwrite", async (tx) => {
      for (const record of stats) await tx.delete("physicalTelemetryStats", record.physicalTelemetryStatId);
      for (const record of sessions) await tx.delete("physicalTelemetrySessions", record.sessionId);
    });
    return Object.freeze({ deletedStats: stats.length, deletedSessions: sessions.length });
  }

  async function getPhysicalTelemetrySnapshot(profileId, contextId) {
    const [stats, sessions] = await Promise.all([listPhysicalTelemetryStats(profileId, contextId), listPhysicalTelemetrySessions(profileId, contextId)]);
    return buildPracticePhysicalTelemetrySnapshot({ stats, sessions });
  }

  return Object.freeze({ getPhysicalTelemetrySession, listPhysicalTelemetryStats, listPhysicalTelemetrySessions, applyPhysicalTelemetrySession, prunePhysicalTelemetry, clearPhysicalTelemetry, getPhysicalTelemetrySnapshot });
}

export async function applyPracticePhysicalTelemetrySidecar({ repository, ...input } = {}) {
  try {
    return await repository.applyPhysicalTelemetrySession(input);
  } catch (cause) {
    return Object.freeze({ applied: false, failed: true, error: cause });
  }
}
