import {
  PRACTICE_LIMITS,
} from "./practiceConstants.js";
import { createPracticeSessionId } from "./practiceIds.js";
import {
  applyPracticeCorrection,
  applyPracticeInsertion,
  createPracticeTypingState,
  rebuildCompletedPracticeUnits,
} from "./practiceInputEngine.js";
import { createPracticeMetricsCollector } from "./practiceMetrics.js";
import { createPracticeEventBuffer } from "./practiceEventBuffer.js";
import { buildPracticeFoundationAnalysis, withPracticeAbilityAnalysis } from "./practiceFoundationAnalysis.js";
import { buildPracticeAbilityObservation } from "./practiceAbilityObservation.js";
import { createPracticeErrorTracker } from "./practiceErrorTracker.js";
import { createPracticeSessionContextSnapshot } from "./practiceContextFeatures.js";
import { resolvePracticeEvidenceRole } from "./practiceEvidenceRole.js";
import { createPracticeSkillEvidenceTracker } from "./practiceSkillEvidenceCollector.js";
import {
  buildPracticeCheckpoint,
  validatePracticeCheckpointRestore,
} from "./practiceCheckpoint.js";
import {
  buildPracticeProfileUpdate,
  buildPracticeSessionResult,
} from "./practiceSessionResult.js";
import {
  PRACTICE_EVENT_TRACE_VERSION,
  PRACTICE_SESSION_ERROR_CODES,
  PRACTICE_SESSION_LIMITS,
  PRACTICE_SESSION_STATES,
  PRACTICE_SESSION_TRANSITIONS,
} from "./practiceSessionConstants.js";
import {
  appendPracticeContentPlan,
  createPracticeSegmenter,
  practiceSessionError,
  validatePracticeContentPlan,
  validatePracticeExperimentDescriptor,
  validatePracticeNormalizedInput,
  validatePracticeSessionConfiguration,
} from "./practiceSessionContract.js";
import {
  getPracticeTimeContext,
  toPracticeUtcIso,
} from "./practiceTime.js";
import {
  clonePracticeValue,
} from "./practiceStorageContract.js";
import { validatePracticeSerializable } from "./practiceValidation.js";
import { hasMeaningfulAbandonedActivity } from "./practiceRetention.js";

const defaultScheduler = Object.freeze({
  setTimeout(callback, delay) { return globalThis.setTimeout(callback, delay); },
  clearTimeout(id) { globalThis.clearTimeout(id); },
});

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const completionReasonForMode = (mode) => ({
  content: "content-complete",
  duration: "time-complete",
  "word-count": "word-target-complete",
  manual: "manual-stop",
})[mode] || "manual-stop";

