import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createGameplayViewportController } from "../js/gameplayViewport.js";
import { getSpeedTestLineWindow, isConstrainedSpeedTestLayout } from "../js/speedTestLayout.js";

for (const scenario of [
  { width: 1440, height: 900, coarse: false, short: false },
  { width: 1440, height: 480, coarse: false, short: false },
  { width: 1024, height: 300, coarse: false, short: false },
  { width: 390, height: 844, coarse: true, short: false },
  { width: 390, height: 340, coarse: true, short: true },
  { width: 844, height: 390, coarse: true, short: true },
]) {
  const classes = new Set();
  const body = { classList: { add: (x) => classes.add(x), remove: (x) => classes.delete(x), toggle: (x, active) => active ? classes.add(x) : classes.delete(x), contains: (x) => classes.has(x) } };
  const visualViewport = { ...scenario };
  const win = { innerWidth: scenario.width, innerHeight: scenario.height, matchMedia: () => ({ matches: scenario.coarse }) };
  const controller = createGameplayViewportController({ documentObject: { body, documentElement: { style: { setProperty() {}, removeProperty() {} } } }, windowObject: win, visualViewport });
  assert.equal(classes.has("gameplay-viewport-short"), scenario.short, JSON.stringify(scenario));
  const constrained = isConstrainedSpeedTestLayout({ body, matchMedia: () => ({ matches: scenario.width <= 760 || (scenario.coarse && scenario.height <= 700) }) });
  assert.equal(getSpeedTestLineWindow({ currentLineIndex: 2, lineCount: 10, constrained }).visibleLineCount, constrained ? 2 : 3);
  visualViewport.height = 900;
  controller.update();
  assert.equal(classes.has("gameplay-viewport-short"), false);
  controller.destroy();
  assert.equal(classes.size, 0);
}

// Catch unmatched media/rule braces instead of merely searching for CSS strings.
const css = (await readFile(new URL("../style.css", import.meta.url), "utf8"))
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
let depth = 0;
for (const character of css) {
  if (character === "{") depth += 1;
  if (character === "}") depth -= 1;
  assert.ok(depth >= 0, "a CSS block closes without a matching opening brace");
}
assert.equal(depth, 0, "CSS blocks must balance");
assert.doesNotMatch(css, /\.speed-test-controls-wrap[^{}]*\{[^}]*display:\s*none/s);
console.log("Short desktop stays three-row; touch/narrow layouts remain compact; essential controls and CSS scope are protected.");
