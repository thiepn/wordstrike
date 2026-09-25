import { calculateGrade } from "./scoring.js";
import { normalizeSpeedTestFontSize } from "./speedTestPresentation.js";
import { getRecentSessions, getSpeedTestRecord } from "./modeStorage.js";
import { notifyLocalDataChanged } from "./localDataEvents.js";
import { getResilientBrowserStorage } from "./browserStorage.js";

import { createDefaultCustomization, normalizeCustomization, normalizeCustomizationValue } from "./customization.js";

import { normalizeModeCustomizationValue } from "./modeCustomization.js";

const STORAGE_KEY = "wordstrike_save";
export const CAMPAIGN_BACKUP_KEY = "wordstrike_campaign_progress_v1";
const CAMPAIGN_TYPING_TEST_CONFIG_ID = "time-60";

export const CAMPAIGN_SPEED_UNLOCKS = Object.freeze([
  Object.freeze({ wpm: 40, level: 11 }),
  Object.freeze({ wpm: 50, level: 21 }),
  Object.freeze({ wpm: 60, level: 31 }),
  Object.freeze({ wpm: 70, level: 41 }),
  Object.freeze({ wpm: 80, level: 51 }),
  Object.freeze({ wpm: 90, level: 61 }),
  Object.freeze({ wpm: 100, level: 71 }),
  Object.freeze({ wpm: 110, level: 81 }),
  Object.freeze({ wpm: 120, level: 91 }),
]);

function normalizeCampaignFurthestLevel(value) {
  return Math.max(1, Number(value) || 1);
}

export function getCampaignSpeedUnlockLevelFromWpm(wpm) {
  const safeWpm = Number(wpm);
  if (!Number.isFinite(safeWpm)) return 1;
  let unlockedLevel = 1;
  for (const threshold of CAMPAIGN_SPEED_UNLOCKS) {
    if (safeWpm < threshold.wpm) break;
    unlockedLevel = threshold.level;
  }
  return unlockedLevel;
}

export function getCampaignBest60SecondWpm() {
  try {
    const record = getSpeedTestRecord(CAMPAIGN_TYPING_TEST_CONFIG_ID);
    const bestWpm = Number(record?.bestWpm);
    return Number.isFinite(bestWpm) && bestWpm > 0 ? bestWpm : 0;
  } catch {
    return 0;
  }
}

export function getCampaignSpeedUnlockLevel() {
  return getCampaignSpeedUnlockLevelFromWpm(getCampaignBest60SecondWpm());
}

export function getCampaignPlacementSummary(bestWpm = getCampaignBest60SecondWpm()) {
  const safeWpm = Number.isFinite(Number(bestWpm)) ? Math.max(0, Number(bestWpm)) : 0;
  const level = getCampaignSpeedUnlockLevelFromWpm(safeWpm);
  const next = CAMPAIGN_SPEED_UNLOCKS.find((checkpoint) => checkpoint.wpm > safeWpm) ?? null;
  return Object.freeze({
    bestWpm: safeWpm,
    level,
    placed: level > 1,
    nextWpm: next?.wpm ?? null,
    nextLevel: next?.level ?? null,
  });
}

export function getCampaignResumeLevel(
  save,
  speedUnlockLevel = getCampaignSpeedUnlockLevel(),
) {
  const progressLevel = normalizeCampaignLevel(
    save?.campaignFurthestLevel ?? save?.currentFurthestLevel ?? 1,
  );
  const checkpointLevel = normalizeCampaignLevel(speedUnlockLevel);
  if (checkpointLevel > progressLevel && isCampaignSpeedCheckpointUnlocked(checkpointLevel, checkpointLevel)) {
    return checkpointLevel;
  }
  return progressLevel;
}

export function isCampaignEstablished(save, bestWpm = getCampaignBest60SecondWpm()) {
  if ((Number(bestWpm) || 0) > 0) return true;
  if (normalizeCampaignFurthestLevel(save?.campaignFurthestLevel ?? save?.currentFurthestLevel) > 1) return true;
  return Object.values(save?.levels || {}).some((record) => (
    record?.grade && record.grade !== "Fail"
  ));
}

