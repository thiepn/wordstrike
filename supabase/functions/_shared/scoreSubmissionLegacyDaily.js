export const CURRENT_GAME_VERSION = "1.0.0";
export const DAILY_BOARD_KEY = "daily-strike-v1";
export const ENDLESS_BOARD_KEY = "endless-v1";
export const CAMPAIGN_BOARD_KEY = "campaign-highest-level-v1";
export const TYPING_60_BOARD_KEY = "typing-60s-english200-v1";
export const TYPING_15_BOARD_KEY = "typing-15s-english200-v1";
export const ARCADE_RUSH_BOARD_KEY = "arcade-rush-v1";
export const DAILY_CHALLENGE_VERSION = 1;
export const ARCADE_RUSH_CONTRACT_VERSION = 1;
export const ARCADE_RUSH_RULES_VERSION = 1;
export const ARCADE_RUSH_VARIANT_ID = "draft-r1-s1";
export const ARCADE_RUSH_NORMAL_WORDS = 168;
export const ARCADE_RUSH_STARTING_INTEGRITY = 5;
export const ARCADE_RUSH_BOSS_DURATION_MS = 45_000;
export const ARCADE_RUSH_MIN_SUCCESS_DURATION_MS = 227_000;
export const SUPPORTED_BOARD_KEYS = Object.freeze([
  CAMPAIGN_BOARD_KEY, TYPING_60_BOARD_KEY, TYPING_15_BOARD_KEY,
  ENDLESS_BOARD_KEY, DAILY_BOARD_KEY, ARCADE_RUSH_BOARD_KEY,
]);
export const SUBMISSION_RATE_LIMIT_PER_HOUR = 30;

const ROOT_FIELDS = new Set(["boardKey", "sessionId", "clientVersion", "result"]);
const NORMAL_SOURCES = Object.freeze({
  [DAILY_BOARD_KEY]: new Set(["daily-ready", "retry"]),
  [ENDLESS_BOARD_KEY]: new Set(["mode-select", "retry", "restart"]),
  [CAMPAIGN_BOARD_KEY]: new Set(["level-select", "retry", "next-level"]),
  [TYPING_60_BOARD_KEY]: new Set(["mode-select", "retry", "change-test", "tab-reset", "quit-test"]),
  [TYPING_15_BOARD_KEY]: new Set(["mode-select", "retry", "change-test", "tab-reset", "quit-test"]),
  [ARCADE_RUSH_BOARD_KEY]: new Set(["arcade-rush-ready", "retry", "restart"]),
});
const DAILY_FIELDS = new Set([
  "score", "accuracy", "durationMs", "wordsCompleted", "completed", "failureReason",
  "integrityRemaining", "challengeDate", "challengeVersion", "wordsResolved",
  "wordsSpawned", "totalWords", "dateOverride", "recordEligible", "developerMode",
  "sessionSource", "wordPoints", "completionBonus", "integrityBonus", "accuracyBonus",
  "timeBonus", "coreHits", "coreBreaches", "finalWave",
]);
const ENDLESS_FIELDS = new Set([
  "score", "stage", "accuracy", "durationMs", "wordsCompleted", "completed",
  "failureReason", "recordEligible", "developerMode", "sessionSource", "metricVersion",
  "finalStage", "stageProgress", "completedStages", "survivalPoints", "wordPoints",
  "stageBonusPoints", "coreHits", "coreBreaches", "startStage",
]);
const CAMPAIGN_FIELDS = new Set([
  "level", "completed", "grade", "accuracy", "durationMs", "wordsCompleted",
  "wordsTotal", "variantId", "correctCharacters", "correctKeystrokes",
  "totalKeystrokes", "missedCharacters", "recordEligible", "developerMode",
  "sessionSource",
]);
const TYPING_FIELDS = new Set([
  "durationSeconds", "configId", "wordSetId", "wordSetVersion", "metricVersion",
  "wpm", "rawWpm", "accuracy", "durationMs", "correctTestCharacters",
  "rawTestCharacters", "correctKeystrokes", "incorrectKeystrokes",
  "missedCharacters", "wordsCompleted", "exactWords", "incorrectWords",
  "completed", "recordEligible", "developerMode", "sessionSource",
]);
const ARCADE_RUSH_FIELDS = new Set([
  "contractVersion", "rulesVersion", "seed", "variantId", "score", "accuracy", "wpm",
  "durationMs", "completed", "failureReason", "wavesCompleted", "finalWave",
  "bossDefeated", "bossTimeRemainingMs", "integrityRemaining", "perfectWaves",
  "maxCombo", "finalCombo", "wordsCompleted", "wordsMissed", "wordsTotal",
  "correctCharacters", "incorrectCharacters", "missedCharacters", "totalKeystrokes",
  "wordPoints", "waveClearBonus", "perfectWaveBonus", "bossBonus", "integrityBonus",
  "accuracyBonus", "timeBonus", "recordEligible", "developerMode", "sessionSource",
]);
const CAMPAIGN_GRADES = Object.freeze(["D", "C", "B", "A", "S"]);

