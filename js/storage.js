import { calculateGrade } from "./scoring.js";

const STORAGE_KEY = "wordstrike_save";

export function createDefaultSave() {
  return {
    currentFurthestLevel: 1,
    levels: {},
    settings: {
      screenShake: true,
      particles: true,
      strictMode: false,
      speedTestTimerPosition: "center",
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
      speedTestTimerPosition: value.settings?.speedTestTimerPosition === "top" ? "top" : "center",
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

export function resetProgress(save) {
  save.currentFurthestLevel = 1;
  save.levels = {};
  saveGame(save);
}
