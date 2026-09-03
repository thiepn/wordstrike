import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

class Button {
  constructor(action) {
    this.dataset = { action };
    this.onclick = null;
    this.onmouseenter = null;
    this.onfocus = null;
  }
}

const app = {
  html: "",
  buttons: [],
  set innerHTML(value) {
    this.html = value;
    this.buttons = [...value.matchAll(/data-action="([^"]+)"/g)]
      .map((match) => new Button(match[1]));
  },
  querySelector(selector) {
    const action = selector.match(/data-action="([^"]+)"/)?.[1];
    return this.buttons.find((button) => button.dataset.action === action) || null;
  },
  querySelectorAll(selector) {
    return selector.includes("arcade-button") ? this.buttons : [];
  },
};
globalThis.document = {
  querySelector(selector) { return selector === "#app" ? app : null; },
};

const {
  renderEndlessResults,
  renderResults,
  renderSpeedTestResults,
} = await import("../js/ui.js");

const clickAudit = (expectedActions, render) => {
  const calls = [];
  const handlers = Object.fromEntries(expectedActions.map((action) => [
    action,
    () => calls.push(action),
  ]));
  handlers.select = () => {};
  render(handlers);
  assert.deepEqual(app.buttons.map(({ dataset }) => dataset.action), expectedActions);
  for (const button of app.buttons) {
    button.onclick({ preventDefault() {} });
  }
  assert.deepEqual(calls, expectedActions);
};

const campaign = (grade, isBoss, levelNumber, handlers) => renderResults({
  grade,
  wpm: 50,
  accuracy: 95,
  maxCombo: 10,
  score: 1000,
  levelNumber,
  isBoss,
  livesRemaining: 2,
  startingLives: 3,
  timeRemaining: 4,
  phrasesCompleted: 1,
  phraseCount: 1,
}, 0, handlers);
clickAudit(["next", "retry", "levels", "title"], (handlers) => campaign("A", false, 9, handlers));
clickAudit(["retry", "levels", "title"], (handlers) => campaign("Fail", false, 9, handlers));
clickAudit(["next", "retry", "levels", "title"], (handlers) => campaign("S", true, 10, handlers));
clickAudit(["retry", "levels", "title"], (handlers) => campaign("Fail", true, 10, handlers));

renderEndlessResults({
  score: 75411,
  accuracy: 96,
  wpm: 91,
  modeData: {
    highestStage: 14, survivalTimeMs: 300000, wordsCompleted: 140,
    stageProgress: 0, peakWpm: 100, finalRollingWpm: 90,
    maximumCombo: 40, maximumPerfectStreak: 20, coreHits: 3,
    coreBreaches: 3, survivalPoints: 29993, wordPoints: 31668,
    stageBonusPoints: 13750, attemptSeed: 1,
  },
}, 0, { select() {} });
assert.deepEqual(app.buttons.map(({ dataset }) => dataset.action), ["retry", "modes", "title"]);
assert.doesNotMatch(app.html, /29993\s*\+\s*31668/);

clickAudit(["retry", "change", "modes", "title"], (handlers) => renderSpeedTestResults({
  variantId: "time",
  wpm: 60,
  accuracy: 95,
  activeDurationMs: 15000,
  characters: { correct: 70, incorrect: 3, missed: 2 },
  modeData: {
    durationSeconds: 15, targetWordCount: null, rawWpm: 65,
    exactWords: 14, incorrectWords: 1, extraCharacters: 1,
    backspaces: 2, wordDeletes: 1,
  },
}, {}, 1, handlers));
assert.match(app.html, /arcade-button selected[^>]*data-action="change"/);

const [main, keyboard] = await Promise.all([
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
]);
assert.match(keyboard, /Screens\.ARCADE_RUSH_RESULTS[\s\S]*const actions = \["retry", "modes", "title"\][\s\S]*startArcadeRush\?\.\("retry"\)/);
assert.doesNotMatch(keyboard, /startDaily|DAILY_RESULTS/);
assert.match(main, /createGlobalKeyboardController\(\{/);
assert.doesNotMatch(main, /renderDailyResults|Screens\.DAILY_RESULTS/);
assert.equal(main.split('addEventListener("keydown"').length - 1, 1);

console.log("Campaign, Typing Test, Endless, and Arcade Rush result navigation remain wired without a Daily result surface.");