const failure = (code) => Object.freeze({ valid: false, code });
const success = (value) => Object.freeze({ valid: true, value: Object.freeze(value) });
const ownKeysOnly = (value, allowed) => (
  value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.has(key))
);
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => (
  Number.isSafeInteger(value) && value >= minimum && value <= maximum
);
const finite = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => (
  Number.isFinite(value) && value >= minimum && value <= maximum
);
const canonicalDate = (now = new Date()) => new Date(now).toISOString().slice(0, 10);
const closeEnough = (actual, expected, tolerance = 1e-9) => (
  Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance
);

export function isValidSubmissionSessionId(value) {
  return typeof value === "string" && value.length <= 128 && (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ||
    /^session-[a-z0-9-]{8,120}$/i.test(value)
  );
}

export function getEndlessWordsPerStageForSubmission(stage) {
  if (stage <= 5) return 10;
  if (stage <= 10) return 15;
  return 20;
}

export function getEndlessWordsBeforeStage(stage) {
  let total = 0;
  for (let current = 1; current < stage; current += 1) {
    total += getEndlessWordsPerStageForSubmission(current);
  }
  return total;
}

function validateCommon(body) {
  if (!ownKeysOnly(body, ROOT_FIELDS) || Object.keys(body).length !== ROOT_FIELDS.size) {
    return failure("INVALID_REQUEST");
  }
  if (!SUPPORTED_BOARD_KEYS.includes(body.boardKey)) return failure("INVALID_BOARD");
  if (!isValidSubmissionSessionId(body.sessionId)) return failure("INVALID_SESSION_ID");
  if (body.clientVersion !== CURRENT_GAME_VERSION) return failure("UNSUPPORTED_CLIENT_VERSION");
  return null;
}

function validateEligibility(result, boardKey) {
  if (result.developerMode === true) return failure("DEVELOPER_RESULT");
  if (result.developerMode !== false) return failure("INVALID_RESULT");
  if (result.recordEligible !== true) return failure("RECORD_NOT_ELIGIBLE");
  if (!NORMAL_SOURCES[boardKey].has(result.sessionSource)) return failure("INVALID_SESSION_SOURCE");
  return null;
}

