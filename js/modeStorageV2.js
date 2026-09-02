import {
  getModeDefinition,
  getRegisteredModes,
  MODE_IDS,
} from "./modes.js";
import { SPEED_TEST_CONFIG_IDS } from "./speedTestConfig.js";
import {
  LEGACY_SPEED_TEST_WORD_SET_ID,
  SPEED_TEST_WORD_SET,
} from "./speedTestWords.js";
import {
  createDefaultDailyRecords,
  MAX_DAILY_RECORD_DAYS,
  updateDailyRecords,
} from "./dailyRecords.js";
import { getUtcDateKey, isValidDailyDateKey } from "./dailyDate.js";
import { DAILY_CHALLENGE_VERSION, DAILY_TOTAL_WORDS } from "./dailyConfig.js";
import { getDailyChallengeSeed } from "./dailyGenerator.js";
import {
  createDefaultPlayerProfile,
  getPublicPlayerProfile as selectPublicPlayerProfile,
  sanitizePlayerProfile,
  updateDisplayName,
  validateDisplayName,
} from "./playerProfile.js";
import {
  applyResultToLifetimeStatistics,
  createDefaultLifetimeStatistics,
  sanitizeLifetimeStatistics,
} from "./lifetimeStatistics.js";

export const MODE_DATA_STORAGE_KEY = "wordstrike_mode_data_v2";
export const LEGACY_MODE_DATA_STORAGE_KEY = "wordstrike_mode_data_v1";
export const LEGACY_DAILY_STORAGE_KEY = "wordstrike_daily_legacy_v1";
export const MODE_DATA_SCHEMA_VERSION = 2;
export const MAX_RECENT_SESSIONS = 30;
const MAX_RECORDED_SESSION_IDS = 100;
const LEGACY_DAILY_SCHEMA_VERSION = 1;

const ACTIVE_MODE_IDS = Object.freeze(
  getRegisteredModes()
    .map(({ id }) => id)
    .filter((id) => id !== MODE_IDS.DAILY),
);
const ACTIVE_MODE_ID_SET = new Set(ACTIVE_MODE_IDS);

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : fallback;
}

