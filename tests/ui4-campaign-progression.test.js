import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { moveLevelGridSelection } from "../js/state.js";

const [ui, css, legacyCss, systemCss, index, appCss, main, modes] = await Promise.all([
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/campaign-progression.css", import.meta.url), "utf8"),
  readFile(new URL("../style.css", import.meta.url), "utf8"),
  readFile(new URL("../styles/ui-system.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles/app.css", import.meta.url), "utf8"),
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
]);

assert.match(index, /styles\/app\.css\?v=20260911v8/);
assert.doesNotMatch(index, /styles\/screens\/(?:mode-select|campaign-progression)\.css/);
assert.equal((appCss.match(/\.\/screens\/mode-select\.css/g) || []).length, 1);
assert.equal((appCss.match(/\.\/screens\/campaign-progression\.css/g) || []).length, 1);
assert.match(appCss, /\.\/screens\/mode-select\.css[\s\S]*\.\/screens\/campaign-progression\.css/);

assert.match(ui, /class="screen level-screen campaign-progress-screen/);
assert.match(ui, /class="campaign-progress-shell"/);
assert.match(ui, /class="campaign-mission-briefing/);
assert.match(ui, /class="campaign-route" id="campaign-route"/);
assert.match(ui, /data-campaign-sector="\$\{sector\}"/);
assert.match(ui, /class="campaign-node/);
assert.match(ui, /is-boss/);
assert.match(ui, /is-frontier/);
assert.match(ui, /aria-label="Campaign progression map"/);
assert.match(ui, /aria-current="\$\{level === safeSelected \? "true" : "false"\}"/);
assert.match(ui, /\.campaign-node:not\(:disabled\)/);
assert.match(ui, /data-campaign-route-scroll/);
assert.doesNotMatch(ui, /class="level-grid/);
assert.doesNotMatch(ui, /class="level-tile/);

assert.match(css, /WORDSTRIKE UI4/);
assert.match(css, /\.campaign-sector-track\{[^}]*grid-template-columns:repeat\(10/);
assert.match(css, /@media\(max-width:720px\)[\s\S]*\.campaign-sector-track\{[^}]*grid-template-columns:repeat\(5/);
assert.match(css, /\.campaign-node\{[^}]*min-width:44px[^}]*min-height:58px/);
assert.match(css, /\.campaign-node\.is-boss/);
assert.match(css, /prefers-reduced-motion:reduce/);
assert.doesNotMatch(css, /practice-lab/i);

assert.doesNotMatch(legacyCss, /\.level-grid(?:[\s,{.:])/);
assert.doesNotMatch(legacyCss, /\.level-tile(?:[\s,{.:])/);
assert.doesNotMatch(legacyCss, /\.level-screen\s*\{/);
assert.doesNotMatch(systemCss, /\.level-tile(?:[\s,{.:])/);

assert.match(main, /function getCampaignProgressionColumns\(\)/);
assert.match(main, /matchMedia\?\.\("\(max-width: 720px\)"\)/);
assert.match(main, /getCampaignProgressionColumns\(\),/);
assert.equal(moveLevelGridSelection(1, "ArrowDown", 100, 10), 11);
assert.equal(moveLevelGridSelection(11, "ArrowUp", 100, 10), 1);
assert.equal(moveLevelGridSelection(1, "ArrowDown", 100, 5), 6);
assert.equal(moveLevelGridSelection(6, "ArrowUp", 100, 5), 1);
assert.equal(moveLevelGridSelection(17, "ArrowDown", 17, 5), 17);
assert.equal(moveLevelGridSelection(1, "ArrowLeft", 17, 5), 1);
assert.equal(moveLevelGridSelection(17, "ArrowRight", 17, 5), 17);

// UI4 must not alter or special-case the disabled Practice Lab registry boundary.
assert.match(modes, /PRACTICE: "practice"/);
assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

console.log("UI4 Campaign progression source contracts passed: semantic V8 stylesheet ownership, route sectors, boss identity, responsive keyboard geometry, legacy retirement, and Practice exclusion.");
