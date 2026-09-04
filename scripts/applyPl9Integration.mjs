import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing patch anchor in ${path}: ${before.slice(0, 120)}`);
  fs.writeFileSync(path, source.replace(before, after));
}

function replaceAllExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing patch anchor in ${path}: ${before.slice(0, 120)}`);
  fs.writeFileSync(path, source.split(before).join(after));
}

replaceExact(
  "js/practiceLab/practiceConstants.js",
  "  sessionSummary: 3,",
  "  sessionSummary: 4,",
);

replaceExact(
  "js/practiceLab/practiceDefaults.js",
  "    fluencySummary: null,\n    beforeMetrics: null,",
  "    fluencySummary: null,\n    errorSummary: null,\n    beforeMetrics: null,",
);

replaceExact(
  "js/practiceLab/practiceSessionConstants.js",
  "export const PRACTICE_EVENT_TRACE_VERSION = 2;",
  "export const PRACTICE_EVENT_TRACE_VERSION = 3;",
);

replaceExact(
  "js/practiceLab/practiceMigrations.js",
  `    2: (value) => ({\n      ...value,\n      recordVersion: 3,\n      fluencySummary: null,\n    }),\n  }),`,
  `    2: (value) => ({\n      ...value,\n      recordVersion: 3,\n      fluencySummary: null,\n    }),\n    3: (value) => ({\n      ...value,\n      recordVersion: 4,\n      errorSummary: null,\n    }),\n  }),`,
);

replaceExact(
  "js/practiceLab/practiceMigrations.js",
  `  if (type === "sessionSummary" && version <= 2) return {\n    ...value,\n    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,\n    contextId: version === 1 ? createDefaultPracticeContextId(value.profileId) : value.contextId,\n    fluencySummary: null,\n  };`,
  `  if (type === "sessionSummary" && version <= 3) return {\n    ...value,\n    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,\n    contextId: version === 1 ? createDefaultPracticeContextId(value.profileId) : value.contextId,\n    fluencySummary: version <= 2 ? null : value.fluencySummary ?? null,\n    errorSummary: null,\n  };`,
);

