import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  THEMES, ACCENTS, EFFECTS, createDefaultCustomization, normalizeCustomization,
  normalizeCustomizationValue, resolveEffectsIntensity, presentationEffectsReduced,
} from "../js/customization.js";
import {
  createDefaultSave, loadSave, updateCustomizationSetting, resetAppearance,
  resetSettings, updateSpeedTestFontSize, updateSetting,
} from "../js/storage.js";

let raw;
let writes = 0;
globalThis.localStorage = {
  getItem: () => raw ?? null,
  setItem: (_key, value) => { raw = value; writes++; },
};
const baseline = createDefaultCustomization();
assert.equal(THEMES.length, 4);
assert.equal(ACCENTS.length, 6);
assert.equal(EFFECTS.length, 3);
assert.deepEqual(normalizeCustomization(null), baseline);
for (const corrupt of [null, false, 7, "__proto__", [], { theme: {}, accent: [], effectsIntensity: 3, typingTest: null }]) {
  assert.deepEqual(normalizeCustomization(corrupt), baseline);
}
assert.throws(() => normalizeCustomizationValue("strictMode", true), TypeError);
assert.throws(() => normalizeCustomizationValue("__proto__", {}), TypeError);
for (const { value: theme } of THEMES) {
  for (const { value: accent } of ACCENTS) {
    for (const { value: effectsIntensity } of EFFECTS) {
      const save = createDefaultSave();
      save.currentFurthestLevel = 41;
      save.levels = { 40: { grade: "S", bestAccuracy: 100, bestScore: 9000 } };
      for (const [key, value] of Object.entries({ theme, accent, effectsIntensity })) {
        const before = writes;
        assert.deepEqual(updateCustomizationSetting(save, key, value), { value, persisted: true });
        assert.equal(writes, before + 1, "only one persistence write per actual selection");
      }
      const reloaded = loadSave();
      assert.equal(reloaded.settings.theme, theme);
      assert.equal(reloaded.settings.accent, accent);
      assert.equal(reloaded.settings.effectsIntensity, effectsIntensity);
      assert.equal(reloaded.currentFurthestLevel, 41);
      assert.deepEqual(reloaded.levels, save.levels);
      assert.equal(resolveEffectsIntensity(reloaded.settings, true), "reduced");
      assert.equal(resolveEffectsIntensity(reloaded.settings, false), effectsIntensity);
    }
  }
}

// Old saves retain progress, booleans, audio, timer position and the existing text size.
raw = JSON.stringify({ currentFurthestLevel: 77, levels: { 76: { bestAccuracy: 99, bestScore: 3456 } },
  settings: { particles: false, screenShake: false, strictMode: true, soundEffects: true,
    speedTestTimerPosition: "top", speedTestFontSize: "large" } });
const legacy = loadSave();
assert.equal(legacy.currentFurthestLevel, 77);
assert.equal(legacy.settings.typingTest.textSize, "large");
assert.equal(legacy.settings.speedTestFontSize, "large");
assert.equal(legacy.settings.speedTestTimerPosition, "top");
assert.equal(legacy.settings.theme, "wordstrike");
assert.equal(legacy.settings.particles, false);
assert.equal(legacy.settings.screenShake, false);
assert.equal(legacy.settings.strictMode, true);
assert.equal(legacy.settings.soundEffects, true);
updateSpeedTestFontSize(legacy, "small");
assert.equal(legacy.settings.typingTest.textSize, "small");
assert.equal(loadSave().settings.speedTestFontSize, "small");
updateCustomizationSetting(legacy, "theme", "oled");
updateCustomizationSetting(legacy, "accent", "orange");
updateCustomizationSetting(legacy, "effectsIntensity", "cinematic");
const preserved = JSON.stringify({ ...legacy, settings: { ...legacy.settings, theme: "wordstrike", accent: "cyan", effectsIntensity: "standard" } });
resetAppearance(legacy);
assert.equal(JSON.stringify(legacy), preserved, "appearance reset cannot erase progress or gameplay/audio settings");
resetSettings(legacy);
assert.deepEqual(legacy.settings, createDefaultSave().settings);
assert.equal(legacy.currentFurthestLevel, 77);
assert.equal(legacy.levels[76].bestScore, 3456);
updateSetting(legacy, "particles", false);
updateCustomizationSetting(legacy, "effectsIntensity", "cinematic");
assert.equal(legacy.settings.particles, false, "Cinematic must not overwrite a disabled override");
assert.equal(updateCustomizationSetting(legacy, "theme", "invalid").value, "wordstrike");

const a = createDefaultSave(); const b = createDefaultSave();
a.settings.typingTest.liveStats = false;
assert.equal(b.settings.typingTest.liveStats, true, "nested defaults are never shared");
raw = '{corrupt'; assert.deepEqual(loadSave(), createDefaultSave());
globalThis.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
assert.equal(updateCustomizationSetting(b, "theme", "oled").persisted, false);
assert.equal(b.settings.theme, "oled", "preferences still work in memory when storage is blocked");
Object.defineProperty(globalThis, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
assert.deepEqual(loadSave(), createDefaultSave());
assert.equal(resetAppearance(b).persisted, false);

globalThis.matchMedia = () => ({ matches: true });
assert.equal(presentationEffectsReduced({ closest: () => null }), true);
assert.equal(presentationEffectsReduced({ closest: (s) => s === ".practice-lab-screen" ? {} : null }), false);
delete globalThis.matchMedia;

const css = readFileSync(new URL("../styles/customization.css", import.meta.url), "utf8");
const controller = readFileSync(new URL("../js/customizationPresentation.js", import.meta.url), "utf8");
assert.match(controller, /observer\.observe\(root, \{ childList: true \}\)/);
assert.doesNotMatch(controller, /subtree:\s*true|setInterval|requestAnimationFrame/);
assert.match(controller, /data-appearance-status/);
assert.match(controller, /media\?\.addEventListener\?\.\("change"/);
assert.doesNotMatch(css, /--color-(danger|warning|success|special):/);
assert.doesNotMatch(css, /filter:\s*(hue-rotate|invert|saturate)/);
assert.match(css, /data-customization-active="true"/);
assert.match(css, /prefers-reduced-motion/);
console.log("P1: 72 preference combinations, migration, invalid saves, resets, blocked storage, old text-size compatibility, effects precedence, and isolation passed.");
