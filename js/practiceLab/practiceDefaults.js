import {
  CHECKPOINT_PHASES,
  LATENCY_HISTOGRAM_BOUNDS_MS,
  PRACTICE_DATABASE_NAME,
  PRACTICE_DATABASE_VERSION,
  PRACTICE_LIMITS,
  PRACTICE_MANIFEST_VERSION,
  PRACTICE_RECORD_VERSIONS,
} from "./practiceConstants.js";
import {
  createDefaultPracticeContextId,
  createPracticeCustomTextId,
  createPracticePresetId,
  createPracticeProfileId,
  createPracticeReviewItemId,
  createPracticeSessionId,
  createSkillStatId,
  hashPracticeContent,
} from "./practiceIds.js";
import {
  addPracticeMilliseconds,
  getPracticeTimeContext,
  toPracticeUtcIso,
} from "./practiceTime.js";

const freshObject = (value) => JSON.parse(JSON.stringify(value));

export function createDefaultPracticeSettings(overrides = {}) {
  return {
    settingsVersion: 1,
    dailySessionLengthMinutes: 12,
    targetTrainingDaysPerWeek: 5,
    preferredContentTypes: ["common-words"],
    punctuationFrequency: "low",
    numbersFrequency: "low",
    soundEnabled: false,
    metronomeSoundEnabled: false,
    keyboardLayout: "qwerty",
    correctionBehavior: "allow",
    difficultyPreference: "adaptive",
    reducedMotion: "system",
    showLiveWpm: false,
    showLiveAccuracy: true,
    showRhythmFeedback: true,
    ...freshObject(overrides),
  };
}

export function createDefaultDashboardSummary(overrides = {}) {
  return {
    sustainableWpm: null,
    burstWpm: null,
    controlledWpm: null,
    overallAccuracy: null,
    consistency: null,
    primaryLimiterIds: [],
    dueReviewCount: 0,
    recentTrend: "insufficient-data",
    ...freshObject(overrides),
  };
}

export function createDefaultPracticeManifest({
  profileId = createPracticeProfileId(),
  now = Date.now,
  settings = {},
  overrides = {},
} = {}) {
  const timestamp = toPracticeUtcIso(now);
  return {
    manifestVersion: PRACTICE_MANIFEST_VERSION,
    profileId,
    databaseName: PRACTICE_DATABASE_NAME,
    databaseVersion: PRACTICE_DATABASE_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    settings: createDefaultPracticeSettings(settings),
    onboarding: {
      currentVersion: 1,
      completedVersion: 0,
      dismissed: false,
      completedAt: null,
    },
    assessmentState: "never-started",
    dashboardSummary: createDefaultDashboardSummary(),
    lastCompletedSessionAt: null,
    lastAssessmentAt: null,
    activeCheckpointMetadata: null,
    storageHealth: "healthy",
    lastSuccessfulMigration: PRACTICE_MANIFEST_VERSION,
    ...freshObject(overrides),
  };
}

export function createDefaultPracticeProfile({
  profileId = createPracticeProfileId(),
  now = Date.now,
  locale = "en",
  keyboardLayout = "qwerty",
  activeContextId = createDefaultPracticeContextId(profileId),
  overrides = {},
} = {}) {
  const timestamp = toPracticeUtcIso(now);
  return {
    profileId,
    recordVersion: PRACTICE_RECORD_VERSIONS.profile,
    createdAt: timestamp,
    updatedAt: timestamp,
    dataLocale: locale,
    keyboardLayout,
    activeContextId,
    firstAssessmentCompleted: false,
    firstAssessmentCompletedAt: null,
    lastAssessmentAt: null,
    lastPracticeAt: null,
    lastTrainingDayKey: null,
    totalCompletedSessions: 0,
    totalPracticeDurationMs: 0,
    activeTrainingDays: 0,
    settingsVersion: 1,
    summaryVersion: 1,
    dashboardSummary: createDefaultDashboardSummary(),
    ...freshObject(overrides),
  };
}

export function createDefaultSkillStat({
  profileId = createPracticeProfileId(),
  contextId = createDefaultPracticeContextId(profileId),
  entityType = "key",
  entityKey = "a",
  statId = createSkillStatId(profileId, contextId, entityType, entityKey),
  now = Date.now,
  overrides = {},
} = {}) {
  const timestamp = toPracticeUtcIso(now);
  return {
    statId,
    profileId,
    contextId,
    entityType,
    entityKey,
    recordVersion: PRACTICE_RECORD_VERSIONS.skillStat,
    createdAt: timestamp,
    updatedAt: timestamp,
    sampleCount: 0,
    correctCount: 0,
    errorCount: 0,
    correctedErrorCount: 0,
    uncorrectedErrorCount: 0,
    latencyCount: 0,
    latencyMeanMs: 0,
    latencyM2: 0,
    latencyMinMs: null,
    latencyMaxMs: null,
    latencyEmaMs: null,
    latencyHistogram: LATENCY_HISTOGRAM_BOUNDS_MS.map(() => 0),
    recentLatencySamples: [],
    lastObservedAt: null,
    lastPractisedAt: null,
    recentTrend: "insufficient-data",
    confidenceScore: 0,
    confidenceLevel: "none",
    weaknessScore: 0,
    priority: 0,
    masteryState: "unmeasured",
    successfulReviewCount: 0,
    failedReviewCount: 0,
    ...freshObject(overrides),
  };
}