fs.writeFileSync("js/practiceLab/practiceFoundationAnalysis.js", `import {\n  analyzePracticeLatency,\n  PRACTICE_LATENCY_POLICY_V1,\n} from "./practiceLatencyClassifier.js";\nimport { analyzePracticeErrors } from "./practiceErrorAnalyzer.js";\nimport { createPracticeErrorTracker } from "./practiceErrorTracker.js";\nimport {\n  PRACTICE_ERROR_POLICY_V1,\n} from "./practiceErrorPolicy.js";\n\nexport const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 2;\n\nconst freezeDeep = (value) => {\n  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;\n  Object.values(value).forEach(freezeDeep);\n  return Object.freeze(value);\n};\n\nfunction normalizeFallbackEvent(event, cursor) {\n  if (!event || typeof event !== "object") return null;\n  const insertion = event.type === "character" || event.type === "space";\n  const correction = event.type === "backspace" || event.type === "word-delete";\n  if (!insertion && !correction) return null;\n  if (insertion) {\n    const cursorBefore = Number.isInteger(event.cursorBefore)\n      ? event.cursorBefore\n      : Number.isInteger(event.textPosition) ? event.textPosition : cursor;\n    return { ...event, cursorBefore, cursorAfter: Number.isInteger(event.cursorAfter) ? event.cursorAfter : cursorBefore + 1 };\n  }\n  const cursorAfter = Number.isInteger(event.cursorAfter) ? event.cursorAfter : cursor;\n  const cursorBefore = Number.isInteger(event.cursorBefore) ? event.cursorBefore : cursorAfter;\n  return {\n    ...event,\n    cursorBefore,\n    cursorAfter,\n    removedCount: Number.isInteger(event.removedCount) ? event.removedCount : Math.max(0, cursorBefore - cursorAfter),\n    removedIncorrectCount: Number.isInteger(event.removedIncorrectCount) ? event.removedIncorrectCount : 0,\n    removedCorrectCount: Number.isInteger(event.removedCorrectCount) ? event.removedCorrectCount : 0,\n    correctionPolicy: event.correctionPolicy ?? "allow",\n  };\n}\n\nfunction buildFallbackTrackerSnapshot(events, traceMetadata, policy) {\n  const tracker = createPracticeErrorTracker({\n    policy,\n    aggregateScope: traceMetadata?.truncated ? "retained-window" : "complete-session",\n  });\n  let cursor = 0;\n  for (const source of events) {\n    const event = normalizeFallbackEvent(source, cursor);\n    if (!event) continue;\n    try {\n      tracker.consume(event);\n      cursor = event.cursorAfter;\n    } catch {\n      // Historical/synthetic PL8 traces can lack correction cursor data.\n      // The fallback remains bounded and degraded; live PL9 sessions always supply streaming state.\n    }\n  }\n  return tracker.finalizeSnapshot();\n}\n\nexport function buildPracticeFoundationAnalysis({\n  events = [],\n  traceMetadata = {},\n  latencyPolicy = PRACTICE_LATENCY_POLICY_V1,\n  errorPolicy = PRACTICE_ERROR_POLICY_V1,\n  errorTrackerSnapshot = null,\n} = {}) {\n  const latency = analyzePracticeLatency({ events, traceMetadata, policy: latencyPolicy });\n  const trackerSnapshot = errorTrackerSnapshot ?? buildFallbackTrackerSnapshot(events, traceMetadata, errorPolicy);\n  const errors = analyzePracticeErrors({\n    events,\n    traceMetadata,\n    trackerSnapshot,\n    latencyAnalysis: latency,\n    policy: errorPolicy,\n  });\n  return freezeDeep({\n    version: PRACTICE_FOUNDATION_ANALYSIS_VERSION,\n    latency,\n    errors,\n  });\n}\n`);

replaceExact(
  "js/practiceLab/practiceCheckpoint.js",
  "  eventTraceMetadata = null,\n  startedAtUtc = null,",
  "  eventTraceMetadata = null,\n  errorTrackerSnapshot = null,\n  startedAtUtc = null,",
);
replaceExact(
  "js/practiceLab/practiceCheckpoint.js",
  "        eventTraceMetadata,\n      },",
  "        eventTraceMetadata,\n        errorTrackerSnapshot,\n      },",
);

replaceExact(
  "js/practiceLab/practiceSessionResult.js",
  "      fluencySummary: foundationAnalysis?.latency?.sessionSummary ?? null,\n      beforeMetrics: analysis?.beforeMetrics ?? null,",
  "      fluencySummary: foundationAnalysis?.latency?.sessionSummary ?? null,\n      errorSummary: foundationAnalysis?.errors?.sessionSummary ?? null,\n      beforeMetrics: analysis?.beforeMetrics ?? null,",
);

replaceExact(
  "js/practiceLab/practiceValidation.js",
  `import {\n  PRACTICE_LATENCY_ANALYSIS_VERSION,\n  PRACTICE_LATENCY_CALIBRATION_STATUSES,\n  PRACTICE_LATENCY_CLASSIFIER_VERSION,\n  PRACTICE_LATENCY_CONFIDENCE_LEVELS,\n  PRACTICE_LATENCY_POLICY_V1,\n  PRACTICE_LATENCY_TRACE_SCOPES,\n} from "./practiceLatencyClassifier.js";`,
  `import {\n  PRACTICE_LATENCY_ANALYSIS_VERSION,\n  PRACTICE_LATENCY_CALIBRATION_STATUSES,\n  PRACTICE_LATENCY_CLASSIFIER_VERSION,\n  PRACTICE_LATENCY_CONFIDENCE_LEVELS,\n  PRACTICE_LATENCY_POLICY_V1,\n  PRACTICE_LATENCY_TRACE_SCOPES,\n} from "./practiceLatencyClassifier.js";\nimport {\n  PRACTICE_ERROR_AGGREGATE_SCOPES,\n  PRACTICE_ERROR_ANALYSIS_VERSION,\n  PRACTICE_ERROR_ANALYZER_VERSION,\n  PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION,\n  PRACTICE_ERROR_CONTENT_CLASSES,\n  PRACTICE_ERROR_STRUCTURAL_CLASSES,\n  PRACTICE_ERROR_SUMMARY_CONFIDENCE,\n  PRACTICE_ERROR_TRACE_SCOPES,\n  PRACTICE_RECOVERY_POLICY_VERSION,\n} from "./practiceErrorPolicy.js";`,
);

