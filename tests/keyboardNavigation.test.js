import assert from "node:assert/strict";
import { getLeaderboardKeyboardTarget, LEADERBOARD_BOARDS } from "../js/leaderboardService.js";
import { moveSpeedTestConfiguration } from "../js/speedTestConfig.js";

assert.equal(getLeaderboardKeyboardTarget({ selectedBoardKey: LEADERBOARD_BOARDS.CAMPAIGN }, "ArrowRight"), LEADERBOARD_BOARDS.TYPING_60);
assert.equal(getLeaderboardKeyboardTarget({ selectedBoardKey: LEADERBOARD_BOARDS.TYPING_60 }, "ArrowDown"), LEADERBOARD_BOARDS.TYPING_15);
assert.equal(getLeaderboardKeyboardTarget({ selectedBoardKey: LEADERBOARD_BOARDS.TYPING_15 }, "ArrowUp"), LEADERBOARD_BOARDS.TYPING_60);
assert.equal(getLeaderboardKeyboardTarget({ selectedBoardKey: LEADERBOARD_BOARDS.DAILY }, "Home"), LEADERBOARD_BOARDS.CAMPAIGN);
assert.equal(getLeaderboardKeyboardTarget({ selectedBoardKey: LEADERBOARD_BOARDS.CAMPAIGN }, "End"), LEADERBOARD_BOARDS.ARCADE_RUSH);
assert.equal(moveSpeedTestConfiguration("time-60", "ArrowLeft"), "time-30");
assert.equal(moveSpeedTestConfiguration("time-60", "ArrowRight"), "time-120");
assert.equal(moveSpeedTestConfiguration("time-60", "ArrowDown"), "words-50");
assert.equal(moveSpeedTestConfiguration("words-50", "ArrowUp"), "time-60");
assert.equal(moveSpeedTestConfiguration("words-50", "Home"), "words-10");

console.log("Public leaderboard categories, Arcade Rush cutover order, nested durations, and every Typing configuration support deterministic arrow navigation.");