function validateDaily(body, now) {
  const result = body.result;
  if (!ownKeysOnly(result, DAILY_FIELDS) || Object.keys(result).length !== DAILY_FIELDS.size) {
    return failure("INVALID_RESULT");
  }
  const ineligible = validateEligibility(result, body.boardKey);
  if (ineligible) return ineligible;
  if (result.challengeDate !== canonicalDate(now) || result.challengeVersion !== DAILY_CHALLENGE_VERSION) {
    return failure("CHALLENGE_MISMATCH");
  }
  if (result.dateOverride !== false) return failure("RECORD_NOT_ELIGIBLE");
  if (
    result.totalWords !== 60 ||
    !integer(result.wordsCompleted, 0, 60) || !integer(result.wordsResolved, 0, 60) ||
    !integer(result.wordsSpawned, 0, 60) || result.wordsCompleted > result.wordsResolved ||
    result.wordsResolved > result.wordsSpawned ||
    !integer(result.coreBreaches, 0, 60) ||
    result.wordsCompleted + result.coreBreaches !== result.wordsResolved
  ) return failure("INVALID_WORD_COUNTERS");
  if (
    typeof result.completed !== "boolean" ||
    (result.completed && (result.failureReason !== null || result.wordsResolved !== 60 || result.integrityRemaining < 1)) ||
    (!result.completed && result.failureReason !== "core-destroyed")
  ) return failure("INVALID_FAILURE_STATE");
  if (
    !integer(result.score) || !finite(result.accuracy, 0, 100) ||
    !integer(result.durationMs, 1, 21600000) ||
    !integer(result.integrityRemaining, 0, 3) ||
    !integer(result.wordPoints) || !integer(result.completionBonus) ||
    !integer(result.integrityBonus) || !integer(result.accuracyBonus) ||
    !integer(result.timeBonus) || !integer(result.coreHits, 0, 3) ||
    result.coreBreaches < result.coreHits || !integer(result.finalWave, 1, 3) ||
    result.coreHits !== 3 - result.integrityRemaining
  ) return failure("INVALID_RESULT");

  const completionBonus = result.completed ? 10000 : 0;
  const integrityBonus = result.completed ? result.integrityRemaining * 2000 : 0;
  const accuracyBonus = result.completed ? Math.round(2000 * result.accuracy / 100) : 0;
  const timeBonus = result.completed
    ? Math.round(Math.max(0, Math.min(1, (180000 - result.durationMs) / 180000)) * 5000)
    : 0;
  const computedScore = result.wordPoints + completionBonus + integrityBonus + accuracyBonus + timeBonus;
  if (
    result.completionBonus !== completionBonus || result.integrityBonus !== integrityBonus ||
    result.accuracyBonus !== accuracyBonus || result.timeBonus !== timeBonus ||
    result.score !== computedScore
  ) return failure("SCORE_MISMATCH");

  return success({
    boardKey: body.boardKey,
    sessionId: body.sessionId,
    clientVersion: body.clientVersion,
    score: result.score,
    stage: null,
    level: null,
    grade: null,
    wpm: null,
    rawWpm: null,
    accuracy: result.accuracy,
    durationMs: result.durationMs,
    completed: result.completed,
    wordsCompleted: result.wordsCompleted,
    integrityRemaining: result.integrityRemaining,
    challengeDate: result.challengeDate,
    challengeVersion: result.challengeVersion,
    metrics: Object.freeze({
      wordsResolved: result.wordsResolved,
      wordsSpawned: result.wordsSpawned,
      wordPoints: result.wordPoints,
      completionBonus,
      integrityBonus,
      accuracyBonus,
      timeBonus,
      coreHits: result.coreHits,
      coreBreaches: result.coreBreaches,
      finalWave: result.finalWave,
    }),
  });
}

