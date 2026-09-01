import test from "node:test";
import assert from "node:assert/strict";
import { createGlobalKeyboardController } from "../js/appKeyboardController.js";
import { getAllModes } from "../js/modes.js";
import { Screens } from "../js/state.js";

function eventFor(key) {
  return {
    key,
    repeat: false,
    target: { tagName: "DIV", matches: () => false, closest: () => null },
    prevented: false,
    preventDefault() { this.prevented = true; },
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
    dailyDateKey: "2026-09-01",
    dailyResult: { modeData: { dateKey: "2026-09-01" } },
    dailyResultsIndex: 0,
    dailyResultsReadyAt: 0,
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
    openModeSelect: record("modes"),
    startEndless: record("endless"),
    startDaily: record("daily"),
    retryCurrentLevel: record("campaign-retry"),
    backPracticeLab: record("practice-back"),
    activateTitleAction: record("title-action"),
    renderCurrentScreen: record("render"),
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
  assert.deepEqual(modes.calls, [["render"], ["title"]]);
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

  const daily = createHarness({ screen: Screens.DAILY_RESULTS, dailyResultsReadyAt: 0, dailyResultsIndex: 0 });
  daily.handle(eventFor("Enter"));
  assert.deepEqual(daily.calls, [["daily", "retry", "2026-09-01"]]);
});
