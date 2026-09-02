import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRush/arcadeRushContract.js";
import { validateArcadeRushCanonicalResult } from "./arcadeRush/arcadeRushResult.js";

export const ARCADE_RUSH_LEADERBOARD_BOARD_KEY = "arcade-rush-v1";
export const ARCADE_RUSH_LEADERBOARD_CATEGORY = ARCADE_RUSH_MODE_ID;
export const ARCADE_RUSH_LEADERBOARD_RULES_VERSION = ARCADE_RUSH_RULES_VERSION;
export const ARCADE_RUSH_LEADERBOARD_SHADOW_VERSION = 1;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = 0) {
  const number = Math.trunc(finite(value, fallback));
  return Number.isSafeInteger(number) ? number : fallback;
}

function compareTimestamp(first, second) {
  const a = Date.parse(String(first?.submittedAt || ""));
  const b = Date.parse(String(second?.submittedAt || ""));
  const safeA = Number.isFinite(a) ? a : Number.MAX_SAFE_INTEGER;
  const safeB = Number.isFinite(b) ? b : Number.MAX_SAFE_INTEGER;
  return safeA - safeB;
}

export function isArcadeRushLeaderboardShadowEnabled(search = globalThis.location?.search || "") {
  try {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    return ["1", "true", "yes", "on"].includes(String(params.get("dev") || "").toLowerCase());
  } catch {
    return false;
  }
}

export function compareArcadeRushLeaderboardEntries(first = {}, second = {}) {
  const completedDifference = Number(second?.completed === true) - Number(first?.completed === true);
  if (completedDifference) return completedDifference;
  const scoreDifference = finite(second?.score) - finite(first?.score);
  if (scoreDifference) return scoreDifference;
  const accuracyDifference = finite(second?.accuracy) - finite(first?.accuracy);
  if (accuracyDifference) return accuracyDifference;
  const durationDifference = Math.max(0, finite(first?.durationMs)) - Math.max(0, finite(second?.durationMs));
  if (durationDifference) return durationDifference;
  const timestampDifference = compareTimestamp(first, second);
  if (timestampDifference) return timestampDifference;
  return String(first?.username || "").localeCompare(String(second?.username || ""));
}

export function buildArcadeRushLeaderboardSubmissionResult(result) {
  const validation = validateArcadeRushCanonicalResult(result);
  const data = result?.modeData;
  if (
    !validation.valid ||
    result?.modeId !== ARCADE_RUSH_MODE_ID ||
    result?.success !== true ||
    data?.bossDefeated !== true ||
    data?.wavesCompleted !== ARCADE_RUSH_WAVE_COUNT ||
    data?.rulesVersion !== ARCADE_RUSH_LEADERBOARD_RULES_VERSION
  ) return null;

  return Object.freeze({
    contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
    rulesVersion: data.rulesVersion,
    seed: result.seed,
    variantId: result.variantId,
    score: result.score,
    accuracy: result.accuracy,
    wpm: result.wpm,
    durationMs: Math.max(0, integer(result.activeDurationMs)),
    completed: true,
    failureReason: null,
    wavesCompleted: data.wavesCompleted,
    finalWave: data.finalWave,
    bossDefeated: true,
    bossTimeRemainingMs: data.bossTimeRemainingMs,
    integrityRemaining: data.integrityRemaining,
    perfectWaves: data.perfectWaves,
    maxCombo: integer(result.combo?.maximum),
    finalCombo: integer(result.combo?.final),
    wordsCompleted: integer(result.words?.completed),
    wordsMissed: integer(result.words?.missed),
    wordsTotal: integer(result.words?.total),
    correctCharacters: integer(result.characters?.correct),
    incorrectCharacters: integer(result.characters?.incorrect),
    missedCharacters: integer(result.characters?.missed),
    totalKeystrokes: integer(result.characters?.totalKeystrokes),
    wordPoints: data.wordPoints,
    waveClearBonus: data.waveClearBonus,
    perfectWaveBonus: data.perfectWaveBonus,
    bossBonus: data.bossBonus,
    integrityBonus: data.integrityBonus,
    accuracyBonus: data.accuracyBonus,
    timeBonus: data.timeBonus,
    recordEligible: data.recordEligible === true,
    developerMode: result.developerMode === true,
    sessionSource: result.sessionSource,
  });
}