function validateEndless(body) {
  const result = body.result;
  if (!ownKeysOnly(result, ENDLESS_FIELDS) || Object.keys(result).length !== ENDLESS_FIELDS.size) {
    return failure("INVALID_RESULT");
  }
  const ineligible = validateEligibility(result, body.boardKey);
  if (ineligible) return ineligible;
  if (result.completed !== false || result.failureReason !== "core-destroyed") {
    return failure("INVALID_FAILURE_STATE");
  }
  if (
    result.metricVersion !== 1 || result.startStage !== 1 ||
    !integer(result.score) || !integer(result.stage, 1, 10000) || result.finalStage !== result.stage ||
    !finite(result.accuracy, 0, 100) || !integer(result.durationMs, 1, 86400000) ||
    !integer(result.wordsCompleted, 0, 200000) ||
    !integer(result.stageProgress, 0, getEndlessWordsPerStageForSubmission(result.stage) - 1) ||
    result.completedStages !== result.stage - 1 ||
    result.wordsCompleted !== getEndlessWordsBeforeStage(result.stage) + result.stageProgress ||
    !integer(result.survivalPoints) || !integer(result.wordPoints) ||
    !integer(result.stageBonusPoints) || !integer(result.coreHits, 3, 3) ||
    !integer(result.coreBreaches, result.coreHits, 200000)
  ) return failure("INVALID_RESULT");

  const survivalPoints = Math.floor((result.durationMs / 1000) * 100);
  const stageBonusPoints = 250 * (result.stage - 1) * result.stage / 2;
  const computedScore = survivalPoints + result.wordPoints + stageBonusPoints;
  if (
    result.survivalPoints !== survivalPoints || result.stageBonusPoints !== stageBonusPoints ||
    result.score !== computedScore
  ) return failure("SCORE_MISMATCH");

  return success({
    boardKey: body.boardKey,
    sessionId: body.sessionId,
    clientVersion: body.clientVersion,
    score: result.score,
    stage: result.stage,
    level: null,
    grade: null,
    wpm: null,
    rawWpm: null,
    accuracy: result.accuracy,
    durationMs: result.durationMs,
    completed: false,
    wordsCompleted: result.wordsCompleted,
    integrityRemaining: null,
    challengeDate: null,
    challengeVersion: null,
    metrics: Object.freeze({
      stageProgress: result.stageProgress,
      completedStages: result.completedStages,
      survivalPoints,
      wordPoints: result.wordPoints,
      stageBonusPoints,
      coreHits: result.coreHits,
      coreBreaches: result.coreBreaches,
    }),
  });
}

function arcadeRushAccuracyBasisPoints(accuracy) {
  if (accuracy >= 100) return 3_000;
  if (accuracy >= 98) return 2_000;
  if (accuracy >= 95) return 1_000;
  if (accuracy >= 90) return 500;
  return 0;
}

export function isPossibleArcadeRushWordCounters({
  integrityRemaining,
  wordsCompleted,
  wordsMissed,
  wordsTotal,
} = {}) {
  if (
    !integer(integrityRemaining, 1, ARCADE_RUSH_STARTING_INTEGRITY) ||
    !integer(wordsCompleted, 0, 220) || !integer(wordsMissed, 0, 20) ||
    !integer(wordsTotal, 0, 240) || wordsCompleted + wordsMissed !== wordsTotal
  ) return false;
  const integrityLost = ARCADE_RUSH_STARTING_INTEGRITY - integrityRemaining;
  for (let bossMisses = 0; bossMisses <= integrityLost; bossMisses += 1) {
    const normalMisses = integrityLost - bossMisses;
    const normalCompleted = ARCADE_RUSH_NORMAL_WORDS - normalMisses;
    const minimumCompleted = normalCompleted + 16;
    const maximumCompleted = normalCompleted + 24;
    const minimumMissed = normalMisses + bossMisses * 2;
    const maximumMissed = normalMisses + bossMisses * 3;
    if (
      wordsCompleted >= minimumCompleted && wordsCompleted <= maximumCompleted &&
      wordsMissed >= minimumMissed && wordsMissed <= maximumMissed
    ) return true;
  }
  return false;
}

