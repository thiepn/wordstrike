import assert from "node:assert/strict";
import {
  createMobileInputAdapter,
  keyboardEventFromNormalized,
  normalizeBeforeInput,
  normalizeKeyboardInput,
} from "../js/mobileInputAdapter.js";

assert.deepEqual(normalizeKeyboardInput({ key: "a" }), {
  type: "character", value: "a", source: "physical-keyboard",
});
assert.equal(normalizeKeyboardInput({ key: "a", metaKey: true }), null);
assert.equal(normalizeKeyboardInput({ key: "Unidentified" }), null);
assert.deepEqual(normalizeKeyboardInput({ key: "Backspace", metaKey: true }), {
  type: "word-delete", value: "", source: "physical-keyboard",
});
assert.deepEqual(normalizeBeforeInput({ inputType: "insertText", data: "a " }), [
  { type: "character", value: "a", source: "soft-keyboard" },
  { type: "space", value: " ", source: "soft-keyboard" },
]);
assert.deepEqual(normalizeBeforeInput({ inputType: "deleteContentBackward" }), [
  { type: "backspace", value: "", source: "soft-keyboard" },
]);
assert.deepEqual(normalizeBeforeInput({ inputType: "deleteWordBackward" }), [
  { type: "word-delete", value: "", source: "soft-keyboard" },
]);
assert.deepEqual(normalizeBeforeInput({ inputType: "insertLineBreak" }), [
  { type: "space", value: " ", source: "soft-keyboard" },
]);
assert.deepEqual(normalizeBeforeInput({ inputType: "insertCompositionText", data: "x", isComposing: true }), []);
assert.equal(keyboardEventFromNormalized({ type: "word-delete", value: "" }).ctrlKey, true);

class Target {
  constructor() { this.listeners = new Map(); this.classList = { add() {} }; this.value = ""; }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener() {}
  dispatch(type, event = {}) {
    event.target ||= this;
    event.preventDefault ||= () => { event.prevented = true; };
    this.listeners.get(type)?.(event);
    return event;
  }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}
const host = new Target();
host.append = (child) => { host.child = child; };
const arena = new Target();
const input = new Target();
const trigger = new Target();
const root = {
  documentElement: { style: { setProperty() {} } },
  querySelector(selector) { return selector.startsWith(".speed-test") ? host : arena; },
  createElement() {
    const dock = new Target();
    dock.querySelector = (selector) => selector === ".gameplay-input" ? input : trigger;
    return dock;
  },
};
const routed = [];
const cleanup = createMobileInputAdapter({ root, onInput: (value) => routed.push(value) });
trigger.dispatch("click");
assert.equal(input.focused, true);
input.dispatch("keydown", { key: "a" });
input.dispatch("beforeinput", { inputType: "insertText", data: "a" });
assert.equal(routed.length, 1, "physical keydown and beforeinput must not double-register");
const physicalDelete = input.dispatch("keydown", { key: "Backspace" });
const suppressedDelete = input.dispatch("beforeinput", { inputType: "deleteContentBackward" });
assert.equal(physicalDelete.prevented, true);
assert.equal(suppressedDelete.prevented, true);
assert.equal(routed.filter(({ type }) => type === "backspace").length, 1, "physical delete must dispatch once");
const softwareDelete = input.dispatch("beforeinput", { inputType: "deleteContentBackward" });
assert.equal(softwareDelete.prevented, true);
assert.equal(routed.filter(({ type }) => type === "backspace").length, 2, "software delete must dispatch once");
input.dispatch("beforeinput", { inputType: "insertText", data: "b" });
assert.equal(routed.at(-1).value, "b");
input.dispatch("compositionstart");
input.dispatch("beforeinput", { inputType: "insertCompositionText", data: "c", isComposing: true });
input.dispatch("compositionend", { data: "c" });
assert.equal(routed.filter((value) => value.value === "c").length, 1);
cleanup();
assert.equal(host.child.removed, true);

console.log("Mobile and physical input normalize characters, spaces, deletion, composition, and Meta word deletion consistently.");
