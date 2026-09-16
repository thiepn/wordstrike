import { createPracticePhysicalModifierTracker } from "./practicePhysicalModifierTracker.js";
import { normalizePracticePhysicalKeyEvent } from "./practicePhysicalTelemetryEvent.js";
import { createPracticePhysicalTelemetryAccumulator } from "./practicePhysicalTelemetryAccumulator.js";
import { getPracticePhysicalTelemetryRuntimeEligibility } from "./practicePhysicalTelemetryPolicy.js";
import { applyPracticePhysicalTelemetrySidecar } from "./practicePhysicalTelemetryService.js";
import { resolvePracticeEvidenceRole } from "./practiceEvidenceRole.js";

let activeRuntime = null;

function isInsertion(input) { return input?.type === "character" || input?.type === "space"; }
function isCorrection(input) { return input?.type === "backspace" || input?.type === "word-delete"; }

export function observePracticePhysicalTelemetryKeyDown(event) {
  return activeRuntime?.observeKeyDown?.(event) ?? false;
}

function wallIso(wallClock) {
  const value = typeof wallClock === "function" ? wallClock() : wallClock;
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return date.toISOString();
}

export function createPracticePhysicalTelemetryRuntime({
  repository,
  telemetryRepository = repository,
  profileId,
  contextId,
  sessionId,
  wallClock = () => new Date(),
  clock = () => globalThis.performance?.now?.() ?? Date.now(),
  documentObject = globalThis.document,
  logger = null,
} = {}) {
  const modifierTracker = createPracticePhysicalModifierTracker();
  const accumulator = createPracticePhysicalTelemetryAccumulator();
  let prepared = null;
  let runtimeEligibility = Object.freeze({ eligible: false, reasons: Object.freeze(["not-prepared"]) });
  let pendingPhysicalEvent = null;
  let started = false;
  let lastInputEvent = null;
  let seenPositions = new Set();
  let completionPayload = null;

  function resetTransient() {
    pendingPhysicalEvent = null;
    modifierTracker.reset();
    accumulator.resetTimingContinuity();
    lastInputEvent = null;
  }

  function visibilityReset() {
    if (documentObject?.visibilityState === "hidden") resetTransient();
  }
  function blurReset() { resetTransient(); }
  function keyUp(event) { modifierTracker.observeKeyUp(event); }

  async function prepare({ contentPlan, evidenceRole = null } = {}) {
    const initialized = await repository.initializePracticeStorage();
    const context = initialized.context?.contextId === contextId ? initialized.context : await repository.getPracticeContext?.(contextId);
    const settings = initialized.manifest?.settings ?? {};
    const role = evidenceRole ?? resolvePracticeEvidenceRole({ contentPlan, context });
    runtimeEligibility = getPracticePhysicalTelemetryRuntimeEligibility({ settings, context, evidenceRole: role, contentPlan });
    prepared = Object.freeze({ contentPlan, evidenceRole: role, context, settings });
    return runtimeEligibility;
  }

  function start() {
    if (started) return runtimeEligibility;
    started = true;
    resetTransient();
    seenPositions = new Set();
    if (runtimeEligibility.eligible) {
      activeRuntime = api;
      documentObject?.addEventListener?.("keyup", keyUp, true);
      globalThis.addEventListener?.("blur", blurReset, true);
      documentObject?.addEventListener?.("visibilitychange", visibilityReset, true);
    }
    return runtimeEligibility;
  }

  function stop() {
    if (!started) return;
    if (activeRuntime === api) activeRuntime = null;
    documentObject?.removeEventListener?.("keyup", keyUp, true);
    globalThis.removeEventListener?.("blur", blurReset, true);
    documentObject?.removeEventListener?.("visibilitychange", visibilityReset, true);
    resetTransient();
    started = false;
  }

  function observeKeyDown(event) {
    if (!started || !runtimeEligibility.eligible) return false;
    modifierTracker.observeKeyDown(event);
    // Preserve only one transient browser event for the immediately following canonical text insertion.
    // Modifier-only keydowns update tracker state but never become text telemetry.
    if (modifierTracker.isModifierCode(event?.code)) return false;
    pendingPhysicalEvent = normalizePracticePhysicalKeyEvent(event, modifierTracker, clock());
    return true;
  }

  function observeCanonicalInput(rawInput, outcome, snapshot = null) {
    if (!started || !runtimeEligibility.eligible) return false;
    if (isCorrection(rawInput)) {
      accumulator.recordCorrection();
      pendingPhysicalEvent = null;
      lastInputEvent = null;
      return false;
    }
    if (!isInsertion(rawInput) || outcome?.accepted !== true) {
      pendingPhysicalEvent = null;
      return false;
    }
    const position = Number.isInteger(outcome.position) ? outcome.position : null;
    const isFirstAttempt = position != null && !seenPositions.has(position);
    if (position != null) seenPositions.add(position);
    const timingSegmentId = snapshot?.timing?.timingSegmentId ?? 1;
    const activeTimestamp = Number(rawInput.monotonicTimestampMs) || 0;
    const priorTimestamp = lastInputEvent?.monotonicTimestampMs;
    const latency = Number.isFinite(priorTimestamp) ? Math.max(0, activeTimestamp - priorTimestamp) : null;
    const canonicalEvent = Object.freeze({
      type: rawInput.type,
      correctness: outcome.correctness,
      isFirstAttempt,
      timingSegmentId,
      timingSegmentStartReason: lastInputEvent == null || lastInputEvent.timingSegmentId !== timingSegmentId ? "timing-boundary" : null,
      latencyFromPriorInsertionMs: latency,
    });
    const processedInput = Object.freeze({
      type: rawInput.type,
      value: rawInput.type === "space" ? " " : rawInput.value,
      expected: outcome.expected,
      accepted: true,
      correctness: outcome.correctness,
      position,
      isFirstAttempt,
      primaryErrorOrigin: isFirstAttempt && outcome.correctness !== "correct",
      timingSegmentId,
      timingSegmentStartReason: canonicalEvent.timingSegmentStartReason,
      latencyFromPriorInsertionMs: latency,
      event: canonicalEvent,
    });
    accumulator.recordProcessedInput({ physicalEvent: pendingPhysicalEvent, processedInput });
    pendingPhysicalEvent = null;
    lastInputEvent = { monotonicTimestampMs: activeTimestamp, timingSegmentId };
    return true;
  }

  function resetTimingContinuity() {
    accumulator.resetTimingContinuity();
    lastInputEvent = null;
  }

  function getDelta() { return accumulator.snapshotDelta(); }

  async function afterCanonicalCommit({ sessionSummary, contentPlan = prepared?.contentPlan } = {}) {
    completionPayload = { sessionSummary, contentPlan };
    if (!runtimeEligibility.eligible) return Object.freeze({ applied: false, skipped: true, reason: runtimeEligibility.reasons?.[0] ?? "not-eligible" });
    const result = await applyPracticePhysicalTelemetrySidecar({
      repository: telemetryRepository,
      sessionSummary,
      delta: accumulator.snapshotDelta(),
      settings: prepared.settings,
      context: prepared.context,
      evidenceRole: prepared.evidenceRole,
      contentPlan,
    });
    if (result.failed) logger?.warn?.("Physical telemetry sidecar failed after canonical Practice commit", { sessionId, cause: result.error });
    return result;
  }

  function getDiagnostics() {
    return Object.freeze({ sessionId, profileId, contextId, started, eligibility: runtimeEligibility, delta: accumulator.snapshotDelta(), completedAt: completionPayload?.sessionSummary?.completedAtUtc ?? null, now: wallIso(wallClock) });
  }

  const api = Object.freeze({ prepare, start, stop, observeKeyDown, observeCanonicalInput, resetTimingContinuity, afterCanonicalCommit, getDelta, getDiagnostics });
  return api;
}