export function hasExperiencedCampaignBoss(save) {
  if (normalizeCampaignFurthestLevel(save?.campaignFurthestLevel ?? save?.currentFurthestLevel) > 10) {
    return true;
  }
  return Object.values(save?.levels || {}).some((record) => record?.bossCleared === true);
}


function normalizeCampaignLevel(value) {
  return Math.max(1, Math.min(100, Math.trunc(Number(value) || 1)));
}

function hasClearedCampaignLevel(save, levelNumber) {
  const level = normalizeCampaignLevel(levelNumber);
  const record = save?.levels?.[String(level)] ?? save?.levels?.[level];
  return Boolean(record?.grade && record.grade !== "Fail");
}

function isCampaignSpeedCheckpointUnlocked(levelNumber, speedUnlockLevel) {
  const level = normalizeCampaignLevel(levelNumber);
  const speedLevel = normalizeCampaignLevel(speedUnlockLevel);
  return CAMPAIGN_SPEED_UNLOCKS.some(
    (checkpoint) => checkpoint.level === level && checkpoint.level <= speedLevel,
  );
}

export function isCampaignLevelAccessible(
  save,
  levelNumber,
  speedUnlockLevel = getCampaignSpeedUnlockLevel(),
) {
  const targetLevel = normalizeCampaignLevel(levelNumber);
  if (targetLevel === 1) return true;

  let previousAccessible = true;
  for (let level = 2; level <= targetLevel; level += 1) {
    const checkpointAccessible = isCampaignSpeedCheckpointUnlocked(level, speedUnlockLevel);
    const sequentiallyAccessible = previousAccessible && hasClearedCampaignLevel(save, level - 1);
    const accessible = checkpointAccessible || sequentiallyAccessible;
    if (level === targetLevel) return accessible;
    previousAccessible = accessible;
  }
  return false;
}

function attachCampaignAvailability(save, campaignFurthestLevel = 1) {
  let progressLevel = normalizeCampaignFurthestLevel(campaignFurthestLevel);
  Object.defineProperties(save, {
    campaignFurthestLevel: {
      enumerable: true,
      configurable: true,
      get() {
        return progressLevel;
      },
      set(value) {
        progressLevel = normalizeCampaignFurthestLevel(value);
      },
    },
    currentFurthestLevel: {
      enumerable: true,
      configurable: true,
      get() {
        return Math.max(progressLevel, getCampaignSpeedUnlockLevel());
      },
      set(value) {
        progressLevel = normalizeCampaignFurthestLevel(value);
      },
    },
  });
  return save;
}

export function createDefaultSave() {
  return attachCampaignAvailability({
    levels: {},
    settings: {
      screenShake: true,
      particles: true,
      strictMode: false,
      soundEffects: false,
      speedTestTimerPosition: "center",
      speedTestFontSize: "auto",
      speedTestPassageWidth: "normal",
      ...createDefaultCustomization(),
    },
  }, 1);
}

function validateSave(value) {
  const defaults = createDefaultSave();
  if (!value || typeof value !== "object") return defaults;
  const levels = value.levels && typeof value.levels === "object" ? value.levels : {};
  const migratedLevels = Object.fromEntries(Object.entries(levels).map(([key, result]) => {
    if (!result || typeof result !== "object" || !Number.isFinite(Number(result.bestAccuracy))) {
      return [key, result];
    }
    return [key, {
      ...result,
      grade: calculateGrade({ accuracy: Number(result.bestAccuracy) }),
    }];
  }));
  const campaignFurthestLevel = normalizeCampaignFurthestLevel(
    value.campaignFurthestLevel ?? value.currentFurthestLevel,
  );
  return attachCampaignAvailability({
    levels: migratedLevels,
    settings: {
      screenShake: value.settings?.screenShake !== false,
      particles: value.settings?.particles !== false,
      strictMode: value.settings?.strictMode === true,
      soundEffects: value.settings?.soundEffects === true,
      speedTestTimerPosition: value.settings?.speedTestTimerPosition === "top" ? "top" : "center",
      ...normalizeCustomization(value.settings),
      speedTestFontSize: normalizeCustomization(value.settings).typingTest.textSize,
      speedTestPassageWidth: normalizeModeCustomizationValue(
        "typingTest.passageWidth",
        value.settings?.speedTestPassageWidth,
      ),
    },
  }, campaignFurthestLevel);
}

