import test from "node:test";
import assert from "node:assert/strict";
import { createGlobalKeyboardController } from "../js/appKeyboardController.js";
import { getAllModes } from "../js/modes.js";
import { Screens } from "../js/state.js";

function eventFor(key, overrides = {}) {
  return {
    key,
    repeat: false,
    defaultPrevented: false,
    target: { tagName: "DIV", matches: () => false, closest: () => null },
    prevented: false,
    preventDefault() { this.prevented = true; this.defaultPrevented = true; },
    ...overrides,
  };
}

function createHarness(overrides = {}) {
  const calls = [];
  const state = {
    screen: Screens.TITLE,
    game: null,
    profileEditing: false,
    statisticsTabIndex: 0,
    pauseIndex: 0,
    menuIndex: 0,
    modeSelection: 0,
    endlessResultsIndex: 0,
    endlessResultsReadyAt: 0,
    arcadeRushResult: { score: 42 },
    arcadeRushResultsIndex: 0,
    arcadeRushResultsReadyAt: 0,
    speedTestResult: null,
    speedTestResultsIndex: 0,
    speedTestResultsReadyAt: 0,
    levelSelection: 1,
    results: { grade: "A", levelNumber: 3 },
    resultsIndex: 0,
    resultsReadyAt: 0,
    settingsIndex: 0,
    ...overrides,
  };
  const record = (name) => (...args) => calls.push([name, ...args]);
  const handle = createGlobalKeyboardController({
    state,
    currentTimeMs: () => 1000,
    routeActiveGameplayKey: () => false,
    cancelProfileNameEdit: record("cancel-profile"),
    saveProfileName: record("save-profile"),
    openTitle: record("title"),
    selectStatisticsTab: record("stats-tab"),
    resumeGame: record("resume"),
    renderPauseOverlay: record("pause-render"),
    resetSpeedTestAttempt: record("typing-reset"),
    startCampaignPlacement: record("placement"),
    openModeSelect: record("modes"),
    startEndless: record("endless"),
    startArcadeRush: record("rush"),
    openArcadeRushLeaderboard: record("rush-leaderboard"),
    retryCurrentLevel: record("campaign-retry"),
    backPracticeLab: record("practice-back"),
    activateTitleAction: record("title-action"),
    renderCurrentScreen: record("render"),
    syncModeSelection: record("sync-mode"),
    syncResultsSelection: record("sync-result"),
    activateSelectedMode: record("activate-mode"),
    moveLevelSelection: record("move-level"),
    startLevel: record("start-level"),
    openLevelSelect: record("levels"),
    backFromSettings: record("settings-back"),
    toggleSetting: record("toggle-setting"),
    confirmReset: record("reset-progress"),
    titleActionCount: 4,
  });
  return { state, calls, handle };
}

test("title and mode-select keyboard state is owned by the extracted controller", () => {
  const title = createHarness();
  const down = eventFor("ArrowDown");
  title.handle(down);
  assert.equal(title.state.menuIndex, 1);
  assert.equal(down.prevented, true);
  assert.deepEqual(title.calls, [["render"]]);

  const modes = createHarness({ screen: Screens.MODE_SELECT, modeSelection: 0 });
  modes.handle(eventFor("ArrowLeft"));
  assert.equal(modes.state.modeSelection, getAllModes().length);
  modes.handle(eventFor("Enter"));
  assert.deepEqual(modes.calls, [["sync-mode"], ["title"]]);
});

test("native controls and already-handled events are never hijacked by global shortcuts", () => {
  const results = createHarness({
    screen: Screens.SPEED_TEST_RESULTS,
    speedTestResultsReadyAt: 0,
  });
  const summary = eventFor("Enter", {
    target: {
      tagName: "SUMMARY",
      matches: (selector) => selector.includes("summary"),
      closest: () => null,
    },
  });
  results.handle(summary);
  assert.equal(summary.prevented, false);
  assert.deepEqual(results.calls, []);

  const alreadyHandled = eventFor("ArrowDown", { defaultPrevented: true });
  results.handle(alreadyHandled);
  assert.equal(results.state.speedTestResultsIndex, 0);
  assert.deepEqual(results.calls, []);
});

