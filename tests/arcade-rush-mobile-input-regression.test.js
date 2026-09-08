import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createMobileInputAdapter } from "../js/mobileInputAdapter.js";

class FakeNode {
  constructor() { this.listeners = new Map(); this.classList = { add() {}, remove() {} }; this.style = { setProperty() {}, removeProperty() {} }; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type, event = {}) { this.listeners.get(type)?.({ preventDefault() {}, ...event }); }
  focus() { globalThis.document.activeElement = this; }
  blur() { if (globalThis.document.activeElement === this) globalThis.document.activeElement = null; }
  append() {}
  remove() { this.removed = true; }
  querySelector(selector) { if (selector === ".gameplay-input") return this.input; if (selector === ".gameplay-keyboard-trigger") return this.trigger; return null; }
}

const host = new FakeNode();
const arena = new FakeNode();
const rootStyle = new FakeNode().style;
const body = { classList: { add() {}, remove() {}, toggle() {} } };
const input = new FakeNode(); input.value = "";
const trigger = new FakeNode();
const dock = new FakeNode(); dock.input = input; dock.trigger = trigger;
const root = {
  documentElement: { style: rootStyle }, body, activeElement: null,
  querySelector(selector) {
    if (selector.includes(".arcade-rush-gameplay")) return host;
    if (selector.includes(".arcade-rush-word-layer")) return arena;
    return null;
  },
  createElement() { return dock; },
};
globalThis.document = root;
globalThis.window = { innerWidth: 390, innerHeight: 844, scrollX: 0, scrollY: 0, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: true }), setTimeout(fn) { fn(); }, scrollTo() {} };
const visualViewport = { width: 390, height: 844, offsetTop: 0, offsetLeft: 0, addEventListener() {}, removeEventListener() {} };
const events = [];
const cleanup = createMobileInputAdapter({ root, visualViewport, onInput: (event) => events.push(event) });
assert.equal(typeof cleanup, "function");
assert.equal(host.removed, undefined);
arena.dispatch("pointerdown");
assert.equal(root.activeElement, input);
input.dispatch("beforeinput", { inputType: "insertText", data: "a" });
assert.equal(events.at(-1)?.value, "a");
cleanup();
assert.equal(dock.removed, true);

const [rushUi, css] = await Promise.all([
  readFile(new URL("../js/arcadeRush/arcadeRushUi.js", import.meta.url), "utf8"),
  readFile(new URL("../style.css", import.meta.url), "utf8"),
]);
assert.match(rushUi, /\.arcade-rush-word-layer\{[^}]*pointer-events:auto/);
assert.match(css, /body\.gameplay-active :is\([^)]*\.arcade-rush-gameplay/);
console.log("Arcade Rush mounts the shared mobile keyboard adapter and follows visual-viewport gameplay containment.");