function nullableFinite(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? Math.max(0, number) : fallback;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function readJsonStorage(key) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJsonStorage(key, value) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function createSpeedTestRecord() {
  return {
    bestWpm: null,
    bestRawWpm: null,
    bestAccuracy: null,
    bestExactWords: null,
    bestResultAt: null,
    sessionId: null,
    tieAccuracy: null,
    tieRawWpm: null,
  };
}

function createSpeedTestRecordMap() {
  return Object.fromEntries(
    SPEED_TEST_CONFIG_IDS.map((configId) => [configId, createSpeedTestRecord()]),
  );
}

function createSpeedTestUsageMap() {
  return Object.fromEntries(SPEED_TEST_CONFIG_IDS.map((configId) => [configId, 0]));
}

function createModeActivity() {
  return {
    activityVersion: 1,
    trackedSessions: 0,
    activePlaytimeMs: 0,
    wordsCompleted: 0,
    wordsMissed: 0,
    charactersCorrect: 0,
    charactersIncorrect: 0,
    charactersMissed: 0,
    totalKeystrokes: 0,
    accuracyNumerator: 0,
    accuracyDenominator: 0,
    wpmWeightedTotal: 0,
    wpmWeightedDurationMs: 0,
    coreBreaches: 0,
  };
}

function createEndlessRecords() {
  return {
    bestStage: null,
    highestScore: null,
    longestSurvival: null,
    mostWordsCompleted: null,
    highestCombo: null,
    highestPerfectStreak: null,
    bestAccuracy: null,
    bestAverageWpm: null,
  };
}

export function createDefaultArcadeRushRecords() {
  return {
    highestScore: null,
    bestCompletedScore: null,
    fastestCompletion: null,
    highestCombo: null,
    bestAccuracy: null,
    bestWpm: null,
    mostPerfectWaves: null,
    runsStarted: 0,
    runsCompleted: 0,
    bossesDefeated: 0,
  };
}

function createModeSummary(modeId) {
  const summary = {
    completedSessions: 0,
    failedSessions: 0,
    activePlaytimeMs: 0,
    bestWpm: null,
    bestAccuracy: null,
    highestScore: null,
    activity: createModeActivity(),
  };
  if (modeId === MODE_IDS.SPEED_TEST) {
    summary.records = createSpeedTestRecordMap();
    summary.configUsage = createSpeedTestUsageMap();
    summary.wordSetRecords = {
      [SPEED_TEST_WORD_SET.id]: createSpeedTestRecordMap(),
    };
    summary.wordSetConfigUsage = {
      [SPEED_TEST_WORD_SET.id]: createSpeedTestUsageMap(),
    };
    summary.wordSetActivity = {
      [SPEED_TEST_WORD_SET.id]: createModeActivity(),
    };
  }
  if (modeId === MODE_IDS.ENDLESS) {
    summary.highestStage = null;
    summary.records = createEndlessRecords();
  }
  if (modeId === MODE_IDS.ARCADE_RUSH) {
    summary.records = createDefaultArcadeRushRecords();
  }
  if (modeId === MODE_IDS.DAILY) {
    summary.records = createDefaultDailyRecords();
  }
  return summary;
}

export function createDefaultModeData() {
  return {
    schemaVersion: MODE_DATA_SCHEMA_VERSION,
    profile: null,
    lifetime: createDefaultLifetimeStatistics(),
    totals: {
      completedSessions: 0,
      failedSessions: 0,
      activePlaytimeMs: 0,
      charactersTyped: 0,
      correctCharacters: 0,
      incorrectCharacters: 0,
      missedCharacters: 0,
      wordsCompleted: 0,
    },
    modes: Object.fromEntries(
      ACTIVE_MODE_IDS.map((modeId) => [modeId, createModeSummary(modeId)]),
    ),
    recentSessions: [],
    recordedSessionIds: [],
  };
}

function sanitizeSpeedTestRecord(value) {
  return {
    bestWpm: nullableFinite(value?.bestWpm),
    bestRawWpm: nullableFinite(value?.bestRawWpm),
    bestAccuracy: nullableFinite(value?.bestAccuracy),
    bestExactWords: nullableFinite(value?.bestExactWords),
    bestResultAt: nullableFinite(value?.bestResultAt),
    sessionId: typeof value?.sessionId === "string" ? value.sessionId : null,
    tieAccuracy: nullableFinite(value?.tieAccuracy),
    tieRawWpm: nullableFinite(value?.tieRawWpm),
  };
}

function sanitizeRecordObject(value, fields) {
  if (!value || typeof value !== "object") return null;
  const record = {};
  for (const field of fields) {
    record[field] = field === "sessionId"
      ? (typeof value[field] === "string" ? value[field] : null)
      : nullableFinite(value[field]);
  }
  return record;
}

function sanitizeEndlessRecords(value) {
  return {
    bestStage: sanitizeRecordObject(value?.bestStage, [
      "stage", "score", "wordsCompleted", "accuracy", "achievedAt", "sessionId",
    ]),
    highestScore: sanitizeRecordObject(value?.highestScore, [
      "score", "stage", "wordsCompleted", "accuracy", "achievedAt", "sessionId",
    ]),
    longestSurvival: sanitizeRecordObject(value?.longestSurvival, [
      "survivalTimeMs", "stage", "achievedAt", "sessionId",
    ]),
    mostWordsCompleted: sanitizeRecordObject(value?.mostWordsCompleted, [
      "wordsCompleted", "stage", "achievedAt", "sessionId",
    ]),
    highestCombo: sanitizeRecordObject(value?.highestCombo, [
      "value", "stage", "achievedAt", "sessionId",
    ]),
    highestPerfectStreak: sanitizeRecordObject(value?.highestPerfectStreak, [
      "value", "stage", "achievedAt", "sessionId",
    ]),
    bestAccuracy: sanitizeRecordObject(value?.bestAccuracy, [
      "value", "stage", "achievedAt", "sessionId",
    ]),
    bestAverageWpm: sanitizeRecordObject(value?.bestAverageWpm, [
      "value", "stage", "achievedAt", "sessionId",
    ]),
  };
}

function sanitizeArcadeRushRecords(value) {
  const defaults = createDefaultArcadeRushRecords();
  return {
    highestScore: nullableFinite(value?.highestScore),
    bestCompletedScore: nullableFinite(value?.bestCompletedScore),
    fastestCompletion: nullableFinite(value?.fastestCompletion),
    highestCombo: nullableFinite(value?.highestCombo),
    bestAccuracy: nullableFinite(value?.bestAccuracy),
    bestWpm: nullableFinite(value?.bestWpm),
    mostPerfectWaves: nullableFinite(value?.mostPerfectWaves),
    runsStarted: safeInteger(value?.runsStarted, defaults.runsStarted),
    runsCompleted: safeInteger(value?.runsCompleted, defaults.runsCompleted),
    bossesDefeated: safeInteger(value?.bossesDefeated, defaults.bossesDefeated),
  };
}

function sanitizeDailyBest(value) {
  if (!value || typeof value !== "object") return null;
  return {
    success: value.success === true,
    score: finiteNonNegative(value.score),
    activeDurationMs: finiteNonNegative(value.activeDurationMs),
    accuracy: Math.max(0, Math.min(100, finiteNonNegative(value.accuracy))),
    wordsCompleted: finiteNonNegative(value.wordsCompleted),
    wordsResolved: finiteNonNegative(value.wordsResolved),
    integrityRemaining: finiteNonNegative(value.integrityRemaining),
    endedAt: finiteNonNegative(value.endedAt),
    sessionId: typeof value.sessionId === "string" ? value.sessionId : null,
  };
}

function sanitizeDailyRecords(value) {
  const entries = Object.entries(value?.days || {})
    .filter(([dateKey]) => isValidDailyDateKey(dateKey))
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, MAX_DAILY_RECORD_DAYS)
    .map(([dateKey, day]) => [dateKey, {
      attempts: finiteNonNegative(day?.attempts),
      best: sanitizeDailyBest(day?.best),
      firstCompletedAt: nullableFinite(day?.firstCompletedAt),
      lastAttemptAt: nullableFinite(day?.lastAttemptAt),
    }]);
  return {
    currentStreak: finiteNonNegative(value?.currentStreak),
    bestStreak: finiteNonNegative(value?.bestStreak),
    distinctCompletedDays: value?.distinctCompletedDays == null
      ? entries.filter(([, day]) => day.firstCompletedAt != null || day.best?.success).length
      : finiteNonNegative(value.distinctCompletedDays),
    lastSuccessfulDateKey: isValidDailyDateKey(value?.lastSuccessfulDateKey)
      ? value.lastSuccessfulDateKey
      : null,
    days: Object.fromEntries(entries),
  };
}

