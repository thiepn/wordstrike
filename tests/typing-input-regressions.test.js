import assert from "node:assert/strict";
import { createGlobalKeyboardController } from "../js/appKeyboardController.js";
import { normalizeKeyboardInput } from "../js/mobileInputAdapter.js";
import { Screens } from "../js/state.js";

const state = { screen: Screens.SPEED_TEST_RUN, game: null };
const routed = [];
const handle = createGlobalKeyboardController({
  state, currentTimeMs: () => 1000,
  routeActiveGameplayKey: (event) => { routed.push(event); return true; },
});
const textarea = { tagName: "TEXTAREA", matches: (selector) => selector === "textarea.gameplay-input", closest: () => null };
for (const key of ["Tab", "Escape"]) {
  const event = { key, target: textarea, preventDefault() {} };
  assert.equal(normalizeKeyboardInput(event), null, "commands must not become characters");
  handle(event);
  assert.equal(routed.at(-1), event, `${key} must reach the actual gameplay route`);
}
assert.equal(routed.length, 2);
for (const key of ["a", " ", "Backspace"]) handle({ key, target: textarea, preventDefault() {} });
assert.equal(routed.length, 2, "the mobile adapter owns text exactly once");
for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
  for (const key of ["Tab", "Escape", "a", "Backspace"]) {
    handle({ key, target: { tagName, matches: () => false, closest: () => null }, preventDefault() {} });
  }
}
assert.equal(routed.length, 2, "ordinary form controls remain isolated");
state.screen = Screens.SETTINGS;
handle({ key: "Tab", target: textarea });
assert.equal(routed.length, 2, "a stale gameplay input cannot route outside gameplay");
console.log("Gameplay textarea forwards Tab/Escape while preserving single-owner text and form isolation.");
