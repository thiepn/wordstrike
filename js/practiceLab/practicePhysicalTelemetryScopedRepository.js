import { createPracticePhysicalTelemetryRepositoryFacade } from "./practicePhysicalTelemetryService.js";
import { validatePracticePhysicalTelemetryStat } from "./practicePhysicalTelemetryStat.js";

function scopeViolation() {
  const error = new TypeError("Physical telemetry record is outside the active Practice profile/context");
  error.code = "PRACTICE_PHYSICAL_TELEMETRY_SCOPE_VIOLATION";
  return error;
}

export function createScopedPracticePhysicalTelemetryRepository({
  dataStore,
  now = Date.now,
  scopeProvider,
} = {}) {
  if (!dataStore) throw new TypeError("Scoped physical telemetry repository requires a data store");
  if (typeof scopeProvider !== "function") throw new TypeError("Scoped physical telemetry repository requires an active scope provider");
  const base = createPracticePhysicalTelemetryRepositoryFacade({ dataStore, now });

  async function activeScope() {
    const active = await scopeProvider();
    if (!active?.profileId) throw scopeViolation();
    return Object.freeze({ profileId: active.profileId, contextId: active.contextId ?? null });
  }

  function matches(record, scope, { contextRequired = true } = {}) {
    return Boolean(record
      && record.profileId === scope.profileId
      && (!contextRequired || !scope.contextId || record.contextId === scope.contextId));
  }

  async function assertRequested(profileId, contextId = null, { contextRequired = true } = {}) {
    const scope = await activeScope();
    if (profileId && profileId !== scope.profileId) throw scopeViolation();
    if (contextRequired && contextId && scope.contextId && contextId !== scope.contextId) throw scopeViolation();
    return scope;
  }

  async function getPhysicalTelemetrySession(sessionId) {
    const scope = await activeScope();
    const record = await base.getPhysicalTelemetrySession(sessionId);
    return matches(record, scope) ? record : null;
  }

  async function getPhysicalTelemetryStat(physicalTelemetryStatId) {
    const scope = await activeScope();
    const record = await dataStore.get("physicalTelemetryStats", physicalTelemetryStatId);
    return record && validatePracticePhysicalTelemetryStat(record).valid && matches(record, scope) ? record : null;
  }

  async function listPhysicalTelemetryStats(profileId, contextId = null) {
    const scope = await assertRequested(profileId, contextId, { contextRequired: contextId != null });
    const records = await base.listPhysicalTelemetryStats(scope.profileId, contextId);
    return records.filter((record) => matches(record, scope, { contextRequired: contextId != null }));
  }

  async function listPhysicalTelemetrySessions(profileId, contextId = null) {
    const scope = await assertRequested(profileId, contextId, { contextRequired: contextId != null });
    const records = await base.listPhysicalTelemetrySessions(scope.profileId, contextId);
    return records.filter((record) => matches(record, scope, { contextRequired: contextId != null }));
  }

  async function applyPhysicalTelemetrySession(input) {
    const scope = await activeScope();
    const summary = input?.sessionSummary;
    if (!matches(summary, scope)) throw scopeViolation();
    return base.applyPhysicalTelemetrySession(input);
  }

  async function prunePhysicalTelemetry(profileId) {
    const scope = await assertRequested(profileId, null, { contextRequired: false });
    return base.prunePhysicalTelemetry(scope.profileId);
  }

  async function clearPhysicalTelemetry(profileId, { contextId = null } = {}) {
    const scope = await assertRequested(profileId, contextId, { contextRequired: contextId != null });
    return base.clearPhysicalTelemetry(scope.profileId, { contextId });
  }

  async function getPhysicalTelemetrySnapshot(profileId, contextId) {
    const scope = await assertRequested(profileId, contextId);
    return base.getPhysicalTelemetrySnapshot(scope.profileId, contextId ?? scope.contextId);
  }

  return Object.freeze({
    getPhysicalTelemetrySession,
    getPhysicalTelemetryStat,
    listPhysicalTelemetryStats,
    listPhysicalTelemetrySessions,
    applyPhysicalTelemetrySession,
    prunePhysicalTelemetry,
    clearPhysicalTelemetry,
    getPhysicalTelemetrySnapshot,
  });
}