export function createPracticeSessionEngine({
  repository,
  sessionId = createPracticeSessionId(),
  profileId,
  contextId,
  clock = () => globalThis.performance?.now?.() ?? Date.now(),
  wallClock = () => new Date(),
  scheduler = defaultScheduler,
  logger = null,
  checkpointPolicy = {},
  segmenter = null,
} = {}) {
  if (!repository || typeof repository.commitCompletedPracticeSession !== "function") throw new TypeError("Practice engine requires a repository");
  if (typeof profileId !== "string") throw new TypeError("Practice engine requires a profileId");
  if (typeof contextId !== "string") throw new TypeError("Practice engine requires a resolved contextId");
  const segment = createPracticeSegmenter(segmenter);
  const checkpointIntervalMs = checkpointPolicy.minimumIntervalMs ?? PRACTICE_SESSION_LIMITS.checkpointIntervalMs;
  const checkpointCharacterThreshold = checkpointPolicy.characterThreshold ?? PRACTICE_SESSION_LIMITS.checkpointCharacterThreshold;

  let lifecycleState = "created";
  let experiment = null;
  let configuration = null;
  let contentPlan = null;
  let typingState = null;
  let metrics = createPracticeMetricsCollector();
  let errorTracker = createPracticeErrorTracker();
  let normalizationContext = null;
  let skillEvidenceTracker = null;
  let evidenceRole = "unclassified";
  const eventBuffer = createPracticeEventBuffer({ capacity: checkpointPolicy.eventCapacity ?? PRACTICE_SESSION_LIMITS.eventBuffer });
  const subscribers = new Set();
  let snapshotVersion = 0;
  let pauseReason = null;
  let visibilityState = "visible";
  let createdAtUtc = toPracticeUtcIso(wallClock);
  let startedAtUtc = null;
  let completedAtUtc = null;
  let sessionTimeContext = null;
  let startMono = null;
  let performanceTimingStarted = false;
  let activeIntervalStart = null;
  let accumulatedActiveMs = 0;
  let pauseIntervalStart = null;
  let accumulatedPausedMs = 0;
  let dirtyCheckpoint = false;
  let acceptedSinceCheckpoint = 0;
  let lastCheckpointMono = null;
  let checkpointTimer = null;
  let checkpointWrite = null;
  let checkpointWriteCount = 0;
  let finalizationPromise = null;
  let finalResult = null;
  let preparedFinalResult = null;
  let finalizationState = "idle";
  let lastErrorCode = null;
  let destroyed = false;
  let timingSegmentId = 1;
  let timingSegmentStartReason = "session-start";
  let hasInsertionInTimingSegment = false;

  const nowMono = () => Math.max(0, Number(clock()) || 0);
  const wallDate = () => {
    const value = typeof wallClock === "function" ? wallClock() : wallClock;
    return value instanceof Date ? new Date(value.getTime()) : new Date(value);
  };
  const wallIso = () => wallDate().toISOString();

  const activeAt = (at = nowMono()) => accumulatedActiveMs + (
    lifecycleState === "active" && performanceTimingStarted && activeIntervalStart != null
      ? Math.max(0, at - activeIntervalStart)
      : 0
  );
  const pausedAt = (at = nowMono()) => accumulatedPausedMs + (
    lifecycleState === "paused" && pauseIntervalStart != null
      ? Math.max(0, at - pauseIntervalStart)
      : 0
  );
  const wallDuration = () => startedAtUtc ? Math.max(0, wallDate().getTime() - Date.parse(startedAtUtc)) : 0;

  const metricsSnapshot = () => metrics.snapshot({
    activeDurationMs: activeAt(),
    pausedDurationMs: pausedAt(),
    wallDurationMs: wallDuration(),
    finalTypedEntries: typingState?.typed || [],
  });

  const immutableSnapshot = () => {
    const typing = typingState?.snapshot({ windowSize: PRACTICE_SESSION_LIMITS.snapshotTypedWindow });
    const typedValues = typing?.typedGraphemes || [];
    const value = {
      snapshotVersion,
      lifecycleState,
      sessionId,
      profileId,
      contextId,
      experimentId: experiment?.id ?? null,
      experimentVersion: experiment?.version ?? null,
      timing: {
        performanceTimingStarted,
        activeDurationMs: activeAt(),
        pausedDurationMs: pausedAt(),
        wallDurationMs: wallDuration(),
        firstInputTimestamp: typing?.firstInputTimestamp ?? null,
        lastAcceptedInputTimestamp: typing?.lastAcceptedInputTimestamp ?? null,
        timingSegmentId,
      },
      content: contentPlan ? {
        contentId: contentPlan.contentId,
        contentHash: contentPlan.contentHash,
        completion: contentPlan.completion,
        expectedLength: typingState.expectedGraphemes.length,
        unitCount: contentPlan.units.length,
      } : null,
      typedLength: typingState?.typed.length ?? 0,
      cursorIndex: typing?.cursorIndex ?? 0,
      typedBufferWindow: typedValues.join(""),
      typedBufferWindowStart: typing?.typedWindowStart ?? 0,
      currentUnitId: typing?.currentUnitId ?? null,
      completedUnitCount: typing?.completedUnitIds.length ?? 0,
      errorPositions: typing?.errorPositions ?? Object.freeze([]),
      metrics: metricsSnapshot(),
      checkpoint: {
        dirty: dirtyCheckpoint,
        pending: checkpointTimer != null || checkpointWrite != null,
        writeCount: checkpointWriteCount,
        lastCheckpointMonotonicMs: lastCheckpointMono,
      },
      completion: {
        state: finalizationState,
        completedAtUtc,
        hasResult: Boolean(finalResult),
      },
      pauseReason,
      visibilityState,
    };
    return freezeDeep(value);
  };

  const emit = (event) => {
    snapshotVersion += 1;
    const snapshot = immutableSnapshot();
    for (const listener of [...subscribers]) {
      try { listener(snapshot, event); } catch (cause) { logger?.warn?.("Practice subscriber failed", { event, cause }); }
    }
    return snapshot;
  };

  const sessionError = (code, message, operation, recoverable = false, cause = null, details = null) => {
    lastErrorCode = code;
    return practiceSessionError(code, message, {
      operation,
      sessionId,
      lifecycleState,
      recoverable,
      cause,
      details,
    });
  };

  const transition = (nextState, operation) => {
    if (nextState === lifecycleState) return false;
    if (!PRACTICE_SESSION_TRANSITIONS[lifecycleState]?.includes(nextState)) throw sessionError(
      PRACTICE_SESSION_ERROR_CODES.INVALID_STATE,
      `Cannot transition Practice session from ${lifecycleState} to ${nextState}`,
      operation,
    );
    lifecycleState = nextState;
    return true;
  };

  const freezeActiveTiming = (at = nowMono()) => {
    if (performanceTimingStarted && activeIntervalStart != null) {
      accumulatedActiveMs += Math.max(0, at - activeIntervalStart);
      activeIntervalStart = null;
    }
  };

  const clearCheckpointTimer = () => {
    if (checkpointTimer != null) scheduler.clearTimeout(checkpointTimer);
    checkpointTimer = null;
  };

  const canCheckpoint = () => Boolean(
    experiment?.resumable
    && contentPlan
    && !destroyed
    && !["created", "completed", "abandoned", "destroyed"].includes(lifecycleState)
    && (typingState?.typed.length || activeAt() > 0),
  );

  const scheduleCheckpoint = () => {
    if (!canCheckpoint() || checkpointTimer != null || !dirtyCheckpoint || finalizationState === "finalizing") return false;
    const base = lastCheckpointMono ?? startMono ?? nowMono();
    const delay = Math.max(0, base + checkpointIntervalMs - nowMono());
    checkpointTimer = scheduler.setTimeout(() => {
      checkpointTimer = null;
      void flushCheckpoint("scheduled");
    }, delay);
    return true;
  };

  const markDirty = (acceptedInsertion = false) => {
    dirtyCheckpoint = true;
    if (acceptedInsertion) acceptedSinceCheckpoint += 1;
    if (acceptedSinceCheckpoint >= checkpointCharacterThreshold || acceptedInsertion) scheduleCheckpoint();
  };

  const flushCheckpoint = async (reason = "manual", { force = true } = {}) => {
    if (!canCheckpoint()) return { saved: false, reason: "checkpoint-not-applicable" };
    if (!dirtyCheckpoint && !force) return { saved: false, reason: "checkpoint-clean" };
    clearCheckpointTimer();
    if (checkpointWrite) {
      await checkpointWrite;
      if (!dirtyCheckpoint) return { saved: false, reason: "checkpoint-coalesced" };
    }
    const writeVersion = snapshotVersion;
    const checkpoint = buildPracticeCheckpoint({
      profileId,
      contextId,
      sessionId,
      experiment,
      configuration,
      contentPlan,
      typingSnapshot: typingState.snapshot(),
      metricsSnapshot: metrics.checkpointSnapshot(),
      recentInputTail: eventBuffer.getTail(PRACTICE_SESSION_LIMITS.checkpointRecentEvents),
      eventTraceMetadata: eventBuffer.getMetadata(),
      errorTrackerSnapshot: errorTracker.checkpointSnapshot({ contentHash: contentPlan.contentHash, cursorIndex: typingState.cursorIndex }),
      skillEvidenceTrackerSnapshot: skillEvidenceTracker?.checkpointSnapshot() ?? null,
      startedAtUtc,
      sessionTimeContext,
      activeElapsedMs: activeAt(),
      pausedElapsedMs: pausedAt(),
      phase: lifecycleState,
      reason,
      wallClock,
    });
    checkpointWrite = (async () => {
      try {
        await repository.saveActiveCheckpoint(checkpoint);
        if (snapshotVersion === writeVersion) {
          dirtyCheckpoint = false;
          acceptedSinceCheckpoint = 0;
        }
        lastCheckpointMono = nowMono();
        checkpointWriteCount += 1;
        emit("checkpointed");
        return { saved: true, checkpoint };
      } catch (cause) {
        const error = sessionError(PRACTICE_SESSION_ERROR_CODES.CHECKPOINT_FAILED, "Practice checkpoint write failed", "checkpoint", true, cause);
        emit("error");
        return { saved: false, reason: "checkpoint-failed", error };
      } finally {
        checkpointWrite = null;
        if (dirtyCheckpoint && lifecycleState === "active") scheduleCheckpoint();
      }
    })();
    return checkpointWrite;
  };

  const evaluateCompletion = () => {
    if (!contentPlan || finalizationState !== "idle") return null;
    const mode = contentPlan.completion.mode;
    if (mode === "content" && typingState.cursorIndex >= typingState.expectedGraphemes.length) return completionReasonForMode(mode);
    if (mode === "duration" && activeAt() >= contentPlan.completion.value) return completionReasonForMode(mode);
    if (mode === "word-count" && metricsSnapshot().completedWords >= contentPlan.completion.value) return completionReasonForMode(mode);
    if (typeof experiment?.shouldComplete === "function") {
      try {
        if (experiment.shouldComplete({ snapshot: immutableSnapshot() })) return completionReasonForMode(mode);
      } catch (cause) {
        lastErrorCode = PRACTICE_SESSION_ERROR_CODES.INVALID_CONFIGURATION;
        logger?.warn?.("Practice shouldComplete failed", { cause });
      }
    }
    return null;
  };

  const prepare = async ({ experiment: nextExperiment, configuration: nextConfiguration = {}, contentPlan: nextContentPlan }) => {
    if (destroyed) throw sessionError(PRACTICE_SESSION_ERROR_CODES.DESTROYED, "Practice session is destroyed", "prepare");
    if (lifecycleState !== "created") throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Practice session is already prepared", "prepare");
    const experimentValidation = validatePracticeExperimentDescriptor(nextExperiment);
    if (!experimentValidation.valid) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONFIGURATION, "Invalid Practice experiment descriptor", "prepare", false, null, experimentValidation.errors);
    const configurationValidation = validatePracticeSessionConfiguration(nextConfiguration);
    if (!configurationValidation.valid || (nextExperiment.validateConfiguration && nextExperiment.validateConfiguration(nextConfiguration) === false)) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONFIGURATION, "Invalid Practice session configuration", "prepare", false, null, configurationValidation.errors);
    const contentValidation = validatePracticeContentPlan(nextContentPlan, { segmenter });
    if (!contentValidation.valid || !nextExperiment.supportedCompletionModes.includes(nextContentPlan.completion.mode) || (nextExperiment.validateContentPlan && nextExperiment.validateContentPlan(nextContentPlan) === false)) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONTENT, "Invalid Practice content plan", "prepare", false, null, contentValidation.errors);
    let resolvedContext;
    try {
      if (typeof repository.getPracticeContext !== "function") throw new Error("repository does not expose getPracticeContext");
      resolvedContext = await repository.getPracticeContext(contextId);
      normalizationContext = createPracticeSessionContextSnapshot(resolvedContext, { profileId, contextId });
    } catch (cause) {
      throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONFIGURATION, "Practice normalization context could not be resolved", "prepare-context", true, cause);
    }
    experiment = nextExperiment;
    configuration = freezeDeep(clonePracticeValue(nextConfiguration));
    contentPlan = nextContentPlan;
    evidenceRole = resolvePracticeEvidenceRole({ contentPlan, context: normalizationContext });
    skillEvidenceTracker = createPracticeSkillEvidenceTracker({
      sessionId,
      profileId,
      contextId,
      contentPlan,
      context: normalizationContext,
      evidenceRole,
      segmenter,
    });
    typingState = createPracticeTypingState(contentPlan, { segmenter });
    transition("ready", "prepare");
    emit("prepared");
    return immutableSnapshot();
  };

  const start = async () => {
    if (lifecycleState === "active") return immutableSnapshot();
    if (lifecycleState !== "ready") throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Practice session is not ready", "start");
    const at = nowMono();
    startMono = at;
    startedAtUtc = wallIso();
    sessionTimeContext = getPracticeTimeContext(wallDate());
    transition("active", "start");
    if ((configuration.timingMode ?? "on-first-input") === "on-start") {
      performanceTimingStarted = true;
      activeIntervalStart = at;
    }
    emit("started");
    return immutableSnapshot();
  };

  const handleInput = (rawInput) => {
    if (destroyed) return { accepted: false, stateChanged: false, reason: "destroyed", sessionCompleted: false, snapshotVersion };
    if (finalizationState === "finalizing") return { accepted: false, stateChanged: false, reason: "already-completed", sessionCompleted: true, snapshotVersion };
    if (lifecycleState !== "active") return { accepted: false, stateChanged: false, reason: lifecycleState === "completed" ? "already-completed" : "session-not-active", sessionCompleted: false, snapshotVersion };
    let input = rawInput;
    try {
      if (typeof experiment.transformInput === "function") input = experiment.transformInput(freezeDeep(clonePracticeValue(rawInput))) ?? rawInput;
    } catch {
      return { accepted: false, stateChanged: false, reason: "invalid-input", sessionCompleted: false, snapshotVersion };
    }
    const validation = validatePracticeNormalizedInput(input, { segmenter });
    if (!validation.valid) return { accepted: false, stateChanged: false, reason: "invalid-input", errors: validation.errors, sessionCompleted: false, snapshotVersion };
    const isInsertion = input.type === "character" || input.type === "space";
    let outcome;
    const activeMs = activeAt(input.monotonicTimestampMs);
    if (isInsertion) {
      const cursorBefore = typingState.cursorIndex;
      const value = input.type === "space" ? " " : input.value;
      outcome = applyPracticeInsertion(typingState, contentPlan, value, activeMs);
      if (outcome.accepted) {
        if (!performanceTimingStarted) {
          performanceTimingStarted = true;
          activeIntervalStart = input.monotonicTimestampMs;
        }
        const unit = contentPlan.units.find((candidate) => candidate.unitId === outcome.unitId) || null;
        const latency = metrics.recordInsertion({
          ...outcome, value, correct: outcome.correctness === "correct",
          expectedGraphemes: typingState.expectedGraphemes, monotonicMs: input.monotonicTimestampMs,
          activeMs, performanceStartMono: startMono, unit,
        });
        for (const unitId of outcome.completedUnitIds) {
          const completedUnit = contentPlan.units.find((candidate) => candidate.unitId === unitId);
          if (completedUnit) metrics.recordUnitCompletion(completedUnit, typingState.typed, activeMs);
        }
        const isFirstAttempt = skillEvidenceTracker.recordInsertion({ position: outcome.position, correctness: outcome.correctness });
        const errorEvent = {
          eventIndex: eventBuffer.totalEventCount + 1, eventTraceVersion: PRACTICE_EVENT_TRACE_VERSION,
          timingSegmentId, timingSegmentStartReason: hasInsertionInTimingSegment ? null : timingSegmentStartReason,
          type: input.type, entered: value, expected: outcome.expected, textPosition: outcome.position,
          cursorBefore, cursorAfter: typingState.cursorIndex, unitId: outcome.unitId, correctness: outcome.correctness,
          correctedLater: false, monotonicTimestampMs: input.monotonicTimestampMs, relativeActiveTimestampMs: activeMs,
          latencyFromPriorInsertionMs: latency, source: input.source, targetEntityMatches: [], isFirstAttempt,
        };
        eventBuffer.push(errorEvent);
        errorTracker.consume(errorEvent);
        for (const episode of errorTracker.drainClosedEpisodes()) skillEvidenceTracker.recordClosedEpisode(episode);
        hasInsertionInTimingSegment = true;
        markDirty(true);
      }
    } else {
      const correctionPolicy = configuration.correctionBehavior ?? experiment.defaultCorrectionBehavior;
      const cursorBefore = typingState.cursorIndex;
      outcome = applyPracticeCorrection(typingState, input.type, correctionPolicy, activeMs);
      if (correctionPolicy !== "disabled") metrics.recordCorrection({ type: input.type, policy: correctionPolicy, removed: outcome.removed, activeMs });
      if (outcome.stateChanged) { rebuildCompletedPracticeUnits(typingState, contentPlan); markDirty(false); }
      const removed = Array.isArray(outcome.removed) ? outcome.removed : [];
      const removedIncorrectCount = removed.filter((entry) => !entry.correct).length;
      const removedCorrectCount = removed.filter((entry) => entry.correct).length;
      const errorEvent = {
        eventIndex: eventBuffer.totalEventCount + 1, eventTraceVersion: PRACTICE_EVENT_TRACE_VERSION, timingSegmentId,
        timingSegmentStartReason: null, type: input.type, entered: "", expected: null, textPosition: typingState.cursorIndex,
        cursorBefore, cursorAfter: typingState.cursorIndex, removedCount: removed.length, removedIncorrectCount, removedCorrectCount,
        removedStartPosition: removed.length ? typingState.cursorIndex : null, correctionPolicy, accepted: outcome.accepted,
        stateChanged: outcome.stateChanged, unitId: typingState.currentUnit?.unitId ?? null, correctness: null, correctedLater: false,
        monotonicTimestampMs: input.monotonicTimestampMs, relativeActiveTimestampMs: activeMs, latencyFromPriorInsertionMs: null,
        source: input.source, targetEntityMatches: [], isFirstAttempt: null,
      };
      eventBuffer.push(errorEvent);
      errorTracker.consume(errorEvent);
      for (const episode of errorTracker.drainClosedEpisodes()) skillEvidenceTracker.recordClosedEpisode(episode);
    }
    const completionReason = outcome.accepted ? evaluateCompletion() : null;
    const snapshot = emit("input");
    if (completionReason) queueMicrotask(() => { void complete(completionReason); });
    return { ...outcome, sessionCompleted: Boolean(completionReason), snapshotVersion: snapshot.snapshotVersion };
  };

  const pause = async (reason = "manual") => {
    if (finalizationState === "finalizing") {
      await finalizationPromise;
      return immutableSnapshot();
    }
    if (lifecycleState === "paused") return immutableSnapshot();
    if (lifecycleState !== "active") throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Only an active Practice session can pause", "pause");
    const at = nowMono();
    errorTracker.markTimingBoundary();
    freezeActiveTiming(at);
    transition("paused", "pause");
    pauseIntervalStart = at;
    pauseReason = reason;
    emit("paused");
    await flushCheckpoint(reason, { force: true });
    return immutableSnapshot();
  };

  const resume = async () => {
    if (lifecycleState === "active") return immutableSnapshot();
    if (lifecycleState !== "paused") throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Only a paused Practice session can resume", "resume");
    if (checkpointWrite) await checkpointWrite;
    const at = nowMono();
    if (pauseIntervalStart != null) accumulatedPausedMs += Math.max(0, at - pauseIntervalStart);
    pauseIntervalStart = null;
    const restoring = pauseReason === "restored";
    transition("active", "resume");
    if (!restoring) {
      timingSegmentId += 1;
      timingSegmentStartReason = "resume";
      hasInsertionInTimingSegment = false;
    } else {
      timingSegmentStartReason = "restore";
      hasInsertionInTimingSegment = false;
    }
    if (performanceTimingStarted) activeIntervalStart = at;
    pauseReason = null;
    emit("resumed");
    if (dirtyCheckpoint) scheduleCheckpoint();
    return immutableSnapshot();
  };

  const handleVisibilityState = async (nextVisibility) => {
    if (!["hidden", "visible"].includes(nextVisibility)) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONFIGURATION, "Invalid visibility state", "visibility");
    visibilityState = nextVisibility;
    if (nextVisibility === "hidden" && lifecycleState === "active") return pause("visibility-hidden");
    return immutableSnapshot();
  };

  const appendContent = (addition) => {
    if (!["ready", "active", "paused"].includes(lifecycleState)) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Content cannot be appended in this state", "append-content");
    const next = appendPracticeContentPlan(contentPlan, addition, { segmenter });
    contentPlan = next;
    typingState.setContentPlan(next);
    skillEvidenceTracker?.setContentPlan(next);
    markDirty(false);
    emit("content-appended");
    const reason = evaluateCompletion();
    if (reason) queueMicrotask(() => { void complete(reason); });
    return immutableSnapshot();
  };

  const tick = async () => {
    if (lifecycleState !== "active") return { completed: false, snapshot: immutableSnapshot() };
    const reason = evaluateCompletion();
    if (!reason) return { completed: false, snapshot: immutableSnapshot() };
    return { completed: true, result: await complete(reason) };
  };

  const analyzeFoundation = ({ status, observedAt }) => {
    try {
      for (const episode of errorTracker.drainClosedEpisodes()) skillEvidenceTracker.recordClosedEpisode(episode);
      const activeEpisode = errorTracker.previewActiveEpisode();
      if (activeEpisode) skillEvidenceTracker.recordClosedEpisode(activeEpisode);
      return buildPracticeFoundationAnalysis({
        events: eventBuffer.getTrace(),
        traceMetadata: eventBuffer.getMetadata(),
        errorTrackerSnapshot: errorTracker.finalizeSnapshot(),
        contentPlan,
        context: normalizationContext,
        segmenter,
        skillEvidenceTracker,
        skillEvidenceFinalize: {
          status,
          observedAt,
          localDayKey: sessionTimeContext?.localDayKey ?? getPracticeTimeContext(wallDate()).localDayKey,
        },
      });
    } catch (cause) {
      throw sessionError(PRACTICE_SESSION_ERROR_CODES.ANALYSIS_FAILED, "Practice foundation analysis failed", "foundation-analysis", true, cause);
    }
  };

  const analyze = async (foundationAnalysis) => {
    if (typeof experiment.analyzeResult !== "function") return null;
    try {
      const output = await experiment.analyzeResult(freezeDeep({
        sessionSnapshot: immutableSnapshot(),
        metricsSnapshot: metricsSnapshot(),
        eventTrace: eventBuffer.getTrace(),
        observations: metrics.observations(),
        foundationAnalysis,
      }));
      const validation = validatePracticeSerializable(output, {
        path: "analysis",
        maxBytes: PRACTICE_SESSION_LIMITS.analysisBytes,
      });
      if (!validation.valid) throw new Error("Analysis output is not valid");
      return output;
    } catch (cause) {
      throw sessionError(PRACTICE_SESSION_ERROR_CODES.ANALYSIS_FAILED, "Practice experiment analysis failed", "analyze", true, cause);
    }
  };

  const finalize = async ({ status, reason, countCompleted }) => {
    if (finalResult) return finalResult;
    finalizationState = "finalizing";
    clearCheckpointTimer();
    const previousState = lifecycleState;
    if (previousState === "active") freezeActiveTiming(nowMono());
    if (previousState === "paused" && pauseIntervalStart != null) {
      accumulatedPausedMs += Math.max(0, nowMono() - pauseIntervalStart);
      pauseIntervalStart = null;
    }
    if (checkpointWrite) await checkpointWrite;
    let foundationAnalysis;
    let analysis;
    completedAtUtc = wallIso();
    try {
      foundationAnalysis = analyzeFoundation({ status, observedAt: completedAtUtc });
      const abilityMetrics = metricsSnapshot();
      const abilityAssessment = buildPracticeAbilityObservation({
        session: {
          sessionId, profileId, contextId, status, completionReason: reason, completedAtUtc,
          localDayKey: sessionTimeContext?.localDayKey ?? getPracticeTimeContext(wallDate()).localDayKey,
          wpm: abilityMetrics.wpm, rawWpm: abilityMetrics.rawWpm, accuracy: abilityMetrics.accuracy,
          activeDurationMs: abilityMetrics.activeDurationMs, typedCharacterCount: abilityMetrics.acceptedInsertions,
          configuration: { ...configuration, correctionBehavior: configuration.correctionBehavior ?? experiment.defaultCorrectionBehavior },
        },
        experiment, foundationAnalysis, contentPlan, evidenceRole,
      });
      foundationAnalysis = withPracticeAbilityAnalysis(foundationAnalysis, abilityAssessment);
      analysis = await analyze(foundationAnalysis);
    } catch (error) {
      finalizationState = "error";
      completedAtUtc = null;
      lastErrorCode = error.code;
      if (lifecycleState === "active") {
        transition("paused", "analysis-failed");
        pauseIntervalStart = nowMono();
        pauseReason = "analysis-failed";
      }
      dirtyCheckpoint = true;
      await flushCheckpoint("analysis-failed", { force: true });
      throw error;
    }
    const finalMetrics = metricsSnapshot();
    preparedFinalResult = buildPracticeSessionResult({
      sessionId,
      profileId,
      contextId,
      experiment,
      configuration,
      contentPlan,
      status,
      completionReason: reason,
      createdAt: createdAtUtc,
      startedAtUtc: startedAtUtc ?? createdAtUtc,
      completedAtUtc,
      timeContext: sessionTimeContext ?? getPracticeTimeContext(wallDate()),
      metrics: finalMetrics,
      targetEntities: contentPlan.targetEntities,
      foundationAnalysis,
      analysis,
    });
    const currentProfile = await repository.getPracticeProfile();
    const updatedProfile = buildPracticeProfileUpdate(currentProfile, preparedFinalResult, { completed: countCompleted });
    try {
      const committed = await repository.commitCompletedPracticeSession({
        sessionSummary: preparedFinalResult,
        skillEvidenceDeltas: foundationAnalysis.skills?.deltas ?? [],
        abilityObservation: foundationAnalysis.ability?.observation ?? null,
        reviewItemChanges: analysis?.reviewItemChanges ?? [],
        updatedProfileSummary: updatedProfile,
        clearCheckpoint: true,
      });
      finalResult = Object.freeze({ summary: preparedFinalResult, commit: committed });
      finalizationState = "committed";
      transition(status === "completed" ? "completed" : "abandoned", "finalize");
      dirtyCheckpoint = false;
      emit(status === "completed" ? "completed" : "abandoned");
      return finalResult;
    } catch (cause) {
      finalizationState = "error";
      if (lifecycleState === "active") {
        transition("paused", "commit-failed");
        pauseIntervalStart = nowMono();
        pauseReason = "commit-failed";
      }
      dirtyCheckpoint = true;
      await flushCheckpoint("commit-failed", { force: true });
      throw sessionError(PRACTICE_SESSION_ERROR_CODES.COMMIT_FAILED, "Practice session commit failed", "complete", true, cause);
    }
  };

  function complete(reason = completionReasonForMode(contentPlan?.completion?.mode)) {
    if (finalResult) return Promise.resolve(finalResult);
    if (finalizationPromise) return finalizationPromise;
    if (!["active", "paused"].includes(lifecycleState)) return Promise.reject(sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Practice session cannot complete in this state", "complete"));
    finalizationPromise = finalize({ status: "completed", reason, countCompleted: true })
      .finally(() => {
        if (!finalResult) finalizationPromise = null;
      });
    return finalizationPromise;
  }

  const abandon = async (reason = "manual-stop") => {
    if (lifecycleState === "abandoned") return finalResult ?? { persisted: false };
    if (!["ready", "active", "paused"].includes(lifecycleState)) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Practice session cannot be abandoned in this state", "abandon");
    if (lifecycleState === "active") freezeActiveTiming(nowMono());
    const meaningful = hasMeaningfulAbandonedActivity({
      typedCharacterCount: metricsSnapshot().acceptedInsertions,
      activeDurationMs: activeAt(),
    });
    clearCheckpointTimer();
    if (!meaningful) {
      if (checkpointWrite) await checkpointWrite;
      await repository.clearActiveCheckpoint(profileId);
      transition("abandoned", "abandon");
      dirtyCheckpoint = false;
      emit("abandoned");
      return { persisted: false, meaningful: false };
    }
    if (finalizationPromise) return finalizationPromise;
    finalizationPromise = finalize({ status: "abandoned", reason, countCompleted: false })
      .finally(() => {
        if (!finalResult) finalizationPromise = null;
      });
    return finalizationPromise;
  };

  const interrupt = async (reason = "runtime-error") => {
    if (finalizationState === "finalizing") {
      try {
        await finalizationPromise;
        return immutableSnapshot();
      } catch {
        // A recoverable completion failure leaves the session paused and interruptible.
      }
    }
    if (lifecycleState === "interrupted") return immutableSnapshot();
    if (!["active", "paused"].includes(lifecycleState)) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Practice session cannot be interrupted in this state", "interrupt");
    if (lifecycleState === "active") freezeActiveTiming(nowMono());
    if (lifecycleState === "paused" && pauseIntervalStart != null) {
      accumulatedPausedMs += Math.max(0, nowMono() - pauseIntervalStart);
      pauseIntervalStart = null;
    }
    transition("interrupted", "interrupt");
    pauseReason = reason;
    dirtyCheckpoint = true;
    emit("interrupted");
    await flushCheckpoint(reason, { force: true });
    return immutableSnapshot();
  };

  const destroy = async () => {
    if (destroyed) return { destroyed: true, repeated: true };
    if (finalizationState === "finalizing") {
      try { await finalizationPromise; } catch {}
    }
    const warning = ["active", "paused"].includes(lifecycleState)
      ? sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_STATE, "Destroying a non-terminal session; interrupt first to preserve recovery state", "destroy", true)
      : null;
    clearCheckpointTimer();
    if (checkpointWrite) await checkpointWrite;
    transition("destroyed", "destroy");
    destroyed = true;
    emit("destroyed");
    subscribers.clear();
    eventBuffer.clear();
    typingState = null;
    contentPlan = null;
    normalizationContext = null;
    skillEvidenceTracker = null;
    experiment = null;
    configuration = null;
    return { destroyed: true, repeated: false, warning };
  };

  const internalRestore = async (checkpoint, nextExperiment, restoredContentPlan) => {
    await prepare({ experiment: nextExperiment, configuration: checkpoint.configuration, contentPlan: restoredContentPlan });
    const values = segment(checkpoint.typedBuffer);
    for (const value of values) {
      const position = typingState.typed.length;
      const expected = typingState.expectedGraphemes[position];
      typingState.typed.push({ value, expected, correct: value === expected, insertedAt: 0, unitId: typingState.currentUnit?.unitId ?? null });
    }
    rebuildCompletedPracticeUnits(typingState, contentPlan);
    metrics = createPracticeMetricsCollector(checkpoint.metricsSnapshot);
    const restoredIncorrectCount = typingState.typed.filter((entry) => !entry.correct).length;
    const trackerSeed = checkpoint.metricsSnapshot?.errorTrackerSnapshot ?? null;
    const trackerSeedValid = trackerSeed && trackerSeed.contentHash === checkpoint.contentHash && trackerSeed.cursorAtSnapshot === typingState.cursorIndex;
    try {
      errorTracker = trackerSeedValid
        ? createPracticeErrorTracker({ seed: trackerSeed })
        : createPracticeErrorTracker({ aggregateScope: "post-restore", initialIncorrectCount: restoredIncorrectCount });
    } catch {
      errorTracker = createPracticeErrorTracker({ aggregateScope: "post-restore", initialIncorrectCount: restoredIncorrectCount });
    }
    errorTracker.markTimingBoundary();
    const skillSeed = checkpoint.metricsSnapshot?.skillEvidenceTrackerSnapshot ?? null;
    skillEvidenceTracker = createPracticeSkillEvidenceTracker({
      sessionId,
      profileId,
      contextId,
      contentPlan,
      context: normalizationContext,
      evidenceRole,
      segmenter,
      seed: skillSeed,
      initialCursor: typingState.cursorIndex,
      historicalRestore: !skillSeed,
    });
    const restoredTail = (checkpoint.metricsSnapshot?.recentInputTail || []).map((event) => {
      const insertion = event?.type === "character" || event?.type === "space";
      const fallbackBefore = Number.isInteger(event?.textPosition) ? event.textPosition : 0;
      const fallbackAfter = insertion ? fallbackBefore + 1 : fallbackBefore;
      return {
        ...event,
        eventTraceVersion: Number.isInteger(event?.eventTraceVersion) ? event.eventTraceVersion : 1,
        timingSegmentId: Number.isInteger(event?.timingSegmentId) ? event.timingSegmentId : 0,
        timingSegmentStartReason: event?.timingSegmentStartReason ?? null,
        cursorBefore: Number.isInteger(event?.cursorBefore) ? event.cursorBefore : fallbackBefore,
        cursorAfter: Number.isInteger(event?.cursorAfter) ? event.cursorAfter : fallbackAfter,
        removedCount: Number.isInteger(event?.removedCount) ? event.removedCount : 0,
        removedIncorrectCount: Number.isInteger(event?.removedIncorrectCount) ? event.removedIncorrectCount : 0,
        removedCorrectCount: Number.isInteger(event?.removedCorrectCount) ? event.removedCorrectCount : 0,
      };
    });
    const restoredMetadata = checkpoint.metricsSnapshot?.eventTraceMetadata ?? {
      totalEventCount: restoredTail.length,
      truncated: restoredTail.length > 0,
    };
    eventBuffer.restore(restoredTail, restoredMetadata);
    timingSegmentId = restoredTail.reduce((max, event) => Math.max(max, Number.isInteger(event.timingSegmentId) ? event.timingSegmentId : 0), 0) + 1;
    timingSegmentStartReason = "restore";
    hasInsertionInTimingSegment = false;
    accumulatedActiveMs = checkpoint.activeElapsedMs;
    accumulatedPausedMs = checkpoint.pausedElapsedMs;
    performanceTimingStarted = values.length > 0 || accumulatedActiveMs > 0;
    startedAtUtc = checkpoint.metricsSnapshot?.sessionStartedAtUtc ?? checkpoint.createdAt;
    sessionTimeContext = checkpoint.metricsSnapshot?.sessionTimeContext ?? getPracticeTimeContext(startedAtUtc);
    lifecycleState = "paused";
    pauseReason = "restored";
    lastCheckpointMono = nowMono();
    dirtyCheckpoint = false;
    emit("restored");
    return immutableSnapshot();
  };

  const api = Object.freeze({
    prepare,
    start,
    handleInput,
    pause,
    resume,
    handleVisibilityState,
    appendContent,
    tick,
    flushCheckpoint,
    complete,
    abandon,
    interrupt,
    destroy,
    getSnapshot: immutableSnapshot,
    getMetricsSnapshot: metricsSnapshot,
    getEventTrace: () => eventBuffer.getTrace(),
    getObservations: () => metrics.observations(),
    getDiagnostics: () => Object.freeze({
      sessionId,
      profileId,
      contextId,
      lifecycleState,
      snapshotVersion,
      eventCount: eventBuffer.totalEventCount,
      retainedEventCount: eventBuffer.size,
      eventTraceTruncated: eventBuffer.truncated,
      eventTraceMetadata: eventBuffer.getMetadata(),
      timingSegmentId,
      errorEpisodeCount: errorTracker.getSnapshot().errorEpisodeCount,
      activeErrorEpisode: Boolean(errorTracker.activeEpisode),
      normalizationContextFingerprint: normalizationContext?.fingerprint ?? null,
      evidenceRole,
      skillEvidence: skillEvidenceTracker?.getSnapshot() ?? null,
      activeDurationMs: activeAt(),
      checkpointPending: checkpointTimer != null || checkpointWrite != null,
      lastCheckpointMonotonicMs: lastCheckpointMono,
      checkpointWriteCount,
      contentLength: typingState?.expectedGraphemes.length ?? 0,
      cursorPosition: typingState?.cursorIndex ?? 0,
      subscriberCount: subscribers.size,
      finalizationState,
      lastErrorCode,
    }),
    subscribe(listener) {
      if (typeof listener !== "function") throw new TypeError("Practice subscriber must be a function");
      if (destroyed) return () => {};
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },
    _restore: internalRestore,
  });
  return api;
}

