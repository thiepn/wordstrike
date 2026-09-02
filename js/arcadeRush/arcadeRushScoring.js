import {
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_SCORE_COMPONENT_FIELDS,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";
import { ARCADE_RUSH_BOSS_TARGET_DURATION_MS } from "./arcadeRushConfig.js";

export const ARCADE_RUSH_SCORING_VERSION = 1;
// Compatibility alias for AR3–AR5 imports. It intentionally resolves to the
// frozen rules version after AR10; there is no active draft ruleset anymore.
export const ARCADE_RUSH_DRAFT_RULES_VERSION = ARCADE_RUSH_RULES_VERSION;
export const ARCADE_RUSH_SCORING_STATUS = "FROZEN_V1";

export const ARCADE_RUSH_BASE_POINTS_BY_TIER = Object.freeze({
  1: 100,
  2: 125,
  3: 160,
  4: 200,
  5: 250,
});

export const ARCADE_RUSH_COMBO_MULTIPLIER_BPS = Object.freeze([
  Object.freeze({ minimumCombo: 100, basisPoints: 20_000 }),
  Object.freeze({ minimumCombo: 70, basisPoints: 17_500 }),
  Object.freeze({ minimumCombo: 40, basisPoints: 15_000 }),
  Object.freeze({ minimumCombo: 20, basisPoints: 12_500 }),
  Object.freeze({ minimumCombo: 10, basisPoints: 11_000 }),
  Object.freeze({ minimumCombo: 0, basisPoints: 10_000 }),
]);

export const ARCADE_RUSH_WAVE_CLEAR_BONUSES = Object.freeze({
  1: 500,
  2: 1_000,
  3: 1_500,
  4: 2_000,
  5: 3_000,
  6: 4_000,
});

export const ARCADE_RUSH_PERFECT_WAVE_BONUS = 1_500;
export const ARCADE_RUSH_BOSS_CLEAR_BONUS = 8_000;
export const ARCADE_RUSH_INTEGRITY_POINT_VALUE = 2_000;
export const ARCADE_RUSH_BOSS_TIME_BONUS_PER_SECOND = 100;

export const ARCADE_RUSH_ACCURACY_BONUS_BPS = Object.freeze([
  Object.freeze({ minimumAccuracy: 100, basisPoints: 3_000 }),
  Object.freeze({ minimumAccuracy: 98, basisPoints: 2_000 }),
  Object.freeze({ minimumAccuracy: 95, basisPoints: 1_000 }),
  Object.freeze({ minimumAccuracy: 90, basisPoints: 500 }),
  Object.freeze({ minimumAccuracy: 0, basisPoints: 0 }),
]);

function validPoints(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validInteger(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validAccuracy(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function multiplyBasisPoints(points, basisPoints) {
  if (!validPoints(points) || !validInteger(basisPoints, 0)) return null;
  const multiplied = points * basisPoints;
  if (!Number.isSafeInteger(multiplied)) return null;
  const rounded = Math.round(multiplied / 10_000);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

export function createEmptyArcadeRushScoreBreakdown() {
  return Object.freeze(Object.fromEntries(
    ARCADE_RUSH_SCORE_COMPONENT_FIELDS.map((field) => [field, 0]),
  ));
}

export function normalizeArcadeRushScoreBreakdown(value = {}) {
  const normalized = {};
  for (const field of ARCADE_RUSH_SCORE_COMPONENT_FIELDS) {
    const points = value[field] ?? 0;
    if (!validPoints(points)) return null;
    normalized[field] = points;
  }
  return Object.freeze(normalized);
}

export function sumArcadeRushScoreComponents(value = {}) {
  const normalized = normalizeArcadeRushScoreBreakdown(value);
  if (!normalized) return null;
  const total = Object.values(normalized).reduce((sum, points) => sum + points, 0);
  return Number.isSafeInteger(total) ? total : null;
}

export function getArcadeRushComboMultiplierBasisPoints(comboAfterCompletion) {
  if (!validInteger(comboAfterCompletion, 1)) return null;
  return ARCADE_RUSH_COMBO_MULTIPLIER_BPS.find(
    ({ minimumCombo }) => comboAfterCompletion >= minimumCombo,
  )?.basisPoints ?? null;
}

export function calculateArcadeRushWordPoints({ pointTier, comboAfterCompletion } = {}) {
  if (!validInteger(pointTier, 1, 5)) return null;
  const basePoints = ARCADE_RUSH_BASE_POINTS_BY_TIER[pointTier];
  const multiplier = getArcadeRushComboMultiplierBasisPoints(comboAfterCompletion);
  if (!validPoints(basePoints) || multiplier == null) return null;
  return multiplyBasisPoints(basePoints, multiplier);
}

export function calculateArcadeRushWaveClearBonus(wavesCompleted) {
  if (!validInteger(wavesCompleted, 0, ARCADE_RUSH_WAVE_COUNT)) return null;
  let total = 0;
  for (let wave = 1; wave <= wavesCompleted; wave += 1) {
    total += ARCADE_RUSH_WAVE_CLEAR_BONUSES[wave] || 0;
  }
  return Number.isSafeInteger(total) ? total : null;
}

export function calculateArcadeRushPerfectWaveBonus(perfectWaves) {
  if (!validInteger(perfectWaves, 0, ARCADE_RUSH_WAVE_COUNT)) return null;
  return perfectWaves * ARCADE_RUSH_PERFECT_WAVE_BONUS;
}

export function calculateArcadeRushBossBonus({ success, bossDefeated } = {}) {
  if (typeof success !== "boolean" || typeof bossDefeated !== "boolean") return null;
  if (success !== bossDefeated) return null;
  return success ? ARCADE_RUSH_BOSS_CLEAR_BONUS : 0;
}

export function calculateArcadeRushIntegrityBonus({
  success,
  bossDefeated,
  integrityRemaining,
} = {}) {
  if (typeof success !== "boolean" || typeof bossDefeated !== "boolean") return null;
  if (success !== bossDefeated) return null;
  if (!validInteger(integrityRemaining, 0, ARCADE_RUSH_STARTING_INTEGRITY)) return null;
  if (success && integrityRemaining < 1) return null;
  if (!success && integrityRemaining !== 0) return null;
  return success ? integrityRemaining * ARCADE_RUSH_INTEGRITY_POINT_VALUE : 0;
}

export function calculateArcadeRushTimeBonus({
  success,
  bossDefeated,
  bossTimeRemainingMs,
} = {}) {
  if (typeof success !== "boolean" || typeof bossDefeated !== "boolean") return null;
  if (success !== bossDefeated) return null;
  if (!validInteger(bossTimeRemainingMs, 0, ARCADE_RUSH_BOSS_TARGET_DURATION_MS)) return null;
  if (!success) return 0;
  const wholeSecondsRemaining = Math.floor(bossTimeRemainingMs / 1_000);
  return wholeSecondsRemaining * ARCADE_RUSH_BOSS_TIME_BONUS_PER_SECOND;
}

export function getArcadeRushAccuracyBonusBasisPoints(accuracy) {
  if (!validAccuracy(accuracy)) return null;
  return ARCADE_RUSH_ACCURACY_BONUS_BPS.find(
    ({ minimumAccuracy }) => accuracy >= minimumAccuracy,
  )?.basisPoints ?? null;
}

export function calculateArcadeRushAccuracyBonus({ accuracy, eligibleSubtotal } = {}) {
  if (!validAccuracy(accuracy) || !validPoints(eligibleSubtotal)) return null;
  const basisPoints = getArcadeRushAccuracyBonusBasisPoints(accuracy);
  if (basisPoints == null) return null;
  return multiplyBasisPoints(eligibleSubtotal, basisPoints);
}

export function calculateArcadeRushFinalScore({
  wordPoints,
  wavesCompleted,
  perfectWaves,
  success,
  bossDefeated,
  integrityRemaining,
  accuracy,
  bossTimeRemainingMs,
} = {}) {
  if (!validPoints(wordPoints)) return null;
  if (!validInteger(wavesCompleted, 0, ARCADE_RUSH_WAVE_COUNT)) return null;
  if (!validInteger(perfectWaves, 0, wavesCompleted)) return null;
  if (!validAccuracy(accuracy)) return null;

  const waveClearBonus = calculateArcadeRushWaveClearBonus(wavesCompleted);
  const perfectWaveBonus = calculateArcadeRushPerfectWaveBonus(perfectWaves);
  const bossBonus = calculateArcadeRushBossBonus({ success, bossDefeated });
  const integrityBonus = calculateArcadeRushIntegrityBonus({
    success,
    bossDefeated,
    integrityRemaining,
  });
  const timeBonus = calculateArcadeRushTimeBonus({
    success,
    bossDefeated,
    bossTimeRemainingMs,
  });
  if ([waveClearBonus, perfectWaveBonus, bossBonus, integrityBonus, timeBonus].some(
    (value) => value == null,
  )) return null;

  const eligibleSubtotal = [
    wordPoints,
    waveClearBonus,
    perfectWaveBonus,
    bossBonus,
    integrityBonus,
    timeBonus,
  ].reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(eligibleSubtotal)) return null;
  const accuracyBonus = calculateArcadeRushAccuracyBonus({ accuracy, eligibleSubtotal });
  if (accuracyBonus == null) return null;

  const breakdown = normalizeArcadeRushScoreBreakdown({
    wordPoints,
    waveClearBonus,
    perfectWaveBonus,
    bossBonus,
    integrityBonus,
    accuracyBonus,
    timeBonus,
  });
  if (!breakdown) return null;
  const total = sumArcadeRushScoreComponents(breakdown);
  if (total == null) return null;

  return Object.freeze({
    scoringVersion: ARCADE_RUSH_SCORING_VERSION,
    rulesVersion: ARCADE_RUSH_RULES_VERSION,
    scoringStatus: ARCADE_RUSH_SCORING_STATUS,
    accuracyBonusBasisPoints: getArcadeRushAccuracyBonusBasisPoints(accuracy),
    breakdown,
    total,
  });
}
