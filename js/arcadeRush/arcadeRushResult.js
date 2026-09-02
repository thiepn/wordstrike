import { buildSessionResult } from "../sessionResult.js";
import {
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_FAILURE_REASONS,
  ARCADE_RUSH_MODE_DATA_FIELDS,
  ARCADE_RUSH_MODE_ID,
  ARCADE_RUSH_REQUIRED_RESULT_FIELDS,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_WAVE_COUNT,
} from "./arcadeRushContract.js";
import { ARCADE_RUSH_BOSS_TARGET_DURATION_MS } from "./arcadeRushConfig.js";
import { isArcadeRushSeed } from "./arcadeRushGenerator.js";
import {
  ARCADE_RUSH_DRAFT_RULES_VERSION,
  ARCADE_RUSH_SCORING_VERSION,
  calculateArcadeRushFinalScore,
} from "./arcadeRushScoring.js";

function own(value, field) {
  return Boolean(value && Object.hasOwn(value, field));
}

function validInteger(value, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validFinite(value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validCountBlock(value) {
  return Boolean(
    value &&
    validInteger(value.completed, 0) &&
    validInteger(value.missed, 0) &&
    validInteger(value.total, 0) &&
    value.completed + value.missed === value.total,
  );
}

function validCharacterBlock(value) {
  return Boolean(
    value &&
    validInteger(value.correct, 0) &&
    validInteger(value.incorrect, 0) &&
    validInteger(value.missed, 0) &&
    validInteger(value.totalKeystrokes, 0) &&
    value.correct + value.incorrect === value.totalKeystrokes,
  );
}

function expectedFinalWave(wavesCompleted) {
  if (!validInteger(wavesCompleted, 0, ARCADE_RUSH_WAVE_COUNT)) return null;
  return wavesCompleted >= ARCADE_RUSH_WAVE_COUNT
    ? ARCADE_RUSH_WAVE_COUNT + 1
    : wavesCompleted + 1;
}

export function getMissingArcadeRushResultFields(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return Object.freeze([...ARCADE_RUSH_REQUIRED_RESULT_FIELDS]);
  }
  return Object.freeze(ARCADE_RUSH_REQUIRED_RESULT_FIELDS.filter((field) => !own(result, field)));
}

export function getMissingArcadeRushModeDataFields(modeData) {
  if (!modeData || typeof modeData !== "object" || Array.isArray(modeData)) {
    return Object.freeze([...ARCADE_RUSH_MODE_DATA_FIELDS]);
  }
  return Object.freeze(ARCADE_RUSH_MODE_DATA_FIELDS.filter((field) => !own(modeData, field)));
}

export function isArcadeRushResultContract(result) {
  return Boolean(
    result &&
    result.modeId === ARCADE_RUSH_MODE_ID &&
    getMissingArcadeRushResultFields(result).length === 0 &&
    getMissingArcadeRushModeDataFields(result.modeData).length === 0,
  );
}

export function isArcadeRushGlobalRecordEligible({
  success,
  bossDefeated,
  developerMode,
  rulesVersion,
} = {}) {
  return Boolean(
    success === true &&
    bossDefeated === true &&
    developerMode !== true &&
    Number.isSafeInteger(rulesVersion) &&
    rulesVersion >= 1,
  );
}

export function createArcadeRushModeData({
  success,
  developerMode = false,
  wavesCompleted,
  bossDefeated,
  bossTimeRemainingMs,
  integrityRemaining,
  perfectWaves,
  wordPoints,
  accuracy,
  rulesVersion = ARCADE_RUSH_DRAFT_RULES_VERSION,
} = {}) {
  if (rulesVersion !== ARCADE_RUSH_DRAFT_RULES_VERSION) return null;
  const scoring = calculateArcadeRushFinalScore({
    wordPoints,
    wavesCompleted,
    perfectWaves,
    success,
    bossDefeated,
    integrityRemaining,
    accuracy,
    bossTimeRemainingMs,
  });
  if (!scoring) return null;
  const finalWave = expectedFinalWave(wavesCompleted);
  if (finalWave == null) return null;
  if (success && (wavesCompleted !== ARCADE_RUSH_WAVE_COUNT || finalWave !== ARCADE_RUSH_WAVE_COUNT + 1)) {
    return null;
  }
  if (success !== bossDefeated) return null;
  if (!success && integrityRemaining !== 0) return null;
  if (wavesCompleted < ARCADE_RUSH_WAVE_COUNT && bossTimeRemainingMs !== 0) return null;

  return Object.freeze({
    contractVersion: ARCADE_RUSH_CONTRACT_VERSION,
    rulesVersion,
    recordEligible: isArcadeRushGlobalRecordEligible({
      success,
      bossDefeated,
      developerMode,
      rulesVersion,
    }),
    wavesCompleted,
    finalWave,
    bossDefeated,
    bossTimeRemainingMs,
    integrityRemaining,
    perfectWaves,
    wordPoints: scoring.breakdown.wordPoints,
    waveClearBonus: scoring.breakdown.waveClearBonus,
    perfectWaveBonus: scoring.breakdown.perfectWaveBonus,
    bossBonus: scoring.breakdown.bossBonus,
    integrityBonus: scoring.breakdown.integrityBonus,
    accuracyBonus: scoring.breakdown.accuracyBonus,
    timeBonus: scoring.breakdown.timeBonus,
  });
}

export function recomputeArcadeRushResultScore(result) {
  if (!isArcadeRushResultContract(result)) return null;
  const modeData = result.modeData;
  if (modeData.rulesVersion !== ARCADE_RUSH_DRAFT_RULES_VERSION) return null;
  return calculateArcadeRushFinalScore({
    wordPoints: modeData.wordPoints,
    wavesCompleted: modeData.wavesCompleted,
    perfectWaves: modeData.perfectWaves,
    success: result.success,
    bossDefeated: modeData.bossDefeated,
    integrityRemaining: modeData.integrityRemaining,
    accuracy: result.accuracy,
    bossTimeRemainingMs: modeData.bossTimeRemainingMs,
  });
}

export function validateArcadeRushCanonicalResult(result) {
  const errors = [];
  if (!isArcadeRushResultContract(result)) {
    return Object.freeze({ valid: false, errors: Object.freeze(["contract-shape"]), recomputedScore: null });
  }
  const modeData = result.modeData;
  if (!isArcadeRushSeed(result.seed)) errors.push("seed");
  if (modeData.contractVersion !== ARCADE_RUSH_CONTRACT_VERSION) errors.push("contract-version");
  if (modeData.rulesVersion !== ARCADE_RUSH_DRAFT_RULES_VERSION) errors.push("rules-version");
  if (!validInteger(modeData.wavesCompleted, 0, ARCADE_RUSH_WAVE_COUNT)) errors.push("waves-completed");
  if (modeData.finalWave !== expectedFinalWave(modeData.wavesCompleted)) errors.push("final-wave");
  if (!validInteger(modeData.perfectWaves, 0, modeData.wavesCompleted)) errors.push("perfect-waves");
  if (!validInteger(modeData.integrityRemaining, 0, ARCADE_RUSH_STARTING_INTEGRITY)) errors.push("integrity");
  if (!validInteger(modeData.bossTimeRemainingMs, 0, ARCADE_RUSH_BOSS_TARGET_DURATION_MS)) errors.push("boss-time");
  if (typeof modeData.bossDefeated !== "boolean") errors.push("boss-defeated");
  if (result.success !== modeData.bossDefeated) errors.push("success-boss-state");
  if (result.success && modeData.wavesCompleted !== ARCADE_RUSH_WAVE_COUNT) errors.push("success-wave-state");
  if (result.success && modeData.integrityRemaining < 1) errors.push("success-integrity");
  if (!result.success && modeData.integrityRemaining !== 0) errors.push("failure-integrity");
  if (modeData.wavesCompleted < ARCADE_RUSH_WAVE_COUNT && modeData.bossTimeRemainingMs !== 0) {
    errors.push("boss-time-before-boss");
  }
  if (result.success && result.failureReason != null) errors.push("success-failure-reason");
  if (!result.success && !ARCADE_RUSH_FAILURE_REASONS.includes(result.failureReason)) {
    errors.push("failure-reason");
  }
  if (!validFinite(result.accuracy, 0, 100)) errors.push("accuracy");
  if (!validFinite(result.wpm, 0)) errors.push("wpm");
  if (!validCharacterBlock(result.characters)) errors.push("characters");
  if (!validCountBlock(result.words)) errors.push("words");
  if (!result.combo || !validInteger(result.combo.maximum, 0) || !validInteger(result.combo.final, 0)) {
    errors.push("combo");
  } else if (result.combo.final > result.combo.maximum) {
    errors.push("combo-order");
  }
  const expectedEligibility = isArcadeRushGlobalRecordEligible({
    success: result.success,
    bossDefeated: modeData.bossDefeated,
    developerMode: result.developerMode,
    rulesVersion: modeData.rulesVersion,
  });
  if (modeData.recordEligible !== expectedEligibility) errors.push("record-eligibility");

  const recomputed = recomputeArcadeRushResultScore(result);
  if (!recomputed) {
    errors.push("score-recompute");
  } else {
    for (const field of [
      "wordPoints",
      "waveClearBonus",
      "perfectWaveBonus",
      "bossBonus",
      "integrityBonus",
      "accuracyBonus",
      "timeBonus",
    ]) {
      if (modeData[field] !== recomputed.breakdown[field]) errors.push(`score-component:${field}`);
    }
    if (result.score !== recomputed.total) errors.push("score-total");
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    recomputedScore: recomputed?.total ?? null,
  });
}