function getStorage() {
  return getResilientBrowserStorage();
}

function campaignSnapshot(save) {
  return {
    version: 1,
    campaignFurthestLevel: normalizeCampaignFurthestLevel(
      save?.campaignFurthestLevel ?? save?.currentFurthestLevel,
    ),
    levels: save?.levels && typeof save.levels === "object"
      ? JSON.parse(JSON.stringify(save.levels))
      : {},
    updatedAt: Date.now(),
  };
}

function readCampaignBackup(storage) {
  try {
    const raw = storage?.getItem?.(CAMPAIGN_BACKUP_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || value.version !== 1 || typeof value.levels !== "object") return null;
    return value;
  } catch {
    return null;
  }
}

function persistCampaignBackup(save, storage = getStorage()) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(CAMPAIGN_BACKUP_KEY, JSON.stringify(campaignSnapshot(save)));
    return true;
  } catch {
    return false;
  }
}

function mergeCampaignRecords(primary, backup) {
  if (!primary) return backup && typeof backup === "object" ? { ...backup } : backup;
  if (!backup) return primary && typeof primary === "object" ? { ...primary } : primary;
  if (typeof primary !== "object" || typeof backup !== "object") return primary ?? backup;

  const merged = { ...backup, ...primary };
  const hasOwn = (record, key) => Object.prototype.hasOwnProperty.call(record, key);
  const mergeMaximum = (key) => {
    const values = [primary, backup]
      .filter((record) => hasOwn(record, key))
      .map((record) => Number(record[key]))
      .filter(Number.isFinite);
    if (values.length > 0) merged[key] = Math.max(...values);
    else if (!hasOwn(primary, key) && !hasOwn(backup, key)) delete merged[key];
  };

  for (const key of [
    "bestWPM",
    "bestAccuracy",
    "bestScore",
    "maxCombo",
    "bestTimeRemaining",
  ]) mergeMaximum(key);

  if (hasOwn(primary, "bossCleared") || hasOwn(backup, "bossCleared")) {
    merged.bossCleared = primary.bossCleared === true || backup.bossCleared === true;
  } else {
    delete merged.bossCleared;
  }

  if (hasOwn(merged, "bestAccuracy") && Number.isFinite(Number(merged.bestAccuracy))) {
    merged.grade = calculateGrade({ accuracy: Number(merged.bestAccuracy) });
  } else if (!hasOwn(primary, "grade") && !hasOwn(backup, "grade")) {
    delete merged.grade;
  }

  return merged;
}

function recoverCampaignFromRecentSessions(save) {
  let sessions = [];
  try {
    sessions = getRecentSessions();
  } catch {
    return save;
  }

  let highestRecoveredLevel = normalizeCampaignFurthestLevel(
    save.campaignFurthestLevel ?? save.currentFurthestLevel,
  );
  let recoveredAny = false;

  for (const session of sessions) {
    if (
      session?.modeId !== "campaign" ||
      session.success !== true ||
      !Number.isInteger(Number(session.modeData?.level))
    ) continue;

    const level = normalizeCampaignLevel(session.modeData.level);
    const accuracy = Number(session.accuracy);
    const recovered = {
      grade: typeof session.grade === "string"
        ? session.grade
        : calculateGrade({ accuracy: Number.isFinite(accuracy) ? accuracy : 0 }),
      bestWPM: Math.max(0, Number(session.wpm) || 0),
      bestAccuracy: Math.max(0, Math.min(100, Number.isFinite(accuracy) ? accuracy : 0)),
      bestScore: Math.max(0, Number(session.score) || 0),
      maxCombo: Math.max(0, Number(session.modeData?.maxCombo) || 0),
      bestTimeRemaining: Math.max(0, Number(session.modeData?.bossTimeRemainingMs) || 0) / 1000,
      bossCleared: level % 10 === 0,
    };
    const key = String(level);
    save.levels[key] = mergeCampaignRecords(save.levels[key], recovered);
    highestRecoveredLevel = Math.max(highestRecoveredLevel, Math.min(100, level + 1));
    recoveredAny = true;
  }

  if (recoveredAny) {
    save.campaignFurthestLevel = highestRecoveredLevel;
    save.currentFurthestLevel = highestRecoveredLevel;
  }
  return save;
}

