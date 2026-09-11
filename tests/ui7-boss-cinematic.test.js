import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, appCss, presentationBootstrap, presentation, css, bossLoop, renderer, workflow, modes] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles/app.css", import.meta.url), "utf8"),
  readFile(new URL("../js/presentationBootstrap.js", import.meta.url), "utf8"),
  readFile(new URL("../js/bossGameplayPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/boss-gameplay.css", import.meta.url), "utf8"),
  readFile(new URL("../js/bossLoop.js", import.meta.url), "utf8"),
  readFile(new URL("../js/renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/non-practice-browser.yml", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
]);

assert.match(index, /styles\/app\.css\?v=20260911v8/);
assert.doesNotMatch(index, /styles\/screens\/boss-gameplay\.css|js\/bossGameplayPresentation\.js/);
assert.equal((appCss.match(/\.\/screens\/boss-gameplay\.css/g) || []).length, 1);
assert.match(appCss, /endless-gameplay\.css[\s\S]*boss-gameplay\.css[\s\S]*typing-test\.css/);
assert.equal((presentationBootstrap.match(/bossGameplayPresentation\.js/g) || []).length, 1);
assert.match(presentationBootstrap, /endlessGameplayPresentation\.js[\s\S]*bossGameplayPresentation\.js[\s\S]*arcadeRushGameplayPresentation\.js/);

assert.match(presentation, /import \{ appState \} from "\.\/state\.js"/);
assert.match(presentation, /BOSS_SCREEN_SELECTOR = "\.boss-screen"/);
assert.match(presentation, /boss-gameplay-screen/);
assert.match(presentation, /boss-gameplay-hud/);
assert.match(presentation, /boss-threat-sigil/);
assert.match(presentation, /data\.bossResolve|dataset\.bossResolve|data-boss-resolve/);
assert.match(presentation, /role", "progressbar"/);
assert.match(presentation, /Boss encounter completion/);
assert.match(presentation, /Current boss sequence progress/);
assert.match(presentation, /bossTier/);
assert.match(presentation, /introStep/);
assert.match(presentation, /timeTier/);
assert.match(presentation, /overallProgress/);
assert.match(presentation, /SEQUENCE BREACHED/);
assert.match(presentation, /\.gameplay-keyboard-trigger/);
assert.match(presentation, /boss-keyboard-trigger/);

for (const id of [
  "boss-phrase-count",
  "boss-word-count",
  "boss-timer",
  "boss-score",
  "boss-combo",
  "boss-wpm",
  "boss-accuracy",
]) {
  assert.ok(presentation.includes(`#${id}`), `UI7 must preserve #${id}`);
}

for (const forbidden of [
  "appState.game =",
  "localStorage",
  "sessionStorage",
  "fetch(",
  "calculateAccuracy",
  "calculateWPM",
  "recordCompletedSession",
]) {
  assert.equal(presentation.includes(forbidden), false, `Boss presentation must not own ${forbidden}`);
}
assert.doesNotMatch(presentation, /practiceLab|practice-lab/i);

assert.match(css, /UI7/);
assert.match(css, /\.boss-gameplay-screen/);
assert.match(css, /\.boss-gameplay-screen \.boss-gameplay-hud[\s\S]*border:\s*0/);
assert.match(css, /\.boss-threat-sigil/);
assert.match(css, /\.boss-resolve-meter/);
assert.match(css, /data-boss-time-tier="critical"/);
assert.match(css, /data-boss-tier="apex"/);
assert.match(css, /\.boss-gameplay-screen \.boss-current[\s\S]*background:\s*transparent/);
assert.match(css, /\.boss-gameplay-screen \.boss-combat-frame\.wrong[\s\S]*boss-ui-wrong/);
assert.match(css, /@media \(min-width: 761px\)[\s\S]*boss-keyboard-trigger[\s\S]*display:\s*none !important/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /@media \(max-width: 520px\) and \(max-height: 430px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(css, /\.campaign-gameplay-screen/);
assert.doesNotMatch(css, /\.endless-gameplay-screen/);
assert.doesNotMatch(css, /\.practice-lab-screen/);

// UI7 consumes the existing Boss state machine; it does not replace its timing/mechanics.
assert.match(bossLoop, /const INTRO_DURATION_MS = 2800/);
assert.match(bossLoop, /export const BOSS_TRANSITION_DURATION_MS = 350/);
assert.match(bossLoop, /phase: "INTRO"/);
assert.match(bossLoop, /game\.phase = "ACTIVE"/);
assert.match(bossLoop, /game\.phase = "TRANSITION"/);
assert.match(bossLoop, /game\.remainingMs = Math\.max\(0, game\.remainingMs - deltaMs\)/);
assert.match(bossLoop, /game\.remainingMs = Math\.max\(0, game\.remainingMs - chargedTransitionMs\)/);
assert.doesNotMatch(bossLoop, /bossGameplayPresentation/);

// Existing phrase renderer remains authoritative.
assert.match(renderer, /boss-phrase-size-normal/);
assert.match(renderer, /boss-phrase-size-dense/);
assert.match(renderer, /boss-phrase-size-extreme/);
assert.match(renderer, /boss-typed/);
assert.match(renderer, /boss-current/);
assert.match(renderer, /boss-remaining/);
assert.match(renderer, /export function flashBossWrong/);

assert.match(workflow, /Certify UI7 Boss cinematic gameplay/);
assert.match(workflow, /tests\/browser\/ui7_boss_gameplay\.py/);
assert.match(workflow, /tests\/browser\/ui7_boss_visual\.py/);
assert.match(workflow, /browser-artifacts\/ui7-boss-gameplay\//);

// Practice Lab stays disabled and outside the UI redesign boundary.
assert.match(modes, /PRACTICE: "practice"/);
assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

console.log("UI7 Boss source contracts passed: semantic V8 resource ownership, runtime-clock cinematic, Boss Resolve/sequence progress, phrase states, responsive/reduced-motion treatment, no fake HP, and Practice isolation.");
