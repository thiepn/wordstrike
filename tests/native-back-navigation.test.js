import assert from "node:assert/strict";
import { Screens } from "../js/appScreens.js";
import {
  NATIVE_BACK_STATE_KEY,
  createNativeBackNavigation,
  createWordStrikeBackHandler,
} from "../js/nativeBackNavigation.js";

function createActions(calls) {
  const record = (name) => (...args) => { calls.push([name, ...args]); return true; };
  return {
    cancelProfileNameEdit: record("cancel-edit"),
    openTitle: record("title"),
    openModeSelect: record("modes"),
    openLevelSelect: record("levels"),
    openEndlessReady: record("endless-ready"),
    openArcadeRushReady: record("rush-ready"),
    resetSpeedTestAttempt: record("typing-reset"),
    pauseGame: record("pause-game"),
    pauseTypingTest: record("pause-typing"),
    backFromSettings: record("settings-back"),
    backPracticeLab: record("practice-back"),
  };
}

{
  const calls = [];
  const state = { screen: Screens.TITLE, profileEditing: false, game: null };
  let speed = null;
  let flowActive = false;
  const onboarding = { getState: () => null, close: () => calls.push(["tutorial-close"]) };
  const handler = createWordStrikeBackHandler({
    state,
    onboardingController: onboarding,
    getSpeedTestState: () => speed,
    backFlow: () => {
      if (!flowActive) return false;
      flowActive = false;
      calls.push(["flow-back"]);
      return true;
    },
    ...createActions(calls),
  });

  assert.equal(handler(), false, "title allows the browser/device to leave the app");
  assert.deepEqual(calls, []);

  state.screen = Screens.MODE_SELECT;
  flowActive = true;
  assert.equal(handler(), true);
  assert.deepEqual(calls.pop(), ["flow-back"], "active Flow owns native Back before the underlying app screen");
  assert.equal(flowActive, false);
  assert.equal(handler(), true);
  assert.deepEqual(calls.pop(), ["title"]);

  state.screen = Screens.LEVEL_SELECT;
  handler();
  assert.deepEqual(calls.pop(), ["modes"]);

  state.screen = Screens.SPEED_TEST_RUN;
  speed = { phase: "PREPARING" };
  handler();
  assert.deepEqual(calls.pop(), ["modes"]);

  speed = { phase: "ACTIVE" };
  handler();
  assert.deepEqual(calls.pop(), ["pause-typing"]);

  state.screen = Screens.SPEED_TEST_RESULTS;
  handler();
  assert.deepEqual(calls.pop(), ["typing-reset", "change-test"]);

  state.screen = Screens.PLAYING;
  state.game = { mode: "normal" };
  speed = null;
  handler();
  assert.deepEqual(calls.pop(), ["pause-game"]);

  state.screen = Screens.PAUSED;
  handler();
  assert.deepEqual(calls.pop(), ["levels", "native-back"]);

  state.game = { mode: "endless" };
  handler();
  assert.deepEqual(calls.pop(), ["endless-ready", "native-back"]);

  state.game = { mode: "arcade-rush" };
  handler();
  assert.deepEqual(calls.pop(), ["rush-ready", "native-back"]);

  speed = { phase: "PAUSED" };
  handler();
  assert.deepEqual(calls.pop(), ["modes"]);

  state.screen = Screens.RESULTS;
  speed = null;
  handler();
  assert.deepEqual(calls.pop(), ["levels", "native-back"]);

  state.screen = Screens.ENDLESS_RESULTS;
  handler();
  assert.deepEqual(calls.pop(), ["endless-ready", "native-back"]);

  state.screen = Screens.ARCADE_RUSH_RESULTS;
  handler();
  assert.deepEqual(calls.pop(), ["rush-ready", "native-back"]);

  state.screen = Screens.SETTINGS;
  handler();
  assert.deepEqual(calls.pop(), ["settings-back"]);

  state.screen = Screens.PROFILE_STATS;
  state.profileEditing = true;
  handler();
  assert.deepEqual(calls.pop(), ["cancel-edit"]);
  state.profileEditing = false;

  onboarding.getState = () => ({ tutorialId: "campaign" });
  handler();
  assert.deepEqual(calls.pop(), ["tutorial-close"]);
}

function createFakeWindow() {
  const listeners = new Map();
  const operations = [];
  const history = {
    state: { existing: "kept" },
    replaceState(state) {
      this.state = state;
      operations.push(["replace", state]);
    },
    pushState(state) {
      this.state = state;
      operations.push(["push", state]);
    },
    back() { operations.push(["back"]); },
  };
  return {
    history,
    operations,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    emitPop(state) { listeners.get("popstate")?.({ state }); },
    hasPopListener: () => listeners.has("popstate"),
  };
}

{
  const fakeWindow = createFakeWindow();
  let backCalls = 0;
  const navigation = createNativeBackNavigation({
    windowRef: fakeWindow,
    onBack: () => { backCalls += 1; return true; },
  });
  assert.equal(navigation.mount(), true);
  assert.equal(navigation.isMounted(), true);
  assert.equal(fakeWindow.history.state[NATIVE_BACK_STATE_KEY], "guard");
  assert.equal(fakeWindow.operations[0][1].existing, "kept", "existing history state is preserved");

  fakeWindow.emitPop({ [NATIVE_BACK_STATE_KEY]: "root" });
  assert.equal(backCalls, 1);
  assert.equal(fakeWindow.operations.at(-1)[0], "push", "handled app back immediately rearms the guard");

  fakeWindow.emitPop({ unrelated: true });
  assert.equal(backCalls, 1, "unrelated browser history events are ignored");
  assert.equal(navigation.destroy(), true);
  assert.equal(fakeWindow.hasPopListener(), false);
}

{
  const fakeWindow = createFakeWindow();
  const navigation = createNativeBackNavigation({
    windowRef: fakeWindow,
    onBack: () => false,
  });
  navigation.mount();
  fakeWindow.emitPop({ [NATIVE_BACK_STATE_KEY]: "root" });
  assert.equal(fakeWindow.operations.at(-1)[0], "back", "title/root back continues into real browser history");
  assert.equal(navigation.isMounted(), false);
  assert.equal(fakeWindow.hasPopListener(), false);
}

console.log("Native Android/browser Back navigation routing and history guard tests passed.");
