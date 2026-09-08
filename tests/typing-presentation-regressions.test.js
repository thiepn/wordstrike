import assert from "node:assert/strict";
import { normalizeSpeedTestFontSize, speedTestFontSizeMarkup } from "../js/speedTestPresentation.js";
import { createDefaultSave, loadSave, updateSpeedTestFontSize, updateSpeedTestTimerPosition } from "../js/storage.js";
const data = new Map();
globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
const legacy = { currentFurthestLevel: 9, levels: { 1: { bestWPM: 85, bestScore: 3400 } }, settings: { speedTestTimerPosition: "top", screenShake: false } };
data.set("wordstrike_save", JSON.stringify(legacy));
let save = loadSave();
assert.equal(createDefaultSave().settings.speedTestFontSize, "auto");
assert.equal(save.settings.speedTestFontSize, "auto");
assert.equal(save.currentFurthestLevel, 9);
assert.deepEqual(save.levels, legacy.levels);
for (const size of ["small", "medium", "large", "auto"]) {
  assert.equal(updateSpeedTestFontSize(save, size), size);
  save = loadSave();
  assert.equal(save.settings.speedTestFontSize, size);
  assert.equal(save.settings.speedTestTimerPosition, "top");
  assert.deepEqual(save.levels, legacy.levels);
  assert.match(speedTestFontSizeMarkup(size), new RegExp(`value="${size}" selected`));
}
for (const invalid of [undefined, null, "", "HUGE", '<script>alert(1)</script>', {}, 42]) {
  assert.equal(normalizeSpeedTestFontSize(invalid), "auto");
  assert.doesNotMatch(speedTestFontSizeMarkup(invalid), /<script/);
}
updateSpeedTestFontSize(save, "large");
updateSpeedTestTimerPosition(save, "center");
assert.equal(loadSave().settings.speedTestFontSize, "large");
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("Blocked storage"); } });
assert.equal(updateSpeedTestFontSize(save, "medium"), "medium", "blocked storage does not break the current screen");
console.log("Font preference validates, survives reload/timer changes, and preserves legacy progress and records.");
