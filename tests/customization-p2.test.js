import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDefaultSave, loadSave, resetAppearance, resetSettings, updateModeCustomizationSetting, updateSpeedTestFontSize } from "../js/storage.js";
import { normalizeCustomization } from "../js/customization.js";
import { normalizeModeCustomizationValue, resolveTypingPresentation, resolveModeEffectsIntensity } from "../js/modeCustomization.js";
import { modePresentationMarkup } from "../js/modeCustomizationPresentation.js";
import { createGlobalKeyboardController } from "../js/appKeyboardController.js";
import { Screens } from "../js/state.js";
import { getAllSpeedTestConfigs } from "../js/speedTestConfig.js";
import { startSpeedTest, handleCurrentSpeedTestKey, completeSpeedTest, clearSpeedTestRuntime, getSpeedTestLoopActive, pauseSpeedTest, resumeSpeedTest } from "../js/speedTest.js";
import { clearSession } from "../js/sessionManager.js";

const data = new Map();
globalThis.localStorage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
const frames = new Map(); let nextFrame = 0;
globalThis.requestAnimationFrame = (fn) => { frames.set(++nextFrame, fn); return nextFrame; };
globalThis.cancelAnimationFrame = (id) => frames.delete(id);
const save = createDefaultSave();
save.currentFurthestLevel = 56; save.levels = { 1: { bestWPM: 78 } };
save.settings.theme = "midnight"; save.settings.accent = "violet"; save.settings.soundEffects = true;
save.settings.screenShake = false; save.settings.speedTestTimerPosition = "top";
const originalLevels = JSON.stringify(save.levels);

let preferenceCases = 0;
for (const hud of ["focus", "balanced", "data"]) for (const stats of [false, true]) for (const size of ["auto", "small", "medium", "large"]) {
  assert.equal(updateModeCustomizationSetting(save, "typingTest.hudLayout", hud).persisted, true);
  updateModeCustomizationSetting(save, "typingTest.liveStats", stats);
  updateModeCustomizationSetting(save, "typingTest.textSize", size);
  const reloaded = loadSave();
  assert.deepEqual(reloaded.settings.typingTest, { hudLayout: hud, liveStats: stats, textSize: size });
  assert.equal(reloaded.settings.speedTestFontSize, size);
  assert.equal(resolveTypingPresentation(reloaded.settings).showLiveStats, hud !== "focus" && stats);
  assert.equal(reloaded.settings.theme, "midnight");
  assert.equal(reloaded.settings.accent, "violet");
  assert.equal(reloaded.settings.soundEffects, true);
  assert.equal(reloaded.settings.screenShake, false);
  assert.equal(reloaded.settings.speedTestTimerPosition, "top");
  assert.equal(reloaded.currentFurthestLevel, 56);
  assert.equal(JSON.stringify(reloaded.levels), originalLevels);
  preferenceCases++;
}
updateModeCustomizationSetting(save, "typingTest.liveStats", false);
updateModeCustomizationSetting(save, "typingTest.hudLayout", "focus");
updateModeCustomizationSetting(save, "typingTest.hudLayout", "data");
assert.equal(resolveTypingPresentation(save.settings).showLiveStats, false, "Changing layouts never silently enables live stats");
updateSpeedTestFontSize(save, "small");
assert.equal(loadSave().settings.typingTest.textSize, "small");
for (const invalid of [null, undefined, "", "huge", 12, [], {}, "<script>"]) {
  assert.equal(normalizeModeCustomizationValue("typingTest.hudLayout", invalid), "balanced");
  assert.equal(normalizeModeCustomizationValue("typingTest.textSize", invalid), "auto");
  assert.equal(normalizeModeCustomizationValue("typingTest.liveStats", invalid), true);
  assert.equal(normalizeModeCustomizationValue("gameplayHud", invalid), "standard");
  assert.equal(normalizeModeCustomizationValue("actionModeIntensity", invalid), "full");
}
assert.throws(() => updateModeCustomizationSetting(save, "__proto__", {}), TypeError);
assert.throws(() => modePresentationMarkup("<script>"), TypeError);
assert.throws(() => modePresentationMarkup("typing", "<script>"), TypeError);
for (const hud of ["minimal", "standard"]) {
  updateModeCustomizationSetting(save, "gameplayHud", hud); assert.equal(loadSave().settings.gameplayHud, hud);
}
let effectsCases = 0;
for (const effects of ["reduced", "standard", "cinematic"]) for (const intensity of ["focused", "full"]) for (const reduced of [false, true]) {
  save.settings.effectsIntensity = effects;
  updateModeCustomizationSetting(save, "actionModeIntensity", intensity);
  for (const mode of ["typing", "campaign", "endless", "boss", "arcade-rush"]) {
    const action = ["boss", "arcade-rush"].includes(mode);
    assert.equal(resolveModeEffectsIntensity(save.settings, mode, reduced), reduced || (action && intensity === "focused") ? "reduced" : effects);
    effectsCases++;
  }
}
const kept = structuredClone(save.settings.typingTest);
resetAppearance(save); assert.deepEqual(save.settings.typingTest, kept);
resetSettings(save); assert.deepEqual(save.settings, createDefaultSave().settings);
assert.equal(JSON.stringify(save.levels), originalLevels); assert.equal(save.currentFurthestLevel, 56);
const originalSet = globalThis.localStorage.setItem;
globalThis.localStorage.setItem = () => { throw new Error("QuotaExceededError"); };
assert.equal(updateModeCustomizationSetting(save, "gameplayHud", "minimal").persisted, false);
assert.equal(save.settings.gameplayHud, "minimal");
globalThis.localStorage.setItem = originalSet;
data.set("wordstrike_save", JSON.stringify({ levels:{}, settings:{ speedTestFontSize: "large", typingTest:{ textSize:"small", liveStats:"false", hudLayout:"bad" } } }));
assert.deepEqual(loadSave().settings.typingTest, { textSize:"large", hudLayout:"balanced", liveStats:true });

