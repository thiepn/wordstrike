import fs from "node:fs";

function replaceExact(path, before, after) {
  const source = fs.readFileSync(path, "utf8");
  if (!source.includes(before)) throw new Error(`Missing PL10 patch anchor in ${path}: ${before.slice(0, 120)}`);
  fs.writeFileSync(path, source.replace(before, after));
}

replaceExact(
  "js/practiceLab/practiceConstants.js",
  "  sessionSummary: 4,",
  "  sessionSummary: 5,",
);

replaceExact(
  "js/practiceLab/practiceDefaults.js",
  "    errorSummary: null,\n    beforeMetrics: null,",
  "    errorSummary: null,\n    normalizationSummary: null,\n    beforeMetrics: null,",
);

replaceExact(
  "js/practiceLab/practiceMigrations.js",
  `    3: (value) => ({\n      ...value,\n      recordVersion: 4,\n      errorSummary: null,\n    }),\n  }),`,
  `    3: (value) => ({\n      ...value,\n      recordVersion: 4,\n      errorSummary: null,\n    }),\n    4: (value) => ({\n      ...value,\n      recordVersion: 5,\n      normalizationSummary: null,\n    }),\n  }),`,
);
replaceExact(
  "js/practiceLab/practiceMigrations.js",
  `  if (type === "sessionSummary" && version <= 3) return {\n    ...value,\n    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,\n    contextId: version === 1 ? createDefaultPracticeContextId(value.profileId) : value.contextId,\n    fluencySummary: version <= 2 ? null : value.fluencySummary ?? null,\n    errorSummary: null,\n  };`,
  `  if (type === "sessionSummary" && version <= 4) return {\n    ...value,\n    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,\n    contextId: version === 1 ? createDefaultPracticeContextId(value.profileId) : value.contextId,\n    fluencySummary: version <= 2 ? null : value.fluencySummary ?? null,\n    errorSummary: version <= 3 ? null : value.errorSummary ?? null,\n    normalizationSummary: null,\n  };`,
);

