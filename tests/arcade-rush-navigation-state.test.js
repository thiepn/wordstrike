import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getAllModes,
  getModeDefinition,
  getRegisteredModes,
  isModeEnabled,
  isValidModeId,
  MODE_IDS,
} from "../js/modes.js";
import {
  appState,
  changeScreen,
  getStateDomain,
  getStateOwner,
  resetStateDomains,
  Screens,
} from "../js/state.js";
import {
  abortSession,
  beginSession,
  clearSession,
  getCurrentSession,
} from "../js/sessionManager.js";
import { captureGameplayBackspace } from "../js/inputSafety.js";
import { parseArcadeRushDeveloperSeed } from "../js/arcadeRushAppController.js";

function backspaceEvent() {
  return {
    key: "Backspace",
    target: { tagName: "DIV", closest: () => null },
    prevented: false,
    preventDefault() { this.prevented = true; },
  };
}

test("Arcade Rush is retained only as hidden legacy compatibility while Flow owns the released public slot", () => {
  const rush = getModeDefinition(MODE_IDS.ARCADE_RUSH);
  assert.equal(MODE_IDS.ARCADE_RUSH, "arcade-rush");
  assert.ok(rush);
  assert.equal(rush.enabled, true);
  assert.equal(rush.visible, false);
  assert.equal(rush.route, null);
  assert.equal(rush.storesProgress, true);
  assert.equal(rush.status, "retired");
  assert.equal(isValidModeId(MODE_IDS.ARCADE_RUSH), true);
  assert.equal(isModeEnabled(MODE_IDS.ARCADE_RUSH), true);
  assert.equal(getAllModes().some(({ id }) => id === MODE_IDS.ARCADE_RUSH), false);
  assert.equal(getRegisteredModes().some(({ id }) => id === MODE_IDS.ARCADE_RUSH), true);

  const flow = getModeDefinition(MODE_IDS.FLOW);
  assert.ok(flow);
  assert.equal(flow.name, "Flow");
  assert.equal(flow.shortLabel, "Longform");
  assert.equal(flow.enabled, true);
  assert.equal(flow.visible, true);
  assert.equal(flow.route, "flow-release");
  assert.equal(flow.status, "available");
  assert.equal(getAllModes().some(({ id }) => id === MODE_IDS.FLOW), true);

  assert.equal(Object.hasOwn(MODE_IDS, "DAILY"), false);
  assert.equal(getModeDefinition("daily"), null);
  assert.equal(getAllModes().some(({ id }) => id === "daily"), false);
  assert.equal(getRegisteredModes().some(({ id }) => id === "daily"), false);
});

test("legacy Arcade Rush state/screens remain valid and Flow screens are reserved", () => {
  resetStateDomains();
  const domain = getStateDomain("arcadeRush");
  assert.ok(domain);
  assert.equal(Object.isSealed(domain), true);
  assert.deepEqual(Object.keys(domain), [
    "arcadeRushResult",
    "arcadeRushRecordFlags",
    "arcadeRushResultsIndex",
    "arcadeRushResultsReadyAt",
  ]);
  for (const key of Object.keys(domain)) assert.equal(getStateOwner(key), "arcadeRush");
  changeScreen(Screens.ARCADE_RUSH_READY);
  assert.equal(appState.screen, Screens.ARCADE_RUSH_READY);
  changeScreen(Screens.ARCADE_RUSH_RESULTS);
  assert.equal(appState.screen, Screens.ARCADE_RUSH_RESULTS);
  changeScreen(Screens.FLOW_READY);
  assert.equal(appState.screen, Screens.FLOW_READY);
  changeScreen(Screens.FLOW_RESULTS);
  assert.equal(appState.screen, Screens.FLOW_RESULTS);
});

test("shared session manager still accepts legacy Arcade Rush sessions", () => {
  clearSession();
  const session = beginSession({
    modeId: MODE_IDS.ARCADE_RUSH,
    variantId: "draft-r1-s1",
    source: "arcade-rush-test",
    seed: 1234,
    developerMode: true,
  }, { monotonicMs: 10, epochMs: 1000 });
  assert.ok(session);
  assert.equal(session.modeId, MODE_IDS.ARCADE_RUSH);
  assert.equal(getCurrentSession()?.modeId, MODE_IDS.ARCADE_RUSH);
  assert.ok(abortSession("test-cleanup", { monotonicMs: 11, epochMs: 1001 }));
  clearSession();
});

test("legacy developer seed override remains parseable for historical runtime support", () => {
  assert.equal(parseArcadeRushDeveloperSeed("?dev=1&rushSeed=123456"), 123456);
  assert.equal(parseArcadeRushDeveloperSeed("rushSeed=0"), 0);
  assert.equal(parseArcadeRushDeveloperSeed("4294967295"), 0xffffffff);
  assert.equal(parseArcadeRushDeveloperSeed("?rushSeed=-1"), null);
  assert.equal(parseArcadeRushDeveloperSeed("?rushSeed=4294967296"), null);
  assert.equal(parseArcadeRushDeveloperSeed("?rushSeed=abc"), null);
  assert.equal(parseArcadeRushDeveloperSeed("?date=2026-09-02"), null);
});

test("legacy Arcade Rush backspace handling remains safe", () => {
  const event = backspaceEvent();
  let forwarded = 0;
  assert.equal(captureGameplayBackspace(event, {
    mode: MODE_IDS.ARCADE_RUSH,
    onTypingBackspace() { forwarded += 1; },
  }), true);
  assert.equal(event.prevented, true);
  assert.equal(forwarded, 1);
});

test("production mode selection cannot launch Arcade Rush and Flow uses only its dedicated release route", async () => {
  const [main, modes, release] = await Promise.all([
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
    readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
  ]);
  assert.match(main, /route === "arcade-rush-ready"\) openArcadeRushReady\("mode-select"\)/);
  assert.doesNotMatch(main, /MODE_IDS\.DAILY|openDailyReady|startDaily|daily-ready/);
  assert.match(main, /renderModeSelect\(getPracticeLabFeatureGate\(\)\.resolveModeDefinitions\(getAllModes\(\)\)/);
  assert.doesNotMatch(modes, /Daily Strike|MODE_IDS\.DAILY|daily-ready/);
  assert.match(modes, /name: "Arcade Rush"[\s\S]*enabled: true[\s\S]*visible: false[\s\S]*route: null/);
  assert.match(modes, /name: "Flow"[\s\S]*enabled: true[\s\S]*visible: true[\s\S]*route: "flow-release"/);
  assert.match(release, /button\[data-mode-id=["']flow["']\]/);
  assert.match(release, /flowRelease/);
});