export function buildArcadeRushSessionResult({
  sessionId,
  sessionSource = "arcade-rush-ready",
  startedAt,
  endedAt,
  durationMs,
  activeDurationMs,
  seed,
  developerMode = false,
  success,
  accuracy,
  wpm,
  characters,
  words,
  combo,
  wavesCompleted,
  bossDefeated,
  bossTimeRemainingMs = 0,
  integrityRemaining,
  perfectWaves,
  wordPoints,
  rulesVersion = ARCADE_RUSH_DRAFT_RULES_VERSION,
} = {}) {
  if (typeof sessionId !== "string" || !sessionId) return null;
  if (!isArcadeRushSeed(seed)) return null;
  if (typeof success !== "boolean") return null;
  if (!validFinite(accuracy, 0, 100) || !validFinite(wpm, 0)) return null;
  if (!validCharacterBlock(characters) || !validCountBlock(words)) return null;
  if (!combo || !validInteger(combo.maximum, 0) || !validInteger(combo.final, 0)) return null;
  if (combo.final > combo.maximum) return null;

  const modeData = createArcadeRushModeData({
    success,
    developerMode,
    wavesCompleted,
    bossDefeated,
    bossTimeRemainingMs,
    integrityRemaining,
    perfectWaves,
    wordPoints,
    accuracy,
    rulesVersion,
  });
  if (!modeData) return null;
  const scoring = calculateArcadeRushFinalScore({
    wordPoints,
    wavesCompleted,
    perfectWaves,
    success,
    bossDefeated,
    integrityRemaining,
    accuracy,
    bossTimeRemainingMs,
  });
  if (!scoring) return null;

  const result = buildSessionResult({
    sessionId,
    modeId: ARCADE_RUSH_MODE_ID,
    variantId: `draft-r${rulesVersion}-s${ARCADE_RUSH_SCORING_VERSION}`,
    sessionSource,
    startedAt,
    endedAt,
    durationMs,
    activeDurationMs,
    seed,
    developerMode,
    success,
    failureReason: success ? null : "core-destroyed",
    score: scoring.total,
    accuracy,
    wpm,
    characters,
    words,
    combo,
    modeData,
  });
  if (!result) return null;
  return validateArcadeRushCanonicalResult(result).valid ? result : null;
}
