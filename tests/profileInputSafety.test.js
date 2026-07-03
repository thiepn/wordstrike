import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { captureGameplayBackspace, isTextEntryTarget } from "../js/inputSafety.js";

for (const tagName of ["INPUT", "textarea", "Select"]) {
  assert.equal(isTextEntryTarget({ tagName }), true);
}
assert.equal(isTextEntryTarget({ tagName: "DIV", isContentEditable: true }), true);
assert.equal(isTextEntryTarget({ tagName: "SPAN", closest: () => ({}) }), true);
assert.equal(isTextEntryTarget({ tagName: "BUTTON", closest: () => null }), false);
const editableBackspace = {
  key: "Backspace",
  target: { tagName: "INPUT" },
  preventDefault() { this.prevented = true; },
};
assert.equal(captureGameplayBackspace(editableBackspace, { mode: "typing" }), false);
assert.equal(editableBackspace.prevented, undefined);

const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
assert.match(main, /function handleGlobalKeydown\(event\)[\s\S]*captureGameplayBackspace\(event,[\s\S]*if \(isTextEntryTarget\(event\.target\)\) return;/s);
assert.match(main, /const authUiChanged = authUiKey !== lastAuthUiKey/);
assert.match(main, /authUiChanged &&[\s\S]*updateProfileAuthSection/);
assert.equal(main.split('addEventListener("keydown"').length - 1, 1);
assert.equal(main.split('addEventListener("input"').length - 1, 1);

console.log("Profile username inputs are ignored by the global keyboard router.");
