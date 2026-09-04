import { readFile, writeFile } from "node:fs/promises";

async function patch(path, edits) {
  let source = await readFile(path, "utf8");
  for (const [before, after] of edits) {
    if (!source.includes(before)) throw new Error(`PL8 patch anchor missing in ${path}: ${before.slice(0, 100)}`);
    source = source.replace(before, after);
  }
  await writeFile(path, source);
}

await patch("js/practiceLab/practiceConstants.js", [[
  "  sessionSummary: 2,",
  "  sessionSummary: 3,",
]]);

await patch("js/practiceLab/practiceDefaults.js", [[
  "    accuracy: 0,\n    consistency: null,\n    beforeMetrics: null,",
  "    accuracy: 0,\n    consistency: null,\n    fluencySummary: null,\n    beforeMetrics: null,",
]]);

await patch("js/practiceLab/practiceSessionResult.js", [
  [
    "  targetEntities,\n  analysis = null,\n}) {",
    "  targetEntities,\n  foundationAnalysis = null,\n  analysis = null,\n}) {",
  ],
  [
    "      consistency: metrics.consistency,\n      beforeMetrics: analysis?.beforeMetrics ?? null,",
    "      consistency: metrics.consistency,\n      fluencySummary: foundationAnalysis?.latency?.sessionSummary ?? null,\n      beforeMetrics: analysis?.beforeMetrics ?? null,",
  ],
]);

await patch("js/practiceLab/practiceMigrations.js", [
  [
    "  sessionSummary: Object.freeze({\n    1: (value) => ({\n      ...value,\n      recordVersion: 2,\n      contextId: createDefaultPracticeContextId(value.profileId),\n    }),\n  }),",
    "  sessionSummary: Object.freeze({\n    1: (value) => ({\n      ...value,\n      recordVersion: 2,\n      contextId: createDefaultPracticeContextId(value.profileId),\n    }),\n    2: (value) => ({\n      ...value,\n      recordVersion: 3,\n      fluencySummary: null,\n    }),\n  }),",
  ],
  [
    "  if ([\"sessionSummary\", \"reviewItem\", \"checkpoint\"].includes(type) && version === 1) return {\n    ...value,\n    recordVersion: PRACTICE_RECORD_VERSIONS[type],\n    contextId: createDefaultPracticeContextId(value.profileId),\n  };",
    "  if (type === \"sessionSummary\" && version <= 2) return {\n    ...value,\n    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,\n    contextId: version === 1 ? createDefaultPracticeContextId(value.profileId) : value.contextId,\n    fluencySummary: null,\n  };\n  if ([\"reviewItem\", \"checkpoint\"].includes(type) && version === 1) return {\n    ...value,\n    recordVersion: PRACTICE_RECORD_VERSIONS[type],\n    contextId: createDefaultPracticeContextId(value.profileId),\n  };",
  ],
]);