replaceExact(
  "js/practiceLab/practiceValidation.js",
  `const FORBIDDEN_SESSION_FIELDS = Object.freeze([\n  "rawEvents", "eventTrace", "rawEventTrace", "leaderboardEligible",\n  "submissionPayload", "accessToken", "boardKey", "rulesVersion",\n]);`,
  `const FORBIDDEN_SESSION_FIELDS = Object.freeze([\n  "rawEvents", "eventTrace", "rawEventTrace", "classifiedEventTrace",\n  "errorEpisodeHistory", "mistypedStrings", "rawLatencies", "leaderboardEligible",\n  "submissionPayload", "accessToken", "boardKey", "rulesVersion",\n]);`,
);

replaceExact(
  "js/practiceLab/practiceValidation.js",
  "export function validateSessionSummary(summary) {",
  `export function validatePracticeErrorSummary(summary) {\n  const errors = [];\n  if (!isPlainObject(summary)) return result([{ path: "errorSummary", code: "INVALID_TYPE", message: "errorSummary must be an object" }]);\n  validateVersion(errors, summary.analysisVersion, PRACTICE_ERROR_ANALYSIS_VERSION, "analysisVersion");\n  validateVersion(errors, summary.errorAnalyzerVersion, PRACTICE_ERROR_ANALYZER_VERSION, "errorAnalyzerVersion");\n  validateVersion(errors, summary.alignmentPolicyVersion, PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION, "alignmentPolicyVersion");\n  validateVersion(errors, summary.recoveryPolicyVersion, PRACTICE_RECOVERY_POLICY_VERSION, "recoveryPolicyVersion");\n\n  if (!isPlainObject(summary.coverage)) error(errors, "coverage", "INVALID_TYPE", "coverage must be an object");\n  else {\n    oneOf(errors, summary.coverage.aggregateScope, "coverage.aggregateScope", PRACTICE_ERROR_AGGREGATE_SCOPES);\n    oneOf(errors, summary.coverage.traceScope, "coverage.traceScope", PRACTICE_ERROR_TRACE_SCOPES);\n    for (const key of ["retainedEventCount", "totalEventCount", "activeEpisodeTruncatedCount"]) finite(errors, summary.coverage[key], \`coverage.\${key}\`, { min: 0, integer: true });\n    if (typeof summary.coverage.traceTruncated !== "boolean") error(errors, "coverage.traceTruncated", "INVALID_TYPE", "traceTruncated must be boolean");\n    if (Number.isFinite(summary.coverage.retainedEventCount) && Number.isFinite(summary.coverage.totalEventCount) && summary.coverage.retainedEventCount > summary.coverage.totalEventCount) error(errors, "coverage.retainedEventCount", "IMPOSSIBLE_RELATIONSHIP", "retainedEventCount exceeds totalEventCount");\n    if (summary.coverage.traceTruncated && summary.coverage.traceScope !== "retained-window") error(errors, "coverage.traceScope", "IMPOSSIBLE_RELATIONSHIP", "truncated traces must use retained-window scope");\n    if (!summary.coverage.traceTruncated && summary.coverage.traceScope !== "complete-session") error(errors, "coverage.traceScope", "IMPOSSIBLE_RELATIONSHIP", "untruncated traces must use complete-session scope");\n  }\n\n  const countKeys = [\n    "errorEpisodeCount", "correctedEpisodeCount", "uncorrectedEpisodeCount",\n    "doublingEpisodeCount", "cascadeEpisodeCount", "correctionAttemptCount",\n    "nonErrorCorrectionActionCount", "ignoredCorrectionActionCount", "disabledCorrectionAttemptCount",\n    "charactersRemoved", "incorrectCharactersRemoved", "correctCharactersRemoved",\n  ];\n  for (const key of countKeys) finite(errors, summary[key], key, { min: 0, integer: true });\n  if (summary.correctedEpisodeCount + summary.uncorrectedEpisodeCount !== summary.errorEpisodeCount) error(errors, "errorEpisodeCount", "IMPOSSIBLE_RELATIONSHIP", "corrected + uncorrected episode counts must equal errorEpisodeCount");\n  if (summary.doublingEpisodeCount > summary.errorEpisodeCount || summary.cascadeEpisodeCount > summary.errorEpisodeCount) error(errors, "errorEpisodeCount", "IMPOSSIBLE_RELATIONSHIP", "episode subtype counts exceed total episodes");\n\n  if (!isPlainObject(summary.structuralCounts)) error(errors, "structuralCounts", "INVALID_TYPE", "structuralCounts must be an object");\n  else {\n    for (const key of PRACTICE_ERROR_STRUCTURAL_CLASSES) finite(errors, summary.structuralCounts[key], \`structuralCounts.\${key}\`, { min: 0, integer: true });\n    const structuralTotal = PRACTICE_ERROR_STRUCTURAL_CLASSES.reduce((sum, key) => sum + (Number.isInteger(summary.structuralCounts[key]) ? summary.structuralCounts[key] : 0), 0);\n    if (structuralTotal !== summary.errorEpisodeCount) error(errors, "structuralCounts", "IMPOSSIBLE_RELATIONSHIP", "structural counts must equal errorEpisodeCount");\n  }\n\n  if (!isPlainObject(summary.contentCounts)) error(errors, "contentCounts", "INVALID_TYPE", "contentCounts must be an object");\n  else {\n    const contentKeys = PRACTICE_ERROR_CONTENT_CLASSES.map((key) => key === "whitespace-boundary" ? "whitespaceBoundary" : key);\n    for (const key of contentKeys) finite(errors, summary.contentCounts[key], \`contentCounts.\${key}\`, { min: 0, integer: true });\n    const contentTotal = contentKeys.reduce((sum, key) => sum + (Number.isInteger(summary.contentCounts[key]) ? summary.contentCounts[key] : 0), 0);\n    if (contentTotal !== summary.errorEpisodeCount) error(errors, "contentCounts", "IMPOSSIBLE_RELATIONSHIP", "content counts must equal errorEpisodeCount");\n  }\n\n  if (summary.incorrectCharactersRemoved + summary.correctCharactersRemoved !== summary.charactersRemoved) error(errors, "charactersRemoved", "IMPOSSIBLE_RELATIONSHIP", "removed character classes must equal charactersRemoved");\n  if (summary.charactersRemoved === 0) {\n    if (summary.overDeletionRate != null) error(errors, "overDeletionRate", "IMPOSSIBLE_RELATIONSHIP", "overDeletionRate must be null without removed characters");\n  } else {\n    finite(errors, summary.overDeletionRate, "overDeletionRate", { min: 0, max: 1 });\n    if (Number.isFinite(summary.overDeletionRate) && Math.abs(summary.overDeletionRate - summary.correctCharactersRemoved / summary.charactersRemoved) > 1e-12) error(errors, "overDeletionRate", "IMPOSSIBLE_RELATIONSHIP", "overDeletionRate denominator is inconsistent");\n  }\n\n  for (const key of ["correctionInitiationMedianMs", "correctionDistanceMedianChars", "correctionToRepairMedianMs", "errorToRepairMedianMs", "repairToResumeMedianMs", "resumeToFluentMedianMs"]) if (summary[key] != null) finite(errors, summary[key], key, { min: 0 });\n  if (summary.errorEpisodeCount === 0) {\n    if (summary.correctedEpisodeRate != null) error(errors, "correctedEpisodeRate", "IMPOSSIBLE_RELATIONSHIP", "correctedEpisodeRate must be null without episodes");\n  } else {\n    finite(errors, summary.correctedEpisodeRate, "correctedEpisodeRate", { min: 0, max: 1 });\n    if (Number.isFinite(summary.correctedEpisodeRate) && Math.abs(summary.correctedEpisodeRate - summary.correctedEpisodeCount / summary.errorEpisodeCount) > 1e-12) error(errors, "correctedEpisodeRate", "IMPOSSIBLE_RELATIONSHIP", "correctedEpisodeRate denominator is inconsistent");\n  }\n  if (summary.episodesPer1000Insertions != null) finite(errors, summary.episodesPer1000Insertions, "episodesPer1000Insertions", { min: 0 });\n  oneOf(errors, summary.classificationConfidence, "classificationConfidence", PRACTICE_ERROR_SUMMARY_CONFIDENCE);\n  return result(errors);\n}\n\nexport function validateSessionSummary(summary) {`,
);