test("Home, End, and unowned arrows remain native outside components that explicitly own them", () => {
  const modes = createHarness({ screen: Screens.MODE_SELECT });
  const home = eventFor("Home");
  modes.handle(home);
  assert.equal(home.prevented, false);
  assert.deepEqual(modes.calls, []);

  const settings = createHarness({ screen: Screens.SETTINGS });
  const end = eventFor("End");
  settings.handle(end);
  assert.equal(end.prevented, false);
  assert.deepEqual(settings.calls, []);

  const practice = createHarness({ screen: Screens.PRACTICE_LAB });
  const practiceDown = eventFor("ArrowDown");
  practice.handle(practiceDown);
  assert.equal(practiceDown.prevented, false);
  assert.deepEqual(practice.calls, []);

  const ready = createHarness({ screen: Screens.ENDLESS_READY });
  const readyDown = eventFor("ArrowDown");
  ready.handle(readyDown);
  assert.equal(readyDown.prevented, false);
  assert.deepEqual(ready.calls, []);

  const title = createHarness({ screen: Screens.TITLE });
  const titleLeft = eventFor("ArrowLeft");
  title.handle(titleLeft);
  assert.equal(titleLeft.prevented, false);
  assert.deepEqual(title.calls, []);
});

test("Practice and Settings keyboard routes remain independent of gameplay execution", () => {
  const practice = createHarness({ screen: Screens.PRACTICE_LAB });
  practice.handle(eventFor("Escape"));
  assert.deepEqual(practice.calls, [["practice-back"]]);

  const settings = createHarness({ screen: Screens.SETTINGS, settingsIndex: 0 });
  settings.handle(eventFor("ArrowDown"));
  assert.equal(settings.state.settingsIndex, 1);
  settings.handle(eventFor("Enter"));
  assert.deepEqual(settings.calls, [["render"], ["toggle-setting", "particles"]]);
});

test("result navigation preserves readiness gates and selected action routing", () => {
  const blocked = createHarness({ screen: Screens.RESULTS, resultsReadyAt: 1200 });
  blocked.handle(eventFor("Enter"));
  assert.deepEqual(blocked.calls, []);

  const ready = createHarness({ screen: Screens.RESULTS, resultsReadyAt: 0, resultsIndex: 0 });
  ready.handle(eventFor("Enter"));
  assert.deepEqual(ready.calls, [["start-level", 4, "next-level"]]);
});

test("Typing Results keeps Tab native and updates arrow selection without rebuilding the results screen", () => {
  const typing = createHarness({
    screen: Screens.SPEED_TEST_RESULTS,
    speedTestResultsReadyAt: 0,
    speedTestResultsIndex: 0,
  });
  const tab = eventFor("Tab");
  typing.handle(tab);
  assert.equal(tab.prevented, false);
  assert.deepEqual(typing.calls, []);

  const down = eventFor("ArrowDown");
  typing.handle(down);
  assert.equal(typing.state.speedTestResultsIndex, 1);
  assert.equal(down.prevented, true);
  assert.deepEqual(typing.calls, [["sync-result", Screens.SPEED_TEST_RESULTS, 1]]);
});

test("Campaign and Endless result arrows update selection in place", () => {
  const campaign = createHarness({
    screen: Screens.RESULTS,
    resultsReadyAt: 0,
    resultsIndex: 0,
  });
  campaign.handle(eventFor("ArrowDown"));
  assert.equal(campaign.state.resultsIndex, 1);
  assert.deepEqual(campaign.calls, [["sync-result", Screens.RESULTS, 1]]);

  const endless = createHarness({
    screen: Screens.ENDLESS_RESULTS,
    endlessResultsReadyAt: 0,
    endlessResultsIndex: 0,
  });
  endless.handle(eventFor("ArrowDown"));
  assert.equal(endless.state.endlessResultsIndex, 1);
  assert.deepEqual(endless.calls, [["sync-result", Screens.ENDLESS_RESULTS, 1]]);
});

test("Campaign placement result keyboard routes match RETURN / RETRY placement actions", () => {
  const back = createHarness({
    screen: Screens.SPEED_TEST_RESULTS,
    speedTestResult: { sessionSource: "campaign-placement" },
    speedTestResultsReadyAt: 0,
    speedTestResultsIndex: 0,
  });
  back.handle(eventFor("Enter"));
  assert.deepEqual(back.calls, [["levels", "placement-result"]]);

  const retry = createHarness({
    screen: Screens.SPEED_TEST_RESULTS,
    speedTestResult: { sessionSource: "campaign-placement" },
    speedTestResultsReadyAt: 0,
    speedTestResultsIndex: 1,
  });
  retry.handle(eventFor("Enter"));
  assert.deepEqual(retry.calls, [["placement"]]);

  const escape = createHarness({
    screen: Screens.SPEED_TEST_RESULTS,
    speedTestResult: { sessionSource: "campaign-placement" },
    speedTestResultsReadyAt: 0,
  });
  escape.handle(eventFor("Escape"));
  assert.deepEqual(escape.calls, [["levels", "placement-result"]]);
});