function validateArcadeRush(body) {
  const result = body.result;
  if (!ownKeysOnly(result, ARCADE_RUSH_FIELDS) || Object.keys(result).length !== ARCADE_RUSH_FIELDS.size) {
    return failure("INVALID_RESULT");
  }
  const ineligible = validateEligibility(result, body.boardKey);
  if (ineligible) return ineligible;
  if (
    result.contractVersion !== ARCADE_RUSH_CONTRACT_VERSION ||
    result.rulesVersion !== ARCADE_RUSH_RULES_VERSION ||
    result.variantId !== ARCADE_RUSH_VARIANT_ID ||
    !integer(result.seed, 0, 0xffffffff)
  ) return failure("INVALID_RESULT");
  if (
    result.completed !== true || result.failureReason !== null ||
    result.wavesCompleted !== 6 || result.finalWave !== 7 || result.bossDefeated !== true
  ) return failure("INVALID_FAILURE_STATE");
  if (
    !integer(result.durationMs, ARCADE_RUSH_MIN_SUCCESS_DURATION_MS, 900_000) ||
    !integer(result.bossTimeRemainingMs, 0, ARCADE_RUSH_BOSS_DURATION_MS) ||
    !integer(result.integrityRemaining, 1, ARCADE_RUSH_STARTING_INTEGRITY) ||
    !integer(result.perfectWaves, 0, 6) ||
    !integer(result.maxCombo, 2, 220) || !integer(result.finalCombo, 2, result.maxCombo) ||
    !finite(result.accuracy, 0, 100) || !finite(result.wpm, 0, 1000) ||
    !integer(result.correctCharacters, 0, 1_000_000) ||
    !integer(result.incorrectCharacters, 0, 1_000_000) ||
    !integer(result.missedCharacters, 0, 1_000_000) ||
    !integer(result.totalKeystrokes, 0, 2_000_000) ||
    result.correctCharacters + result.incorrectCharacters !== result.totalKeystrokes ||
    result.maxCombo > result.wordsCompleted ||
    !isPossibleArcadeRushWordCounters(result)
  ) return failure("INVALID_WORD_COUNTERS");

  const accuracyDenominator = result.totalKeystrokes + result.missedCharacters;
  const expectedAccuracy = accuracyDenominator === 0
    ? 100
    : Math.min(100, result.correctCharacters / accuracyDenominator * 100);
  const expectedWpm = (result.correctCharacters / 5) / (result.durationMs / 60000);
  if (
    !closeEnough(result.accuracy, expectedAccuracy) ||
    !closeEnough(result.wpm, expectedWpm, 0.01)
  ) return failure("METRIC_MISMATCH");

  const integrityLost = ARCADE_RUSH_STARTING_INTEGRITY - result.integrityRemaining;
  const minimumWordPoints = (ARCADE_RUSH_NORMAL_WORDS - integrityLost) * 100;
  const maximumWordPoints = ARCADE_RUSH_NORMAL_WORDS * 500;
  if (!integer(result.wordPoints, minimumWordPoints, maximumWordPoints)) {
    return failure("SCORE_MISMATCH");
  }

  const waveClearBonus = 12_000;
  const perfectWaveBonus = result.perfectWaves * 1_500;
  const bossBonus = 8_000;
  const integrityBonus = result.integrityRemaining * 2_000;
  const timeBonus = Math.floor(result.bossTimeRemainingMs / 1_000) * 100;
  const subtotal = result.wordPoints + waveClearBonus + perfectWaveBonus + bossBonus + integrityBonus + timeBonus;
  const accuracyBonus = Math.round(subtotal * arcadeRushAccuracyBasisPoints(result.accuracy) / 10_000);
  const computedScore = subtotal + accuracyBonus;
  if (
    !integer(result.score) || !integer(result.waveClearBonus) ||
    !integer(result.perfectWaveBonus) || !integer(result.bossBonus) ||
    !integer(result.integrityBonus) || !integer(result.accuracyBonus) || !integer(result.timeBonus) ||
    result.waveClearBonus !== waveClearBonus || result.perfectWaveBonus !== perfectWaveBonus ||
    result.bossBonus !== bossBonus || result.integrityBonus !== integrityBonus ||
    result.timeBonus !== timeBonus || result.accuracyBonus !== accuracyBonus ||
    result.score !== computedScore
  ) return failure("SCORE_MISMATCH");

  return success({
    boardKey: body.boardKey,
    sessionId: body.sessionId,
    clientVersion: body.clientVersion,
    score: result.score,
    stage: null,
    level: null,
    grade: null,
    wpm: result.wpm,
    rawWpm: null,
    accuracy: result.accuracy,
    durationMs: result.durationMs,
    completed: true,
    wordsCompleted: result.wordsCompleted,
    integrityRemaining: result.integrityRemaining,
    challengeDate: null,
    challengeVersion: null,
    metrics: Object.freeze({
      contractVersion: result.contractVersion,
      rulesVersion: result.rulesVersion,
      seed: result.seed,
      variantId: result.variantId,
      wavesCompleted: result.wavesCompleted,
      finalWave: result.finalWave,
      bossDefeated: result.bossDefeated,
      bossTimeRemainingMs: result.bossTimeRemainingMs,
      perfectWaves: result.perfectWaves,
      maxCombo: result.maxCombo,
      finalCombo: result.finalCombo,
      wordsMissed: result.wordsMissed,
      wordsTotal: result.wordsTotal,
      correctCharacters: result.correctCharacters,
      incorrectCharacters: result.incorrectCharacters,
      missedCharacters: result.missedCharacters,
      totalKeystrokes: result.totalKeystrokes,
      wordPoints: result.wordPoints,
      waveClearBonus,
      perfectWaveBonus,
      bossBonus,
      integrityBonus,
      accuracyBonus,
      timeBonus,
    }),
  });
}