function sanitizeModeActivity(value) {
  const defaults = createModeActivity();
  if (!value || typeof value !== "object" || value.activityVersion !== 1) return defaults;
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [
    key,
    key === "activityVersion" ? 1 : finiteNonNegative(value[key], fallback),
  ]));
}

function sanitizeModeSummary(value, modeId) {
  const defaults = createModeSummary(modeId);
  const summary = {
    ...defaults,
    completedSessions: finiteNonNegative(value?.completedSessions),
    failedSessions: finiteNonNegative(value?.failedSessions),
    activePlaytimeMs: finiteNonNegative(value?.activePlaytimeMs),
    bestWpm: nullableFinite(value?.bestWpm),
    bestAccuracy: nullableFinite(value?.bestAccuracy),
    highestScore: nullableFinite(value?.highestScore),
    activity: sanitizeModeActivity(value?.activity),
  };
  if (modeId === MODE_IDS.SPEED_TEST) {
    summary.records = Object.fromEntries(SPEED_TEST_CONFIG_IDS.map((configId) => [
      configId,
      sanitizeSpeedTestRecord(value?.records?.[configId]),
    ]));
    summary.configUsage = Object.fromEntries(SPEED_TEST_CONFIG_IDS.map((configId) => [
      configId,
      finiteNonNegative(value?.configUsage?.[configId]),
    ]));
    summary.wordSetRecords = {
      [SPEED_TEST_WORD_SET.id]: Object.fromEntries(SPEED_TEST_CONFIG_IDS.map((configId) => [
        configId,
        sanitizeSpeedTestRecord(value?.wordSetRecords?.[SPEED_TEST_WORD_SET.id]?.[configId]),
      ])),
    };
    summary.wordSetConfigUsage = {
      [SPEED_TEST_WORD_SET.id]: Object.fromEntries(SPEED_TEST_CONFIG_IDS.map((configId) => [
        configId,
        finiteNonNegative(value?.wordSetConfigUsage?.[SPEED_TEST_WORD_SET.id]?.[configId]),
      ])),
    };
    summary.wordSetActivity = {
      [SPEED_TEST_WORD_SET.id]: sanitizeModeActivity(
        value?.wordSetActivity?.[SPEED_TEST_WORD_SET.id],
      ),
    };
  }
  if (modeId === MODE_IDS.ENDLESS) {
    summary.highestStage = nullableFinite(value?.highestStage);
    summary.records = sanitizeEndlessRecords(value?.records);
  }
  if (modeId === MODE_IDS.ARCADE_RUSH) {
    summary.records = sanitizeArcadeRushRecords(value?.records);
  }
  if (modeId === MODE_IDS.DAILY) {
    summary.records = sanitizeDailyRecords(value?.records);
  }
  return summary;
}

function sanitizeRecentSummary(value) {
  if (
    !value ||
    typeof value.sessionId !== "string" ||
    !ACTIVE_MODE_ID_SET.has(value.modeId)
  ) {
    return null;
  }
  const maxCombo = finiteNonNegative(
    value.combo?.maximum ?? value.modeData?.maxCombo ?? value.modeData?.maximumCombo,
  );
  return {
    sessionId: value.sessionId,
    modeId: value.modeId,
    variantId: typeof value.variantId === "string" ? value.variantId : null,
    endedAt: finiteNonNegative(value.endedAt),
    success: value.success === true,
    score: value.score == null ? null : finiteNonNegative(value.score),
    grade: typeof value.grade === "string" ? value.grade : null,
    accuracy: Math.max(0, Math.min(100, finiteNonNegative(value.accuracy))),
    wpm: finiteNonNegative(value.wpm),
    activeDurationMs: finiteNonNegative(value.activeDurationMs),
    modeData: {
      level: Number.isInteger(Number(value.modeData?.level)) ? Number(value.modeData.level) : null,
      configId: typeof value.modeData?.configId === "string" ? value.modeData.configId : null,
      wordSetId: typeof value.modeData?.wordSetId === "string" ? value.modeData.wordSetId : null,
      wordSetName: typeof value.modeData?.wordSetName === "string" ? value.modeData.wordSetName : null,
      wordSetVersion: finiteNonNegative(value.modeData?.wordSetVersion),
      wordSetWordCount: finiteNonNegative(value.modeData?.wordSetWordCount),
      metricVersion: finiteNonNegative(value.modeData?.metricVersion),
      rawWpm: nullableFinite(value.modeData?.rawWpm),
      correctTestCharacters: finiteNonNegative(value.modeData?.correctTestCharacters),
      rawTestCharacters: finiteNonNegative(value.modeData?.rawTestCharacters),
      correctSpaces: finiteNonNegative(value.modeData?.correctSpaces),
      validSpaces: finiteNonNegative(value.modeData?.validSpaces),
      backspaces: finiteNonNegative(value.modeData?.backspaces),
      wordDeletes: finiteNonNegative(value.modeData?.wordDeletes),
      completedWordCount: finiteNonNegative(value.modeData?.completedWordCount),
      highestStage: nullableFinite(value.modeData?.highestStage),
      wordsCompleted: finiteNonNegative(value.modeData?.wordsCompleted),
      survivalTimeMs: finiteNonNegative(value.modeData?.survivalTimeMs),
      wavesCompleted: finiteNonNegative(value.modeData?.wavesCompleted),
      bossDefeated: value.modeData?.bossDefeated === true,
      integrityRemaining: finiteNonNegative(value.modeData?.integrityRemaining),
      maxCombo,
      perfectWaves: finiteNonNegative(value.modeData?.perfectWaves),
      bossTimeRemainingMs: finiteNonNegative(value.modeData?.bossTimeRemainingMs),
      rulesVersion: finiteNonNegative(value.modeData?.rulesVersion),
    },
  };
}

