import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = {
  html: "",
  set innerHTML(value) { this.html = value; },
  querySelector() { return { onclick: null }; },
  querySelectorAll() { return []; },
};
globalThis.document = {
  querySelector(selector) {
    if (selector === "#app") return app;
    return null;
  },
};

const {
  renderEndlessReady,
  renderEndlessResults,
  renderEndlessShell,
  updateEndlessHud,
} = await import("../js/ui.js");
renderEndlessReady({ start() {} });
assert.match(app.html, /ENDLESS MODE/);
assert.match(app.html, /3 CORE INTEGRITY/);
assert.match(app.html, /10 WORDS IN STAGE 1/);
assert.match(app.html, /PRESS ENTER TO BEGIN/);

renderEndlessResults({
  score: 49000,
  accuracy: 94.5,
  wpm: 52.2,
  modeData: {
    highestStage: 8,
    finalStage: 8,
    survivalTimeMs: 300000,
    wordsCompleted: 140,
    stageProgress: 4,
    peakWpm: 70,
    finalRollingWpm: 58,
    maximumCombo: 42,
    maximumPerfectStreak: 15,
    coreHits: 3,
    coreBreaches: 4,
    survivalPoints: 30000,
    wordPoints: 12000,
    stageBonusPoints: 7000,
    attemptSeed: 123,
  },
}, 0, { retry() {}, modes() {}, title() {} });
assert.match(app.html, /RUN OVER/);
assert.match(app.html, /Highest stage.*8/s);
assert.match(app.html, /Score.*49[.,]000/s);
assert.match(app.html, /Survival time.*300\.0s/s);
assert.match(app.html, /SCORE BREAKDOWN/);
assert.match(app.html, /SURVIVAL.*30[.,]000/s);
assert.match(app.html, /WORDS.*12[.,]000/s);
assert.match(app.html, /STAGE BONUSES.*7[.,]000/s);
assert.match(app.html, /TOTAL.*49[.,]000/s);
assert.doesNotMatch(app.html, /30000\s*\+\s*12000/);
assert.doesNotMatch(app.html, /GRADE|BOSS|RAW WPM/);
assert.match(app.html, /Stage progress.*4 \/ 15/s);

for (const [stage, progress, expected] of [[4, 7, "7 / 10"], [8, 11, "11 / 15"], [14, 16, "16 / 20"]]) {
  const nodes = new Map();
  for (const id of ["#endless-stage", "#endless-progress", "#endless-score", "#endless-integrity"]) {
    nodes.set(id, { textContent: "" });
  }
  document.querySelector = (selector) => selector === "#app" ? app : nodes.get(selector) || null;
  const game = { stage, stageWordsCompleted: progress, score: 0, integrity: 3, elapsedMs: 0 };
  renderEndlessShell(game);
  updateEndlessHud(game);
  assert.equal(nodes.get("#endless-progress").textContent, expected);
}

const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
assert.match(main, /"endless-ready": \(\) => openEndlessReady\("mode-select"\)/);
assert.match(main, /Screens\.ENDLESS_READY/);
assert.match(main, /Screens\.ENDLESS_RESULTS/);
assert.equal(main.split('addEventListener("keydown"').length - 1, 1);

console.log("Endless ready, minimal Results, navigation, and listener integration tests passed.");
