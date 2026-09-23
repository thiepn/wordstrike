import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAllModes, MODE_IDS } from "../js/modes.js";

const [ui, css, legacyCss, systemCss, index, keyboard, modesSource] = await Promise.all([
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/mode-select.css", import.meta.url), "utf8"),
  readFile(new URL("../style.css", import.meta.url), "utf8"),
  readFile(new URL("../styles/ui-system.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
]);

const modes = getAllModes();
assert.deepEqual(modes.map(({ id }) => id), [
  MODE_IDS.CAMPAIGN,
  MODE_IDS.SPEED_TEST,
  MODE_IDS.ENDLESS,
  MODE_IDS.FLOW,
  MODE_IDS.PRACTICE,
]);
assert.deepEqual(modes.map(({ enabled }) => enabled), [true, true, true, true, true]);
assert.deepEqual(modes.slice(-2).map(({ status }) => status), ["available", "available"]);

assert.match(index, /styles\/ui-system\.css[\s\S]*styles\/screens\/title\.css[\s\S]*styles\/screens\/mode-select\.css/);
assert.match(index, /js\/flow\/flowRuntimeLoader\\.js\\?v=20260923b/);
assert.match(ui, /<section class="screen mode-screen mode-select-screen">/);
assert.match(ui, /class="mode-select-shell"/);
assert.match(ui, /class="mode-showcase mode-tone-\$\{toneFor\(selectedMode\)\}"/);
assert.match(ui, /<nav class="mode-options" aria-label="Game modes">/);
assert.match(ui, /class="mode-option available\$\{selectedClass\(index\)\}"/);
assert.match(ui, /class="mode-option coming-soon\$\{selectedClass\(index\)\}"/);
assert.match(ui, /data-mode-home-index="\$\{modes\.length\}"/);
assert.match(ui, /tabindex="-1"/);
assert.match(ui, /aria-disabled="true"/);
assert.match(ui, /aria-current="true"/);
assert.match(ui, /mode\.id === "campaign"/);
assert.match(ui, /mode\.id === "speed-test"/);
assert.match(ui, /mode\.id === "endless"/);
// Hidden legacy Rush presentation branches may remain for developer compatibility.
// Flow is now public but intentionally retains the calm neutral Mode Select motif.
assert.match(ui, /mode\.id === "arcade-rush"/);
assert.doesNotMatch(ui, /mode\.id === "flow"/);
assert.doesNotMatch(ui, /mode\.id === "practice"/);
assert.doesNotMatch(ui, /class="mode-card/);
assert.doesNotMatch(ui, /class="mode-grid/);
assert.doesNotMatch(ui, /class="mode-panel/);
assert.match(ui, /card\.onmousemove = \(\) => handlers\.select\?\.\(index\)/);
assert.match(ui, /titleButton\.onmousemove = \(\) => handlers\.select\?\.\(modes\.length\)/);
assert.doesNotMatch(ui, /card\.onmouseenter = \(\) => handlers\.select/);
assert.doesNotMatch(ui, /titleButton\.onmouseenter = \(\) => handlers\.select/);

assert.match(css, /WORDSTRIKE UI3 — MODE SELECT/);
assert.match(css, /\.mode-showcase/);
assert.match(css, /\.mode-motif-campaign/);
assert.match(css, /\.mode-motif-typing/);
assert.match(css, /\.mode-motif-endless/);
assert.match(css, /\.mode-motif-rush/);
assert.match(css, /\.mode-motif-neutral/);
assert.match(css, /\.mode-option\.coming-soon/);
assert.match(css, /\.mode-home-action/);
assert.match(css, /prefers-reduced-motion/);
assert.doesNotMatch(css, /\.practice-lab/);
assert.doesNotMatch(css, /data-mode-id="practice"/);

assert.doesNotMatch(legacyCss, /\.mode-panel\s*\{/);
assert.doesNotMatch(legacyCss, /\.mode-grid\s*\{/);
assert.doesNotMatch(legacyCss, /\.mode-card\s*\{/);
assert.doesNotMatch(legacyCss, /\.mode-menu-action\s*\{/);
assert.doesNotMatch(legacyCss, /\.mode-description\s*\{/);
assert.doesNotMatch(systemCss, /\.mode-card(?:[,.\s:{])/);
assert.doesNotMatch(systemCss, /\.mode-panel(?:[,.\s:{])/);

assert.match(keyboard, /const itemCount = getAllModes\(\)\.length \+ 1/);
assert.match(keyboard, /event\.key === "ArrowUp" \|\| event\.key === "ArrowLeft"/);
assert.match(keyboard, /event\.key === "ArrowDown" \|\| event\.key === "ArrowRight"/);
assert.match(keyboard, /state\.modeSelection === getAllModes\(\)\.length\) openTitle\(\)/);
assert.match(keyboard, /else if \(event\.key === "Escape"\) \{\s*openTitle\(\)/s);

// UI3 is presentation-only. The registry now exposes Flow as a launchable release
// mode alongside Practice; hidden Rush
// remains available only through explicit compatibility access.
assert.match(modesSource, /FLOW: "flow"/);
assert.match(modesSource, /id: MODE_IDS\.FLOW,[\s\S]*enabled: true,[\s\S]*visible: true,[\s\S]*status: "available",[\s\S]*route: "flow-release"/);
assert.match(modesSource, /PRACTICE: "practice"/);
assert.match(modesSource, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: true,[\s\S]*visible: true,[\s\S]*status: "available",[\s\S]*route: "practice-lab"/);
assert.match(modesSource, /id: MODE_IDS\.ARCADE_RUSH,[\s\S]*enabled: true,[\s\S]*visible: false,[\s\S]*status: "retired",[\s\S]*route: null/);

console.log("UI3 source contracts passed: five public registry slots, five launchable modes including Flow and Practice, hidden Rush compatibility, and unchanged six-position navigation.");