function sanitizeTotals(value) {
  return {
    completedSessions: finiteNonNegative(value?.completedSessions),
    failedSessions: finiteNonNegative(value?.failedSessions),
    activePlaytimeMs: finiteNonNegative(value?.activePlaytimeMs),
    charactersTyped: finiteNonNegative(value?.charactersTyped),
    correctCharacters: finiteNonNegative(value?.correctCharacters),
    incorrectCharacters: finiteNonNegative(value?.incorrectCharacters),
    missedCharacters: finiteNonNegative(value?.missedCharacters),
    wordsCompleted: finiteNonNegative(value?.wordsCompleted),
  };
}

export function migrateModeDataToV2(value) {
  const defaults = createDefaultModeData();
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults;
  const recentSessions = Array.isArray(value.recentSessions)
    ? value.recentSessions.map(sanitizeRecentSummary).filter(Boolean)
    : [];
  const recordedIds = Array.isArray(value.recordedSessionIds)
    ? value.recordedSessionIds.filter((id) => typeof id === "string")
    : recentSessions.map(({ sessionId }) => sessionId);
  const totals = sanitizeTotals(value.totals);
  return {
    schemaVersion: MODE_DATA_SCHEMA_VERSION,
    profile: sanitizePlayerProfile(value.profile),
    lifetime: sanitizeLifetimeStatistics(value.lifetime, totals, recentSessions),
    totals,
    modes: Object.fromEntries(ACTIVE_MODE_IDS.map((modeId) => [
      modeId,
      sanitizeModeSummary(value.modes?.[modeId], modeId),
    ])),
    recentSessions: recentSessions.slice(0, MAX_RECENT_SESSIONS),
    recordedSessionIds: [...new Set(recordedIds)].slice(0, MAX_RECORDED_SESSION_IDS),
  };
}

function createDefaultLegacyDailyData() {
  return {
    schemaVersion: LEGACY_DAILY_SCHEMA_VERSION,
    mode: createModeSummary(MODE_IDS.DAILY),
    recordedSessionIds: [],
  };
}

function sanitizeLegacyDailyData(value) {
  const sourceMode = value?.mode || value?.modes?.[MODE_IDS.DAILY] || null;
  return {
    schemaVersion: LEGACY_DAILY_SCHEMA_VERSION,
    mode: sanitizeModeSummary(sourceMode, MODE_IDS.DAILY),
    recordedSessionIds: [...new Set(
      (Array.isArray(value?.recordedSessionIds) ? value.recordedSessionIds : [])
        .filter((id) => typeof id === "string"),
    )].slice(0, MAX_RECORDED_SESSION_IDS),
  };
}

function saveLegacyDailyData(data) {
  return writeJsonStorage(LEGACY_DAILY_STORAGE_KEY, sanitizeLegacyDailyData(data));
}

function seedLegacyDailyFromSource(source) {
  if (!source?.modes?.[MODE_IDS.DAILY]) return false;
  if (readJsonStorage(LEGACY_DAILY_STORAGE_KEY)) return false;
  return saveLegacyDailyData({
    schemaVersion: LEGACY_DAILY_SCHEMA_VERSION,
    mode: source.modes[MODE_IDS.DAILY],
    recordedSessionIds: [],
  });
}

function loadLegacyDailyData() {
  const direct = readJsonStorage(LEGACY_DAILY_STORAGE_KEY);
  if (direct) return sanitizeLegacyDailyData(direct);
  const legacy = readJsonStorage(LEGACY_MODE_DATA_STORAGE_KEY);
  if (legacy?.modes?.[MODE_IDS.DAILY]) {
    const migrated = sanitizeLegacyDailyData(legacy);
    saveLegacyDailyData(migrated);
    return migrated;
  }
  return createDefaultLegacyDailyData();
}