export function createDefaultSessionSummary({
  sessionId = createPracticeSessionId(),
  profileId = createPracticeProfileId(),
  contextId = createDefaultPracticeContextId(profileId),
  experimentId = "foundation-test",
  now = Date.now,
  overrides = {},
} = {}) {
  const context = getPracticeTimeContext(now);
  return {
    sessionId,
    profileId,
    contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.sessionSummary,
    experimentId,
    experimentVersion: 1,
    sessionSchemaVersion: 1,
    contentGeneratorVersion: 1,
    status: "completed",
    completionReason: "manual-stop",
    createdAt: context.utc,
    updatedAt: context.utc,
    startedAtUtc: context.utc,
    completedAtUtc: context.utc,
    localDayKey: context.localDayKey,
    timezoneOffsetMinutesAtStart: context.timezoneOffsetMinutes,
    timezoneId: context.timezoneId,
    plannedDurationMs: 0,
    activeDurationMs: 0,
    pausedDurationMs: 0,
    wallDurationMs: 0,
    configuration: {},
    contentDescriptor: { type: "generated", contentId: null },
    targetEntities: [],
    typedCharacterCount: 0,
    correctCharacterCount: 0,
    incorrectCharacterCount: 0,
    correctedErrorCount: 0,
    uncorrectedErrorCount: 0,
    wordCount: 0,
    completedWordCount: 0,
    wpm: 0,
    rawWpm: 0,
    accuracy: 0,
    consistency: null,
    fluencySummary: null,
    errorSummary: null,
    normalizationSummary: null,
    beforeMetrics: null,
    afterMetrics: null,
    transferMetrics: null,
    fatigueSummary: null,
    trainingQuality: null,
    recommendationIds: [],
    ...freshObject(overrides),
  };
}

export function createDefaultReviewItem({
  reviewItemId = createPracticeReviewItemId(),
  profileId = createPracticeProfileId(),
  contextId = createDefaultPracticeContextId(profileId),
  entityType = "key",
  entityKey = "a",
  now = Date.now,
  overrides = {},
} = {}) {
  const timestamp = toPracticeUtcIso(now);
  const localDayKey = getPracticeTimeContext(now).localDayKey;
  return {
    reviewItemId,
    profileId,
    contextId,
    recordVersion: PRACTICE_RECORD_VERSIONS.reviewItem,
    entityType,
    entityKey,
    sourceExperimentId: "foundation",
    state: "new",
    priority: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastReviewedAt: null,
    dueAtUtc: timestamp,
    localDueDayKey: localDayKey,
    intervalDays: 0,
    successfulReviewCount: 0,
    failedReviewCount: 0,
    consecutiveSuccesses: 0,
    lastOutcome: null,
    masteryState: "unmeasured",
    ...freshObject(overrides),
  };
}

export function createDefaultCustomText({
  customTextId = createPracticeCustomTextId(),
  profileId = createPracticeProfileId(),
  title = "Untitled",
  text = "",
  now = Date.now,
  overrides = {},
} = {}) {
  const timestamp = toPracticeUtcIso(now);
  const normalizedTitle = String(title).trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return {
    customTextId,
    profileId,
    recordVersion: PRACTICE_RECORD_VERSIONS.customText,
    title: String(title).trim().replace(/\s+/g, " "),
    normalizedTitle,
    text: String(text),
    characterCount: [...String(text)].length,
    wordCount: String(text).trim() ? String(text).trim().split(/\s+/u).length : 0,
    contentHash: hashPracticeContent(text),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastUsedAt: null,
    language: "und",
    privacy: "local-only",
    analysisVersion: 1,
    analysisSummary: null,
    ...freshObject(overrides),
  };
}

export function createDefaultPreset({
  presetId = createPracticePresetId(),
  profileId = createPracticeProfileId(),
  name = "New preset",
  experimentId = "foundation-test",
  now = Date.now,
  overrides = {},
} = {}) {
  const timestamp = toPracticeUtcIso(now);
  const cleanName = String(name).trim().replace(/\s+/g, " ");
  return {
    presetId,
    profileId,
    recordVersion: PRACTICE_RECORD_VERSIONS.preset,
    name: cleanName,
    normalizedName: cleanName.toLocaleLowerCase(),
    experimentId,
    experimentVersion: 1,
    configuration: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...freshObject(overrides),
  };
}

export function createDefaultCheckpoint({
  profileId = createPracticeProfileId(),
  contextId = createDefaultPracticeContextId(profileId),
  sessionId = createPracticeSessionId(),
  experimentId = "foundation-test",
  now = Date.now,
  overrides = {},
} = {}) {
  const createdAt = toPracticeUtcIso(now);
  return {
    profileId,
    contextId,
    sessionId,
    recordVersion: PRACTICE_RECORD_VERSIONS.checkpoint,
    experimentId,
    experimentVersion: 1,
    sessionSchemaVersion: 1,
    createdAt,
    updatedAt: createdAt,
    expiresAt: addPracticeMilliseconds(createdAt, PRACTICE_LIMITS.checkpointTtlMs),
    phase: CHECKPOINT_PHASES[0],
    configuration: {},
    contentDescriptor: { type: "generated", contentId: null },
    contentSnapshot: null,
    contentReference: null,
    contentHash: "none",
    cursorState: { unitIndex: 0, characterIndex: 0 },
    typedBuffer: "",
    completedUnitCount: 0,
    activeElapsedMs: 0,
    pausedElapsedMs: 0,
    metricsSnapshot: {},
    resumable: true,
    recoveryReason: null,
    ...freshObject(overrides),
  };
}

export { createDefaultPracticeContext } from "./practiceContext.js";
