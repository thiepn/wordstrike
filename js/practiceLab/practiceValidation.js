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
import { isValidPracticeDayKey, isValidPracticeUtcIso } from "./practiceTime.js";

const SETTINGS_ENUMS = Object.freeze({
  punctuationFrequency: ["none", "low", "medium", "high"],
  numbersFrequency: ["none", "low", "medium", "high"],
  correctionBehavior: ["allow", "strict", "word-reset"],
  difficultyPreference: ["gentle", "adaptive", "challenging"],
  reducedMotion: ["system", "reduce", "full"],
});

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
    Object.entries(entry).forEach(([key, child]) => visit(child, `${currentPath}.${key}`, depth + 1));
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
  if (typeof profile.firstAssessmentCompleted !== "boolean") error(errors, "firstAssessmentCompleted", "INVALID_TYPE", "firstAssessmentCompleted must be boolean");
  for (const key of ["firstAssessmentCompletedAt", "lastAssessmentAt", "lastPracticeAt"]) nullableTimestamp(errors, profile[key], key);
  for (const key of ["totalCompletedSessions", "totalPracticeDurationMs", "activeTrainingDays", "settingsVersion", "summaryVersion"]) finite(errors, profile[key], key, { min: 0, integer: true });
  validateDashboard(errors, profile.dashboardSummary);
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

export function validateSkillStat(stat) {
  const errors = [];
  if (!isPlainObject(stat)) return result([{ path: "skillStat", code: "INVALID_TYPE", message: "skillStat must be an object" }]);
  requiredString(errors, stat.statId, "statId", 500);
  validId(errors, stat.profileId, "profileId", "profile");
  validateVersion(errors, stat.recordVersion, PRACTICE_RECORD_VERSIONS.skillStat);
  oneOf(errors, stat.entityType, "entityType", ENTITY_TYPES);
  validEntityKey(errors, stat.entityType, stat.entityKey);
  if (
    typeof stat.profileId === "string"
    && typeof stat.entityType === "string"
    && typeof stat.entityKey === "string"
    && stat.statId !== createSkillStatId(stat.profileId, stat.entityType, stat.entityKey)
  ) error(errors, "statId", "IDENTITY_MISMATCH", "statId does not match the profile/entity identity");
  timestamp(errors, stat.createdAt, "createdAt");
  timestamp(errors, stat.updatedAt, "updatedAt");
  for (const key of ["sampleCount", "correctCount", "errorCount", "correctedErrorCount", "uncorrectedErrorCount", "latencyCount", "successfulReviewCount", "failedReviewCount"]) finite(errors, stat[key], key, { min: 0, integer: true });
  if (stat.correctCount + stat.errorCount > stat.sampleCount) error(errors, "sampleCount", "IMPOSSIBLE_RELATIONSHIP", "correct and error counts exceed sampleCount");
  if (stat.correctedErrorCount + stat.uncorrectedErrorCount > stat.errorCount) error(errors, "errorCount", "IMPOSSIBLE_RELATIONSHIP", "error detail exceeds errorCount");
  for (const key of ["latencyMeanMs", "latencyM2", "confidenceScore", "weaknessScore", "priority"]) finite(errors, stat[key], key, { min: 0 });
  for (const key of ["latencyMinMs", "latencyMaxMs", "latencyEmaMs"]) if (stat[key] != null) finite(errors, stat[key], key, { min: 0 });
  if (!Array.isArray(stat.latencyHistogram) || stat.latencyHistogram.length !== LATENCY_HISTOGRAM_BOUNDS_MS.length || stat.latencyHistogram.some((value) => !Number.isInteger(value) || value < 0)) error(errors, "latencyHistogram", "INVALID_HISTOGRAM", "latencyHistogram has invalid buckets");
  if (!Array.isArray(stat.recentLatencySamples) || stat.recentLatencySamples.length > PRACTICE_LIMITS.recentLatencySamples || stat.recentLatencySamples.some((value) => !Number.isFinite(value) || value < 0)) error(errors, "recentLatencySamples", "ARRAY_LIMIT", "recentLatencySamples is invalid");
  oneOf(errors, stat.confidenceLevel, "confidenceLevel", CONFIDENCE_LEVELS);
  oneOf(errors, stat.masteryState, "masteryState", MASTERY_STATES);
  nullableTimestamp(errors, stat.lastObservedAt, "lastObservedAt");
  nullableTimestamp(errors, stat.lastPractisedAt, "lastPractisedAt");
  return result(errors);
}