export function getLegacyDailyModeSummary() {
  return clone(loadLegacyDailyData().mode);
}

export function loadModeData() {
  const v2 = readJsonStorage(MODE_DATA_STORAGE_KEY);
  if (v2) {
    seedLegacyDailyFromSource(v2);
    return migrateModeDataToV2(v2);
  }
  const legacy = readJsonStorage(LEGACY_MODE_DATA_STORAGE_KEY);
  if (legacy) {
    seedLegacyDailyFromSource(legacy);
    const migrated = migrateModeDataToV2(legacy);
    writeJsonStorage(MODE_DATA_STORAGE_KEY, migrated);
    return migrated;
  }
  return createDefaultModeData();
}

export function saveModeData(data) {
  return writeJsonStorage(MODE_DATA_STORAGE_KEY, migrateModeDataToV2(data));
}

function better(previous, next) {
  const value = nullableFinite(next);
  if (value == null) return previous;
  return previous == null ? value : Math.max(previous, value);
}

function lowerIsBetter(previous, next) {
  const value = nullableFinite(next);
  if (value == null) return previous;
  return previous == null ? value : Math.min(previous, value);
}

function shouldReplaceWpmRecord(record, result) {
  const wpm = nullableFinite(result.wpm);
  const accuracy = nullableFinite(result.accuracy);
  const rawWpm = nullableFinite(result.modeData?.rawWpm);
  const endedAt = nullableFinite(result.endedAt);
  if (wpm == null) return false;
  if (record.bestWpm == null || wpm > record.bestWpm) return true;
  if (wpm < record.bestWpm) return false;
  if ((accuracy ?? 0) > (record.tieAccuracy ?? 0)) return true;
  if ((accuracy ?? 0) < (record.tieAccuracy ?? 0)) return false;
  if ((rawWpm ?? 0) > (record.tieRawWpm ?? 0)) return true;
  if ((rawWpm ?? 0) < (record.tieRawWpm ?? 0)) return false;
  return record.bestResultAt == null || (endedAt != null && endedAt < record.bestResultAt);
}

function compareDescending(next, previous) {
  if (next > previous) return 1;
  if (next < previous) return -1;
  return 0;
}

export function isBetterEndlessStageRecord(next, previous) {
  if (!previous) return true;
  for (const field of ["stage", "score", "wordsCompleted", "accuracy"]) {
    const comparison = compareDescending(
      finiteNonNegative(next?.[field]),
      finiteNonNegative(previous?.[field]),
    );
    if (comparison) return comparison > 0;
  }
  return finiteNonNegative(next?.achievedAt, Infinity)
    < finiteNonNegative(previous?.achievedAt, Infinity);
}

export function isBetterEndlessScoreRecord(next, previous) {
  if (!previous) return true;
  for (const field of ["score", "stage", "accuracy"]) {
    const comparison = compareDescending(
      finiteNonNegative(next?.[field]),
      finiteNonNegative(previous?.[field]),
    );
    if (comparison) return comparison > 0;
  }
  return finiteNonNegative(next?.achievedAt, Infinity)
    < finiteNonNegative(previous?.achievedAt, Infinity);
}

function updateIndependentRecord(records, key, next, valueField) {
  const previous = records[key];
  const nextValue = finiteNonNegative(next[valueField]);
  const previousValue = finiteNonNegative(previous?.[valueField], -1);
  if (
    !previous ||
    nextValue > previousValue ||
    (
      nextValue === previousValue &&
      (
        finiteNonNegative(next.stage) > finiteNonNegative(previous.stage) ||
        (
          finiteNonNegative(next.stage) === finiteNonNegative(previous.stage) &&
          finiteNonNegative(next.achievedAt, Infinity)
            < finiteNonNegative(previous.achievedAt, Infinity)
        )
      )
    )
  ) {
    records[key] = next;
  }
}

function isEligibleDailyResult(result) {
  const dateKey = result?.modeData?.dateKey;
  return (
    result?.developerMode !== true &&
    result?.variantId === `v${DAILY_CHALLENGE_VERSION}` &&
    result?.modeData?.challengeVersion === DAILY_CHALLENGE_VERSION &&
    result?.modeData?.dateOverride !== true &&
    result?.modeData?.totalWords === DAILY_TOTAL_WORDS &&
    result?.modeData?.recordEligible === true &&
    dateKey === getUtcDateKey() &&
    result?.seed === getDailyChallengeSeed(dateKey)
  );
}

function isSupportedSpeedTestResult(result) {
  if (!SPEED_TEST_CONFIG_IDS.includes(result?.modeData?.configId)) return false;
  const wordSetId = getSpeedTestWordSetId(result);
  if (wordSetId === LEGACY_SPEED_TEST_WORD_SET_ID) {
    return result?.modeData?.wordSetId == null;
  }
  return (
    wordSetId === SPEED_TEST_WORD_SET.id &&
    result.modeData?.wordSetName === SPEED_TEST_WORD_SET.name &&
    result.modeData?.wordSetVersion === SPEED_TEST_WORD_SET.version &&
    result.modeData?.wordSetWordCount === SPEED_TEST_WORD_SET.wordCount
  );
}

