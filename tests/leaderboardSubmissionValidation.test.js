import assert from "node:assert/strict";
import {
  CURRENT_GAME_VERSION as SERVER_GAME_VERSION,
  getEndlessWordsBeforeStage,
  validateScoreSubmission,
} from "../supabase/functions/_shared/scoreSubmission.js";
import { CURRENT_GAME_VERSION as CLIENT_GAME_VERSION } from "../js/gameVersion.js";
import { dailySubmission, endlessSubmission } from "./leaderboardSubmissionFixtures.js";

const options = { now: new Date("2026-06-28T12:00:00Z") };
assert.equal(CLIENT_GAME_VERSION, SERVER_GAME_VERSION);
assert.equal(validateScoreSubmission(dailySubmission(), options).code, "INVALID_BOARD");
assert.equal(validateScoreSubmission(dailySubmission({
  completed: false, failureReason: "core-destroyed", score: 3000,
  wordsCompleted: 20, wordsResolved: 23, wordsSpawned: 24,
  integrityRemaining: 0, coreHits: 3, coreBreaches: 3,
  wordPoints: 3000, completionBonus: 0, integrityBonus: 0,
  accuracyBonus: 0, timeBonus: 0, finalWave: 2,
}), options).code, "INVALID_BOARD");

assert.equal(validateScoreSubmission(endlessSubmission(), options).valid, true);
assert.deepEqual([1, 6, 11].map(getEndlessWordsBeforeStage), [0, 50, 125]);
assert.equal(validateScoreSubmission(endlessSubmission({ wordsCompleted: 85 }), options).code, "INVALID_RESULT");
assert.equal(validateScoreSubmission(endlessSubmission({ score: 49001 }), options).code, "SCORE_MISMATCH");
assert.equal(validateScoreSubmission(endlessSubmission({ accuracy: -1 }), options).code, "INVALID_RESULT");
assert.equal(validateScoreSubmission(endlessSubmission({ durationMs: 0 }), options).code, "INVALID_RESULT");
assert.equal(validateScoreSubmission(endlessSubmission({ completed: true }), options).code, "INVALID_FAILURE_STATE");
assert.equal(validateScoreSubmission(endlessSubmission({ developerMode: true }), options).code, "DEVELOPER_RESULT");
assert.equal(validateScoreSubmission({ ...endlessSubmission(), userId: "forged" }, options).code, "INVALID_REQUEST");
assert.equal(validateScoreSubmission({ ...endlessSubmission(), boardKey: "campaign-v1" }, options).code, "INVALID_BOARD");

console.log("Retired Daily score submissions are rejected at the active board gate while Endless validation remains canonical and strict.");