function campaignGrade(accuracy) {
  if (accuracy >= 98) return "S";
  if (accuracy >= 95) return "A";
  if (accuracy >= 90) return "B";
  if (accuracy >= 80) return "C";
  return "D";
}

function validateCampaign(body) {
  const result = body.result;
  if (!ownKeysOnly(result, CAMPAIGN_FIELDS) || Object.keys(result).length !== CAMPAIGN_FIELDS.size) {
    return failure("INVALID_RESULT");
  }
  const ineligible = validateEligibility(result, body.boardKey);
  if (ineligible) return ineligible;
  const expectedVariant = result.level % 10 === 0 ? "boss" : "normal";
  if (
    !integer(result.level, 1, 100) ||
    result.variantId !== expectedVariant || !CAMPAIGN_GRADES.includes(result.grade) ||
    !finite(result.accuracy, 0, 100) || campaignGrade(result.accuracy) !== result.grade ||
    !integer(result.durationMs, 1, 21600000) ||
    !integer(result.wordsCompleted, 1, 1000) || !integer(result.wordsTotal, 1, 1000) ||
    result.wordsCompleted !== result.wordsTotal ||
    !integer(result.correctCharacters, 0, 100000) ||
    !integer(result.correctKeystrokes, 0, 100000) ||
    !integer(result.totalKeystrokes, result.correctKeystrokes, 200000) ||
    !integer(result.missedCharacters, 0, 100000)
  ) return failure("INVALID_RESULT");
  if (result.completed !== true) return failure("TEST_NOT_COMPLETED");
  const denominator = result.totalKeystrokes + result.missedCharacters;
  const expectedAccuracy = denominator === 0
    ? 100
    : Math.min(100, result.correctKeystrokes / denominator * 100);
  if (!closeEnough(result.accuracy, expectedAccuracy)) return failure("SCORE_MISMATCH");
  return success({
    boardKey: body.boardKey,
    sessionId: body.sessionId,
    clientVersion: body.clientVersion,
    score: null,
    stage: null,
    level: result.level,
    grade: result.grade,
    wpm: null,
    rawWpm: null,
    accuracy: result.accuracy,
    durationMs: result.durationMs,
    completed: true,
    wordsCompleted: result.wordsCompleted,
    integrityRemaining: null,
    challengeDate: null,
    challengeVersion: null,
    metrics: Object.freeze({
      variantId: result.variantId,
      wordsTotal: result.wordsTotal,
      correctCharacters: result.correctCharacters,
      correctKeystrokes: result.correctKeystrokes,
      totalKeystrokes: result.totalKeystrokes,
      missedCharacters: result.missedCharacters,
    }),
  });
}

