import assert from "node:assert/strict";
import { createMobileInputAdapter } from "../js/mobileInputAdapter.js";

class EventTargetMock {
  constructor() {
    this.listeners = new Map();
    this.classList = { add() {} };
    this.value = "";
  }
  addEventListener(type, handler) { this.listeners.set(type, handler); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type, event = {}) {
    event.target ||= this;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    this.listeners.get(type)?.(event);
    return event;
  }
  focus() { this.focused = true; }
  blur() { this.focused = false; }
  remove() { this.removed = true; }
}

const host = new EventTargetMock();
host.append = (child) => { host.child = child; };
const arena = new EventTargetMock();
const input = new EventTargetMock();
const trigger = new EventTargetMock();
const style = { setProperty() {}, removeProperty() {} };
const bodyClasses = { add() {}, remove() {}, toggle() {} };
const root = {
  documentElement: { style },
  body: { classList: bodyClasses },
  querySelector(selector) {
    if (selector.includes(".arcade-rush-gameplay") && selector.includes(".speed-test-screen")) return host;
    if (selector.includes(".arcade-rush-gameplay") && selector.includes("#play-area")) return arena;
    return null;
  },
  createElement() {
    const dock = new EventTargetMock();
    dock.querySelector = (selector) => selector === ".gameplay-input" ? input : trigger;
    return dock;
  },
};

const cleanup = createMobileInputAdapter({ root, onInput() {} });
assert.equal(host.child != null, true, "Arcade Rush must receive the shared mobile input dock");

const interactive = { closest: () => ({ tagName: "BUTTON" }) };
arena.dispatch("pointerdown", { target: interactive });
assert.notEqual(input.focused, true, "Tapping an Arcade Rush control must not be swallowed to focus gameplay input");

const gameplay = { closest: () => null };
arena.dispatch("pointerdown", { target: gameplay });
assert.equal(input.focused, true, "Tapping the Arcade Rush gameplay surface must focus the shared input");

input.focused = false;
trigger.dispatch("click", { target: trigger });
assert.equal(input.focused, true, "The keyboard enable button must focus the shared input directly");

cleanup();
assert.equal(host.child.removed, true);
console.log("Arcade Rush mounts the shared software-keyboard bridge without stealing interactive controls.");
