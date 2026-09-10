import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createDefaultSave,
  loadSave,
  updateModeCustomizationSetting,
} from "../js/storage.js";
import {
  normalizeModeCustomizationValue,
  resolveTypingPresentation,
  TYPING_PASSAGE_WIDTHS,
} from "../js/modeCustomization.js";
import { modePresentationMarkup } from "../js/modeCustomizationPresentation.js";

const data = new Map();
globalThis.localStorage = {
  getItem: (key) => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, value),
};

const save = createDefaultSave();
assert.equal(save.settings.speedTestPassageWidth, "normal");
assert.equal(resolveTypingPresentation(save.settings).passageWidth, "normal");
assert.deepEqual(TYPING_PASSAGE_WIDTHS.map(({ value }) => value), ["narrow", "normal", "wide"]);

for (const width of ["narrow", "normal", "wide"]) {
  const result = updateModeCustomizationSetting(save, "typingTest.passageWidth", width);
  assert.equal(result.value, width);
  assert.equal(result.persisted, true);
  const reloaded = loadSave();
  assert.equal(reloaded.settings.speedTestPassageWidth, width);
  assert.equal(resolveTypingPresentation(reloaded.settings).passageWidth, width);
  assert.equal(Object.hasOwn(reloaded.settings.typingTest, "passageWidth"), false,
    "passage width stays presentation-only and does not alter the legacy typingTest object contract");
}

for (const invalid of [null, undefined, "", "extra-wide", 42, {}, []]) {
  assert.equal(normalizeModeCustomizationValue("typingTest.passageWidth", invalid), "normal");
}

const markup = modePresentationMarkup("typing", "ready");
assert.match(markup, /Passage width/);
assert.match(markup, /data-mode-setting="typingTest\.passageWidth"/);
assert.match(markup, />Narrow</);
assert.match(markup, />Normal</);
assert.match(markup, />Wide</);

const css = readFileSync(new URL("../styles/mode-customization.css", import.meta.url), "utf8");
assert.match(css, /\.speed-test-topbar-secondary > \.mode-presentation \.mode-presentation-panel\s*\{[\s\S]*position:\s*absolute/);
assert.match(css, /data-speed-passage-width="narrow"[^}]*66\.25rem/);
assert.match(css, /data-speed-passage-width="normal"[^}]*78rem/);
assert.match(css, /data-speed-passage-width="wide"[^}]*96rem/);
assert.doesNotMatch(css, /\.speed-test-topbar-secondary > \.mode-presentation\[open\][^{]*\{[^}]*flex-basis:\s*min\(30rem/);
assert.doesNotMatch(css, /:has\(> \.mode-presentation\[open\]\)/);

console.log("Typing presentation: floating customization and narrow/normal/wide passage width persistence passed.");