test("Arcade Rush ready and results routes use injected high-level actions only", () => {
  const ready = createHarness({ screen: Screens.ARCADE_RUSH_READY });
  ready.handle(eventFor("Enter"));
  assert.deepEqual(ready.calls, [["rush", "arcade-rush-ready"]]);

  const back = createHarness({ screen: Screens.ARCADE_RUSH_READY });
  back.handle(eventFor("Escape"));
  assert.deepEqual(back.calls, [["modes"]]);

  const blocked = createHarness({
    screen: Screens.ARCADE_RUSH_RESULTS,
    arcadeRushResultsReadyAt: 1200,
  });
  blocked.handle(eventFor("Enter"));
  assert.deepEqual(blocked.calls, []);

  const retry = createHarness({
    screen: Screens.ARCADE_RUSH_RESULTS,
    arcadeRushResultsReadyAt: 0,
    arcadeRushResultsIndex: 0,
  });
  retry.handle(eventFor("Enter"));
  assert.deepEqual(retry.calls, [["rush", "retry"]]);

  const modes = createHarness({
    screen: Screens.ARCADE_RUSH_RESULTS,
    arcadeRushResultsReadyAt: 0,
    arcadeRushResultsIndex: 0,
  });
  modes.handle(eventFor("ArrowDown"));
  modes.handle(eventFor("Enter"));
  assert.deepEqual(modes.calls, [["sync-result", Screens.ARCADE_RUSH_RESULTS, 1], ["modes"]]);

  const title = createHarness({
    screen: Screens.ARCADE_RUSH_RESULTS,
    arcadeRushResultsReadyAt: 0,
    arcadeRushResultsIndex: 2,
  });
  title.handle(eventFor("Enter"));
  assert.deepEqual(title.calls, [["title"]]);

  const leaderboard = createHarness({
    screen: Screens.ARCADE_RUSH_RESULTS,
    arcadeRushResultsReadyAt: 0,
    arcadeRushResultsIndex: 3,
  });
  leaderboard.handle(eventFor("Enter"));
  assert.deepEqual(leaderboard.calls, [["rush-leaderboard"]]);

  const tabThenArrow = createHarness({
    screen: Screens.ARCADE_RUSH_RESULTS,
    arcadeRushResultsReadyAt: 0,
    arcadeRushResultsIndex: 0,
  });
  tabThenArrow.handle(eventFor("ArrowDown", {
    target: {
      tagName: "BUTTON",
      matches: () => false,
      closest: (selector) => selector === "[data-rush-action]"
        ? { dataset: { rushAction: "main-menu" } }
        : null,
    },
  }));
  assert.equal(tabThenArrow.state.arcadeRushResultsIndex, 3);
  assert.deepEqual(tabThenArrow.calls, [["sync-result", Screens.ARCADE_RUSH_RESULTS, 3]]);
});

test("Arcade Rush pause routing owns selection without owning runtime execution", () => {
  const paused = createHarness({
    screen: Screens.PAUSED,
    game: { mode: "arcade-rush" },
    pauseIndex: 0,
  });
  paused.handle(eventFor("ArrowDown"));
  assert.equal(paused.state.pauseIndex, 1);
  assert.deepEqual(paused.calls, [["pause-render"]]);
  paused.handle(eventFor("Enter"));
  assert.deepEqual(paused.calls, [["pause-render"], ["rush", "restart"]]);

  const resume = createHarness({
    screen: Screens.PAUSED,
    game: { mode: "arcade-rush" },
  });
  resume.handle(eventFor("Escape"));
  assert.deepEqual(resume.calls, [["resume"]]);

  const modes = createHarness({
    screen: Screens.PAUSED,
    game: { mode: "arcade-rush" },
    pauseIndex: 2,
  });
  modes.handle(eventFor("Enter"));
  assert.deepEqual(modes.calls, [["modes"]]);
});