function appendSerializable(errors, value, path, bytes = PRACTICE_LIMITS.configurationBytes) {
  errors.push(...validatePracticeSerializable(value, { path, maxBytes: bytes }).errors);
}

export function validateSessionSummary(summary) {
  const errors = [];
  if (!isPlainObject(summary)) return result([{ path: "sessionSummary", code: "INVALID_TYPE", message: "sessionSummary must be an object" }]);
  validId(errors, summary.sessionId, "sessionId", "session");
  validId(errors, summary.profileId, "profileId", "profile");
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
  appendSerializable(errors, summary.configuration, "configuration");
  appendSerializable(errors, summary.contentDescriptor, "contentDescriptor");
  for (const key of ["beforeMetrics", "afterMetrics", "transferMetrics", "fatigueSummary", "trainingQuality"]) if (summary[key] != null) appendSerializable(errors, summary[key], key);
  if (!Array.isArray(summary.targetEntities) || summary.targetEntities.length > PRACTICE_LIMITS.targetEntities) error(errors, "targetEntities", "ARRAY_LIMIT", "targetEntities exceeds its limit");
  if (!Array.isArray(summary.recommendationIds) || summary.recommendationIds.length > PRACTICE_LIMITS.recommendationIds) error(errors, "recommendationIds", "ARRAY_LIMIT", "recommendationIds exceeds its limit");
  for (const forbidden of ["rawEvents", "eventTrace", "leaderboardEligible", "submissionPayload", "accessToken"]) if (Object.hasOwn(summary, forbidden)) error(errors, forbidden, "FORBIDDEN_FIELD", `${forbidden} is forbidden in Practice summaries`);
  if (byteSize(summary) > PRACTICE_LIMITS.sessionObjectBytes) error(errors, "sessionSummary", "SERIALIZED_SIZE", "sessionSummary exceeds its size limit");
  return result(errors);
}

export function validateReviewItem(item) {
  const errors = [];
  if (!isPlainObject(item)) return result([{ path: "reviewItem", code: "INVALID_TYPE", message: "reviewItem must be an object" }]);
  validId(errors, item.reviewItemId, "reviewItemId", "review");
  validId(errors, item.profileId, "profileId", "profile");
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
  appendSerializable(errors, record.metricsSnapshot, "metricsSnapshot");
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
    settings: normalizePracticeSettings(value.settings),
  };
}

export function normalizeSkillStat(value) {
  if (!isPlainObject(value)) return null;
  return {
    ...value,
    entityType: String(value.entityType || "").toLowerCase(),
    entityKey: String(value.entityKey || ""),
    recentLatencySamples: Array.isArray(value.recentLatencySamples)
      ? value.recentLatencySamples.slice(-PRACTICE_LIMITS.recentLatencySamples)
      : [],
  };
}

export function normalizeSessionSummary(value) {
  if (!isPlainObject(value)) return null;
  const copy = { ...value };
  for (const key of ["rawEvents", "eventTrace", "leaderboardEligible", "submissionPayload", "accessToken"]) delete copy[key];
  return copy;
}

export function normalizeCustomTextMetadata(value) {
  if (!isPlainObject(value)) return null;
  const title = String(value.title ?? "").trim().replace(/\s+/g, " ");
  return { ...value, title, normalizedTitle: title.toLocaleLowerCase(), privacy: "local-only" };
}