replaceExact(
  "js/practiceLab/practiceValidation.js",
  "  if (summary.fluencySummary != null) errors.push(...validatePracticeFluencySummary(summary.fluencySummary).errors.map((entry) => ({ ...entry, path: `fluencySummary.${entry.path}` })));\n  appendSerializable(errors, summary.configuration, \"configuration\");",
  "  if (summary.fluencySummary != null) errors.push(...validatePracticeFluencySummary(summary.fluencySummary).errors.map((entry) => ({ ...entry, path: `fluencySummary.${entry.path}` })));\n  if (summary.errorSummary != null) errors.push(...validatePracticeErrorSummary(summary.errorSummary).errors.map((entry) => ({ ...entry, path: `errorSummary.${entry.path}` })));\n  appendSerializable(errors, summary.configuration, \"configuration\");",
);

replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `import { buildPracticeFoundationAnalysis } from "./practiceFoundationAnalysis.js";`,
  `import { buildPracticeFoundationAnalysis } from "./practiceFoundationAnalysis.js";\nimport { createPracticeErrorTracker } from "./practiceErrorTracker.js";`,
);
replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `  let metrics = createPracticeMetricsCollector();\n  const eventBuffer = createPracticeEventBuffer({ capacity: checkpointPolicy.eventCapacity ?? PRACTICE_SESSION_LIMITS.eventBuffer });`,
  `  let metrics = createPracticeMetricsCollector();\n  let errorTracker = createPracticeErrorTracker();\n  const eventBuffer = createPracticeEventBuffer({ capacity: checkpointPolicy.eventCapacity ?? PRACTICE_SESSION_LIMITS.eventBuffer });`,
);
replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `      recentInputTail: eventBuffer.getTail(PRACTICE_SESSION_LIMITS.checkpointRecentEvents),\n      eventTraceMetadata: eventBuffer.getMetadata(),\n      startedAtUtc,`,
  `      recentInputTail: eventBuffer.getTail(PRACTICE_SESSION_LIMITS.checkpointRecentEvents),\n      eventTraceMetadata: eventBuffer.getMetadata(),\n      errorTrackerSnapshot: errorTracker.checkpointSnapshot({\n        contentHash: contentPlan.contentHash,\n        cursorIndex: typingState.cursorIndex,\n      }),\n      startedAtUtc,`,
);

