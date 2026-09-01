import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_DISPLAY_NAME,
  ARCADE_RUSH_FINALE_COUNT,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_READY_ROUTE,
  ARCADE_RUSH_RULES_STATUS,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_TARGET_DURATION_MS,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";

export const ARCADE_RUSH_FOUNDATION_CONFIG = Object.freeze({
  contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
  modeId: ARCADE_RUSH_MODE_ID,
  displayName: ARCADE_RUSH_DISPLAY_NAME,
  readyRoute: ARCADE_RUSH_READY_ROUTE,
  waveCount: ARCADE_RUSH_WAVE_COUNT,
  finaleCount: ARCADE_RUSH_FINALE_COUNT,
  startingIntegrity: ARCADE_RUSH_STARTING_INTEGRITY,
  targetDurationMs: ARCADE_RUSH_TARGET_DURATION_MS,
  rulesStatus: ARCADE_RUSH_RULES_STATUS,
});

export const ARCADE_RUSH_GENERATOR_VERSION = 1;
export const ARCADE_RUSH_PROFILE_STATUS = "DRAFT_UNTIL_AR10";
export const ARCADE_RUSH_BOSS_TARGET_DURATION_MS = 45_000;

function freezeWaveProfile(profile) {
  return Object.freeze({
    ...profile,
    sourceCounts: Object.freeze({ ...profile.sourceCounts }),
  });
}

export const ARCADE_RUSH_WAVE_PROFILES = Object.freeze([
  freezeWaveProfile({
    wave: 1,
    id: "ignition",
    name: "Ignition",
    wordCount: 18,
    targetDurationMs: 35_000,
    minWordLength: 3,
    maxWordLength: 6,
    targetAverageWordLength: 4.5,
    sourceCounts: { common: 12, low: 6 },
    spawnIntervalMs: 1_450,
    wordSpeedPxPerSec: 60,
    maxSimultaneousWords: 3,
    targetWpm: 55,
  }),
  freezeWaveProfile({
    wave: 2,
    id: "acceleration",
    name: "Acceleration",
    wordCount: 20,
    targetDurationMs: 40_000,
    minWordLength: 3,
    maxWordLength: 7,
    targetAverageWordLength: 5,
    sourceCounts: { common: 8, low: 8, mid: 4 },
    spawnIntervalMs: 1_150,
    wordSpeedPxPerSec: 64,
    maxSimultaneousWords: 4,
    targetWpm: 65,
  }),
  freezeWaveProfile({
    wave: 3,
    id: "crossfire",
    name: "Crossfire",
    wordCount: 20,
    targetDurationMs: 40_000,
    minWordLength: 4,
    maxWordLength: 8,
    targetAverageWordLength: 5.5,
    sourceCounts: { common: 4, low: 4, mid: 8, high: 4 },
    spawnIntervalMs: 1_050,
    wordSpeedPxPerSec: 70,
    maxSimultaneousWords: 5,
    targetWpm: 72,
  }),
  freezeWaveProfile({
    wave: 4,
    id: "heavy-words",
    name: "Heavy Words",
    wordCount: 18,
    targetDurationMs: 45_000,
    minWordLength: 7,
    maxWordLength: 12,
    targetAverageWordLength: 8.5,
    sourceCounts: { mid: 6, high: 8, difficult: 4 },
    spawnIntervalMs: 1_250,
    wordSpeedPxPerSec: 72,
    maxSimultaneousWords: 4,
    targetWpm: 68,
  }),
  freezeWaveProfile({
    wave: 5,
    id: "overdrive",
    name: "Overdrive",
    wordCount: 22,
    targetDurationMs: 45_000,
    minWordLength: 4,
    maxWordLength: 10,
    targetAverageWordLength: 6.5,
    sourceCounts: { low: 2, mid: 6, high: 8, difficult: 6 },
    spawnIntervalMs: 900,
    wordSpeedPxPerSec: 80,
    maxSimultaneousWords: 6,
    targetWpm: 82,
  }),
  freezeWaveProfile({
    wave: 6,
    id: "critical",
    name: "Critical",
    wordCount: 22,
    targetDurationMs: 50_000,
    minWordLength: 5,
    maxWordLength: 12,
    targetAverageWordLength: 7.2,
    sourceCounts: { mid: 4, high: 8, difficult: 10 },
    spawnIntervalMs: 760,
    wordSpeedPxPerSec: 88,
    maxSimultaneousWords: 7,
    targetWpm: 92,
  }),
]);

