import {
  ASSESSMENT_STATES,
  CHECKPOINT_PHASES,
  COMPLETION_REASONS,
  CONFIDENCE_LEVELS,
  ENTITY_TYPES,
  LATENCY_HISTOGRAM_BOUNDS_MS,
  MASTERY_STATES,
  PRACTICE_DATABASE_NAME,
  PRACTICE_DATABASE_VERSION,
  PRACTICE_LIMITS,
  PRACTICE_MANIFEST_VERSION,
  PRACTICE_RECORD_VERSIONS,
  REVIEW_STATES,
  SESSION_STATUSES,
  STORAGE_HEALTH_STATES,
} from "./practiceConstants.js";
import { createSkillStatId, isPracticeId } from "./practiceIds.js";
import {
  createPracticeContextFingerprint,
  normalizePracticeDataLocale,
  normalizePracticeHardwareProfileId,
  normalizePracticeInputMethod,
  normalizePracticeKeyboardLayout,
} from "./practiceContext.js";
import { isValidPracticeDayKey, isValidPracticeUtcIso } from "./practiceTime.js";
import {
  PRACTICE_LATENCY_ANALYSIS_VERSION,
  PRACTICE_LATENCY_CALIBRATION_STATUSES,
  PRACTICE_LATENCY_CLASSIFIER_VERSION,
  PRACTICE_LATENCY_CONFIDENCE_LEVELS,
  PRACTICE_LATENCY_POLICY_V1,
  PRACTICE_LATENCY_TRACE_SCOPES,
} from "./practiceLatencyClassifier.js";
import {
  PRACTICE_ERROR_AGGREGATE_SCOPES,
  PRACTICE_ERROR_ANALYSIS_VERSION,
  PRACTICE_ERROR_ANALYZER_VERSION,
  PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION,
  PRACTICE_ERROR_CONTENT_CLASSES,
  PRACTICE_ERROR_STRUCTURAL_CLASSES,
  PRACTICE_ERROR_SUMMARY_CONFIDENCE,
  PRACTICE_ERROR_TRACE_SCOPES,
  PRACTICE_RECOVERY_POLICY_VERSION,
} from "./practiceErrorPolicy.js";
import { validatePracticeNormalizationSummary } from "./practiceNormalizationValidation.js";
import { validatePracticeAbilityMeasurementSummary } from "./practiceAbilityValidation.js";
import { validatePracticeSkillStatV3 } from "./practiceSkillEvidenceValidation.js";
import {
  PRACTICE_EVIDENCE_ACCURACY_SCOPES,
  PRACTICE_EVIDENCE_ROLES,
  PRACTICE_EVIDENCE_TIMING_SCOPES,
  PRACTICE_SKILL_EVIDENCE_POLICY_V1,
  PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
  PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
  PRACTICE_SKILL_EVIDENCE_VERSION,
} from "./practiceSkillEvidencePolicy.js";

const SETTINGS_ENUMS = Object.freeze({
  punctuationFrequency: ["none", "low", "medium", "high"],
  numbersFrequency: ["none", "low", "medium", "high"],
  correctionBehavior: ["allow", "strict", "word-reset"],
  difficultyPreference: ["gentle", "adaptive", "challenging"],
  reducedMotion: ["system", "reduce", "full"],
});
const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const FORBIDDEN_SESSION_FIELDS = Object.freeze([
  "rawEvents", "eventTrace", "rawEventTrace", "classifiedEventTrace",
  "errorEpisodeHistory", "mistypedStrings", "rawLatencies", "normalizationTrace",
  "normalizedTransitions", "typabilityFeatureVector", "skillEvidenceDeltas", "abilityObservation", "newAbilityEstimate", "leaderboardEligible",
  "submissionPayload", "accessToken", "boardKey", "rulesVersion",
]);

function result(errors) {
  return { valid: errors.length === 0, errors };
}

function error(errors, path, code, message) {
  errors.push({ path, code, message });
}

function requiredString(errors, value, path, maxLength = 200) {
  if (typeof value !== "string" || value.length === 0) {
    error(errors, path, "REQUIRED", `${path} must be a non-empty string`);
  } else if (value.length > maxLength) {
    error(errors, path, "TOO_LONG", `${path} exceeds ${maxLength} characters`);
  }
}

function nullableTimestamp(errors, value, path) {
  if (value != null && !isValidPracticeUtcIso(value)) {
    error(errors, path, "INVALID_TIMESTAMP", `${path} must be a UTC ISO timestamp`);
  }
}

function timestamp(errors, value, path) {
  if (!isValidPracticeUtcIso(value)) {
    error(errors, path, "INVALID_TIMESTAMP", `${path} must be a UTC ISO timestamp`);
  }
}

function finite(errors, value, path, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    error(errors, path, "OUT_OF_RANGE", `${path} is outside its allowed numeric range`);
  }
}

function oneOf(errors, value, path, values) {
  if (!values.includes(value)) error(errors, path, "INVALID_ENUM", `${path} has an unsupported value`);
}

function validId(errors, value, path, kind) {
  if (!isPracticeId(value, kind)) error(errors, path, "INVALID_ID", `${path} is not a valid Practice ID`);
}

