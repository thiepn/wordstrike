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

export const SUPPORTED_BOARD_KEYS = Object.freeze([
  CAMPAIGN_BOARD_KEY,
  TYPING_60_BOARD_KEY,
  TYPING_15_BOARD_KEY,
  ENDLESS_BOARD_KEY,
  ARCADE_RUSH_BOARD_KEY,
]);

const RETIRED_DAILY_BOARD_KEY = "daily-strike-v1";

export function validateScoreSubmission(body, options = {}) {
  if (body?.boardKey === RETIRED_DAILY_BOARD_KEY) {
    return Object.freeze({ valid: false, code: "INVALID_BOARD" });
  }
  return validateLegacyScoreSubmission(body, options);
}