function validateTyping(body) {
  const result = body.result;
  if (!ownKeysOnly(result, TYPING_FIELDS) || Object.keys(result).length !== TYPING_FIELDS.size) {
    return failure("INVALID_RESULT");
  }
  const ineligible = validateEligibility(result, body.boardKey);
  if (ineligible) return ineligible;
  const expectedDuration = body.boardKey === TYPING_60_BOARD_KEY ? 60 : 15;
  if (result.durationSeconds !== expectedDuration || result.configId !== `time-${expectedDuration}`) {
    return failure("UNSUPPORTED_TEST_DURATION");
  }
  if (result.wordSetId !== "english-200") return failure("UNSUPPORTED_WORD_SET");
  if (result.wordSetVersion !== 1) return failure("WORD_SET_VERSION_MISMATCH");
  if (result.completed !== true) return failure("TEST_NOT_COMPLETED");
  if (result.durationMs !== expectedDuration * 1000) return failure("UNSUPPORTED_TEST_DURATION");
  if (result.metricVersion !== 2) return failure("INVALID_RESULT");
  if (
    !finite(result.wpm, 0, 1000) || !finite(result.rawWpm, 0, 2000) ||
    !finite(result.accuracy, 0, 100) ||
    !integer(result.correctTestCharacters, 0, 100000) ||
    !integer(result.rawTestCharacters, 1, 200000) ||
    result.correctTestCharacters > result.rawTestCharacters ||
    !integer(result.correctKeystrokes, 0, 100000) ||
    !integer(result.incorrectKeystrokes, 0, 100000) ||
    !integer(result.missedCharacters, 0, 100000) ||
    result.correctKeystrokes + result.incorrectKeystrokes !== result.rawTestCharacters ||
    !integer(result.wordsCompleted, 0, 10000) || !integer(result.exactWords, 0, 10000) ||
    !integer(result.incorrectWords, 0, 10000) ||
    result.exactWords + result.incorrectWords !== result.wordsCompleted
  ) return failure("METRIC_MISMATCH");
  const expectedWpm = (result.correctTestCharacters / 5) / (expectedDuration / 60);
  const expectedRawWpm = (result.rawTestCharacters / 5) / (expectedDuration / 60);
  const accuracyDenominator = result.correctKeystrokes + result.incorrectKeystrokes + result.missedCharacters;
  const expectedAccuracy = accuracyDenominator <= 0
    ? 100
    : result.correctKeystrokes / accuracyDenominator * 100;
  if (
    !closeEnough(result.wpm, expectedWpm) || !closeEnough(result.rawWpm, expectedRawWpm) ||
    !closeEnough(result.accuracy, expectedAccuracy)
  ) return failure("METRIC_MISMATCH");
  return success({
    boardKey: body.boardKey,
    sessionId: body.sessionId,
    clientVersion: body.clientVersion,
    score: null,
    stage: null,
    level: null,
    grade: null,
    wpm: result.wpm,
    rawWpm: result.rawWpm,
    accuracy: result.accuracy,
    durationMs: result.durationMs,
    completed: true,
    wordsCompleted: result.wordsCompleted,
    integrityRemaining: null,
    challengeDate: null,
    challengeVersion: null,
    metrics: Object.freeze({
      durationSeconds: expectedDuration,
      wordSetId: result.wordSetId,
      wordSetVersion: result.wordSetVersion,
      correctTestCharacters: result.correctTestCharacters,
      rawTestCharacters: result.rawTestCharacters,
      correctKeystrokes: result.correctKeystrokes,
      incorrectKeystrokes: result.incorrectKeystrokes,
      missedCharacters: result.missedCharacters,
      exactWords: result.exactWords,
      incorrectWords: result.incorrectWords,
    }),
  });
}

export function validateScoreSubmission(body, { now = new Date() } = {}) {
  const commonFailure = validateCommon(body);
  if (commonFailure) return commonFailure;
  if (body.boardKey === DAILY_BOARD_KEY) return validateDaily(body, now);
  if (body.boardKey === ENDLESS_BOARD_KEY) return validateEndless(body);
  if (body.boardKey === CAMPAIGN_BOARD_KEY) return validateCampaign(body);
  if (body.boardKey === ARCADE_RUSH_BOARD_KEY) return validateArcadeRush(body);
  return validateTyping(body);
}