function byteSize(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Infinity;
  }
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function validatePracticeSerializable(value, {
  maxDepth = PRACTICE_LIMITS.configurationDepth,
  maxBytes = PRACTICE_LIMITS.configurationBytes,
  path = "value",
} = {}) {
  const errors = [];
  const seen = new Set();
  const visit = (entry, currentPath, depth) => {
    if (depth > maxDepth) {
      error(errors, currentPath, "MAX_DEPTH", `${currentPath} exceeds maximum object depth`);
      return;
    }
    if (entry == null || typeof entry === "string" || typeof entry === "boolean") return;
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) error(errors, currentPath, "NON_FINITE", `${currentPath} must be finite`);
      return;
    }
    if (typeof entry !== "object") {
      error(errors, currentPath, "UNSERIALIZABLE", `${currentPath} is not JSON-safe`);
      return;
    }
    if (seen.has(entry)) {
      error(errors, currentPath, "CYCLIC", `${currentPath} contains a cycle`);
      return;
    }
    if (!Array.isArray(entry) && !isPlainObject(entry)) {
      error(errors, currentPath, "NON_PLAIN_OBJECT", `${currentPath} must contain plain objects`);
      return;
    }
    seen.add(entry);
    Object.entries(entry).forEach(([key, child]) => {
      if (UNSAFE_OBJECT_KEYS.has(key)) error(errors, `${currentPath}.${key}`, "UNSAFE_KEY", `${currentPath} contains an unsafe object key`);
      else visit(child, `${currentPath}.${key}`, depth + 1);
    });
    seen.delete(entry);
  };
  visit(value, path, 0);
  if (byteSize(value) > maxBytes) error(errors, path, "SERIALIZED_SIZE", `${path} exceeds its serialized-size limit`);
  return result(errors);
}

function validateVersion(errors, value, expected, path = "recordVersion") {
  if (value !== expected) error(errors, path, "UNSUPPORTED_VERSION", `${path} must equal ${expected}`);
}

function validateDashboard(errors, dashboard, path = "dashboardSummary") {
  if (!isPlainObject(dashboard)) {
    error(errors, path, "INVALID_TYPE", `${path} must be an object`);
    return;
  }
  for (const key of ["sustainableWpm", "burstWpm", "controlledWpm", "overallAccuracy", "consistency"]) {
    if (dashboard[key] != null) finite(errors, dashboard[key], `${path}.${key}`, { min: 0, max: key.includes("Accuracy") || key === "consistency" ? 100 : 1000 });
  }
  if (!Array.isArray(dashboard.primaryLimiterIds) || dashboard.primaryLimiterIds.length > PRACTICE_LIMITS.primaryLimiterIds) {
    error(errors, `${path}.primaryLimiterIds`, "ARRAY_LIMIT", "primaryLimiterIds exceeds its limit");
  }
  finite(errors, dashboard.dueReviewCount, `${path}.dueReviewCount`, { min: 0, integer: true });
}

export function validatePracticeSettings(settings) {
  const errors = [];
  if (!isPlainObject(settings)) return result([{ path: "settings", code: "INVALID_TYPE", message: "settings must be an object" }]);
  validateVersion(errors, settings.settingsVersion, 1, "settingsVersion");
  finite(errors, settings.dailySessionLengthMinutes, "dailySessionLengthMinutes", { min: 1, max: 180, integer: true });
  finite(errors, settings.targetTrainingDaysPerWeek, "targetTrainingDaysPerWeek", { min: 1, max: 7, integer: true });
  if (!Array.isArray(settings.preferredContentTypes) || settings.preferredContentTypes.length > 20 || settings.preferredContentTypes.some((value) => typeof value !== "string" || value.length > 50)) {
    error(errors, "preferredContentTypes", "INVALID_ARRAY", "preferredContentTypes must be a bounded string array");
  }
  Object.entries(SETTINGS_ENUMS).forEach(([key, values]) => oneOf(errors, settings[key], key, values));
  requiredString(errors, settings.keyboardLayout, "keyboardLayout", 40);
  for (const key of ["soundEnabled", "metronomeSoundEnabled", "showLiveWpm", "showLiveAccuracy", "showRhythmFeedback"]) {
    if (typeof settings[key] !== "boolean") error(errors, key, "INVALID_TYPE", `${key} must be boolean`);
  }
  return result(errors);
}

export function validatePracticeManifest(manifest) {
  const errors = [];
  if (!isPlainObject(manifest)) return result([{ path: "manifest", code: "INVALID_TYPE", message: "manifest must be an object" }]);
  validateVersion(errors, manifest.manifestVersion, PRACTICE_MANIFEST_VERSION, "manifestVersion");
  validId(errors, manifest.profileId, "profileId", "profile");
  if (manifest.databaseName !== PRACTICE_DATABASE_NAME) error(errors, "databaseName", "INVALID_VALUE", "databaseName is not the Practice database");
  validateVersion(errors, manifest.databaseVersion, PRACTICE_DATABASE_VERSION, "databaseVersion");
  timestamp(errors, manifest.createdAt, "createdAt");
  timestamp(errors, manifest.updatedAt, "updatedAt");
  errors.push(...validatePracticeSettings(manifest.settings).errors.map((entry) => ({ ...entry, path: `settings.${entry.path}` })));
  oneOf(errors, manifest.assessmentState, "assessmentState", ASSESSMENT_STATES);
  oneOf(errors, manifest.storageHealth, "storageHealth", STORAGE_HEALTH_STATES);
  finite(errors, manifest.lastSuccessfulMigration, "lastSuccessfulMigration", { min: 0, integer: true });
  nullableTimestamp(errors, manifest.lastCompletedSessionAt, "lastCompletedSessionAt");
  nullableTimestamp(errors, manifest.lastAssessmentAt, "lastAssessmentAt");
  validateDashboard(errors, manifest.dashboardSummary);
  if (byteSize(manifest) > PRACTICE_LIMITS.manifestBytes) error(errors, "manifest", "SERIALIZED_SIZE", "Practice manifest exceeds 64 KiB");
  return result(errors);
}

