import assert from "node:assert/strict";
import {
  createGameplayVisibilityLifecycle,
  pauseHiddenGameplay,
} from "../js/gameplayVisibilityLifecycle.js";

const screens = Object.freeze({ SPEED_TEST_RUN: "speed-test-run", PLAYING: "playing", PAUSED: "paused" });
assert.equal(pauseHiddenGameplay({ hidden: false, screen: screens.PLAYING, screens }), false);
assert.equal(pauseHiddenGameplay({
  hidden: true,
  screen: screens.SPEED_TEST_RUN,
  screens,
  speedTest: { phase: "PREPARING" },
  pauseTypingTest() { throw new Error("preparing tests must not auto-pause"); },
}), false);

class FakeDocument {
  hidden = false;
  listeners = new Map();
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type) { for (const listener of [...(this.listeners.get(type) || [])]) listener({ type }); }
  listenerCount(type) { return this.listeners.get(type)?.size ?? 0; }
}

const documentRef = new FakeDocument();
let screen = screens.SPEED_TEST_RUN;
let speedTest = { phase: "ACTIVE" };
let typingPauses = 0;
let gameplayPauses = 0;
const lifecycle = createGameplayVisibilityLifecycle({
  documentRef,
  getScreen: () => screen,
  getSpeedTest: () => speedTest,
  screens,
  pauseTypingTest: () => { typingPauses += 1; screen = screens.PAUSED; },
  pauseGameplay: () => { gameplayPauses += 1; screen = screens.PAUSED; },
});

assert.equal(lifecycle.mount(), true);
assert.equal(lifecycle.mount(), false);
assert.equal(documentRef.listenerCount("visibilitychange"), 1);
documentRef.hidden = true;
documentRef.dispatch("visibilitychange");
assert.equal(typingPauses, 1);
assert.equal(gameplayPauses, 0);
screen = screens.PLAYING;
documentRef.dispatch("visibilitychange");
assert.equal(gameplayPauses, 1);
documentRef.hidden = false;
screen = screens.PLAYING;
documentRef.dispatch("visibilitychange");
assert.equal(gameplayPauses, 1);
assert.equal(lifecycle.unmount(), true);
assert.equal(lifecycle.unmount(), false);
assert.equal(documentRef.listenerCount("visibilitychange"), 0);

for (let index = 0; index < 100; index += 1) {
  const probe = createGameplayVisibilityLifecycle({
    documentRef,
    getScreen: () => screens.PLAYING,
    getSpeedTest: () => null,
    screens,
    pauseGameplay() {},
  });
  assert.equal(probe.mount(), true);
  assert.equal(probe.mount(), false);
  assert.equal(documentRef.listenerCount("visibilitychange"), 1);
  assert.equal(probe.unmount(), true);
  assert.equal(documentRef.listenerCount("visibilitychange"), 0);
}
console.log("Visibility lifecycle auto-pauses active gameplay once and leaves no listeners after repeated mount/unmount cycles.");