const handleStart = `  const handleInput = (rawInput) => {`;
const pauseStart = `\n\n  const pause = async (reason = "manual") => {`;
{
  const path = "js/practiceLab/practiceSessionEngine.js";
  const source = fs.readFileSync(path, "utf8");
  const start = source.indexOf(handleStart);
  const end = source.indexOf(pauseStart, start);
  if (start < 0 || end < 0) throw new Error("Unable to locate Practice handleInput block");
  const replacement = `  const handleInput = (rawInput) => {\n    if (destroyed) return { accepted: false, stateChanged: false, reason: "destroyed", sessionCompleted: false, snapshotVersion };\n    if (finalizationState === "finalizing") return { accepted: false, stateChanged: false, reason: "already-completed", sessionCompleted: true, snapshotVersion };\n    if (lifecycleState !== "active") return { accepted: false, stateChanged: false, reason: lifecycleState === "completed" ? "already-completed" : "session-not-active", sessionCompleted: false, snapshotVersion };\n    let input = rawInput;\n    try {\n      if (typeof experiment.transformInput === "function") input = experiment.transformInput(freezeDeep(clonePracticeValue(rawInput))) ?? rawInput;\n    } catch {\n      return { accepted: false, stateChanged: false, reason: "invalid-input", sessionCompleted: false, snapshotVersion };\n    }\n    const validation = validatePracticeNormalizedInput(input, { segmenter });\n    if (!validation.valid) return { accepted: false, stateChanged: false, reason: "invalid-input", errors: validation.errors, sessionCompleted: false, snapshotVersion };\n    const isInsertion = input.type === "character" || input.type === "space";\n    let outcome;\n    const activeMs = activeAt(input.monotonicTimestampMs);\n    if (isInsertion) {\n      const cursorBefore = typingState.cursorIndex;\n      const value = input.type === "space" ? " " : input.value;\n      outcome = applyPracticeInsertion(typingState, contentPlan, value, activeMs);\n      if (outcome.accepted) {\n        if (!performanceTimingStarted) {\n          performanceTimingStarted = true;\n          activeIntervalStart = input.monotonicTimestampMs;\n        }\n        const unit = contentPlan.units.find((candidate) => candidate.unitId === outcome.unitId) || null;\n        const latency = metrics.recordInsertion({\n          ...outcome,\n          value,\n          correct: outcome.correctness === "correct",\n          expectedGraphemes: typingState.expectedGraphemes,\n          monotonicMs: input.monotonicTimestampMs,\n          activeMs,\n          performanceStartMono: startMono,\n          unit,\n        });\n        for (const unitId of outcome.completedUnitIds) {\n          const completedUnit = contentPlan.units.find((candidate) => candidate.unitId === unitId);\n          if (completedUnit) metrics.recordUnitCompletion(completedUnit, typingState.typed, activeMs);\n        }\n        const errorEvent = {\n          eventIndex: eventBuffer.totalEventCount + 1,\n          eventTraceVersion: PRACTICE_EVENT_TRACE_VERSION,\n          timingSegmentId,\n          timingSegmentStartReason: hasInsertionInTimingSegment ? null : timingSegmentStartReason,\n          type: input.type,\n          entered: value,\n          expected: outcome.expected,\n          textPosition: outcome.position,\n          cursorBefore,\n          cursorAfter: typingState.cursorIndex,\n          unitId: outcome.unitId,\n          correctness: outcome.correctness,\n          correctedLater: false,\n          monotonicTimestampMs: input.monotonicTimestampMs,\n          relativeActiveTimestampMs: activeMs,\n          latencyFromPriorInsertionMs: latency,\n          source: input.source,\n          targetEntityMatches: [],\n        };\n        eventBuffer.push(errorEvent);\n        errorTracker.consume(errorEvent);\n        hasInsertionInTimingSegment = true;\n        markDirty(true);\n      }\n    } else {\n      const correctionPolicy = configuration.correctionBehavior ?? experiment.defaultCorrectionBehavior;\n      const cursorBefore = typingState.cursorIndex;\n      outcome = applyPracticeCorrection(typingState, input.type, correctionPolicy, activeMs);\n      if (correctionPolicy !== "disabled") metrics.recordCorrection({ type: input.type, policy: correctionPolicy, removed: outcome.removed, activeMs });\n      if (outcome.stateChanged) {\n        rebuildCompletedPracticeUnits(typingState, contentPlan);\n        markDirty(false);\n      }\n      const removed = Array.isArray(outcome.removed) ? outcome.removed : [];\n      const removedIncorrectCount = removed.filter((entry) => !entry.correct).length;\n      const removedCorrectCount = removed.filter((entry) => entry.correct).length;\n      const errorEvent = {\n        eventIndex: eventBuffer.totalEventCount + 1,\n        eventTraceVersion: PRACTICE_EVENT_TRACE_VERSION,\n        timingSegmentId,\n        timingSegmentStartReason: null,\n        type: input.type,\n        entered: "",\n        expected: null,\n        textPosition: typingState.cursorIndex,\n        cursorBefore,\n        cursorAfter: typingState.cursorIndex,\n        removedCount: removed.length,\n        removedIncorrectCount,\n        removedCorrectCount,\n        removedStartPosition: removed.length ? typingState.cursorIndex : null,\n        correctionPolicy,\n        accepted: outcome.accepted,\n        stateChanged: outcome.stateChanged,\n        unitId: typingState.currentUnit?.unitId ?? null,\n        correctness: null,\n        correctedLater: false,\n        monotonicTimestampMs: input.monotonicTimestampMs,\n        relativeActiveTimestampMs: activeMs,\n        latencyFromPriorInsertionMs: null,\n        source: input.source,\n        targetEntityMatches: [],\n      };\n      eventBuffer.push(errorEvent);\n      errorTracker.consume(errorEvent);\n    }\n    const completionReason = outcome.accepted ? evaluateCompletion() : null;\n    const snapshot = emit("input");\n    if (completionReason) queueMicrotask(() => { void complete(completionReason); });\n    return {\n      ...outcome,\n      sessionCompleted: Boolean(completionReason),\n      snapshotVersion: snapshot.snapshotVersion,\n    };\n  };`;
  fs.writeFileSync(path, source.slice(0, start) + replacement + source.slice(end));
}

replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `    const at = nowMono();\n    freezeActiveTiming(at);\n    transition("paused", "pause");`,
  `    const at = nowMono();\n    errorTracker.markTimingBoundary();\n    freezeActiveTiming(at);\n    transition("paused", "pause");`,
);

replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `      return buildPracticeFoundationAnalysis({\n        events: eventBuffer.getTrace(),\n        traceMetadata: eventBuffer.getMetadata(),\n      });`,
  `      return buildPracticeFoundationAnalysis({\n        events: eventBuffer.getTrace(),\n        traceMetadata: eventBuffer.getMetadata(),\n        errorTrackerSnapshot: errorTracker.finalizeSnapshot(),\n      });`,
);
replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `      throw sessionError(PRACTICE_SESSION_ERROR_CODES.ANALYSIS_FAILED, "Practice foundation latency analysis failed", "foundation-analysis", true, cause);`,
  `      throw sessionError(PRACTICE_SESSION_ERROR_CODES.ANALYSIS_FAILED, "Practice foundation analysis failed", "foundation-analysis", true, cause);`,
);

replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `    metrics = createPracticeMetricsCollector(checkpoint.metricsSnapshot);\n    const restoredTail = (checkpoint.metricsSnapshot?.recentInputTail || []).map((event) => ({\n      ...event,\n      eventTraceVersion: Number.isInteger(event?.eventTraceVersion) ? event.eventTraceVersion : 1,\n      timingSegmentId: Number.isInteger(event?.timingSegmentId) ? event.timingSegmentId : 0,\n      timingSegmentStartReason: event?.timingSegmentStartReason ?? null,\n    }));`,
  `    metrics = createPracticeMetricsCollector(checkpoint.metricsSnapshot);\n    const restoredIncorrectCount = typingState.typed.filter((entry) => !entry.correct).length;\n    const trackerSeed = checkpoint.metricsSnapshot?.errorTrackerSnapshot ?? null;\n    const trackerSeedValid = trackerSeed\n      && trackerSeed.contentHash === checkpoint.contentHash\n      && trackerSeed.cursorAtSnapshot === typingState.cursorIndex;\n    try {\n      errorTracker = trackerSeedValid\n        ? createPracticeErrorTracker({ seed: trackerSeed })\n        : createPracticeErrorTracker({ aggregateScope: "post-restore", initialIncorrectCount: restoredIncorrectCount });\n    } catch {\n      errorTracker = createPracticeErrorTracker({ aggregateScope: "post-restore", initialIncorrectCount: restoredIncorrectCount });\n    }\n    errorTracker.markTimingBoundary();\n    const restoredTail = (checkpoint.metricsSnapshot?.recentInputTail || []).map((event) => {\n      const insertion = event?.type === "character" || event?.type === "space";\n      const fallbackBefore = Number.isInteger(event?.textPosition) ? event.textPosition : 0;\n      const fallbackAfter = insertion ? fallbackBefore + 1 : fallbackBefore;\n      return {\n        ...event,\n        eventTraceVersion: Number.isInteger(event?.eventTraceVersion) ? event.eventTraceVersion : 1,\n        timingSegmentId: Number.isInteger(event?.timingSegmentId) ? event.timingSegmentId : 0,\n        timingSegmentStartReason: event?.timingSegmentStartReason ?? null,\n        cursorBefore: Number.isInteger(event?.cursorBefore) ? event.cursorBefore : fallbackBefore,\n        cursorAfter: Number.isInteger(event?.cursorAfter) ? event.cursorAfter : fallbackAfter,\n        removedCount: Number.isInteger(event?.removedCount) ? event.removedCount : 0,\n        removedIncorrectCount: Number.isInteger(event?.removedIncorrectCount) ? event.removedIncorrectCount : 0,\n        removedCorrectCount: Number.isInteger(event?.removedCorrectCount) ? event.removedCorrectCount : 0,\n      };\n    });`,
);

replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `      timingSegmentId,\n      activeDurationMs: activeAt(),`,
  `      timingSegmentId,\n      errorEpisodeCount: errorTracker.getSnapshot().errorEpisodeCount,\n      activeErrorEpisode: Boolean(errorTracker.activeEpisode),\n      activeDurationMs: activeAt(),`,
);

// Correction-attempt semantics: count every correction input, while episode correctionActionCount\n// counts every correction action participating in the active episode.\nreplaceExact(
  "js/practiceLab/practiceErrorTracker.js",
  `    const policyName = event.correctionPolicy ?? "allow";\n    if (policyName === "ignore") state.ignoredCorrectionActionCount += 1;`,
  `    const policyName = event.correctionPolicy ?? "allow";\n    state.correctionAttemptCount += 1;\n    if (policyName === "ignore") state.ignoredCorrectionActionCount += 1;`,
);
replaceExact(
  "js/practiceLab/practiceErrorTracker.js",
  `    episode.correctionAttempted = true;\n    state.correctionAttemptCount += 1;\n    if (removedCount > 0) {\n      episode.correctionActionCount += 1;`,
  `    episode.correctionAttempted = true;\n    episode.correctionActionCount += 1;\n    if (removedCount > 0) {`,
);

// PL8/current-version regression assertions that intentionally track the current session record version.\nfor (const path of ["tests/practice-context-identity.test.js", "tests/practice-profile-migration.test.js"]) {\n  replaceAllExact(path, "sessionSummary: 3", "sessionSummary: 4");\n  replaceAllExact(path, "PRACTICE_RECORD_VERSIONS.sessionSummary, 3", "PRACTICE_RECORD_VERSIONS.sessionSummary, 4");\n}\n\nconsole.log("PL9 integration patches applied");\n