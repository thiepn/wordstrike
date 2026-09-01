import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getSpeedTestConfig } from "../js/speedTestConfig.js";

class Button {
  constructor(attributes = {}) {
    this.dataset = attributes;
    this.disabled = false;
  }
  focus() {}
}

const app = {
  html: "",
  buttons: [],
  set innerHTML(value) {
    this.html = value;
    this.buttons = [
      ...[...value.matchAll(/data-action="([^"]+)"/g)].map(
        (match) => new Button({ action: match[1] }),
      ),
      ...[...value.matchAll(/data-speed-config="([^"]+)"/g)].map(
        (match) => new Button({ speedConfig: match[1] }),
      ),
      ...[...value.matchAll(/data-speed-category="([^"]+)"/g)].map(
        (match) => new Button({ speedCategory: match[1] }),
      ),
    ];
  },
  querySelector(selector) {
    const action = selector.match(/data-action="([^"]+)"/)?.[1];
    if (action) return this.buttons.find((button) => button.dataset.action === action) || null;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === "[data-speed-config]") {
      return this.buttons.filter((button) => button.dataset.speedConfig);
    }
    if (selector === "[data-speed-category]") {
      return this.buttons.filter((button) => button.dataset.speedCategory);
    }
    if (selector === ".speed-results-panel .arcade-button") {
      return this.buttons.filter((button) => button.dataset.action);
    }
    return [];
  },
};
globalThis.document = {
  querySelector(selector) {
    if (selector === "#app") return app;
    if (selector === "#speed-test-word-viewport") return globalThis.layoutViewport || null;
    if (selector === "#speed-test-word-flow") return globalThis.layoutFlow || null;
    return null;
  },
};

const {
  renderSpeedTestResults,
  renderSpeedTestRun,
  measureSpeedTestLayout,
  speedWordMarkup,
} = await import("../js/ui.js");

const configCalls = [];
renderSpeedTestRun({
  config: getSpeedTestConfig("time-60"),
  phase: "PREPARING",
  words: ["word", "apple"],
  currentWordIndex: 0,
  typedBuffer: "",
}, false, {
  selectConfig: (configId) => configCalls.push(configId),
});
assert.match(app.html, /data-speed-category="time"/);
assert.match(app.html, /data-speed-category="words"/);
assert.match(app.html, /data-speed-config="time-60"/);
assert.match(app.html, /ENGLISH 200/);
assert.match(app.html, /tabindex="-1"/);
assert.match(app.html, /START TYPING/);
assert.match(app.html, /speed-test-caret/);
assert.doesNotMatch(app.html, /CHOOSE A TEST|START 60 SECONDS|CURRENT/);
assert.doesNotMatch(app.html, /ENGLISH 199|ENGLISH 1K|word-set-select/i);
assert.doesNotMatch(app.html, /LIVES|COMBO|MODIFIER/);
app.buttons.find((button) => button.dataset.speedCategory === "words").onclick();
assert.equal(configCalls.at(-1), "words-50");

renderSpeedTestRun({
  config: getSpeedTestConfig("words-10"),
  phase: "PREPARING",
  words: Array(10).fill("word"),
  currentWordIndex: 0,
  typedBuffer: "",
}, false, {
  selectConfig: (configId) => configCalls.push(configId),
});
assert.match(app.html, /data-speed-config="words-10"[\s\S]*data-speed-config="words-25"[\s\S]*data-speed-config="words-50"[\s\S]*data-speed-config="words-100"/);
app.buttons.find((button) => button.dataset.speedConfig === "words-10").onclick();
assert.equal(configCalls.at(-1), "words-10");

const wordNodes = [0, 0, 50, 50, 100, 100, 150].map((offsetTop, index) => ({
  offsetTop,
  dataset: { speedWordIndex: String(index) },
}));
globalThis.layoutViewport = { clientHeight: 130, scrollTop: 99 };
globalThis.layoutFlow = {
  scrollHeight: 220,
  style: {},
  querySelectorAll() { return wordNodes; },
};
const layoutState = {
  currentWordIndex: 0,
  currentLineIndex: 0,
  previousLineIndex: 0,
  lineMap: [],
  verticalTranslation: 99,
};
assert.equal(measureSpeedTestLayout(layoutState).verticalTranslation, 0);
assert.equal(layoutState.currentLineIndex, 0);
assert.equal(globalThis.layoutViewport.scrollTop, 0);
layoutState.currentWordIndex = 4;
assert.equal(measureSpeedTestLayout(layoutState).verticalTranslation, 50);
layoutState.currentWordIndex = 6;
assert.equal(measureSpeedTestLayout(layoutState).verticalTranslation, 90);
delete globalThis.layoutViewport;
delete globalThis.layoutFlow;

renderSpeedTestRun({
  config: getSpeedTestConfig("words-50"),
  phase: "ACTIVE",
  words: ["word"],
  currentWordIndex: 0,
  typedBuffer: "w",
}, false);
assert.match(app.html, /data-speed-category="time" disabled/);
assert.match(app.html, /data-speed-config="words-50" disabled/);

