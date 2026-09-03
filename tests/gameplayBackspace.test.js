import assert from "node:assert/strict";
import { captureGameplayBackspace } from "../js/inputSafety.js";
import { getSpeedTestConfig } from "../js/speedTestConfig.js";
import { createSpeedTestRuntime, handleSpeedTestInput } from "../js/speedTest.js";
import { readFile } from "node:fs/promises";

const backspaceEvent = (target = { tagName: "BODY" }, options = {}) => ({
  key: "Backspace",
  target,
  ctrlKey: false,
  metaKey: false,
  defaultPrevented: false,
  preventDefault() { this.defaultPrevented = true; },
  ...options,
});

const lockedState = {
  target: { id: 7, text: "example", typedIndex: 3 },
  activeTargetId: 7,
  targetingState: { mode: "locked", prefix: "exa", activeTargetId: 7, candidateIds: [] },
  score: 900,
  combo: 4,
  correctKeystrokes: 3,
  totalKeystrokes: 3,
};
for (const [label, mode] of [
  ["Campaign", "normal"],
  ["Endless", "endless"],
  ["Arcade Rush", "arcade-rush"],
  ["Boss", "boss"],
]) {
  const state = structuredClone(lockedState);
  const before = structuredClone(state);
  const event = backspaceEvent();
  assert.equal(captureGameplayBackspace(event, { mode }), true, label);
  assert.equal(event.defaultPrevented, true, label);
  assert.deepEqual(state, before, `${label} Backspace must not mutate unrelated generic gameplay state`);
}

const typing = createSpeedTestRuntime({
  config: getSpeedTestConfig("time-15"),
  wordPool: ["example", "ordinary", "typing"],
  attemptSeed: 17,
});
typing.typedBuffer = "exam";
let event = backspaceEvent();
assert.equal(captureGameplayBackspace(event, {
  mode: "typing",
  onTypingBackspace: (inputEvent) => handleSpeedTestInput(typing, inputEvent, 100),
}), true);
assert.equal(event.defaultPrevented, true);
assert.equal(typing.typedBuffer, "exa");

typing.typedBuffer = "";
event = backspaceEvent();
captureGameplayBackspace(event, {
  mode: "typing",
  onTypingBackspace: (inputEvent) => handleSpeedTestInput(typing, inputEvent, 110),
});
assert.equal(event.defaultPrevented, true);
assert.equal(typing.typedBuffer, "");

let rushBackspaces = 0;
event = backspaceEvent();
assert.equal(captureGameplayBackspace(event, {
  mode: "arcade-rush",
  onTypingBackspace: () => { rushBackspaces += 1; },
}), true);
assert.equal(event.defaultPrevented, true);
assert.equal(rushBackspaces, 1);

const inputEvent = backspaceEvent({ tagName: "INPUT" });
assert.equal(captureGameplayBackspace(inputEvent, { mode: "campaign" }), false);
assert.equal(inputEvent.defaultPrevented, false);
const editableEvent = backspaceEvent({ tagName: "DIV", isContentEditable: true });
assert.equal(captureGameplayBackspace(editableEvent, { mode: "typing" }), false);
assert.equal(editableEvent.defaultPrevented, false);

const [main, keyboard] = await Promise.all([
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
]);
assert.equal(main.split('addEventListener("keydown"').length - 1, 1);
assert.match(main, /createGlobalKeyboardController\(\{/);
assert.match(keyboard, /captureGameplayBackspace\(event,[\s\S]*onTypingBackspace:[\s\S]*routeActiveGameplayKey/);
assert.doesNotMatch(main, /mode === "daily"|dailyMode\.js/);

console.log("Gameplay Backspace is captured once, defense-safe, Typing/Rush-aware, editable-input-safe, and routed through the extracted keyboard controller.");
