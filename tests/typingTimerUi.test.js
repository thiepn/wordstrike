import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getSpeedTestConfig } from "../js/speedTestConfig.js";
import {
  getSpeedTestUpperOverlayGeometry,
  getSpeedTestWordBodyAnchor,
} from "../js/speedTestLayout.js";

const timerButtons = [];
const app = {
  html: "",
  set innerHTML(value) {
    this.html = value;
    timerButtons.length = 0;
    for (const match of value.matchAll(/data-speed-timer-position="([^"]+)"/g)) {
      timerButtons.push({ dataset: { speedTimerPosition: match[1] } });
    }
  },
  querySelector() { return null; },
  querySelectorAll(selector) { return selector === "[data-speed-timer-position]" ? timerButtons : []; },
};
globalThis.document = { querySelector: (selector) => selector === "#app" ? app : null };
const { renderSpeedTestRun } = await import("../js/ui.js");
const base = {
  config: getSpeedTestConfig("time-60"),
  phase: "PREPARING",
  words: ["word"],
  currentWordIndex: 0,
  typedBuffer: "",
};
const selected = [];
renderSpeedTestRun(base, false, { setTimerPosition: (value) => selected.push(value) });
assert.match(app.html, /speed-test-center-timer/);
assert.match(app.html, /speed-test-upper-overlay[\s\S]*speed-test-upper-overlay-content[\s\S]*speed-test-status[\s\S]*speed-test-center-timer/);
assert.match(app.html, /data-speed-timer-position="center"[^>]*aria-pressed="true"/);
timerButtons.find((button) => button.dataset.speedTimerPosition === "top").onclick();
assert.equal(selected.at(-1), "top");
renderSpeedTestRun({ ...base, timerPosition: "top" }, false, {});
assert.doesNotMatch(app.html, /speed-test-center-timer/);
assert.match(app.html, /speed-test-upper-overlay[\s\S]*speed-test-status/);
assert.match(app.html, /speed-test-hud[\s\S]*id="speed-test-primary"/);

const active = {
  ...base,
  phase: "ACTIVE",
  timerPosition: "center",
  currentWordIndex: 0,
  currentLineIndex: 0,
  verticalTranslation: 0,
  activeStartedAtMs: 1000,
  deadlineMs: 61000,
  typedBuffer: "wo",
};
renderSpeedTestRun(active, false, {});
active.timerPosition = "top";
renderSpeedTestRun(active, false, {});
assert.deepEqual({
  phase: active.phase,
  currentWordIndex: active.currentWordIndex,
  currentLineIndex: active.currentLineIndex,
  verticalTranslation: active.verticalTranslation,
  activeStartedAtMs: active.activeStartedAtMs,
  deadlineMs: active.deadlineMs,
  typedBuffer: active.typedBuffer,
}, {
  phase: "ACTIVE",
  currentWordIndex: 0,
  currentLineIndex: 0,
  verticalTranslation: 0,
  activeStartedAtMs: 1000,
  deadlineMs: 61000,
  typedBuffer: "wo",
});

const css = await readFile(new URL("../style.css", import.meta.url), "utf8");
assert.match(css, /\.speed-config-control\s*\{[^}]*font-size:\s*18px/s);
assert.match(css, /--speed-test-center-timer-size:\s*clamp\(26px/s);
assert.match(css, /font-variant-numeric:\s*tabular-nums/);
assert.match(css, /\.speed-test-word-region\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*transform:\s*translateY\(-50%\)/s);
assert.match(css, /\.speed-test-upper-overlay\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*display:\s*grid;[^}]*grid-template-rows:\s*minmax\(0, 1fr\) var\(--speed-test-word-viewport-height\) minmax\(0, 1fr\);[^}]*overflow:\s*hidden/s);
assert.match(css, /\.speed-test-upper-overlay-content\s*\{[^}]*position:\s*relative;[^}]*grid-row:\s*1/s);
assert.match(css, /\.speed-test-center-timer\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\)/s);
assert.match(css, /\.speed-test-status\s*\{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*max-width:[^;]+;[^}]*text-align:\s*center;[^}]*transform:\s*translate\(-50%, -100%\)/s);
assert.match(css, /\.speed-test-status\[hidden\]\s*\{[^}]*display:\s*block;[^}]*visibility:\s*hidden/s);

for (const stageHeight of [900, 620, 500, 260, 220]) {
  const centerAnchor = getSpeedTestWordBodyAnchor({ stageHeight, timerPosition: "center" });
  const topAnchor = getSpeedTestWordBodyAnchor({ stageHeight, timerPosition: "top" });
  assert.equal(centerAnchor, stageHeight / 2);
  assert.equal(topAnchor, centerAnchor);
}

const viewportScenarios = [
  { name: "1920x1080", stageHeight: 968, wordViewportHeight: 189, timerHeight: 76 },
  { name: "1366x768", stageHeight: 656, wordViewportHeight: 160, timerHeight: 54 },
  { name: "phone portrait", stageHeight: 696, wordViewportHeight: 100, timerHeight: 42 },
  { name: "phone landscape", stageHeight: 344, wordViewportHeight: 100, timerHeight: 34 },
  { name: "software keyboard", stageHeight: 220, wordViewportHeight: 80, timerHeight: 30 },
];
for (const scenario of viewportScenarios) {
  const geometry = getSpeedTestUpperOverlayGeometry(scenario);
  const topGap = geometry.timerCenter - scenario.timerHeight / 2;
  assert.equal(geometry.overlayHeight, geometry.wordViewportTop, scenario.name);
  assert.equal(geometry.timerCenter, geometry.overlayHeight / 2, scenario.name);
  assert.equal(geometry.timerToWordGap, topGap, scenario.name);
  assert.ok(geometry.timerToWordGap >= 8, `${scenario.name} needs a safe timer-to-word gap`);
  assert.deepEqual(
    getSpeedTestUpperOverlayGeometry({ ...scenario, statusVisible: false }),
    geometry,
    `${scenario.name} status visibility must not affect timer geometry`,
  );
}

console.log("Typing timer overlay is midpoint-centered, horizontally aligned, flow-independent, and word-anchor invariant across target viewports.");