assert.match(speedWordMarkup("word", ""), /caret.*pending/s);
assert.match(speedWordMarkup("word", "w"), /correct.*caret.*pending/s);
assert.match(speedWordMarkup("word", "word"), /correct">d<\/span><span class="speed-test-caret"/);
assert.match(speedWordMarkup("word", "wordx"), /speed-test-extra.*x.*speed-test-caret/s);
assert.doesNotMatch(speedWordMarkup("word", "word", false), /speed-test-caret/);

const calls = [];
renderSpeedTestResults({
  variantId: "time",
  wpm: 60.5,
  accuracy: 95.2,
  activeDurationMs: 15000,
  score: null,
  grade: null,
  characters: { correct: 70, incorrect: 3, missed: 2 },
  words: { completed: 15 },
  modeData: {
    metricVersion: 2,
    durationSeconds: 15,
    targetWordCount: null,
    rawWpm: 65.4,
    extraCharacters: 1,
    backspaces: 2,
    wordDeletes: 1,
    exactWords: 14,
    incorrectWords: 1,
  },
}, {
  newWpmRecord: true,
  newAccuracyRecord: true,
}, 1, {
  retry: () => calls.push("retry"),
  change: () => calls.push("change"),
  modes: () => calls.push("modes"),
  title: () => calls.push("title"),
  select() {},
});
assert.match(app.html, /TEST COMPLETE/);
assert.match(app.html, /ENGLISH 200/);
assert.match(app.html, /60\.5/);
assert.match(app.html, /65\.4/);
assert.match(app.html, /NEW WPM RECORD/);
assert.match(app.html, /Characters.*70 correct \/ 3 incorrect/s);
assert.match(app.html, /Word deletes.*1/s);
assert.match(app.html, /RETRY TEST/);
assert.match(app.html, /NEXT TEST/);
assert.doesNotMatch(app.html, /RETRY SAME TEST|CHANGE TEST/);
assert.match(app.html, /data-action="change"[^>]*>NEXT TEST<\/button>/);
assert.doesNotMatch(app.html, /GRADE|LIVES|BOSS|CAMPAIGN SCORE|speed-test-caret/);
app.querySelector('[data-action="retry"]').onclick();
assert.equal(calls.at(-1), "retry");

renderSpeedTestResults({
  variantId: "words",
  wpm: 72,
  accuracy: 100,
  activeDurationMs: 10000,
  characters: { correct: 50, incorrect: 0, missed: 0 },
  modeData: {
    targetWordCount: 10,
    rawWpm: 72,
    extraCharacters: 0,
    backspaces: 0,
    wordDeletes: 0,
    exactWords: 10,
    incorrectWords: 0,
  },
}, { newWpmRecord: false, newAccuracyRecord: false }, 0, {});
assert.match(app.html, /10 WORD TEST/);
assert.match(app.html, /10 exact \/ 0 incorrect/);

const css = await readFile(new URL("../style.css", import.meta.url), "utf8");
assert.match(css, /\.speed-test-caret[^}]*width:\s*0/s);
assert.match(css, /\.speed-test-caret::after[^}]*width:\s*2px/s);
assert.match(css, /\.speed-test-char-incorrect[^}]*text-decoration/s);
assert.match(css, /\.speed-test-word-viewport[^}]*overflow:\s*hidden/s);
assert.match(css, /\.speed-test-word-flow[^}]*font-variant-ligatures:\s*none/s);
assert.match(css, /\.speed-test-word-flow[^}]*padding:\s*0 10px/s);
assert.doesNotMatch(css, /\.speed-test-word-current::before/);
assert.doesNotMatch(css, /\.speed-setup-/);
assert.match(css, /\.speed-test-config,\s*\.speed-test-controls-wrap,\s*\.speed-test-hud\s*\{[^}]*flex-wrap:\s*wrap/s);

const [mainSource, keyboardSource, uiSource] = await Promise.all([
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
]);
assert.match(mainSource, /speedTestResultsReadyAt/);
assert.match(keyboardSource, /isResultsInputBlocked\(/);
assert.match(mainSource, /route === "speed-test"/);
assert.match(mainSource, /appState\.speedTestConfigId = DEFAULT_SPEED_TEST_CONFIG_ID/);
assert.match(mainSource, /change:\s*\(\) => resetSpeedTestAttempt\("change-test"\)/);
assert.match(mainSource, /const attemptSeed = getAttemptSeed\(\)/);
assert.match(mainSource, /event\.key === "Tab"[\s\S]*resetSpeedTestAttempt\("tab-reset"\)/);
assert.match(mainSource, /pauseTypingTest\(\)/);
assert.match(mainSource, /modes:\s*openModeSelect/);
assert.match(keyboardSource, /state\.screen === Screens\.SPEED_TEST_RESULTS/);
assert.match(uiSource, /RESUME[\s\S]*RESTART TEST[\s\S]*MODE SELECT[\s\S]*MAIN MENU/);
assert.doesNotMatch(uiSource, /QUIT TEST/);
assert.doesNotMatch(mainSource, /moveSpeedTestConfigSelection/);
assert.doesNotMatch(mainSource, /SPEED_TEST_SETUP|openSpeedTestSetup|renderSpeedTestSetup/);

console.log("Typing Test direct-ready UI, inline controls, caret, clean viewport, and grouped Results tests passed.");