function recoverCampaignProgress(save, backup) {
  if (!backup) return save;
  const backupFurthest = normalizeCampaignFurthestLevel(backup.campaignFurthestLevel);
  const currentFurthest = normalizeCampaignFurthestLevel(
    save.campaignFurthestLevel ?? save.currentFurthestLevel,
  );
  const allKeys = new Set([
    ...Object.keys(backup.levels || {}),
    ...Object.keys(save.levels || {}),
  ]);
  const levels = {};
  for (const key of allKeys) {
    levels[key] = mergeCampaignRecords(save.levels?.[key], backup.levels?.[key]);
  }
  save.levels = levels;
  const recoveredFurthest = Math.max(currentFurthest, backupFurthest);
  save.campaignFurthestLevel = recoveredFurthest;
  save.currentFurthestLevel = recoveredFurthest;
  return save;
}


export function loadSave() {
  const storage = getStorage();
  if (!storage) return createDefaultSave();

  let save = createDefaultSave();
  let validPrimary = false;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      save = validateSave(JSON.parse(raw));
      validPrimary = true;
    }
  } catch {
    // Do not overwrite a malformed primary save with defaults. A compact,
    // independently-written Campaign backup may still contain valid progress.
  }

  const backup = readCampaignBackup(storage);
  let recovered = recoverCampaignProgress(save, backup);
  if (!validPrimary && !backup) {
    // The mode-history store is independent of the Campaign route save. If the
    // primary Campaign save was already lost before this repair shipped, use
    // successful recent Campaign sessions as a best-effort high-water recovery.
    recovered = recoverCampaignFromRecentSessions(recovered);
    if (
      normalizeCampaignFurthestLevel(recovered.campaignFurthestLevel) > 1 ||
      Object.keys(recovered.levels || {}).length > 0
    ) {
      persistCampaignBackup(recovered, storage);
      saveGame(recovered);
    }
  }
  if (validPrimary) {
    // Keep the historical migration contract: a valid primary save is normalized
    // and written back on load. Malformed primary data is never overwritten.
    saveGame(recovered);
    if (
      normalizeCampaignFurthestLevel(recovered.campaignFurthestLevel) > 1 ||
      Object.keys(recovered.levels || {}).length > 0
    ) {
      // Existing players receive recovery protection immediately on first load
      // after this migration, rather than only after completing another mission.
      persistCampaignBackup(recovered, storage);
    }
  }
  return recovered;
}

export function saveGame(save) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    notifyLocalDataChanged("campaign");
    return true;
  } catch {
    return false;
  }
}

