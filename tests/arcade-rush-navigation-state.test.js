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

test("Arcade Rush is registered for infrastructure but excluded from the public mode list", () => {
  const rush = getModeDefinition(MODE_IDS.ARCADE_RUSH);
  assert.equal(MODE_IDS.ARCADE_RUSH, "arcade-rush");
  assert.ok(rush);
  assert.equal(rush.enabled, true);
  assert.equal(rush.visible, false);
  assert.equal(rush.route, "arcade-rush-ready");
  assert.equal(rush.storesProgress, false);
  assert.equal(isValidModeId(MODE_IDS.ARCADE_RUSH), true);
  assert.equal(isModeEnabled(MODE_IDS.ARCADE_RUSH), true);
  assert.equal(getAllModes().some(({ id }) => id === MODE_IDS.ARCADE_RUSH), false);
  assert.equal(getAllModes().some(({ id }) => id === MODE_IDS.DAILY), true);
  assert.equal(getRegisteredModes().some(({ id }) => id === MODE_IDS.ARCADE_RUSH), true);
});

test("Arcade Rush owns one isolated state domain and two valid app screens", () => {
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
});

test("shared session manager accepts hidden Arcade Rush sessions without public exposure", () => {
  clearSession();
  const session = beginSession({
    modeId: MODE_IDS.ARCADE_RUSH,
    variantId: "draft-r0-s1",
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

test("developer seed override is explicit and normal retries are not date-bound", () => {
  assert.equal(parseArcadeRushDeveloperSeed("?dev=1&rushSeed=123456"), 123456);
  assert.equal(parseArcadeRushDeveloperSeed("rushSeed=0"), 0);
  assert.equal(parseArcadeRushDeveloperSeed("4294967295"), 0xffffffff);
  assert.equal(parseArcadeRushDeveloperSeed("?rushSeed=-1"), null);
  assert.equal(parseArcadeRushDeveloperSeed("?rushSeed=4294967296"), null);
  assert.equal(parseArcadeRushDeveloperSeed("?rushSeed=abc"), null);
  assert.equal(parseArcadeRushDeveloperSeed("?date=2026-09-02"), null);
});

test("Arcade Rush backspace is prevented from browser navigation and forwarded to gameplay", () => {
  const event = backspaceEvent();
  let forwarded = 0;
  assert.equal(captureGameplayBackspace(event, {
    mode: MODE_IDS.ARCADE_RUSH,
    onTypingBackspace() { forwarded += 1; },
  }), true);
  assert.equal(event.prevented, true);
  assert.equal(forwarded, 1);
});

test("production mode selection remains Daily while developer routing can reach Arcade Rush", async () => {
  const [main, modes] = await Promise.all([
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
  ]);
  assert.match(main, /appState\.devMode && search\.get\("mode"\) === MODE_IDS\.ARCADE_RUSH/);
  assert.match(main, /openArcadeRushReady\("developer"\)/);
  assert.match(main, /renderModeSelect\(getPracticeLabFeatureGate\(\)\.resolveModeDefinitions\(getAllModes\(\)\)/);
  assert.match(modes, /name: "Daily Strike"[\s\S]*visible: true/);
  assert.match(modes, /name: "Arcade Rush"[\s\S]*visible: false/);
});