export async function restorePracticeSessionEngine({
  checkpoint,
  experimentDescriptor,
  repository,
  clock,
  wallClock,
  scheduler,
  logger,
  checkpointPolicy,
  segmenter,
} = {}) {
  const validation = validatePracticeCheckpointRestore({
    checkpoint,
    experiment: experimentDescriptor,
    profileId: checkpoint?.profileId,
    contextId: checkpoint?.contextId,
    wallClock,
    segmenter,
  });
  if (!validation.valid) throw practiceSessionError(
    PRACTICE_SESSION_ERROR_CODES.RESTORE_FAILED,
    "Practice checkpoint cannot be restored",
    { operation: "restore", sessionId: checkpoint?.sessionId ?? null, lifecycleState: "created", recoverable: true, details: validation.errors },
  );
  try {
    const context = await repository.getPracticeContext(checkpoint.contextId);
    if (!context || context.profileId !== checkpoint.profileId) throw new Error("checkpoint context is missing or belongs to another profile");
  } catch (cause) {
    throw practiceSessionError(
      PRACTICE_SESSION_ERROR_CODES.RESTORE_FAILED,
      "Practice checkpoint context cannot be resolved",
      { operation: "restore", sessionId: checkpoint?.sessionId ?? null, lifecycleState: "created", recoverable: true, cause },
    );
  }
  const existing = await repository.getSessionSummary(checkpoint.sessionId);
  if (existing) return Object.freeze({ alreadyCompleted: true, summary: existing, engine: null });
  const engine = createPracticeSessionEngine({
    repository,
    sessionId: checkpoint.sessionId,
    profileId: checkpoint.profileId,
    contextId: checkpoint.contextId,
    clock,
    wallClock,
    scheduler,
    logger,
    checkpointPolicy,
    segmenter,
  });
  await engine._restore(checkpoint, experimentDescriptor, validation.contentPlan);
  return engine;
}
