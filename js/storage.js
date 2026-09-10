import { calculateGrade } from "./scoring.js";
import { normalizeSpeedTestFontSize } from "./speedTestPresentation.js";

import { createDefaultCustomization, normalizeCustomization, normalizeCustomizationValue } from "./customization.js";

import { normalizeModeCustomizationValue } from "./modeCustomization.js";

const STORAGE_KEY = "wordstrike_save";

export function createDefaultSave() {
  return {
    currentFurthestLevel: 1,
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
  };
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
  return {
    currentFurthestLevel: Math.max(1, Number(value.currentFurthestLevel) || 1),
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
  };
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
  save.currentFurthestLevel = Math.max(save.currentFurthestLevel, levelNumber + 1);
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
