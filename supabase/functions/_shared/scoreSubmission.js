import {
  CURRENT_GAME_VERSION,
  ENDLESS_BOARD_KEY,
  CAMPAIGN_BOARD_KEY,
  TYPING_60_BOARD_KEY,
  TYPING_15_BOARD_KEY,
  ARCADE_RUSH_BOARD_KEY,
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_VARIANT_ID,
  ARCADE_RUSH_NORMAL_WORDS,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_BOSS_DURATION_MS,
  ARCADE_RUSH_MIN_SUCCESS_DURATION_MS,
  SUBMISSION_RATE_LIMIT_PER_HOUR,
  getEndlessWordsPerStageForSubmission,
  getEndlessWordsBeforeStage,
  isPossibleArcadeRushWordCounters,
  isValidSubmissionSessionId,
  validateScoreSubmission as validateLegacyScoreSubmission,
} from "./scoreSubmissionLegacyDaily.js";

export {
  CURRENT_GAME_VERSION,
  ENDLESS_BOARD_KEY,
  CAMPAIGN_BOARD_KEY,
  TYPING_60_BOARD_KEY,
  TYPING_15_BOARD_KEY,
  ARCADE_RUSH_BOARD_KEY,
  ARCADE_RUSH_CONTRACT_VERSION,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_VARIANT_ID,
  ARCADE_RUSH_NORMAL_WORDS,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_BOSS_DURATION_MS,
  ARCADE_RUSH_MIN_SUCCESS_DURATION_MS,
  SUBMISSION_RATE_LIMIT_PER_HOUR,
  getEndlessWordsPerStageForSubmission,
  getEndlessWordsBeforeStage,
  isPossibleArcadeRushWordCounters,
  isValidSubmissionSessionId,
};

export const FLOW_QUICK_BOARD_KEY = "flow-quick-v1";
export const FLOW_STANDARD_BOARD_KEY = "flow-standard-v1";
export const FLOW_LONG_BOARD_KEY = "flow-long-v1";
export const FLOW_RULES_VERSION = 2;
export const FLOW_METRIC_VERSION = 1;
export const FLOW_CONTRACT_VERSION = 1;

export const FLOW_BOARD_KEYS = Object.freeze([
  FLOW_QUICK_BOARD_KEY,
  FLOW_STANDARD_BOARD_KEY,
  FLOW_LONG_BOARD_KEY,
]);

export const SUPPORTED_BOARD_KEYS = Object.freeze([
  CAMPAIGN_BOARD_KEY,
  TYPING_60_BOARD_KEY,
  TYPING_15_BOARD_KEY,
  ENDLESS_BOARD_KEY,
  ARCADE_RUSH_BOARD_KEY,
  ...FLOW_BOARD_KEYS,
]);

const RETIRED_DAILY_BOARD_KEY = "daily-strike-v1";
const ROOT_FIELDS = new Set(["boardKey", "sessionId", "clientVersion", "result"]);
const FLOW_FIELDS = new Set([
  "contractVersion",
  "rulesVersion",
  "metricVersion",
  "variantId",
  "sessionLength",
  "score",
  "wpm",
  "rawWpm",
  "accuracy",
  "consistency",
  "consistencySamples",
  "durationMs",
  "wordsCompleted",
  "charactersCompleted",
  "correctKeystrokes",
  "incorrectKeystrokes",
  "correctedErrors",
  "unresolvedErrors",
  "textId",
  "seed",
  "completed",
  "recordEligible",
  "developerMode",
  "sessionSource",
]);

const FLOW_LENGTH_BY_BOARD = Object.freeze({
  [FLOW_QUICK_BOARD_KEY]: "quick",
  [FLOW_STANDARD_BOARD_KEY]: "standard",
  [FLOW_LONG_BOARD_KEY]: "long",
});

const FLOW_WORD_FLOORS = Object.freeze({
  quick: 150,
  standard: 300,
  long: 600,
});

const failure = (code) => Object.freeze({ valid: false, code });
const success = (value) => Object.freeze({ valid: true, value: Object.freeze(value) });
const integer = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => (
  Number.isSafeInteger(value) && value >= minimum && value <= maximum
);
const finite = (value, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => (
  Number.isFinite(value) && value >= minimum && value <= maximum
);
const ownKeysOnly = (value, allowed) => (
  value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value).every((key) => allowed.has(key))
);
const closeEnough = (actual, expected, tolerance) => (
  Number.isFinite(actual) &&
  Number.isFinite(expected) &&
  Math.abs(actual - expected) <= tolerance
);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function calculateFlowScore({ wpm, accuracy, consistency }) {
  const scoredWpm = clamp(wpm, 0, 300);
  const accuracyMultiplier = Math.pow(clamp(accuracy, 0, 100) / 100, 5);
  const consistencyMultiplier = 0.85 + (0.15 * (clamp(consistency, 0, 100) / 100));
  return Math.round(1000 * scoredWpm * accuracyMultiplier * consistencyMultiplier);
}