export function validatePracticeProfile(profile) {
  const errors = [];
  if (!isPlainObject(profile)) return result([{ path: "profile", code: "INVALID_TYPE", message: "profile must be an object" }]);
  validId(errors, profile.profileId, "profileId", "profile");
  validateVersion(errors, profile.recordVersion, PRACTICE_RECORD_VERSIONS.profile);
  timestamp(errors, profile.createdAt, "createdAt");
  timestamp(errors, profile.updatedAt, "updatedAt");
  requiredString(errors, profile.dataLocale, "dataLocale", 40);
  requiredString(errors, profile.keyboardLayout, "keyboardLayout", 40);
  validId(errors, profile.activeContextId, "activeContextId", "context");
  if (typeof profile.firstAssessmentCompleted !== "boolean") error(errors, "firstAssessmentCompleted", "INVALID_TYPE", "firstAssessmentCompleted must be boolean");
  for (const key of ["firstAssessmentCompletedAt", "lastAssessmentAt", "lastPracticeAt"]) nullableTimestamp(errors, profile[key], key);
  if (profile.lastTrainingDayKey != null && !isValidPracticeDayKey(profile.lastTrainingDayKey)) error(errors, "lastTrainingDayKey", "INVALID_DAY_KEY", "lastTrainingDayKey must be YYYY-MM-DD or null");
  for (const key of ["totalCompletedSessions", "totalPracticeDurationMs", "activeTrainingDays", "settingsVersion", "summaryVersion"]) finite(errors, profile[key], key, { min: 0, integer: true });
  validateDashboard(errors, profile.dashboardSummary);
  return result(errors);
}

export function validatePracticeContext(context) {
  const errors = [];
  if (!isPlainObject(context)) return result([{ path: "context", code: "INVALID_TYPE", message: "context must be an object" }]);
  validId(errors, context.contextId, "contextId", "context");
  validId(errors, context.profileId, "profileId", "profile");
  validateVersion(errors, context.recordVersion, PRACTICE_RECORD_VERSIONS.context);
  timestamp(errors, context.createdAt, "createdAt");
  timestamp(errors, context.updatedAt, "updatedAt");
  timestamp(errors, context.lastUsedAt, "lastUsedAt");
  const locale = normalizePracticeDataLocale(context.dataLocale);
  if (!locale) error(errors, "dataLocale", "INVALID_LOCALE", "dataLocale is invalid");
  else if (locale !== context.dataLocale) error(errors, "dataLocale", "NOT_NORMALIZED", "dataLocale must use canonical normalization");
  const layout = normalizePracticeKeyboardLayout(context.keyboardLayout);
  if (!layout) error(errors, "keyboardLayout", "INVALID_LAYOUT", "keyboardLayout is invalid");
  else if (layout !== context.keyboardLayout) error(errors, "keyboardLayout", "NOT_NORMALIZED", "keyboardLayout must be normalized");
  const inputMethod = normalizePracticeInputMethod(context.inputMethod);
  if (!inputMethod || inputMethod !== context.inputMethod) error(errors, "inputMethod", "INVALID_ENUM", "inputMethod must be unknown, physical, or software");
  const hardware = normalizePracticeHardwareProfileId(context.hardwareProfileId);
  if (hardware === undefined || hardware !== context.hardwareProfileId) error(errors, "hardwareProfileId", "INVALID_ID", "hardwareProfileId must be null or a bounded Practice-local identifier");
  requiredString(errors, context.fingerprint, "fingerprint", 400);
  try {
    const expected = createPracticeContextFingerprint(context);
    if (context.fingerprint !== expected) error(errors, "fingerprint", "IDENTITY_MISMATCH", "fingerprint does not match normalized context components");
  } catch {
    // Component-specific errors above remain the authoritative diagnostics.
  }
  return result(errors);
}

