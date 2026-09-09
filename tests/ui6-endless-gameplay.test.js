import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, presentation, css, renderer, endlessMode, config, workflow, modes] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/endlessGameplayPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/endless-gameplay.css", import.meta.url), "utf8"),
  readFile(new URL("../js/renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../js/endlessMode.js", import.meta.url), "utf8"),
  readFile(new URL("../js/endlessConfig.js", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/non-practice-browser.yml", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
]);

assert.equal((index.match(/styles\/screens\/endless-gameplay\.css/g) || []).length, 1);
assert.equal((index.match(/js\/endlessGameplayPresentation\.js/g) || []).length, 1);
assert.match(index, /campaign-gameplay-input\.css[\s\S]*endless-gameplay\.css[\s\S]*practiceLabV20\.css/);
assert.match(index, /campaignGameplayPresentation\.js[\s\S]*endlessGameplayPresentation\.js/);

assert.match(presentation, /import \{ ENDLESS_CONFIG, getEndlessWordsPerStage \} from "\.\/endlessConfig\.js"/);
assert.match(presentation, /import \{ getCurrentEndless \} from "\.\/endlessMode\.js"/);
assert.match(presentation, /ENDLESS_SCREEN_SELECTOR = "\.endless-screen"/);
assert.match(presentation, /endless-gameplay-screen/);
assert.match(presentation, /endless-gameplay-hud/);
assert.match(presentation, /endless-core/);
assert.match(presentation, /role", "progressbar"/);
assert.match(presentation, /Endless stage progress/);
assert.match(presentation, /Endless Core, integrity/);
assert.match(presentation, /TARGET LOCKED/);
assert.match(presentation, /CANDIDATES/);
assert.match(presentation, /formatSurvival/);
assert.match(presentation, /pressureTier/);
assert.match(presentation, /pressureTier\(activeWords, activeCap\)/);
assert.match(presentation, /endless-word-imminent/);
assert.match(presentation, /Math\.hypot/);
assert.match(presentation, /\.gameplay-keyboard-trigger/);
assert.match(presentation, /endless-keyboard-trigger/);
assert.match(presentation, /trigger\.textContent = "KEYBOARD"/);
assert.match(presentation, /#endless-stage-banner/);
assert.match(presentation, /aria-live", "polite"/);
for (const id of ["endless-stage", "endless-progress", "endless-score", "endless-integrity"]) {
  assert.match(presentation, new RegExp(`#${id}`), `UI6 must preserve #${id}`);
}
assert.doesNotMatch(presentation, /appState|localStorage|sessionStorage|fetch\(|recordCompletedSession|calculateEndlessScore/);
assert.doesNotMatch(presentation, /practice/i);

assert.match(css, /UI6/);
assert.match(css, /\.endless-gameplay-screen/);
assert.match(css, /\.endless-gameplay-screen \.endless-gameplay-hud[\s\S]*border:\s*0/);
assert.match(css, /\.endless-gameplay-screen \.endless-core/);
assert.match(css, /data-endless-integrity="1"/);
assert.match(css, /data-endless-pressure="high"/);
assert.match(css, /\.endless-word-imminent/);
assert.match(css, /\.word-visual\.active[\s\S]*border:\s*0[\s\S]*ui-accent/);
assert.match(css, /\.word-visual\.candidate[\s\S]*border:\s*0[\s\S]*ui-accent-special/);
assert.match(css, /\.word-visual\.wrong[\s\S]*endless-word-error/);
assert.match(css, /\.endless-stage-transition/);
assert.match(css, /\.endless-keyboard-trigger/);
assert.match(css, /@media \(min-width: 761px\)[\s\S]*endless-keyboard-trigger[\s\S]*display:\s*none !important/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /@media \(max-width: 520px\) and \(max-height: 430px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(css, /\.campaign-gameplay-screen/);
assert.doesNotMatch(css, /\.boss-screen/);
assert.doesNotMatch(css, /practice-lab/i);

assert.match(renderer, /"endless-word-error"/);
assert.match(renderer, /gameplayPresentationPrefersReducedMotion/);
assert.ok(
  renderer.includes('".campaign-gameplay-screen, .endless-gameplay-screen"'),
  "reduced-motion renderer boundary must include Campaign and Endless screens",
);
assert.match(renderer, /screenShake && !gameplayPresentationPrefersReducedMotion\(area\)/);

// UI6 is presentation-only: core Endless mechanics/config remain untouched and authoritative.
assert.match(config, /startingIntegrity:\s*3/);
assert.match(config, /stageBannerMs:\s*1250/);
assert.match(config, /initialSpawnIntervalMs:\s*1700/);
assert.match(config, /lateGameSpawnIntervalMs:\s*803/);
assert.match(config, /maxActiveWords:\s*9/);
assert.match(endlessMode, /function advanceEndlessStage/);
assert.match(endlessMode, /processEndlessCoreBreach/);
assert.match(endlessMode, /calculateEndlessScore/);
assert.doesNotMatch(endlessMode, /endlessGameplayPresentation/);

assert.match(workflow, /Certify UI6 Endless gameplay/);
assert.match(workflow, /tests\/browser\/ui6_endless_gameplay\.py/);
assert.match(workflow, /tests\/browser\/ui6_endless_visual\.py/);
assert.match(workflow, /browser-artifacts\/ui6-endless-gameplay\//);

// Practice Lab registry stays disabled and outside UI6.
assert.match(modes, /PRACTICE: "practice"/);
assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

console.log("UI6 Endless gameplay source contracts passed: presentation-only HUD/Core/pressure/risk/stage/input treatment, reduced motion, mode isolation, and Practice exclusion.");