await patch("js/practiceLab/practiceValidation.js", [
  [
    "import { isValidPracticeDayKey, isValidPracticeUtcIso } from \"./practiceTime.js\";",
    "import { isValidPracticeDayKey, isValidPracticeUtcIso } from \"./practiceTime.js\";\nimport {\n  PRACTICE_LATENCY_ANALYSIS_VERSION,\n  PRACTICE_LATENCY_CALIBRATION_STATUSES,\n  PRACTICE_LATENCY_CLASSIFIER_VERSION,\n  PRACTICE_LATENCY_CONFIDENCE_LEVELS,\n  PRACTICE_LATENCY_POLICY_V1,\n  PRACTICE_LATENCY_TRACE_SCOPES,\n} from \"./practiceLatencyClassifier.js\";",
  ],
  [
    "export function validateSessionSummary(summary) {",
    `export function validatePracticeFluencySummary(summary) {
  const errors = [];
  if (!isPlainObject(summary)) return result([{ path: "fluencySummary", code: "INVALID_TYPE", message: "fluencySummary must be an object" }]);
  validateVersion(errors, summary.analysisVersion, PRACTICE_LATENCY_ANALYSIS_VERSION, "analysisVersion");
  validateVersion(errors, summary.classifierVersion, PRACTICE_LATENCY_CLASSIFIER_VERSION, "classifierVersion");
  validateVersion(errors, summary.policyVersion, PRACTICE_LATENCY_POLICY_V1.version, "policyVersion");

  if (!isPlainObject(summary.coverage)) error(errors, "coverage", "INVALID_TYPE", "coverage must be an object");
  else {
    for (const key of ["capacity", "retainedEventCount", "totalEventCount"]) finite(errors, summary.coverage[key], \`coverage.\${key}\`, { min: 0, integer: true });
    if (typeof summary.coverage.truncated !== "boolean") error(errors, "coverage.truncated", "INVALID_TYPE", "coverage.truncated must be boolean");
    oneOf(errors, summary.coverage.scope, "coverage.scope", PRACTICE_LATENCY_TRACE_SCOPES);
    if (Number.isFinite(summary.coverage.retainedEventCount) && Number.isFinite(summary.coverage.totalEventCount) && summary.coverage.retainedEventCount > summary.coverage.totalEventCount) error(errors, "coverage.retainedEventCount", "IMPOSSIBLE_RELATIONSHIP", "retainedEventCount exceeds totalEventCount");
    if (summary.coverage.truncated === false && summary.coverage.scope !== "complete-session") error(errors, "coverage.scope", "IMPOSSIBLE_RELATIONSHIP", "untruncated traces must use complete-session scope");
    if (summary.coverage.truncated === true && summary.coverage.scope !== "retained-window") error(errors, "coverage.scope", "IMPOSSIBLE_RELATIONSHIP", "truncated traces must use retained-window scope");
  }

  if (!isPlainObject(summary.calibration)) error(errors, "calibration", "INVALID_TYPE", "calibration must be an object");
  else {
    oneOf(errors, summary.calibration.status, "calibration.status", PRACTICE_LATENCY_CALIBRATION_STATUSES);
    oneOf(errors, summary.calibration.confidence, "calibration.confidence", PRACTICE_LATENCY_CONFIDENCE_LEVELS);
    finite(errors, summary.calibration.sampleCount, "calibration.sampleCount", { min: 0, integer: true });
    for (const key of ["baselineMedianMs", "baselineMadMs", "robustScaleMs"]) if (summary.calibration[key] != null) finite(errors, summary.calibration[key], \`calibration.\${key}\`, { min: 0 });
  }

  for (const key of ["classifiedInsertionTransitionCount", "calibrationSampleCount", "eligibleTransitionCount", "fluentTransitionCount", "disfluentTransitionCount", "interruptionCount", "excludedTransitionCount", "longHesitationCount"]) finite(errors, summary[key], key, { min: 0, integer: true });
  if (summary.classifiedInsertionTransitionCount !== summary.fluentTransitionCount + summary.disfluentTransitionCount + summary.interruptionCount + summary.excludedTransitionCount) error(errors, "classifiedInsertionTransitionCount", "IMPOSSIBLE_RELATIONSHIP", "classification counts do not sum to the classified transition count");
  if (summary.eligibleTransitionCount !== summary.fluentTransitionCount + summary.disfluentTransitionCount) error(errors, "eligibleTransitionCount", "IMPOSSIBLE_RELATIONSHIP", "eligibleTransitionCount must equal fluent + disfluent");
  if (isPlainObject(summary.calibration) && summary.calibrationSampleCount !== summary.calibration.sampleCount) error(errors, "calibrationSampleCount", "IMPOSSIBLE_RELATIONSHIP", "calibrationSampleCount must match calibration.sampleCount");

  if (!isPlainObject(summary.excludedReasons)) error(errors, "excludedReasons", "INVALID_TYPE", "excludedReasons must be an object");
  else {
    const keys = ["segmentStart", "timingBoundary", "postCorrection", "invalidLatency", "correctness", "insufficientData", "other"];
    for (const key of keys) finite(errors, summary.excludedReasons[key], \`excludedReasons.\${key}\`, { min: 0, integer: true });
    const total = keys.reduce((sum, key) => sum + (Number.isInteger(summary.excludedReasons[key]) ? summary.excludedReasons[key] : 0), 0);
    if (total !== summary.excludedTransitionCount) error(errors, "excludedReasons", "IMPOSSIBLE_RELATIONSHIP", "excluded reason counts must equal excludedTransitionCount");
  }

  for (const key of ["disfluencyRate", "interruptionRate"]) if (summary[key] != null) finite(errors, summary[key], key, { min: 0, max: 1 });
  if (summary.eligibleTransitionCount === 0 && summary.disfluencyRate != null) error(errors, "disfluencyRate", "IMPOSSIBLE_RELATIONSHIP", "disfluencyRate must be null without fluent/disfluent evidence");
  if (summary.eligibleTransitionCount > 0 && summary.disfluencyRate != null) {
    const expected = summary.disfluentTransitionCount / summary.eligibleTransitionCount;
    if (Math.abs(summary.disfluencyRate - expected) > 1e-12) error(errors, "disfluencyRate", "IMPOSSIBLE_RELATIONSHIP", "disfluencyRate denominator is inconsistent");
  }
  const interruptionDenominator = summary.eligibleTransitionCount + summary.interruptionCount;
  if (interruptionDenominator === 0 && summary.interruptionRate != null) error(errors, "interruptionRate", "IMPOSSIBLE_RELATIONSHIP", "interruptionRate must be null without timing evidence");
  if (interruptionDenominator > 0 && summary.interruptionRate != null) {
    const expected = summary.interruptionCount / interruptionDenominator;
    if (Math.abs(summary.interruptionRate - expected) > 1e-12) error(errors, "interruptionRate", "IMPOSSIBLE_RELATIONSHIP", "interruptionRate denominator is inconsistent");
  }

  for (const key of ["fluentMedianMs", "fluentMadMs", "fluentP90Ms", "disfluentMedianMs", "thresholdMs", "longestEligibleLatencyMs"]) if (summary[key] != null) finite(errors, summary[key], key, { min: 0 });
  if (summary.fluentTransitionCount === 0 && [summary.fluentMedianMs, summary.fluentMadMs, summary.fluentP90Ms].some((value) => value != null)) error(errors, "fluentMedianMs", "IMPOSSIBLE_RELATIONSHIP", "fluent distribution metrics require fluent observations");
  if (summary.disfluentTransitionCount === 0 && summary.disfluentMedianMs != null) error(errors, "disfluentMedianMs", "IMPOSSIBLE_RELATIONSHIP", "disfluentMedianMs requires disfluent observations");
  if (summary.calibration?.status === "adaptive") {
    if (!Number.isFinite(summary.thresholdMs) || summary.thresholdMs < PRACTICE_LATENCY_POLICY_V1.minimumAdaptiveThresholdMs || summary.thresholdMs > PRACTICE_LATENCY_POLICY_V1.maximumAdaptiveThresholdMs || summary.thresholdMs >= PRACTICE_LATENCY_POLICY_V1.hardInterruptionMs) error(errors, "thresholdMs", "OUT_OF_RANGE", "adaptive threshold is outside the v1 policy bounds");
    if (summary.calibration.sampleCount < PRACTICE_LATENCY_POLICY_V1.minimumCalibrationSamples) error(errors, "calibration.sampleCount", "IMPOSSIBLE_RELATIONSHIP", "adaptive calibration requires the minimum sample count");
  } else if (summary.thresholdMs != null || summary.disfluencyRate != null) {
    error(errors, "thresholdMs", "IMPOSSIBLE_RELATIONSHIP", "insufficient-data calibration cannot persist an adaptive threshold/rate");
  }
  return result(errors);
}

export function validateSessionSummary(summary) {`,
  ],
  [
    "  if (summary.consistency != null) finite(errors, summary.consistency, \"consistency\", { min: 0, max: 100 });\n  appendSerializable(errors, summary.configuration, \"configuration\");",
    "  if (summary.consistency != null) finite(errors, summary.consistency, \"consistency\", { min: 0, max: 100 });\n  if (summary.fluencySummary != null) errors.push(...validatePracticeFluencySummary(summary.fluencySummary).errors.map((entry) => ({ ...entry, path: `fluencySummary.${entry.path}` })));\n  appendSerializable(errors, summary.configuration, \"configuration\");",
  ],
]);