export function getSpeedTestRecord(configId, wordSetId = SPEED_TEST_WORD_SET.id) {
  if (!SPEED_TEST_CONFIG_IDS.includes(configId)) return null;
  const mode = loadModeData().modes[MODE_IDS.SPEED_TEST];
  const records = wordSetId === LEGACY_SPEED_TEST_WORD_SET_ID
    ? mode.records
    : mode.wordSetRecords?.[wordSetId];
  if (!records) return null;
  return { ...records[configId] };
}

export function getSpeedTestWordSetId(result) {
  return typeof result?.modeData?.wordSetId === "string"
    ? result.modeData.wordSetId
    : LEGACY_SPEED_TEST_WORD_SET_ID;
}

export function getSpeedTestRecordFlags(result, previous = null) {
  const record = previous || getSpeedTestRecord(
    result?.modeData?.configId,
    getSpeedTestWordSetId(result),
  );
  if (!record) {
    return { newWpmRecord: false, newRawWpmRecord: false, newAccuracyRecord: false };
  }
  return {
    newWpmRecord: shouldReplaceWpmRecord(record, result),
    newRawWpmRecord: record.bestRawWpm == null || result.modeData.rawWpm > record.bestRawWpm,
    newAccuracyRecord: record.bestAccuracy == null || result.accuracy > record.bestAccuracy,
  };
}

export function getArcadeRushRecords() {
  return clone(loadModeData().modes[MODE_IDS.ARCADE_RUSH]?.records || createDefaultArcadeRushRecords());
}

export function getArcadeRushRecordFlags(result, previous = null) {
  const records = previous || getArcadeRushRecords();
  const valid = result?.modeId === MODE_IDS.ARCADE_RUSH && result?.developerMode !== true;
  if (!valid) {
    return {
      newBest: false,
      newHighestScore: false,
      newBestCompletedScore: false,
      newFastestCompletion: false,
      newHighestCombo: false,
      newBestAccuracy: false,
      newBestWpm: false,
      newMostPerfectWaves: false,
    };
  }
  const score = finiteNonNegative(result.score);
  const duration = finiteNonNegative(result.activeDurationMs);
  const combo = finiteNonNegative(result.combo?.maximum);
  const accuracy = finiteNonNegative(result.accuracy);
  const wpm = finiteNonNegative(result.wpm);
  const perfectWaves = finiteNonNegative(result.modeData?.perfectWaves);
  const success = result.success === true;
  const flags = {
    newHighestScore: records.highestScore == null || score > records.highestScore,
    newBestCompletedScore: success && (
      records.bestCompletedScore == null || score > records.bestCompletedScore
    ),
    newFastestCompletion: success && (
      records.fastestCompletion == null || duration < records.fastestCompletion
    ),
    newHighestCombo: records.highestCombo == null || combo > records.highestCombo,
    newBestAccuracy: records.bestAccuracy == null || accuracy > records.bestAccuracy,
    newBestWpm: records.bestWpm == null || wpm > records.bestWpm,
    newMostPerfectWaves: records.mostPerfectWaves == null || perfectWaves > records.mostPerfectWaves,
  };
  return { newBest: flags.newHighestScore, ...flags };
}

export function recordArcadeRushRunStarted({ developerMode = false } = {}) {
  if (developerMode === true) return false;
  const data = loadModeData();
  const records = data.modes[MODE_IDS.ARCADE_RUSH]?.records;
  if (!records) return false;
  records.runsStarted += 1;
  return saveModeData(data);
}

function applyResultToModeActivity(mode, result) {
  const activity = mode.activity;
  const correct = finiteNonNegative(result.characters?.correct);
  const incorrect = finiteNonNegative(result.characters?.incorrect);
  const missed = finiteNonNegative(result.characters?.missed);
  const duration = finiteNonNegative(result.activeDurationMs);
  const wpm = nullableFinite(result.wpm);
  activity.trackedSessions += 1;
  activity.activePlaytimeMs += duration;
  activity.wordsCompleted += finiteNonNegative(result.words?.completed);
  activity.wordsMissed += finiteNonNegative(result.words?.missed);
  activity.charactersCorrect += correct;
  activity.charactersIncorrect += incorrect;
  activity.charactersMissed += missed;
  activity.totalKeystrokes += finiteNonNegative(result.characters?.totalKeystrokes);
  activity.accuracyNumerator += correct;
  activity.accuracyDenominator += correct + incorrect + missed;
  if (wpm != null && wpm >= 0 && duration > 0) {
    activity.wpmWeightedTotal += wpm * duration;
    activity.wpmWeightedDurationMs += duration;
  }
  if (result.modeId === MODE_IDS.ENDLESS) {
    activity.coreBreaches += finiteNonNegative(result.modeData?.coreBreaches);
  }
}