fs.writeFileSync("js/practiceLab/practiceFoundationAnalysis.js", `import {\n  analyzePracticeLatency,\n  PRACTICE_LATENCY_POLICY_V1,\n} from "./practiceLatencyClassifier.js";\nimport { analyzePracticeErrors } from "./practiceErrorAnalyzer.js";\nimport { createPracticeErrorTracker } from "./practiceErrorTracker.js";\nimport { PRACTICE_ERROR_POLICY_V1 } from "./practiceErrorPolicy.js";\nimport { analyzePracticeNormalization } from "./practiceNormalizationAnalysis.js";\n\nexport const PRACTICE_FOUNDATION_ANALYSIS_VERSION = 3;\n\nconst freezeDeep = (value) => {\n  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;\n  Object.values(value).forEach(freezeDeep);\n  return Object.freeze(value);\n};\n\nfunction normalizeFallbackEvent(event, cursor) {\n  if (!event || typeof event !== "object") return null;\n  const insertion = event.type === "character" || event.type === "space";\n  const correction = event.type === "backspace" || event.type === "word-delete";\n  if (!insertion && !correction) return null;\n  if (insertion) {\n    const cursorBefore = Number.isInteger(event.cursorBefore)\n      ? event.cursorBefore\n      : Number.isInteger(event.textPosition) ? event.textPosition : cursor;\n    return { ...event, cursorBefore, cursorAfter: Number.isInteger(event.cursorAfter) ? event.cursorAfter : cursorBefore + 1 };\n  }\n  const cursorAfter = Number.isInteger(event.cursorAfter) ? event.cursorAfter : cursor;\n  const cursorBefore = Number.isInteger(event.cursorBefore) ? event.cursorBefore : cursorAfter;\n  return {\n    ...event,\n    cursorBefore,\n    cursorAfter,\n    removedCount: Number.isInteger(event.removedCount) ? event.removedCount : Math.max(0, cursorBefore - cursorAfter),\n    removedIncorrectCount: Number.isInteger(event.removedIncorrectCount) ? event.removedIncorrectCount : 0,\n    removedCorrectCount: Number.isInteger(event.removedCorrectCount) ? event.removedCorrectCount : 0,\n    correctionPolicy: event.correctionPolicy ?? "allow",\n  };\n}\n\nfunction buildFallbackTrackerSnapshot(events, traceMetadata, policy) {\n  const tracker = createPracticeErrorTracker({\n    policy,\n    aggregateScope: traceMetadata?.truncated ? "retained-window" : "complete-session",\n  });\n  let cursor = 0;\n  for (const source of events) {\n    const event = normalizeFallbackEvent(source, cursor);\n    if (!event) continue;\n    try {\n      tracker.consume(event);\n      cursor = event.cursorAfter;\n    } catch {\n      // Live PL9+ sessions supply streaming state; this is only a legacy/synthetic fallback.\n    }\n  }\n  return tracker.finalizeSnapshot();\n}\n\nexport function buildPracticeFoundationAnalysis({\n  events = [],\n  traceMetadata = {},\n  latencyPolicy = PRACTICE_LATENCY_POLICY_V1,\n  errorPolicy = PRACTICE_ERROR_POLICY_V1,\n  errorTrackerSnapshot = null,\n  contentPlan = null,\n  context = null,\n  segmenter = null,\n  normalizationOptions = {},\n} = {}) {\n  const latency = analyzePracticeLatency({ events, traceMetadata, policy: latencyPolicy });\n  const trackerSnapshot = errorTrackerSnapshot ?? buildFallbackTrackerSnapshot(events, traceMetadata, errorPolicy);\n  const errors = analyzePracticeErrors({\n    events,\n    traceMetadata,\n    trackerSnapshot,\n    latencyAnalysis: latency,\n    policy: errorPolicy,\n  });\n  const normalization = analyzePracticeNormalization({\n    ...normalizationOptions,\n    latencyAnalysis: latency,\n    contentPlan,\n    context,\n    segmenter,\n  });\n  return freezeDeep({\n    version: PRACTICE_FOUNDATION_ANALYSIS_VERSION,\n    latency,\n    errors,\n    normalization,\n  });\n}\n`);

replaceExact(
  "js/practiceLab/practiceSessionResult.js",
  "      errorSummary: foundationAnalysis?.errors?.sessionSummary ?? null,\n      beforeMetrics: analysis?.beforeMetrics ?? null,",
  "      errorSummary: foundationAnalysis?.errors?.sessionSummary ?? null,\n      normalizationSummary: foundationAnalysis?.normalization?.sessionSummary ?? null,\n      beforeMetrics: analysis?.beforeMetrics ?? null,",
);

replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `import { createPracticeErrorTracker } from "./practiceErrorTracker.js";`,
  `import { createPracticeErrorTracker } from "./practiceErrorTracker.js";\nimport { createPracticeSessionContextSnapshot } from "./practiceContextFeatures.js";`,
);
replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  "  let errorTracker = createPracticeErrorTracker();\n  const eventBuffer = createPracticeEventBuffer",
  "  let errorTracker = createPracticeErrorTracker();\n  let normalizationContext = null;\n  const eventBuffer = createPracticeEventBuffer",
);
replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `    const contentValidation = validatePracticeContentPlan(nextContentPlan, { segmenter });\n    if (!contentValidation.valid || !nextExperiment.supportedCompletionModes.includes(nextContentPlan.completion.mode) || (nextExperiment.validateContentPlan && nextExperiment.validateContentPlan(nextContentPlan) === false)) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONTENT, "Invalid Practice content plan", "prepare", false, null, contentValidation.errors);\n    experiment = nextExperiment;`,
  `    const contentValidation = validatePracticeContentPlan(nextContentPlan, { segmenter });\n    if (!contentValidation.valid || !nextExperiment.supportedCompletionModes.includes(nextContentPlan.completion.mode) || (nextExperiment.validateContentPlan && nextExperiment.validateContentPlan(nextContentPlan) === false)) throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONTENT, "Invalid Practice content plan", "prepare", false, null, contentValidation.errors);\n    let resolvedContext;\n    try {\n      if (typeof repository.getPracticeContext !== "function") throw new Error("repository does not expose getPracticeContext");\n      resolvedContext = await repository.getPracticeContext(contextId);\n      normalizationContext = createPracticeSessionContextSnapshot(resolvedContext, { profileId, contextId });\n    } catch (cause) {\n      throw sessionError(PRACTICE_SESSION_ERROR_CODES.INVALID_CONFIGURATION, "Practice normalization context could not be resolved", "prepare-context", true, cause);\n    }\n    experiment = nextExperiment;`,
);
replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `      return buildPracticeFoundationAnalysis({\n        events: eventBuffer.getTrace(),\n        traceMetadata: eventBuffer.getMetadata(),\n        errorTrackerSnapshot: errorTracker.finalizeSnapshot(),\n      });`,
  `      return buildPracticeFoundationAnalysis({\n        events: eventBuffer.getTrace(),\n        traceMetadata: eventBuffer.getMetadata(),\n        errorTrackerSnapshot: errorTracker.finalizeSnapshot(),\n        contentPlan,\n        context: normalizationContext,\n        segmenter,\n      });`,
);
replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `    contentPlan = null;\n    experiment = null;`,
  `    contentPlan = null;\n    normalizationContext = null;\n    experiment = null;`,
);
replaceExact(
  "js/practiceLab/practiceSessionEngine.js",
  `      activeErrorEpisode: Boolean(errorTracker.activeEpisode),\n      activeDurationMs: activeAt(),`,
  `      activeErrorEpisode: Boolean(errorTracker.activeEpisode),\n      normalizationContextFingerprint: normalizationContext?.fingerprint ?? null,\n      activeDurationMs: activeAt(),`,
);

replaceExact(
  "js/practiceLab/practiceValidation.js",
  `} from "./practiceErrorPolicy.js";`,
  `} from "./practiceErrorPolicy.js";\nimport { validatePracticeNormalizationSummary } from "./practiceNormalizationValidation.js";`,
);
replaceExact(
  "js/practiceLab/practiceValidation.js",
  `  "errorEpisodeHistory", "mistypedStrings", "rawLatencies", "leaderboardEligible",`,
  `  "errorEpisodeHistory", "mistypedStrings", "rawLatencies", "normalizationTrace",\n  "normalizedTransitions", "typabilityFeatureVector", "leaderboardEligible",`,
);
replaceExact(
  "js/practiceLab/practiceValidation.js",
  `  if (summary.errorSummary != null) errors.push(...validatePracticeErrorSummary(summary.errorSummary).errors.map((entry) => ({ ...entry, path: \`errorSummary.\${entry.path}\` })));\n  appendSerializable(errors, summary.configuration, "configuration");`,
  `  if (summary.errorSummary != null) errors.push(...validatePracticeErrorSummary(summary.errorSummary).errors.map((entry) => ({ ...entry, path: \`errorSummary.\${entry.path}\` })));\n  if (summary.normalizationSummary != null) errors.push(...validatePracticeNormalizationSummary(summary.normalizationSummary).errors.map((entry) => ({ ...entry, path: \`normalizationSummary.\${entry.path}\` })));\n  appendSerializable(errors, summary.configuration, "configuration");`,
);

const packagePath = "package.json";
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
packageJson.scripts["build:practice-typability"] = "node scripts/buildPracticeTypability.mjs";
packageJson.scripts["validate:practice-typability"] = "node scripts/buildPracticeTypability.mjs --validate";
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

console.log("PL10 integration patches applied");