await patch("js/practiceLab/practiceCheckpoint.js", [
  [
    "  recentInputTail = [],\n  startedAtUtc = null,",
    "  recentInputTail = [],\n  eventTraceMetadata = null,\n  startedAtUtc = null,",
  ],
  [
    "        recentInputTail: recentInputTail.slice(-PRACTICE_SESSION_LIMITS.checkpointRecentEvents),",
    "        recentInputTail: recentInputTail.slice(-PRACTICE_SESSION_LIMITS.checkpointRecentEvents),\n        eventTraceMetadata,",
  ],
]);

await patch("js/practiceLab/practiceSessionEngine.js", [
  [
    "import { createPracticeEventBuffer } from \"./practiceEventBuffer.js\";",
    "import { createPracticeEventBuffer } from \"./practiceEventBuffer.js\";\nimport { buildPracticeFoundationAnalysis } from \"./practiceFoundationAnalysis.js\";",
  ],
  [
    "  PRACTICE_SESSION_ERROR_CODES,\n  PRACTICE_SESSION_LIMITS,",
    "  PRACTICE_EVENT_TRACE_VERSION,\n  PRACTICE_SESSION_ERROR_CODES,\n  PRACTICE_SESSION_LIMITS,",
  ],
  [
    "  let lastErrorCode = null;\n  let destroyed = false;",
    "  let lastErrorCode = null;\n  let destroyed = false;\n  let timingSegmentId = 1;\n  let timingSegmentStartReason = \"session-start\";\n  let hasInsertionInTimingSegment = false;",
  ],
  [
    "        lastAcceptedInputTimestamp: typing?.lastAcceptedInputTimestamp ?? null,\n      },",
    "        lastAcceptedInputTimestamp: typing?.lastAcceptedInputTimestamp ?? null,\n        timingSegmentId,\n      },",
  ],
  [
    "      recentInputTail: eventBuffer.getTail(PRACTICE_SESSION_LIMITS.checkpointRecentEvents),\n      startedAtUtc,",
    "      recentInputTail: eventBuffer.getTail(PRACTICE_SESSION_LIMITS.checkpointRecentEvents),\n      eventTraceMetadata: eventBuffer.getMetadata(),\n      startedAtUtc,",
  ],
  [
    "        eventBuffer.push({\n          eventIndex: eventBuffer.totalEventCount + 1,\n          type: input.type,",
    "        eventBuffer.push({\n          eventIndex: eventBuffer.totalEventCount + 1,\n          eventTraceVersion: PRACTICE_EVENT_TRACE_VERSION,\n          timingSegmentId,\n          timingSegmentStartReason: hasInsertionInTimingSegment ? null : timingSegmentStartReason,\n          type: input.type,",
  ],
  [
    "          targetEntityMatches: [],\n        });\n        markDirty(true);",
    "          targetEntityMatches: [],\n        });\n        hasInsertionInTimingSegment = true;\n        markDirty(true);",
  ],
  [
    "      eventBuffer.push({\n        eventIndex: eventBuffer.totalEventCount + 1,\n        type: input.type,",
    "      eventBuffer.push({\n        eventIndex: eventBuffer.totalEventCount + 1,\n        eventTraceVersion: PRACTICE_EVENT_TRACE_VERSION,\n        timingSegmentId,\n        timingSegmentStartReason: null,\n        type: input.type,",
  ],
  [
    "    transition(\"active\", \"resume\");\n    if (performanceTimingStarted) activeIntervalStart = at;\n    pauseReason = null;",
    "    transition(\"active\", \"resume\");\n    timingSegmentId += 1;\n    timingSegmentStartReason = \"resume\";\n    hasInsertionInTimingSegment = false;\n    if (performanceTimingStarted) activeIntervalStart = at;\n    pauseReason = null;",
  ],
  [
    "  const analyze = async () => {\n    if (typeof experiment.analyzeResult !== \"function\") return null;",
    "  const analyzeFoundation = () => {\n    try {\n      return buildPracticeFoundationAnalysis({\n        events: eventBuffer.getTrace(),\n        traceMetadata: eventBuffer.getMetadata(),\n      });\n    } catch (cause) {\n      throw sessionError(PRACTICE_SESSION_ERROR_CODES.ANALYSIS_FAILED, \"Practice foundation latency analysis failed\", \"foundation-analysis\", true, cause);\n    }\n  };\n\n  const analyze = async (foundationAnalysis) => {\n    if (typeof experiment.analyzeResult !== \"function\") return null;",
  ],
  [
    "        eventTrace: eventBuffer.getTrace(),\n        observations: metrics.observations(),",
    "        eventTrace: eventBuffer.getTrace(),\n        observations: metrics.observations(),\n        foundationAnalysis,",
  ],
  [
    "    let analysis;\n    try {\n      analysis = await analyze();",
    "    let foundationAnalysis;\n    let analysis;\n    try {\n      foundationAnalysis = analyzeFoundation();\n      analysis = await analyze(foundationAnalysis);",
  ],
  [
    "      targetEntities: contentPlan.targetEntities,\n      analysis,",
    "      targetEntities: contentPlan.targetEntities,\n      foundationAnalysis,\n      analysis,",
  ],
  [
    "    metrics = createPracticeMetricsCollector(checkpoint.metricsSnapshot);\n    for (const event of checkpoint.metricsSnapshot?.recentInputTail || []) eventBuffer.push(event);\n    accumulatedActiveMs = checkpoint.activeElapsedMs;",
    "    metrics = createPracticeMetricsCollector(checkpoint.metricsSnapshot);\n    const restoredTail = (checkpoint.metricsSnapshot?.recentInputTail || []).map((event) => ({\n      ...event,\n      eventTraceVersion: Number.isInteger(event?.eventTraceVersion) ? event.eventTraceVersion : 1,\n      timingSegmentId: Number.isInteger(event?.timingSegmentId) ? event.timingSegmentId : 0,\n      timingSegmentStartReason: event?.timingSegmentStartReason ?? null,\n    }));\n    const restoredMetadata = checkpoint.metricsSnapshot?.eventTraceMetadata ?? {\n      totalEventCount: restoredTail.length,\n      truncated: restoredTail.length > 0,\n    };\n    eventBuffer.restore(restoredTail, restoredMetadata);\n    timingSegmentId = restoredTail.reduce((max, event) => Math.max(max, Number.isInteger(event.timingSegmentId) ? event.timingSegmentId : 0), 0) + 1;\n    timingSegmentStartReason = \"restore\";\n    hasInsertionInTimingSegment = false;\n    accumulatedActiveMs = checkpoint.activeElapsedMs;",
  ],
  [
    "      eventCount: eventBuffer.totalEventCount,\n      retainedEventCount: eventBuffer.size,\n      eventTraceTruncated: eventBuffer.truncated,",
    "      eventCount: eventBuffer.totalEventCount,\n      retainedEventCount: eventBuffer.size,\n      eventTraceTruncated: eventBuffer.truncated,\n      eventTraceMetadata: eventBuffer.getMetadata(),\n      timingSegmentId,",
  ],
]);

console.log("PL8 source patches applied");