export const ARCADE_RUSH_TOTAL_PLANNED_WORDS = ARCADE_RUSH_WAVE_PROFILES.reduce(
  (sum, profile) => sum + profile.wordCount,
  0,
);

export const ARCADE_RUSH_TARGET_RUN_DURATION_MS = ARCADE_RUSH_WAVE_PROFILES.reduce(
  (sum, profile) => sum + profile.targetDurationMs,
  ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
);

export const ARCADE_RUSH_GENERATOR_CONFIG = Object.freeze({
  generatorVersion: ARCADE_RUSH_GENERATOR_VERSION,
  profileStatus: ARCADE_RUSH_PROFILE_STATUS,
  totalPlannedWords: ARCADE_RUSH_TOTAL_PLANNED_WORDS,
  bossTargetDurationMs: ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
  targetRunDurationMs: ARCADE_RUSH_TARGET_RUN_DURATION_MS,
  waves: ARCADE_RUSH_WAVE_PROFILES,
});

export function getArcadeRushFoundationConfig() {
  return ARCADE_RUSH_FOUNDATION_CONFIG;
}

export function getArcadeRushWaveProfile(wave) {
  return ARCADE_RUSH_WAVE_PROFILES.find((profile) => profile.wave === Number(wave)) || null;
}

export function isArcadeRushWaveProfile(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!Number.isInteger(value.wave) || value.wave < 1 || value.wave > ARCADE_RUSH_WAVE_COUNT) return false;
  if (typeof value.id !== "string" || !value.id || typeof value.name !== "string" || !value.name) return false;
  if (!Number.isInteger(value.wordCount) || value.wordCount < 1) return false;
  if (!Number.isFinite(value.targetDurationMs) || value.targetDurationMs <= 0) return false;
  if (!Number.isInteger(value.minWordLength) || !Number.isInteger(value.maxWordLength)) return false;
  if (value.minWordLength < 2 || value.maxWordLength > 12 || value.minWordLength > value.maxWordLength) return false;
  if (
    !Number.isFinite(value.targetAverageWordLength) ||
    value.targetAverageWordLength < value.minWordLength ||
    value.targetAverageWordLength > value.maxWordLength
  ) return false;
  if (!value.sourceCounts || typeof value.sourceCounts !== "object" || Array.isArray(value.sourceCounts)) return false;
  const sourceCountTotal = Object.values(value.sourceCounts).reduce((sum, count) => sum + Number(count || 0), 0);
  if (sourceCountTotal !== value.wordCount) return false;
  if (Object.values(value.sourceCounts).some((count) => !Number.isInteger(count) || count < 1)) return false;
  if (!Number.isFinite(value.spawnIntervalMs) || value.spawnIntervalMs < 500) return false;
  if (!Number.isFinite(value.wordSpeedPxPerSec) || value.wordSpeedPxPerSec <= 0 || value.wordSpeedPxPerSec > 120) return false;
  if (
    !Number.isInteger(value.maxSimultaneousWords) ||
    value.maxSimultaneousWords < 1 ||
    value.maxSimultaneousWords > 8 ||
    value.maxSimultaneousWords > value.wordCount
  ) return false;
  return Number.isFinite(value.targetWpm) && value.targetWpm > 0;
}

export function isArcadeRushGeneratorConfig(value) {
  return Boolean(
    value &&
    value.generatorVersion === ARCADE_RUSH_GENERATOR_VERSION &&
    value.profileStatus === ARCADE_RUSH_PROFILE_STATUS &&
    value.totalPlannedWords === ARCADE_RUSH_TOTAL_PLANNED_WORDS &&
    value.targetRunDurationMs >= ARCADE_RUSH_TARGET_DURATION_MS.minimum &&
    value.targetRunDurationMs <= ARCADE_RUSH_TARGET_DURATION_MS.maximum &&
    Array.isArray(value.waves) &&
    value.waves.length === ARCADE_RUSH_WAVE_COUNT &&
    value.waves.every((profile, index) => profile.wave === index + 1 && isArcadeRushWaveProfile(profile)),
  );
}

export function isArcadeRushFoundationConfig(value) {
  return Boolean(
    value &&
    value.contractVersion === ARCADE_RUSH_CONTRACT_VERSION &&
    value.modeId === ARCADE_RUSH_MODE_ID &&
    value.waveCount === ARCADE_RUSH_WAVE_COUNT &&
    value.finaleCount === ARCADE_RUSH_FINALE_COUNT &&
    value.startingIntegrity === ARCADE_RUSH_STARTING_INTEGRITY,
  );
}