export function validateFlowScoreSubmission(body) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !ownKeysOnly(body, ROOT_FIELDS) ||
    Object.keys(body).length !== ROOT_FIELDS.size
  ) return failure("INVALID_REQUEST");

  if (!FLOW_BOARD_KEYS.includes(body.boardKey)) return failure("INVALID_BOARD");
  if (!isValidSubmissionSessionId(body.sessionId)) return failure("INVALID_SESSION_ID");
  if (body.clientVersion !== CURRENT_GAME_VERSION) return failure("UNSUPPORTED_CLIENT_VERSION");

  const result = body.result;
  if (!ownKeysOnly(result, FLOW_FIELDS) || Object.keys(result).length !== FLOW_FIELDS.size) {
    return failure("INVALID_RESULT");
  }

  const expectedLength = FLOW_LENGTH_BY_BOARD[body.boardKey];
  if (
    result.contractVersion !== FLOW_CONTRACT_VERSION ||
    result.rulesVersion !== FLOW_RULES_VERSION ||
    result.metricVersion !== FLOW_METRIC_VERSION ||
    result.sessionLength !== expectedLength ||
    result.variantId !== `flow-${expectedLength}-v2`
  ) return failure("INVALID_RESULT");

  if (result.completed !== true) return failure("TEST_NOT_COMPLETED");
  if (result.recordEligible !== true) return failure("RECORD_NOT_ELIGIBLE");
  if (result.developerMode !== false) return failure("DEVELOPER_RESULT");
  if (result.sessionSource !== "flow-release") return failure("INVALID_SESSION_SOURCE");

  if (
    !integer(result.score, 0, 1_000_000_000) ||
    !finite(result.wpm, 0.1, 1000) ||
    !finite(result.rawWpm, result.wpm, 2000) ||
    !finite(result.accuracy, 90, 100) ||
    !integer(result.consistency, 0, 100) ||
    !integer(result.consistencySamples, 5, 200_000) ||
    !integer(result.durationMs, 20_000, 7_200_000) ||
    !integer(result.wordsCompleted, FLOW_WORD_FLOORS[expectedLength], 10_000) ||
    !integer(result.charactersCompleted, result.wordsCompleted, 500_000) ||
    !integer(result.correctKeystrokes, 1, 1_000_000) ||
    !integer(result.incorrectKeystrokes, 0, 1_000_000) ||
    !integer(result.correctedErrors, 0, result.incorrectKeystrokes) ||
    !integer(result.unresolvedErrors, 0, result.incorrectKeystrokes) ||
    result.correctedErrors + result.unresolvedErrors > result.incorrectKeystrokes ||
    result.unresolvedErrors > result.charactersCompleted ||
    result.consistencySamples > result.correctKeystrokes + result.incorrectKeystrokes ||
    typeof result.textId !== "string" ||
    !new RegExp(`^flow-v2-${expectedLength}-[0-9a-f]+$`).test(result.textId) ||
    typeof result.seed !== "string" ||
    result.seed.length < 1 ||
    result.seed.length > 160
  ) return failure("INVALID_RESULT");

  const minutes = result.durationMs / 60000;
  const finalCorrectCharacters = result.charactersCompleted - result.unresolvedErrors;
  const expectedWpm = (finalCorrectCharacters / 5) / minutes;
  const expectedRawWpm = ((result.correctKeystrokes + result.incorrectKeystrokes) / 5) / minutes;
  const expectedAccuracy = result.correctKeystrokes /
    (result.correctKeystrokes + result.incorrectKeystrokes) * 100;

  if (
    !closeEnough(result.wpm, expectedWpm, 0.2) ||
    !closeEnough(result.rawWpm, expectedRawWpm, 0.2) ||
    !closeEnough(result.accuracy, expectedAccuracy, 0.03)
  ) return failure("METRIC_MISMATCH");

  const expectedScore = calculateFlowScore({
    wpm: result.wpm,
    accuracy: result.accuracy,
    consistency: result.consistency,
  });
  if (result.score !== expectedScore) return failure("SCORE_MISMATCH");

  return success({
    boardKey: body.boardKey,
    sessionId: body.sessionId,
    clientVersion: body.clientVersion,
    score: result.score,
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
      contractVersion: result.contractVersion,
      rulesVersion: result.rulesVersion,
      metricVersion: result.metricVersion,
      variantId: result.variantId,
      sessionLength: result.sessionLength,
      consistency: result.consistency,
      consistencySamples: result.consistencySamples,
      charactersCompleted: result.charactersCompleted,
      correctKeystrokes: result.correctKeystrokes,
      incorrectKeystrokes: result.incorrectKeystrokes,
      correctedErrors: result.correctedErrors,
      unresolvedErrors: result.unresolvedErrors,
      textId: result.textId,
      seed: result.seed,
    }),
  });
}

export function validateScoreSubmission(body, options = {}) {
  if (body?.boardKey === RETIRED_DAILY_BOARD_KEY) {
    return Object.freeze({ valid: false, code: "INVALID_BOARD" });
  }
  if (FLOW_BOARD_KEYS.includes(body?.boardKey)) {
    return validateFlowScoreSubmission(body);
  }
  return validateLegacyScoreSubmission(body, options);
}