function validEntityKey(errors, type, key, path = "entityKey") {
  if (typeof key !== "string") return error(errors, path, "INVALID_ENTITY", "entityKey must be a string");
  const points = [...key];
  if (type === "key" && points.length !== 1) error(errors, path, "INVALID_ENTITY", "key entities must contain one character");
  else if (type === "bigram" && points.length !== 2) error(errors, path, "INVALID_ENTITY", "bigram entities must contain two characters");
  else if (type === "trigram" && points.length !== 3) error(errors, path, "INVALID_ENTITY", "trigram entities must contain three characters");
  else if (type === "word" && (!/^[\p{L}\p{M}'-]{1,64}$/u.test(key))) error(errors, path, "INVALID_ENTITY", "word entities must be bounded word text");
  else if (type.endsWith("pattern") || type === "punctuation-transition") {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(key)) error(errors, path, "INVALID_ENTITY", "pattern entities must use a bounded slug");
  }
}

export function validatePracticeEntityKey(type, key) {
  const errors = [];
  if (!ENTITY_TYPES.includes(type)) error(errors, "entityType", "INVALID_ENUM", "entityType has an unsupported value");
  else validEntityKey(errors, type, key);
  return result(errors);
}

export function validateSkillStat(stat) {
  return validatePracticeSkillStatV3(stat);
}

function appendSerializable(errors, value, path, bytes = PRACTICE_LIMITS.configurationBytes) {
  errors.push(...validatePracticeSerializable(value, { path, maxBytes: bytes }).errors);
}

export function validatePracticeFluencySummary(summary) {
  const errors = [];
  if (!isPlainObject(summary)) return result([{ path: "fluencySummary", code: "INVALID_TYPE", message: "fluencySummary must be an object" }]);
  validateVersion(errors, summary.analysisVersion, PRACTICE_LATENCY_ANALYSIS_VERSION, "analysisVersion");
  validateVersion(errors, summary.classifierVersion, PRACTICE_LATENCY_CLASSIFIER_VERSION, "classifierVersion");
  validateVersion(errors, summary.policyVersion, PRACTICE_LATENCY_POLICY_V1.version, "policyVersion");

  if (!isPlainObject(summary.coverage)) error(errors, "coverage", "INVALID_TYPE", "coverage must be an object");
  else {
    for (const key of ["capacity", "retainedEventCount", "totalEventCount"]) finite(errors, summary.coverage[key], `coverage.${key}`, { min: 0, integer: true });
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
    for (const key of ["baselineMedianMs", "baselineMadMs", "robustScaleMs"]) if (summary.calibration[key] != null) finite(errors, summary.calibration[key], `calibration.${key}`, { min: 0 });
  }

  for (const key of ["classifiedInsertionTransitionCount", "calibrationSampleCount", "eligibleTransitionCount", "fluentTransitionCount", "disfluentTransitionCount", "interruptionCount", "excludedTransitionCount", "longHesitationCount"]) finite(errors, summary[key], key, { min: 0, integer: true });
  if (summary.classifiedInsertionTransitionCount !== summary.fluentTransitionCount + summary.disfluentTransitionCount + summary.interruptionCount + summary.excludedTransitionCount) error(errors, "classifiedInsertionTransitionCount", "IMPOSSIBLE_RELATIONSHIP", "classification counts do not sum to the classified transition count");
  if (summary.eligibleTransitionCount !== summary.fluentTransitionCount + summary.disfluentTransitionCount) error(errors, "eligibleTransitionCount", "IMPOSSIBLE_RELATIONSHIP", "eligibleTransitionCount must equal fluent + disfluent");
  if (isPlainObject(summary.calibration) && summary.calibrationSampleCount !== summary.calibration.sampleCount) error(errors, "calibrationSampleCount", "IMPOSSIBLE_RELATIONSHIP", "calibrationSampleCount must match calibration.sampleCount");

  if (!isPlainObject(summary.excludedReasons)) error(errors, "excludedReasons", "INVALID_TYPE", "excludedReasons must be an object");
  else {
    const keys = ["segmentStart", "timingBoundary", "postCorrection", "invalidLatency", "correctness", "insufficientData", "other"];
    for (const key of keys) finite(errors, summary.excludedReasons[key], `excludedReasons.${key}`, { min: 0, integer: true });
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

export function validatePracticeErrorSummary(summary) {
  const errors = [];
  if (!isPlainObject(summary)) return result([{ path: "errorSummary", code: "INVALID_TYPE", message: "errorSummary must be an object" }]);
  validateVersion(errors, summary.analysisVersion, PRACTICE_ERROR_ANALYSIS_VERSION, "analysisVersion");
  validateVersion(errors, summary.errorAnalyzerVersion, PRACTICE_ERROR_ANALYZER_VERSION, "errorAnalyzerVersion");
  validateVersion(errors, summary.alignmentPolicyVersion, PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION, "alignmentPolicyVersion");
  validateVersion(errors, summary.recoveryPolicyVersion, PRACTICE_RECOVERY_POLICY_VERSION, "recoveryPolicyVersion");

  if (!isPlainObject(summary.coverage)) error(errors, "coverage", "INVALID_TYPE", "coverage must be an object");
  else {
    oneOf(errors, summary.coverage.aggregateScope, "coverage.aggregateScope", PRACTICE_ERROR_AGGREGATE_SCOPES);
    oneOf(errors, summary.coverage.traceScope, "coverage.traceScope", PRACTICE_ERROR_TRACE_SCOPES);
    for (const key of ["retainedEventCount", "totalEventCount", "activeEpisodeTruncatedCount"]) finite(errors, summary.coverage[key], "coverage." + key, { min: 0, integer: true });
    if (typeof summary.coverage.traceTruncated !== "boolean") error(errors, "coverage.traceTruncated", "INVALID_TYPE", "traceTruncated must be boolean");
    if (Number.isFinite(summary.coverage.retainedEventCount) && Number.isFinite(summary.coverage.totalEventCount) && summary.coverage.retainedEventCount > summary.coverage.totalEventCount) error(errors, "coverage.retainedEventCount", "IMPOSSIBLE_RELATIONSHIP", "retainedEventCount exceeds totalEventCount");
    if (summary.coverage.traceTruncated && summary.coverage.traceScope !== "retained-window") error(errors, "coverage.traceScope", "IMPOSSIBLE_RELATIONSHIP", "truncated traces must use retained-window scope");
    if (!summary.coverage.traceTruncated && summary.coverage.traceScope !== "complete-session") error(errors, "coverage.traceScope", "IMPOSSIBLE_RELATIONSHIP", "untruncated traces must use complete-session scope");
  }

  const countKeys = ["errorEpisodeCount", "correctedEpisodeCount", "uncorrectedEpisodeCount", "doublingEpisodeCount", "cascadeEpisodeCount", "correctionAttemptCount", "nonErrorCorrectionActionCount", "ignoredCorrectionActionCount", "disabledCorrectionAttemptCount", "charactersRemoved", "incorrectCharactersRemoved", "correctCharactersRemoved"];
  for (const key of countKeys) finite(errors, summary[key], key, { min: 0, integer: true });
  if (summary.correctedEpisodeCount + summary.uncorrectedEpisodeCount !== summary.errorEpisodeCount) error(errors, "errorEpisodeCount", "IMPOSSIBLE_RELATIONSHIP", "corrected + uncorrected episode counts must equal errorEpisodeCount");
  if (summary.doublingEpisodeCount > summary.errorEpisodeCount || summary.cascadeEpisodeCount > summary.errorEpisodeCount) error(errors, "errorEpisodeCount", "IMPOSSIBLE_RELATIONSHIP", "episode subtype counts exceed total episodes");

  if (!isPlainObject(summary.structuralCounts)) error(errors, "structuralCounts", "INVALID_TYPE", "structuralCounts must be an object");
  else {
    for (const key of PRACTICE_ERROR_STRUCTURAL_CLASSES) finite(errors, summary.structuralCounts[key], "structuralCounts." + key, { min: 0, integer: true });
    const structuralTotal = PRACTICE_ERROR_STRUCTURAL_CLASSES.reduce((sum, key) => sum + (Number.isInteger(summary.structuralCounts[key]) ? summary.structuralCounts[key] : 0), 0);
    if (structuralTotal !== summary.errorEpisodeCount) error(errors, "structuralCounts", "IMPOSSIBLE_RELATIONSHIP", "structural counts must equal errorEpisodeCount");
  }

  if (!isPlainObject(summary.contentCounts)) error(errors, "contentCounts", "INVALID_TYPE", "contentCounts must be an object");
  else {
    const contentKeys = PRACTICE_ERROR_CONTENT_CLASSES.map((key) => key === "whitespace-boundary" ? "whitespaceBoundary" : key);
    for (const key of contentKeys) finite(errors, summary.contentCounts[key], "contentCounts." + key, { min: 0, integer: true });
    const contentTotal = contentKeys.reduce((sum, key) => sum + (Number.isInteger(summary.contentCounts[key]) ? summary.contentCounts[key] : 0), 0);
    if (contentTotal !== summary.errorEpisodeCount) error(errors, "contentCounts", "IMPOSSIBLE_RELATIONSHIP", "content counts must equal errorEpisodeCount");
  }

  if (summary.incorrectCharactersRemoved + summary.correctCharactersRemoved !== summary.charactersRemoved) error(errors, "charactersRemoved", "IMPOSSIBLE_RELATIONSHIP", "removed character classes must equal charactersRemoved");
  if (summary.charactersRemoved === 0) {
    if (summary.overDeletionRate != null) error(errors, "overDeletionRate", "IMPOSSIBLE_RELATIONSHIP", "overDeletionRate must be null without removed characters");
  } else {
    finite(errors, summary.overDeletionRate, "overDeletionRate", { min: 0, max: 1 });
    if (Number.isFinite(summary.overDeletionRate) && Math.abs(summary.overDeletionRate - summary.correctCharactersRemoved / summary.charactersRemoved) > 1e-12) error(errors, "overDeletionRate", "IMPOSSIBLE_RELATIONSHIP", "overDeletionRate denominator is inconsistent");
  }

  for (const key of ["correctionInitiationMedianMs", "correctionDistanceMedianChars", "correctionToRepairMedianMs", "errorToRepairMedianMs", "repairToResumeMedianMs", "resumeToFluentMedianMs"]) if (summary[key] != null) finite(errors, summary[key], key, { min: 0 });
  if (summary.errorEpisodeCount === 0) {
    if (summary.correctedEpisodeRate != null) error(errors, "correctedEpisodeRate", "IMPOSSIBLE_RELATIONSHIP", "correctedEpisodeRate must be null without episodes");
  } else {
    finite(errors, summary.correctedEpisodeRate, "correctedEpisodeRate", { min: 0, max: 1 });
    if (Number.isFinite(summary.correctedEpisodeRate) && Math.abs(summary.correctedEpisodeRate - summary.correctedEpisodeCount / summary.errorEpisodeCount) > 1e-12) error(errors, "correctedEpisodeRate", "IMPOSSIBLE_RELATIONSHIP", "correctedEpisodeRate denominator is inconsistent");
  }
  if (summary.episodesPer1000Insertions != null) finite(errors, summary.episodesPer1000Insertions, "episodesPer1000Insertions", { min: 0 });
  oneOf(errors, summary.classificationConfidence, "classificationConfidence", PRACTICE_ERROR_SUMMARY_CONFIDENCE);
  return result(errors);
}

export function validatePracticeSkillEvidenceSummary(summary) {
  const errors = [];
  if (!isPlainObject(summary)) return result([{ path: "skillEvidenceSummary", code: "INVALID_TYPE", message: "skillEvidenceSummary must be an object" }]);
  validateVersion(errors, summary.analysisVersion, 1, "analysisVersion");
  validateVersion(errors, summary.evidenceVersion, PRACTICE_SKILL_EVIDENCE_VERSION, "evidenceVersion");
  validateVersion(errors, summary.policyVersion, PRACTICE_SKILL_EVIDENCE_POLICY_VERSION, "policyVersion");
  oneOf(errors, summary.evidenceRole, "evidenceRole", PRACTICE_EVIDENCE_ROLES);
  if (!isPlainObject(summary.entityCounts)) error(errors, "entityCounts", "INVALID_TYPE", "entityCounts must be an object");
  else for (const key of ["key", "bigram", "trigram", "word"]) finite(errors, summary.entityCounts[key], `entityCounts.${key}`, { min: 0, integer: true });
  for (const key of ["opportunityCount", "fluentTimingCount", "disfluentTimingCount", "normalizedResidualCount", "primaryErrorEpisodeCount", "directTargetEntityCount", "omittedObservationCount"]) finite(errors, summary[key], key, { min: 0, integer: true });
  oneOf(errors, summary.accuracyScope, "accuracyScope", PRACTICE_EVIDENCE_ACCURACY_SCOPES);
  oneOf(errors, summary.timingScope, "timingScope", PRACTICE_EVIDENCE_TIMING_SCOPES);
  if (typeof summary.entityCoverageTruncated !== "boolean") error(errors, "entityCoverageTruncated", "INVALID_TYPE", "entityCoverageTruncated must be boolean");
  const entityTotal = isPlainObject(summary.entityCounts) ? ["key", "bigram", "trigram", "word"].reduce((sum, key) => sum + Number(summary.entityCounts[key] || 0), 0) : 0;
  if (summary.directTargetEntityCount > entityTotal) error(errors, "directTargetEntityCount", "IMPOSSIBLE_RELATIONSHIP", "direct target entities exceed entity count");
  if (summary.normalizedResidualCount > summary.fluentTimingCount + summary.disfluentTimingCount) error(errors, "normalizedResidualCount", "IMPOSSIBLE_RELATIONSHIP", "normalized residual count exceeds timing evidence");
  return result(errors);
}

function validateSkillEvidenceTrackerSnapshot(snapshot, errors, path = "metricsSnapshot.skillEvidenceTrackerSnapshot") {
  if (snapshot == null) return;
  if (!isPlainObject(snapshot)) return error(errors, path, "INVALID_TYPE", "skill evidence tracker snapshot must be an object or null");
  validateVersion(errors, snapshot.trackerVersion, PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION, `${path}.trackerVersion`);
  validateVersion(errors, snapshot.policyVersion, PRACTICE_SKILL_EVIDENCE_POLICY_VERSION, `${path}.policyVersion`);
  oneOf(errors, snapshot.evidenceRole, `${path}.evidenceRole`, PRACTICE_EVIDENCE_ROLES);
  if (!isPlainObject(snapshot.opportunityTracker)) error(errors, `${path}.opportunityTracker`, "INVALID_TYPE", "opportunity tracker snapshot is required");
  else {
    validateVersion(errors, snapshot.opportunityTracker.trackerVersion, PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION, `${path}.opportunityTracker.trackerVersion`);
    finite(errors, snapshot.opportunityTracker.maxFirstAttemptCursor, `${path}.opportunityTracker.maxFirstAttemptCursor`, { min: 0, integer: true });
    oneOf(errors, snapshot.opportunityTracker.accuracyScope, `${path}.opportunityTracker.accuracyScope`, PRACTICE_EVIDENCE_ACCURACY_SCOPES);
  }
  if (!Array.isArray(snapshot.entries) || snapshot.entries.length > PRACTICE_SKILL_EVIDENCE_POLICY_V1.checkpointEntityCap) error(errors, `${path}.entries`, "ARRAY_LIMIT", "checkpoint evidence entity snapshot exceeds PL11 cap");
  else for (const [index, entry] of snapshot.entries.entries()) {
    oneOf(errors, entry?.entityType, `${path}.entries[${index}].entityType`, ENTITY_TYPES);
    if (typeof entry?.entityKey !== "string" || !entry.entityKey) error(errors, `${path}.entries[${index}].entityKey`, "INVALID_ENTITY", "checkpoint entityKey is required");
    if (Array.isArray(entry?.breadthHashes) && entry.breadthHashes.length > PRACTICE_SKILL_EVIDENCE_POLICY_V1.maxBreadthPointsPerEntityPerSession) error(errors, `${path}.entries[${index}].breadthHashes`, "ARRAY_LIMIT", "checkpoint breadth hashes exceed cap");
    for (const forbidden of ["text", "containingWords", "sentenceExcerpt", "eventTrace", "rawEvents"]) if (Object.hasOwn(entry ?? {}, forbidden)) error(errors, `${path}.entries[${index}].${forbidden}`, "FORBIDDEN_FIELD", "raw content is forbidden in skill tracker snapshots");
  }
  for (const key of ["omittedObservationCount", "lastProcessedEpisodeId"]) finite(errors, snapshot[key], `${path}.${key}`, { min: 0, integer: true });
  for (const key of ["evidenceTruncated", "checkpointEvidenceTruncated"]) if (typeof snapshot[key] !== "boolean") error(errors, `${path}.${key}`, "INVALID_TYPE", `${key} must be boolean`);
}

export function validateSessionSummary(summary) {
  const errors = [];
  if (!isPlainObject(summary)) return result([{ path: "sessionSummary", code: "INVALID_TYPE", message: "sessionSummary must be an object" }]);
  validId(errors, summary.sessionId, "sessionId", "session");
  validId(errors, summary.profileId, "profileId", "profile");
  validId(errors, summary.contextId, "contextId", "context");
  validateVersion(errors, summary.recordVersion, PRACTICE_RECORD_VERSIONS.sessionSummary);
  requiredString(errors, summary.experimentId, "experimentId", 100);
  for (const key of ["experimentVersion", "sessionSchemaVersion", "contentGeneratorVersion"]) finite(errors, summary[key], key, { min: 1, integer: true });
  oneOf(errors, summary.status, "status", SESSION_STATUSES);
  oneOf(errors, summary.completionReason, "completionReason", COMPLETION_REASONS);
  for (const key of ["createdAt", "updatedAt", "startedAtUtc", "completedAtUtc"]) timestamp(errors, summary[key], key);
  if (!isValidPracticeDayKey(summary.localDayKey)) error(errors, "localDayKey", "INVALID_DAY_KEY", "localDayKey must be YYYY-MM-DD");
  finite(errors, summary.timezoneOffsetMinutesAtStart, "timezoneOffsetMinutesAtStart", { min: -840, max: 840, integer: true });
  if (summary.timezoneId != null) requiredString(errors, summary.timezoneId, "timezoneId", 100);
  for (const key of ["plannedDurationMs", "activeDurationMs", "pausedDurationMs", "wallDurationMs", "typedCharacterCount", "correctCharacterCount", "incorrectCharacterCount", "correctedErrorCount", "uncorrectedErrorCount", "wordCount", "completedWordCount"]) finite(errors, summary[key], key, { min: 0 });
  if (summary.correctCharacterCount > summary.typedCharacterCount) error(errors, "correctCharacterCount", "IMPOSSIBLE_RELATIONSHIP", "correctCharacterCount exceeds typedCharacterCount");
  if (summary.correctedErrorCount + summary.uncorrectedErrorCount > summary.incorrectCharacterCount) error(errors, "incorrectCharacterCount", "IMPOSSIBLE_RELATIONSHIP", "error detail exceeds incorrectCharacterCount");
  if (summary.completedWordCount > summary.wordCount) error(errors, "completedWordCount", "IMPOSSIBLE_RELATIONSHIP", "completedWordCount exceeds wordCount");
  if (summary.activeDurationMs > summary.wallDurationMs + 1000) error(errors, "activeDurationMs", "IMPOSSIBLE_RELATIONSHIP", "activeDurationMs exceeds wallDurationMs");
  if (isValidPracticeUtcIso(summary.startedAtUtc) && isValidPracticeUtcIso(summary.completedAtUtc) && Date.parse(summary.completedAtUtc) < Date.parse(summary.startedAtUtc)) error(errors, "completedAtUtc", "IMPOSSIBLE_RELATIONSHIP", "completedAtUtc precedes startedAtUtc");
  for (const key of ["wpm", "rawWpm"]) finite(errors, summary[key], key, { min: 0, max: 1000 });
  finite(errors, summary.accuracy, "accuracy", { min: 0, max: 100 });
  if (summary.consistency != null) finite(errors, summary.consistency, "consistency", { min: 0, max: 100 });
  if (summary.fluencySummary != null) errors.push(...validatePracticeFluencySummary(summary.fluencySummary).errors.map((entry) => ({ ...entry, path: `fluencySummary.${entry.path}` })));
  if (summary.errorSummary != null) errors.push(...validatePracticeErrorSummary(summary.errorSummary).errors.map((entry) => ({ ...entry, path: `errorSummary.${entry.path}` })));
  if (summary.normalizationSummary != null) errors.push(...validatePracticeNormalizationSummary(summary.normalizationSummary).errors.map((entry) => ({ ...entry, path: `normalizationSummary.${entry.path}` })));
  if (summary.skillEvidenceSummary != null) errors.push(...validatePracticeSkillEvidenceSummary(summary.skillEvidenceSummary).errors.map((entry) => ({ ...entry, path: `skillEvidenceSummary.${entry.path}` })));
  if (summary.abilityMeasurementSummary != null) errors.push(...validatePracticeAbilityMeasurementSummary(summary.abilityMeasurementSummary).errors.map((entry) => ({ ...entry, path: `abilityMeasurementSummary.${entry.path}` })));
  appendSerializable(errors, summary.configuration, "configuration");
  appendSerializable(errors, summary.contentDescriptor, "contentDescriptor");
  for (const key of ["beforeMetrics", "afterMetrics", "transferMetrics", "fatigueSummary", "trainingQuality"]) if (summary[key] != null) appendSerializable(errors, summary[key], key);
  if (!Array.isArray(summary.targetEntities) || summary.targetEntities.length > PRACTICE_LIMITS.targetEntities) error(errors, "targetEntities", "ARRAY_LIMIT", "targetEntities exceeds its limit");
  if (!Array.isArray(summary.recommendationIds) || summary.recommendationIds.length > PRACTICE_LIMITS.recommendationIds) error(errors, "recommendationIds", "ARRAY_LIMIT", "recommendationIds exceeds its limit");
  for (const forbidden of FORBIDDEN_SESSION_FIELDS) if (Object.hasOwn(summary, forbidden)) error(errors, forbidden, "FORBIDDEN_FIELD", `${forbidden} is forbidden in Practice summaries`);
  if (byteSize(summary) > PRACTICE_LIMITS.sessionObjectBytes) error(errors, "sessionSummary", "SERIALIZED_SIZE", "sessionSummary exceeds its size limit");
  return result(errors);
}

export function validateReviewItem(item) {
  const errors = [];
  if (!isPlainObject(item)) return result([{ path: "reviewItem", code: "INVALID_TYPE", message: "reviewItem must be an object" }]);
  validId(errors, item.reviewItemId, "reviewItemId", "review");
  validId(errors, item.profileId, "profileId", "profile");
  validId(errors, item.contextId, "contextId", "context");
  validateVersion(errors, item.recordVersion, PRACTICE_RECORD_VERSIONS.reviewItem);
  oneOf(errors, item.entityType, "entityType", ENTITY_TYPES);
  validEntityKey(errors, item.entityType, item.entityKey);
  requiredString(errors, item.sourceExperimentId, "sourceExperimentId", 100);
  oneOf(errors, item.state, "state", REVIEW_STATES);
  oneOf(errors, item.masteryState, "masteryState", MASTERY_STATES);
  for (const key of ["createdAt", "updatedAt", "dueAtUtc"]) timestamp(errors, item[key], key);
  nullableTimestamp(errors, item.lastReviewedAt, "lastReviewedAt");
  if (!isValidPracticeDayKey(item.localDueDayKey)) error(errors, "localDueDayKey", "INVALID_DAY_KEY", "localDueDayKey must be YYYY-MM-DD");
  for (const key of ["priority", "intervalDays", "successfulReviewCount", "failedReviewCount", "consecutiveSuccesses"]) finite(errors, item[key], key, { min: 0 });
  if (item.lastOutcome != null) oneOf(errors, item.lastOutcome, "lastOutcome", ["success", "failure", "partial"]);
  return result(errors);
}

export function validateCustomText(record) {
  const errors = [];
  if (!isPlainObject(record)) return result([{ path: "customText", code: "INVALID_TYPE", message: "customText must be an object" }]);
  validId(errors, record.customTextId, "customTextId", "customText");
  validId(errors, record.profileId, "profileId", "profile");
  validateVersion(errors, record.recordVersion, PRACTICE_RECORD_VERSIONS.customText);
  requiredString(errors, record.title, "title", PRACTICE_LIMITS.customTextTitleLength);
  requiredString(errors, record.normalizedTitle, "normalizedTitle", PRACTICE_LIMITS.customTextTitleLength);
  if (typeof record.text !== "string") error(errors, "text", "INVALID_TYPE", "text must be a string");
  else if ([...record.text].length > PRACTICE_LIMITS.customTextCharacters) error(errors, "text", "SERIALIZED_SIZE", "custom text exceeds the character limit");
  finite(errors, record.characterCount, "characterCount", { min: 0, max: PRACTICE_LIMITS.customTextCharacters, integer: true });
  finite(errors, record.wordCount, "wordCount", { min: 0, integer: true });
  if (typeof record.text === "string" && record.characterCount !== [...record.text].length) error(errors, "characterCount", "IMPOSSIBLE_RELATIONSHIP", "characterCount does not match text");
  requiredString(errors, record.contentHash, "contentHash", 100);
  for (const key of ["createdAt", "updatedAt"]) timestamp(errors, record[key], key);
  nullableTimestamp(errors, record.lastUsedAt, "lastUsedAt");
  requiredString(errors, record.language, "language", 40);
  if (record.privacy !== "local-only") error(errors, "privacy", "INVALID_ENUM", "custom text privacy must be local-only");
  finite(errors, record.analysisVersion, "analysisVersion", { min: 1, integer: true });
  if (record.analysisSummary != null) appendSerializable(errors, record.analysisSummary, "analysisSummary");
  return result(errors);
}

export function validatePreset(record) {
  const errors = [];
  if (!isPlainObject(record)) return result([{ path: "preset", code: "INVALID_TYPE", message: "preset must be an object" }]);
  validId(errors, record.presetId, "presetId", "preset");
  validId(errors, record.profileId, "profileId", "profile");
  validateVersion(errors, record.recordVersion, PRACTICE_RECORD_VERSIONS.preset);
  requiredString(errors, record.name, "name", PRACTICE_LIMITS.presetNameLength);
  requiredString(errors, record.normalizedName, "normalizedName", PRACTICE_LIMITS.presetNameLength);
  requiredString(errors, record.experimentId, "experimentId", 100);
  finite(errors, record.experimentVersion, "experimentVersion", { min: 1, integer: true });
  appendSerializable(errors, record.configuration, "configuration");
  timestamp(errors, record.createdAt, "createdAt");
  timestamp(errors, record.updatedAt, "updatedAt");
  return result(errors);
}

export function validateCheckpoint(record) {
  const errors = [];
  if (!isPlainObject(record)) return result([{ path: "checkpoint", code: "INVALID_TYPE", message: "checkpoint must be an object" }]);
  validId(errors, record.profileId, "profileId", "profile");
  validId(errors, record.contextId, "contextId", "context");
  validId(errors, record.sessionId, "sessionId", "session");
  validateVersion(errors, record.recordVersion, PRACTICE_RECORD_VERSIONS.checkpoint);
  requiredString(errors, record.experimentId, "experimentId", 100);
  for (const key of ["experimentVersion", "sessionSchemaVersion"]) finite(errors, record[key], key, { min: 1, integer: true });
  for (const key of ["createdAt", "updatedAt", "expiresAt"]) timestamp(errors, record[key], key);
  if (isValidPracticeUtcIso(record.createdAt) && isValidPracticeUtcIso(record.expiresAt) && Date.parse(record.expiresAt) <= Date.parse(record.createdAt)) error(errors, "expiresAt", "IMPOSSIBLE_RELATIONSHIP", "expiresAt must follow createdAt");
  oneOf(errors, record.phase, "phase", CHECKPOINT_PHASES);
  appendSerializable(errors, record.configuration, "configuration");
  appendSerializable(errors, record.contentDescriptor, "contentDescriptor");
  appendSerializable(errors, record.cursorState, "cursorState");
  appendSerializable(errors, record.metricsSnapshot, "metricsSnapshot", PRACTICE_LIMITS.checkpointBytes);
  validateSkillEvidenceTrackerSnapshot(record.metricsSnapshot?.skillEvidenceTrackerSnapshot ?? null, errors);
  if (record.contentSnapshot != null && typeof record.contentSnapshot !== "string") error(errors, "contentSnapshot", "INVALID_TYPE", "contentSnapshot must be text or null");
  if (record.contentReference != null && typeof record.contentReference !== "string") error(errors, "contentReference", "INVALID_TYPE", "contentReference must be a string or null");
  requiredString(errors, record.contentHash, "contentHash", 100);
  if (typeof record.typedBuffer !== "string") error(errors, "typedBuffer", "INVALID_TYPE", "typedBuffer must be text");
  for (const key of ["completedUnitCount", "activeElapsedMs", "pausedElapsedMs"]) finite(errors, record[key], key, { min: 0 });
  if (typeof record.resumable !== "boolean") error(errors, "resumable", "INVALID_TYPE", "resumable must be boolean");
  if (record.recoveryReason != null) requiredString(errors, record.recoveryReason, "recoveryReason", 100);
  for (const forbidden of ["rawEvents", "eventTrace", "latencySamples"]) if (Object.hasOwn(record, forbidden)) error(errors, forbidden, "FORBIDDEN_FIELD", `${forbidden} is not checkpoint data`);
  if (byteSize(record) > PRACTICE_LIMITS.checkpointBytes) error(errors, "checkpoint", "SERIALIZED_SIZE", "checkpoint exceeds its size limit");
  return result(errors);
}

export function normalizePracticeSettings(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return {
    settingsVersion: 1,
    dailySessionLengthMinutes: Number(source.dailySessionLengthMinutes ?? 12),
    targetTrainingDaysPerWeek: Number(source.targetTrainingDaysPerWeek ?? 5),
    preferredContentTypes: Array.isArray(source.preferredContentTypes) ? [...source.preferredContentTypes] : ["common-words"],
    punctuationFrequency: String(source.punctuationFrequency ?? "low").toLowerCase(),
    numbersFrequency: String(source.numbersFrequency ?? "low").toLowerCase(),
    soundEnabled: source.soundEnabled === true,
    metronomeSoundEnabled: source.metronomeSoundEnabled === true,
    keyboardLayout: String(source.keyboardLayout ?? "qwerty").trim().toLowerCase(),
    correctionBehavior: String(source.correctionBehavior ?? "allow").toLowerCase(),
    difficultyPreference: String(source.difficultyPreference ?? "adaptive").toLowerCase(),
    reducedMotion: String(source.reducedMotion ?? "system").toLowerCase(),
    showLiveWpm: source.showLiveWpm === true,
    showLiveAccuracy: source.showLiveAccuracy !== false,
    showRhythmFeedback: source.showRhythmFeedback !== false,
  };
}

export function normalizePracticeManifest(value) {
  if (!isPlainObject(value)) return null;
  return {
    ...value,
    manifestVersion: Number(value.manifestVersion),
    databaseVersion: PRACTICE_DATABASE_VERSION,
    settings: normalizePracticeSettings(value.settings),
  };
}

export function normalizeSkillStat(value) {
  if (!isPlainObject(value)) return null;
  const copy = {
    ...value,
    entityType: String(value.entityType || "").toLowerCase(),
    entityKey: String(value.entityKey || ""),
  };
  if (Number(copy.recordVersion) >= 3) return copy;
  return {
    ...copy,
    recentLatencySamples: Array.isArray(value.recentLatencySamples)
      ? value.recentLatencySamples.slice(-PRACTICE_LIMITS.recentLatencySamples)
      : [],
  };
}

export function normalizeSessionSummary(value) {
  if (!isPlainObject(value)) return null;
  const copy = { ...value };
  for (const key of FORBIDDEN_SESSION_FIELDS) delete copy[key];
  return copy;
}

export function normalizeCustomTextMetadata(value) {
  if (!isPlainObject(value)) return null;
  const title = String(value.title ?? "").trim().replace(/\s+/g, " ");
  return { ...value, title, normalizedTitle: title.toLocaleLowerCase(), privacy: "local-only" };
}
