import assert from "node:assert/strict";
import { Screens } from "../js/state.js";
import {
  attachAppClickListener,
  resolveResultClickAction,
} from "../js/appClickRouting.js";

class MouseEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = options.bubbles === true;
    this.cancelable = options.cancelable === true;
    this.button = options.button ?? 0;
    this.defaultPrevented = false;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
}
globalThis.MouseEvent = MouseEvent;

class Element {
  constructor({ root, parent = null, action = null, className = "" } = {}) {
    this.root = root || this;
    this.parent = parent;
    this.dataset = action ? { action } : {};
    this.className = className;
    this.disabled = false;
    this.hidden = false;
    this.attributes = {};
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  closest(selector) {
    let node = this;
    while (node) {
      if (selector === "[data-action]" && node.dataset?.action) return node;
      if (selector === "[hidden]" && node.hidden) return node;
      if (selector === '[aria-hidden="true"]' && node.getAttribute?.("aria-hidden") === "true") return node;
      if (selector.startsWith(".") && node.className?.split(" ").includes(selector.slice(1))) return node;
      node = node.parent;
    }
    return null;
  }
  dispatchEvent(event) {
    event.target = this;
    if (event.bubbles) this.root.listeners.get(event.type)?.forEach((listener) => listener(event));
    return !event.defaultPrevented;
  }
}

class Root extends Element {
  constructor() {
    super();
    this.root = this;
    this.listeners = new Map();
    this.currentScreen = null;
    this.buttons = [];
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  contains(node) {
    return node === this || node === this.currentScreen || node?.parent === this.currentScreen;
  }
  set innerHTML(value) {
    this.html = value;
    const screenClass = value.match(/<section class="([^"]+)"/)?.[1] || "";
    this.currentScreen = new Element({ root: this, parent: this, className: screenClass });
    this.buttons = [...value.matchAll(/data-action="([^"]+)"/g)].map((match) => (
      new Element({ root: this, parent: this.currentScreen, action: match[1], className: "arcade-button" })
    ));
  }
  querySelectorAll(selector) {
    return selector.includes("arcade-button") ? this.buttons : [];
  }
}

const root = new Root();
globalThis.document = {
  querySelector(selector) { return selector === "#app" ? root : null; },
};
const { renderEndlessResults } = await import("../js/ui.js");
const screen = Screens.ENDLESS_RESULTS;
let readyAt = 0;
let now = 1000;
const calls = [];
const listener = (event) => {
  const action = resolveResultClickAction(event, { root, screen, readyAt, now });
  if (action) calls.push(`${screen}:${action}`);
};
assert.equal(attachAppClickListener(root, listener), true);
assert.equal(attachAppClickListener(root, listener), false);
assert.equal(root.listeners.get("click").length, 1);

const endlessResult = (score = 1000) => ({
  score, accuracy: 95, wpm: 60,
  modeData: {
    highestStage: 2, finalStage: 2, survivalTimeMs: 10000, wordsCompleted: 10,
    stageProgress: 0, peakWpm: 65, finalRollingWpm: 60, maximumCombo: 10,
    maximumPerfectStreak: 10, coreHits: 3, coreBreaches: 3,
    survivalPoints: 500, wordPoints: 250, stageBonusPoints: 250, attemptSeed: 1,
  },
});

renderEndlessResults(endlessResult(), 0, { select() {} });
for (const button of root.buttons) {
  button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}
assert.deepEqual(calls, [
  "ENDLESS_RESULTS:retry", "ENDLESS_RESULTS:modes", "ENDLESS_RESULTS:title",
]);

const staleButton = root.buttons[0];
renderEndlessResults(endlessResult(2000), 0, { select() {} });
staleButton.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
assert.equal(calls.length, 3, "stale result controls must not route after rerender");

root.buttons[0].disabled = true;
root.buttons[0].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
root.buttons[1].hidden = true;
root.buttons[1].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
readyAt = 2000;
root.buttons[2].dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
assert.equal(calls.length, 3);
assert.equal(Screens.DAILY_RESULTS, undefined);

console.log("Stable-root bubbling routing activates current Endless Results actions exactly once and rejects stale, hidden, disabled, gated, and retired Daily controls.");
