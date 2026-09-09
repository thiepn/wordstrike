import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bossPresentation, ui12Presentation, ui12Css, uiSource, modes] = await Promise.all([
  readFile(new URL("../js/bossGameplayPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../js/ui12GlobalPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/ui12-global-polish.css", import.meta.url), "utf8"),
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
]);

// Boss HUD: the authoritative count already includes the SEQUENCE label.
assert.match(uiSource, /id="boss-phrase-count">SEQUENCE 1 \/ \$\{config\.segmentCount\}/);
assert.match(bossPresentation, /sequence\.append\(phraseCount\)/);
assert.doesNotMatch(bossPresentation, /sequence\.append\(label\("SEQUENCE"\),\s*phraseCount\)/);

// Audio is a UI12-owned setting but mirrors the compact UI11 switch grammar.
assert.match(ui12Presentation, /class="ui12-sound-toggle/);
assert.doesNotMatch(ui12Presentation, /class="toggle ui12-sound-toggle/);
assert.match(ui12Presentation, /data-ui12-sound-toggle role="switch"/);
assert.doesNotMatch(ui12Presentation, /ui12-sound-toggle-track/);
assert.match(ui12Css, /\.settings-screen \.ui12-sound-toggle\[role="switch"\][\s\S]*min-width:\s*4\.25rem[\s\S]*min-height:\s*44px[\s\S]*border-radius:\s*999px/);

// Mobile/touch cleanup must remove desktop keyboard legends without deleting desktop markup.
assert.match(uiSource, /title-keyboard-hint/);
assert.match(uiSource, /mode-select-hint/);
assert.match(uiSource, /campaign-progress-footer/);
assert.match(ui12Css, /@media \(max-width: 680px\), \(hover: none\), \(pointer: coarse\)[\s\S]*\.title-keyboard-hint,[\s\S]*\.mode-select-hint,[\s\S]*\.campaign-progress-footer > span:first-child[\s\S]*display:\s*none/);
assert.match(ui12Css, /\.mode-showcase-command kbd,[\s\S]*\.campaign-mission-command kbd,[\s\S]*\.gameplay-control-button kbd[\s\S]*display:\s*none/);
assert.match(ui12Css, /\.campaign-progress-footer\s*\{\s*justify-content:\s*flex-end/);

// Coming-soon modes stay non-interactive but must remain readable.
assert.match(ui12Css, /\.mode-select-screen \.mode-option\.coming-soon\s*\{\s*opacity:\s*0\.8/);
assert.match(ui12Css, /\.mode-select-screen \.mode-option\.coming-soon\.selected\s*\{\s*opacity:\s*1/);
assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

// The forensic pass must not weaken the established Practice styling boundary.
assert.match(ui12Css, /#app > \.screen:not\(\.practice-lab-screen\)/);
assert.doesNotMatch(ui12Css, /(^|\n)\s*\.practice-lab-screen\s*\{/);

console.log("Forensic visual QA source contracts passed: Boss label uniqueness, Settings switch grammar, mobile/touch hint cleanup, disabled-mode legibility, and Practice isolation.");