export function updateLevelResult(save, levelNumber, result) {
  if (result.grade === "Fail") return false;
  const key = String(levelNumber);
  const previous = save.levels[key];
  const bestAccuracy = Math.max(previous?.bestAccuracy || 0, result.accuracy);
  const next = {
    grade: calculateGrade({ accuracy: bestAccuracy }),
    bestWPM: Math.max(previous?.bestWPM || 0, result.wpm),
    bestAccuracy,
    bestScore: Math.max(previous?.bestScore || 0, result.score),
    maxCombo: Math.max(previous?.maxCombo || 0, result.maxCombo),
    bestTimeRemaining: Math.max(previous?.bestTimeRemaining || 0, result.timeRemaining || 0),
    bossCleared: previous?.bossCleared || result.isBoss || false,
  };
  save.levels[key] = next;
  const campaignFurthestLevel = normalizeCampaignFurthestLevel(
    save.campaignFurthestLevel ?? save.currentFurthestLevel,
  );
  const nextCampaignFurthestLevel = Math.min(100, Math.max(campaignFurthestLevel, levelNumber + 1));
  save.campaignFurthestLevel = nextCampaignFurthestLevel;
  save.currentFurthestLevel = nextCampaignFurthestLevel;

  // Write the compact Campaign backup first. It can still fit when the larger
  // shared save is at quota and prevents a completed mission from disappearing.
  const backupPersisted = persistCampaignBackup(save);
  const primaryPersisted = saveGame(save);
  if (backupPersisted && !primaryPersisted) notifyLocalDataChanged("campaign");
  return backupPersisted || primaryPersisted;
}

export function updateSetting(save, setting, value) {
  save.settings[setting] = Boolean(value);
  saveGame(save);
}

export function updateSpeedTestTimerPosition(save, position) {
  save.settings.speedTestTimerPosition = position === "top" ? "top" : "center";
  saveGame(save);
  return save.settings.speedTestTimerPosition;
}

export function updateSpeedTestFontSize(save, value) {
  save.settings.speedTestFontSize = normalizeSpeedTestFontSize(value);
  save.settings.typingTest = { ...normalizeCustomization(save.settings).typingTest, textSize: save.settings.speedTestFontSize };
  saveGame(save);
  return save.settings.speedTestFontSize;
}

export function resetProgress(save) {
  save.campaignFurthestLevel = 1;
  save.currentFurthestLevel = 1;
  save.levels = {};
  persistCampaignBackup(save);
  return saveGame(save);
}

/** Appearance-only writes use validated strings, not the legacy boolean setter. */
export function updateCustomizationSetting(save, field, value) {
  const normalized = normalizeCustomizationValue(field, value);
  if (!save || typeof save !== "object") throw new TypeError("A save is required");
  save.settings ??= createDefaultSave().settings;
  save.settings[field] = normalized;
  return { value: normalized, persisted: saveGame(save) };
}

export function resetAppearance(save) {
  const defaults = createDefaultCustomization();
  save.settings ??= createDefaultSave().settings;
  for (const field of ["theme", "accent", "effectsIntensity"]) save.settings[field] = defaults[field];
  return { persisted: saveGame(save) };
}

/** Full settings reset is separate from destructive progress reset. */
export function resetSettings(save) {
  save.settings = createDefaultSave().settings;
  const persisted = saveGame(save);
  if (typeof document !== "undefined" && typeof CustomEvent === "function") {
    document.dispatchEvent(new CustomEvent("wordstrike:settings-changed"));
  }
  return { persisted };
}

/** P2 stores only validated presentation preferences; progress/records are untouched. */
export function updateModeCustomizationSetting(save, field, value) {
  const normalized = normalizeModeCustomizationValue(field, value);
  if (!save || typeof save !== "object") throw new TypeError("A save is required");
  save.settings ??= createDefaultSave().settings;
  if (field === "typingTest.passageWidth") {
    save.settings.speedTestPassageWidth = normalized;
  } else if (field.startsWith("typingTest.")) {
    save.settings.typingTest = {
      ...normalizeCustomization(save.settings).typingTest,
      [field.slice("typingTest.".length)]: normalized,
    };
    // One authoritative font choice; preserve the original renderer/setter contract.
    if (field === "typingTest.textSize") save.settings.speedTestFontSize = normalized;
  } else {
    save.settings[field] = normalized;
  }
  const persisted = saveGame(save);
  if (typeof document !== "undefined" && typeof CustomEvent === "function") {
    document.dispatchEvent?.(new CustomEvent("wordstrike:settings-changed"));
  }
  return { value: normalized, persisted };
}
