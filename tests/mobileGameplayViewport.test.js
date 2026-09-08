import assert from "node:assert/strict";
import {
  applyGameplayViewportMetrics,
  createGameplayViewportController,
  focusGameplayInput,
  getGameplayViewportMetrics,
} from "../js/gameplayViewport.js";

assert.deepEqual(getGameplayViewportMetrics({
  visualViewport: { height: 390, width: 844, offsetTop: 52, offsetLeft: 4 },
  innerHeight: 768,
  innerWidth: 1024,
}), { height: 390, width: 844, offsetTop: 52, offsetLeft: 4 });
assert.deepEqual(getGameplayViewportMetrics({
  visualViewport: null,
  innerHeight: 800,
  innerWidth: 360,
}), { height: 800, width: 360, offsetTop: 0, offsetLeft: 0 });

const properties = new Map();
const style = {
  setProperty: (key, value) => properties.set(key, value),
  removeProperty: (key) => properties.delete(key),
};
assert.equal(applyGameplayViewportMetrics(style, {
  height: 390, width: 844, offsetTop: 52, offsetLeft: 4,
}), true);
assert.equal(properties.get("--game-viewport-height"), "390px");
assert.equal(properties.get("--game-viewport-offset-top"), "52px");

class ClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  toggle(value, force) { force ? this.add(value) : this.remove(value); }
  contains(value) { return this.values.has(value); }
}
class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
}
const viewport = new EventTarget();
Object.assign(viewport, { height: 390, width: 844, offsetTop: 52, offsetLeft: 4 });
const windowObject = new EventTarget();
Object.assign(windowObject, { innerHeight: 768, innerWidth: 1024, matchMedia: () => ({ matches: true }) });
const body = { classList: new ClassList() };
const controller = createGameplayViewportController({
  documentObject: { documentElement: { style }, body },
  windowObject,
  visualViewport: viewport,
});
assert.equal(body.classList.contains("gameplay-active"), true);
assert.equal(body.classList.contains("gameplay-viewport-short"), true);
assert.equal(viewport.listeners.has("resize"), true);
assert.equal(viewport.listeners.has("scroll"), true);
assert.equal(windowObject.listeners.has("orientationchange"), true);
controller.destroy();
assert.equal(body.classList.contains("gameplay-active"), false);
assert.equal(viewport.listeners.size, 0);
assert.equal(windowObject.listeners.size, 0);
assert.equal(properties.size, 0);

let focusOptions = null;
let restored = null;
const focusWindow = {
  scrollX: 3,
  scrollY: 9,
  scrollTo: (x, y) => { restored = [x, y]; },
  setTimeout: (callback) => callback(),
};
const input = { focus(options) { focusOptions = options; focusWindow.scrollY = 99; } };
assert.equal(focusGameplayInput(input, focusWindow), true);
assert.deepEqual(focusOptions, { preventScroll: true });
assert.deepEqual(restored, [3, 9]);

console.log("Gameplay viewport metrics, visual offsets, short mode, cleanup, and prevent-scroll focus behavior passed.");
