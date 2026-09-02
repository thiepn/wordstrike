import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getAllModes,
  getModeDefinition,
  MODE_IDS,
} from "../js/modes.js";
import {
  createLeaderboardService,
  getLeaderboardKeyboardTarget,
  LEADERBOARD_BOARDS,
  LEADERBOARD_CATEGORIES,
} from "../js/leaderboardService.js";
import {
  leaderboardReturnStateForBoard,
  validateLeaderboardReturnState,
} from "../js/leaderboardReturnState.js";

const publicModes = getAllModes();
assert.deepEqual(publicModes.map(({ id }) => id), [
  MODE_IDS.CAMPAIGN,
  MODE_IDS.SPEED_TEST,
  MODE_IDS.ENDLESS,
  MODE_IDS.ARCADE_RUSH,
  MODE_IDS.PRACTICE,
]);
assert.equal(publicModes.some(({ id }) => id === MODE_IDS.DAILY), false);
assert.equal(getModeDefinition(MODE_IDS.DAILY)?.visible, false);
assert.equal(getModeDefinition(MODE_IDS.DAILY)?.enabled, true);
assert.equal(getModeDefinition(MODE_IDS.DAILY)?.status, "retired-pending-removal");
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH)?.visible, true);
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH)?.status, "available");
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH)?.storesProgress, true);

const endTarget = getLeaderboardKeyboardTarget({
  selectedCategory: LEADERBOARD_CATEGORIES.CAMPAIGN,
  selectedBoardKey: LEADERBOARD_BOARDS.CAMPAIGN,
  selectedTypingDuration: 60,
}, "End");
assert.equal(endTarget, LEADERBOARD_BOARDS.ARCADE_RUSH);

const calls = [];
const service = createLeaderboardService({
  getClient: () => ({
    functions: {
      async invoke(name, { body }) {
        calls.push({ name, body: structuredClone(body) });
        return {
          data: {
            ok: true,
            data: {
              board: {
                boardKey: LEADERBOARD_BOARDS.ARCADE_RUSH,
                displayName: "Arcade Rush",
                rulesVersion: 1,
                challengeDate: null,
              },
              entries: [],
              viewer: null,
            },
          },
          error: null,
        };
      },
    },
  }),
  isOnline: () => true,
  now: () => 1000,
});
await service.initializeLeaderboards(LEADERBOARD_BOARDS.DAILY);
assert.deepEqual(calls.at(-1), {
  name: "get-leaderboard",
  body: { boardKey: LEADERBOARD_BOARDS.ARCADE_RUSH },
});
assert.equal(service.getLeaderboardState().selectedBoardKey, LEADERBOARD_BOARDS.ARCADE_RUSH);
assert.equal(service.getLeaderboardState().selectedCategory, LEADERBOARD_CATEGORIES.ARCADE_RUSH);

assert.deepEqual(validateLeaderboardReturnState({
  screen: "leaderboards",
  selectedCategory: LEADERBOARD_CATEGORIES.DAILY,
  typingDuration: 60,
}), {
  screen: "leaderboards",
  selectedCategory: LEADERBOARD_CATEGORIES.ARCADE_RUSH,
  typingDuration: 60,
});
assert.deepEqual(leaderboardReturnStateForBoard(LEADERBOARD_BOARDS.ARCADE_RUSH), {
  screen: "leaderboards",
  selectedCategory: LEADERBOARD_CATEGORIES.ARCADE_RUSH,
  typingDuration: 60,
});

const app = { html: "", set innerHTML(value) { this.html = value; } };
globalThis.document = { querySelector: (selector) => selector === "#app" ? app : null };
const { renderLeaderboards } = await import("../js/leaderboardUi.js");
renderLeaderboards({
  status: "loading",
  selectedBoardKey: LEADERBOARD_BOARDS.CAMPAIGN,
  selectedCategory: LEADERBOARD_CATEGORIES.CAMPAIGN,
  selectedTypingDuration: 60,
  entries: [],
}, { status: "signed-out" }, { status: "idle", profile: null });
assert.match(app.html, /ARCADE RUSH/);
assert.doesNotMatch(app.html, /DAILY STRIKE/);
assert.match(app.html, /leaderboard-select-arcade-rush/);

const [mainSource, adapterSource] = await Promise.all([
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/arcadeRushAppController.js", import.meta.url), "utf8"),
]);
assert.doesNotMatch(mainSource, /function openArcadeRushReady[\s\S]{0,120}if \(!appState\.devMode\)/);
assert.doesNotMatch(mainSource, /function startArcadeRush[\s\S]{0,120}if \(!appState\.devMode\)/);
assert.match(mainSource, /route === "arcade-rush-ready"\) openArcadeRushReady\("mode-select"\)/);
assert.match(mainSource, /prepareAutomaticResultSubmission\("arcade-rush", result\)/);
assert.match(mainSource, /Screens\.ARCADE_RUSH_RESULTS, Screens\.DAILY_RESULTS/);
assert.match(mainSource, /leaderboard-select-arcade-rush/);
assert.match(mainSource, /LEADERBOARD_CATEGORIES\.ARCADE_RUSH[\s\S]*LEADERBOARD_BOARDS\.ARCADE_RUSH/);
assert.match(adapterSource, /function openArcadeRushLeaderboard\(\)/);
assert.doesNotMatch(adapterSource, /function openShadowArcadeRushLeaderboard/);
assert.match(adapterSource, /leaderboardAvailable: true/);

console.log("Arcade Rush AR14 public mode, public leaderboard, legacy redirects, router wiring, and submission cutover contracts passed.");
