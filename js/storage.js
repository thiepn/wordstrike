import { calculateGrade } from "./scoring.js";
import { normalizeSpeedTestFontSize } from "./speedTestPresentation.js";
import { getSpeedTestRecord } from "./modeStorage.js";

import { createDefaultCustomization, normalizeCustomization, normalizeCustomizationValue } from "./customization.js";

import { normalizeModeCustomizationValue } from "./modeCustomization.js";

const STORAGE_KEY = "wordstrike_save";
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
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSave() {
  const storage = getStorage();
  if (!storage) return createDefaultSave();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    const save = raw ? validateSave(JSON.parse(raw)) : createDefaultSave();
    saveGame(save);
    return save;
  } catch {
    return createDefaultSave();
  }
}

export function saveGame(save) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function updateLevelResult(save, levelNumber, result) {
  if (result.grade === "Fail") return;
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
  const nextCampaignFurthestLevel = Math.max(campaignFurthestLevel, levelNumber + 1);
  save.campaignFurthestLevel = nextCampaignFurthestLevel;
  save.currentFurthestLevel = nextCampaignFurthestLevel;
  saveGame(save);
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
  saveGame(save);
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