// Native controls cannot trigger gameplay, restart, menu navigation, or level launch.
let routed = 0; let resumed = 0; let focused = 0;
const state = { screen: Screens.PAUSED, game: { mode: "campaign" } };
const keyboard = createGlobalKeyboardController({ state, currentTimeMs: () => 0, routeActiveGameplayKey: () => { routed++; return false; }, resumeGame: () => resumed++ });
const details = { open:true, querySelector: () => ({ focus: () => focused++ }) };
const key = (value) => ({ key:value, target:{ tagName:"SUMMARY", closest:(selector) => selector === "[data-mode-presentation]" ? details : null, matches:()=>false }, preventDefault() { this.prevented = true; } });
for (const value of ["ArrowDown", "ArrowRight", "Enter", " ", "Tab", "Backspace", "x"]) {
  const event = key(value); keyboard(event); assert.equal(event.prevented, undefined);
}
assert.equal(routed, 0);
const escape = key("Escape"); keyboard(escape);
assert.equal(escape.prevented, true); assert.equal(details.open, false); assert.equal(focused, 1);
keyboard(key("Escape")); assert.equal(resumed, 1, "A second Escape resumes the paused run instead of trapping focus");

// Controlled-time replay proves presentation choices do not change measured results.
function replay(config, hud, liveStats, textSize) {
  clearSpeedTestRuntime(); clearSession();
  const settings = createDefaultSave();
  const runtime = startSpeedTest({ config, wordPool:["word","apple","river","stone","green","house"], attemptSeed:4242, developerMode:true });
  const configJson = JSON.stringify(runtime.config);
  let time = 1000;
  const type = (char) => handleCurrentSpeedTestKey({ key:char, preventDefault(){} }, time += 25);
  type("z"); type("Backspace");
  const beforePause = JSON.stringify(runtime.metrics);
  pauseSpeedTest(time + 100);
  updateModeCustomizationSetting(settings,"typingTest.hudLayout",hud);
  updateModeCustomizationSetting(settings,"typingTest.liveStats",liveStats);
  updateModeCustomizationSetting(settings,"typingTest.textSize",textSize);
  assert.equal(JSON.stringify(runtime.metrics), beforePause);
  assert.equal(JSON.stringify(runtime.config), configJson);
  assert.equal(runtime.phase,"PAUSED");
  resumeSpeedTest(time + 1100); time += 1100;
  const words = runtime.words.slice(0, config.wordCount ?? 3);
  for (let i=0;i<words.length;i++) { for (const char of words[i]) type(char); if (!runtime.ended) type(" "); }
  if (!runtime.ended) completeSpeedTest(runtime, runtime.deadlineMs);
  assert.equal(runtime.ended,true);
  const result = runtime.result;
  assert.ok(result);
  const snapshot = { config:runtime.config, metrics:runtime.metrics, wpm:result.wpm, accuracy:result.accuracy, duration:result.activeDurationMs, score:result.score, characters:result.characters };
  clearSpeedTestRuntime();clearSession();assert.equal(getSpeedTestLoopActive(),false);
  assert.equal(frames.size,0);
  return snapshot;
}
let replayCases = 0;
for (const config of getAllSpeedTestConfigs()) {
  const baseline = replay(config,"balanced",true,"auto");
  for (const hud of ["focus","balanced","data"]) for (const live of [true,false]) for (const size of ["auto","small","medium","large"]) {
    assert.deepEqual(replay(config,hud,live,size), baseline, `${config.configId}/${hud}/${live}/${size}`); replayCases++;
  }
}
const controller = readFileSync(new URL("../js/modeCustomizationPresentation.js",import.meta.url),"utf8");
assert.doesNotMatch(controller,/subtree:\s*true|setInterval|requestAnimationFrame|localStorage|startSpeedTest\(/);
assert.match(controller,/observer|Observer/);
assert.match(controller,/could not be saved/);
const css=readFileSync(new URL("../styles/mode-customization.css",import.meta.url),"utf8");
assert.match(css,/grid-template-areas: "back level core"/);
assert.match(css,/grid-template-areas: "back stage core"/);
assert.doesNotMatch(css,/--campaign-hud-height:|--endless-hud-height:/);
for (const mode of ["typing","campaign","endless","boss","arcade-rush"]) for (const location of ["ready","pause"]) {
  const html=modePresentationMarkup(mode,location);
  assert.match(html,/<details/);assert.match(html,/<summary/);assert.match(html,/role="status"/);
}
console.log(`P2: ${preferenceCases} typing preference combinations, ${effectsCases} effects policies, native keyboard isolation, reset/storage boundaries, and ${replayCases} exact measured-result replays passed.`);