function applyResultToTotals(data, result) {
  const failed = result.success !== true;
  data.totals.completedSessions += 1;
  if (failed) data.totals.failedSessions += 1;
  data.totals.activePlaytimeMs += finiteNonNegative(result.activeDurationMs);
  data.totals.charactersTyped += finiteNonNegative(result.characters?.totalKeystrokes);
  data.totals.correctCharacters += finiteNonNegative(result.characters?.correct);
  data.totals.incorrectCharacters += finiteNonNegative(result.characters?.incorrect);
  data.totals.missedCharacters += finiteNonNegative(result.characters?.missed);
  data.totals.wordsCompleted += finiteNonNegative(result.words?.completed);
  data.lifetime = applyResultToLifetimeStatistics(data.lifetime, result);
}

function applyResultToCommonModeSummary(mode, result) {
  const failed = result.success !== true;
  mode.completedSessions += 1;
  if (failed) mode.failedSessions += 1;
  mode.activePlaytimeMs += finiteNonNegative(result.activeDurationMs);
  mode.bestWpm = better(mode.bestWpm, result.wpm);
  mode.bestAccuracy = better(mode.bestAccuracy, result.accuracy);
  mode.highestScore = better(mode.highestScore, result.score);
  applyResultToModeActivity(mode, result);
}

function updateArcadeRushRecords(records, result) {
  records.highestScore = better(records.highestScore, result.score);
  records.highestCombo = better(records.highestCombo, result.combo?.maximum);
  records.bestAccuracy = better(records.bestAccuracy, result.accuracy);
  records.bestWpm = better(records.bestWpm, result.wpm);
  records.mostPerfectWaves = better(records.mostPerfectWaves, result.modeData?.perfectWaves);
  if (result.success === true) {
    records.bestCompletedScore = better(records.bestCompletedScore, result.score);
    records.fastestCompletion = lowerIsBetter(records.fastestCompletion, result.activeDurationMs);
    records.runsCompleted += 1;
  }
  if (result.modeData?.bossDefeated === true) records.bossesDefeated += 1;
}

function recordLegacyDailySession(result) {
  if (!isEligibleDailyResult(result)) return false;
  const legacy = loadLegacyDailyData();
  const data = loadModeData();
  if (
    legacy.recordedSessionIds.includes(result.sessionId) ||
    data.recordedSessionIds.includes(result.sessionId)
  ) return false;

  applyResultToCommonModeSummary(legacy.mode, result);
  legacy.mode.records = updateDailyRecords(legacy.mode.records, result);
  legacy.recordedSessionIds = [
    result.sessionId,
    ...legacy.recordedSessionIds,
  ].slice(0, MAX_RECORDED_SESSION_IDS);

  applyResultToTotals(data, result);
  data.recordedSessionIds = [
    result.sessionId,
    ...data.recordedSessionIds,
  ].slice(0, MAX_RECORDED_SESSION_IDS);

  const dailySaved = saveLegacyDailyData(legacy);
  const activeSaved = saveModeData(data);
  return dailySaved && activeSaved;
}

