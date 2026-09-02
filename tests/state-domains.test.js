import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  appState,
  changeScreen,
  getStateDomain,
  getStateOwner,
  patchStateDomain,
  resetStateDomains,
  Screens,
  snapshotStateDomains,
  STATE_DOMAIN_NAMES,
  stateDomains,
  returnFromSettings,
} from "../js/state.js";

const expectedLegacyKeys = [
  "screen", "previousScreen", "devMode", "developerSeed", "save", "wordBank",
  "bossWordBank", "speedTestWordBank", "commonWordBank", "currentLevel", "game",
  "results", "campaignResult", "menuIndex", "modeSelection", "speedTestConfigId",
  "speedTestResultsIndex", "speedTestResultsReadyAt", "speedTestResult",
  "speedTestRecordFlags", "endlessResult", "endlessResultsIndex",
  "endlessResultsReadyAt", "endlessStartStage", "dailyDateKey", "dailyDateOverride",
  "dailyResult", "dailyRecordFlags", "dailyResultsIndex", "dailyResultsReadyAt",
  "arcadeRushResult", "arcadeRushRecordFlags", "arcadeRushResultsIndex",
  "arcadeRushResultsReadyAt", "levelSelection", "pauseIndex", "resultsIndex",
  "resultsReadyAt", "settingsIndex", "statisticsTabIndex", "statisticsRecentFilter",
  "profileEditing", "profileDraft", "profileNameError", "profileCopyMessage",
];

test("legacy appState facade preserves the established surface while domains own every key exactly once", () => {
  resetStateDomains();
  assert.deepEqual(Object.keys(appState), expectedLegacyKeys);
  assert.equal(Object.isExtensible(appState), false);
  assert.deepEqual(STATE_DOMAIN_NAMES, [
    "environment", "resources", "navigation", "session", "campaign",
    "typing", "endless", "daily", "arcadeRush", "profile",
  ]);

  const owned = new Set();
  for (const domainName of STATE_DOMAIN_NAMES) {
    const domain = getStateDomain(domainName);
    assert.ok(domain);
    assert.equal(Object.isSealed(domain), true);
    for (const key of Object.keys(domain)) {
      assert.equal(owned.has(key), false, `${key} must have one owner`);
      owned.add(key);
      assert.equal(getStateOwner(key), domainName);
    }
  }
  assert.deepEqual([...owned].sort(), [...expectedLegacyKeys].sort());
  for (const property of [
    "arcadeRushResult",
    "arcadeRushRecordFlags",
    "arcadeRushResultsIndex",
    "arcadeRushResultsReadyAt",
  ]) {
    assert.equal(getStateOwner(property), "arcadeRush");
  }
});

test("facade and domain writes stay synchronized without permitting cross-domain patches", () => {
  resetStateDomains();
  appState.menuIndex = 3;
  assert.equal(stateDomains.navigation.menuIndex, 3);

  const dailyResult = { score: 42 };
  stateDomains.daily.dailyResult = dailyResult;
  assert.equal(appState.dailyResult, dailyResult);

  const rushResult = { score: 99 };
  patchStateDomain("arcadeRush", {
    arcadeRushResult: rushResult,
    arcadeRushResultsIndex: 2,
  });
  assert.equal(appState.arcadeRushResult, rushResult);
  assert.equal(appState.arcadeRushResultsIndex, 2);

  patchStateDomain("typing", { speedTestResultsIndex: 2, speedTestResult: { wpm: 91 } });
  assert.equal(appState.speedTestResultsIndex, 2);
  assert.equal(appState.speedTestResult.wpm, 91);

  assert.throws(() => patchStateDomain("typing", { dailyResult: null }), /Unknown typing state property/);
  assert.throws(() => patchStateDomain("arcadeRush", { dailyResult: null }), /Unknown arcadeRush state property/);
  assert.throws(() => patchStateDomain("missing", {}), /Unknown state domain/);
  assert.throws(() => { appState.accidentalStateKey = true; }, TypeError);
});

test("screen transitions mutate only navigation state and accept hidden Arcade Rush screens", () => {
  resetStateDomains();
  const before = snapshotStateDomains();
  changeScreen(Screens.ARCADE_RUSH_READY);
  assert.equal(appState.screen, Screens.ARCADE_RUSH_READY);
  changeScreen(Screens.ARCADE_RUSH_RESULTS);
  assert.equal(appState.screen, Screens.ARCADE_RUSH_RESULTS);
  changeScreen(Screens.MODE_SELECT);
  changeScreen(Screens.SETTINGS);
  assert.equal(appState.previousScreen, Screens.MODE_SELECT);
  assert.equal(appState.screen, Screens.SETTINGS);
  assert.equal(returnFromSettings(), Screens.MODE_SELECT);
  assert.throws(() => changeScreen("NOT_A_SCREEN"), /Unknown app screen/);

  const after = snapshotStateDomains();
  for (const domainName of STATE_DOMAIN_NAMES.filter((name) => name !== "navigation")) {
    assert.deepEqual(after[domainName], before[domainName], `${domainName} should not change during navigation`);
  }
});

test("state module delegates storage to domain modules instead of recreating a flat state bag", async () => {
  const source = await readFile(new URL("../js/state.js", import.meta.url), "utf8");
  assert.match(source, /from "\.\/appStateDomains\.js"/);
  assert.match(source, /from "\.\/appScreens\.js"/);
  assert.doesNotMatch(source, /export const appState\s*=\s*\{/);
});
