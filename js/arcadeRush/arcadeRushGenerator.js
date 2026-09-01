import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";

function cloneSerializable(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function isArcadeRushSeed(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function createArcadeRushPlanEnvelope({ seed, waves, boss } = {}) {
  if (!isArcadeRushSeed(seed) || !Array.isArray(waves) || waves.length !== ARCADE_RUSH_WAVE_COUNT) {
    return null;
  }
  if (!waves.every((wave, index) => (
    wave && typeof wave === "object" && !Array.isArray(wave) && wave.wave === index + 1
  ))) {
    return null;
  }
  if (!boss || typeof boss !== "object" || Array.isArray(boss)) return null;
  const clonedWaves = cloneSerializable(waves);
  const clonedBoss = cloneSerializable(boss);
  if (!clonedWaves || !clonedBoss) return null;
  return deepFreeze({
    contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
    seed,
    waves: clonedWaves,
    boss: clonedBoss,
  });
}

export function isArcadeRushPlanEnvelope(value) {
  return Boolean(
    value &&
    value.contractVersion === ARCADE_RUSH_CONTRACT_VERSION &&
    isArcadeRushSeed(value.seed) &&
    Array.isArray(value.waves) &&
    value.waves.length === ARCADE_RUSH_WAVE_COUNT &&
    value.waves.every((wave, index) => wave?.wave === index + 1) &&
    value.boss && typeof value.boss === "object" && !Array.isArray(value.boss),
  );
}