export function recordCompletedSession(result) {
  if (
    !result ||
    result.schemaVersion !== 1 ||
    result.developerMode === true ||
    result.state === "aborted" ||
    result.sessionState === "aborted" ||
    typeof result.sessionId !== "string" ||
    !getModeDefinition(result.modeId)
  ) {
    return false;
  }
  if (result.modeId === MODE_IDS.DAILY) return recordLegacyDailySession(result);
  if (!ACTIVE_MODE_ID_SET.has(result.modeId)) return false;
  if (result.modeId === MODE_IDS.SPEED_TEST && !isSupportedSpeedTestResult(result)) return false;
  if (result.modeId === MODE_IDS.ENDLESS && result.modeData?.recordEligible !== true) return false;

  const data = loadModeData();
  if (data.recordedSessionIds.includes(result.sessionId)) return false;
  const mode = data.modes[result.modeId];
  if (!mode) return false;

  applyResultToTotals(data, result);
  applyResultToCommonModeSummary(mode, result);

  if (
    result.modeId === MODE_IDS.SPEED_TEST &&
    SPEED_TEST_CONFIG_IDS.includes(result.modeData?.configId)
  ) {
    const wordSetId = getSpeedTestWordSetId(result);
    const currentWordSet = wordSetId === SPEED_TEST_WORD_SET.id;
    const recordMap = currentWordSet
      ? mode.wordSetRecords[SPEED_TEST_WORD_SET.id]
      : mode.records;
    const usageMap = currentWordSet
      ? mode.wordSetConfigUsage[SPEED_TEST_WORD_SET.id]
      : mode.configUsage;
    usageMap[result.modeData.configId] += 1;
    if (currentWordSet) {
      applyResultToModeActivity(
        { activity: mode.wordSetActivity[SPEED_TEST_WORD_SET.id] },
        result,
      );
    }
    const record = recordMap[result.modeData.configId];
    const flags = getSpeedTestRecordFlags(result, record);
    if (flags.newWpmRecord) {
      record.bestWpm = result.wpm;
      record.bestResultAt = result.endedAt;
      record.sessionId = result.sessionId;
      record.tieAccuracy = result.accuracy;
      record.tieRawWpm = result.modeData.rawWpm;
    }
    if (flags.newRawWpmRecord) record.bestRawWpm = result.modeData.rawWpm;
    if (flags.newAccuracyRecord) record.bestAccuracy = result.accuracy;
    record.bestExactWords = better(record.bestExactWords, result.modeData.exactWords);
  }

  if (result.modeId === MODE_IDS.ENDLESS) {
    const records = mode.records;
    const stage = finiteNonNegative(result.modeData?.highestStage);
    const achievedAt = finiteNonNegative(result.endedAt);
    const sessionId = result.sessionId;
    const base = { stage, achievedAt, sessionId };
    const bestStage = {
      ...base,
      score: finiteNonNegative(result.score),
      wordsCompleted: finiteNonNegative(result.modeData?.wordsCompleted),
      accuracy: finiteNonNegative(result.accuracy),
    };
    if (isBetterEndlessStageRecord(bestStage, records.bestStage)) records.bestStage = bestStage;
    if (isBetterEndlessScoreRecord(bestStage, records.highestScore)) records.highestScore = { ...bestStage };
    updateIndependentRecord(records, "longestSurvival", {
      ...base,
      survivalTimeMs: finiteNonNegative(result.modeData?.survivalTimeMs),
    }, "survivalTimeMs");
    updateIndependentRecord(records, "mostWordsCompleted", {
      ...base,
      wordsCompleted: finiteNonNegative(result.modeData?.wordsCompleted),
    }, "wordsCompleted");
    updateIndependentRecord(records, "highestCombo", {
      ...base,
      value: finiteNonNegative(result.modeData?.maximumCombo),
    }, "value");
    updateIndependentRecord(records, "highestPerfectStreak", {
      ...base,
      value: finiteNonNegative(result.modeData?.maximumPerfectStreak),
    }, "value");
    updateIndependentRecord(records, "bestAccuracy", {
      ...base,
      value: finiteNonNegative(result.accuracy),
    }, "value");
    updateIndependentRecord(records, "bestAverageWpm", {
      ...base,
      value: finiteNonNegative(result.modeData?.averageWpm),
    }, "value");
    mode.highestStage = better(mode.highestStage, stage);
  }

  if (result.modeId === MODE_IDS.ARCADE_RUSH) {
    updateArcadeRushRecords(mode.records, result);
  }

  const summary = sanitizeRecentSummary(result);
  if (summary) {
    data.recentSessions = [
      summary,
      ...data.recentSessions.filter(({ sessionId }) => sessionId !== result.sessionId),
    ].slice(0, MAX_RECENT_SESSIONS);
  }
  data.recordedSessionIds = [
    result.sessionId,
    ...data.recordedSessionIds.filter((id) => id !== result.sessionId),
  ].slice(0, MAX_RECORDED_SESSION_IDS);
  return saveModeData(data);
}

export function getModeSummary(modeId) {
  if (modeId === MODE_IDS.DAILY) return getLegacyDailyModeSummary();
  if (!ACTIVE_MODE_ID_SET.has(modeId)) return null;
  return clone(loadModeData().modes[modeId]);
}

export function ensureStoredPlayerProfile(options = {}) {
  const data = loadModeData();
  if (data.profile) return { ...data.profile };
  data.profile = createDefaultPlayerProfile(options);
  saveModeData(data);
  return { ...data.profile };
}

export function updateStoredDisplayName(displayName, now = Date.now()) {
  const data = loadModeData();
  const profile = data.profile || createDefaultPlayerProfile({ now });
  if (!validateDisplayName(displayName).valid) return { ...profile };
  const updated = updateDisplayName(profile, displayName, now);
  if (!updated) return { ...profile };
  data.profile = updated;
  saveModeData(data);
  return { ...updated };
}

export function getPublicPlayerProfile() {
  return selectPublicPlayerProfile(ensureStoredPlayerProfile());
}

export function getDailyRecord(dateKey) {
  if (!isValidDailyDateKey(dateKey)) return null;
  const records = loadLegacyDailyData().mode.records;
  const day = records.days[dateKey];
  return day ? {
    ...day,
    best: day.best ? { ...day.best } : null,
    currentStreak: records.currentStreak,
    bestStreak: records.bestStreak,
    lastSuccessfulDateKey: records.lastSuccessfulDateKey,
  } : {
    attempts: 0,
    best: null,
    firstCompletedAt: null,
    lastAttemptAt: null,
    currentStreak: records.currentStreak,
    bestStreak: records.bestStreak,
    lastSuccessfulDateKey: records.lastSuccessfulDateKey,
  };
}

export function getRecentSessions() {
  return loadModeData().recentSessions.map((summary) => ({
    ...summary,
    modeData: { ...summary.modeData },
  }));
}

export function resetModeData() {
  const defaults = createDefaultModeData();
  saveModeData(defaults);
  saveLegacyDailyData(createDefaultLegacyDailyData());
  return defaults;
}
