import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, presentation, css, inputCss, renderer, workflow, modes, visualTest] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/campaignGameplayPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/campaign-gameplay.css", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/campaign-gameplay-input.css", import.meta.url), "utf8"),
  readFile(new URL("../js/renderer.js", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/non-practice-browser.yml", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
  readFile(new URL("./browser/ui5_campaign_visual.py", import.meta.url), "utf8"),
]);

assert.equal((index.match(/styles\/screens\/campaign-gameplay\.css/g) || []).length, 1);
assert.equal((index.match(/styles\/screens\/campaign-gameplay-input\.css/g) || []).length, 1);
assert.match(index, /campaign-progression\.css[\s\S]*campaign-gameplay\.css[\s\S]*campaign-gameplay-input\.css[\s\S]*practiceLabV20\.css/);
assert.equal((index.match(/js\/campaignGameplayPresentation\.js/g) || []).length, 1);
assert.match(index, /js\/main\.js[\s\S]*js\/campaignGameplayPresentation\.js/);

assert.match(presentation, /import \{ appState \} from "\.\/state\.js"/);
assert.match(presentation, /\.game-screen:not\(\.endless-screen\):not\(\.boss-screen\)/);
assert.match(presentation, /hud\.querySelector\("\.gameplay-pause-button"\)/);
assert.doesNotMatch(presentation, /\.game-back-control/);
assert.match(presentation, /campaign-gameplay-screen/);
assert.match(presentation, /campaign-gameplay-hud/);
assert.match(presentation, /campaign-core/);
assert.match(presentation, /MAX_INTEGRITY = 3/);
assert.match(presentation, /role", "progressbar"/);
assert.match(presentation, /Campaign mission progress/);
assert.match(presentation, /Campaign Core, integrity/);
assert.match(presentation, /TARGET LOCKED/);
assert.match(presentation, /CANDIDATES/);
assert.match(presentation, /\.gameplay-keyboard-trigger/);
assert.match(presentation, /campaign-keyboard-trigger/);
assert.match(presentation, /trigger\.textContent = "KEYBOARD"/);
assert.match(presentation, /Open gameplay keyboard/);
for (const id of ["hud-level", "hud-wpm", "hud-accuracy", "hud-lives", "hud-score", "hud-combo"]) {
  assert.match(presentation, new RegExp(`#${id}`), `UI5 must preserve #${id}`);
}
assert.doesNotMatch(presentation, /practice/i);
assert.doesNotMatch(presentation, /appState\.game\s*=/);
assert.doesNotMatch(presentation, /patchStateDomain|stateDomains\.|localStorage|sessionStorage|fetch\(/);

assert.match(css, /UI5/);
assert.match(css, /\.campaign-gameplay-screen/);
assert.match(css, /\.campaign-gameplay-screen \.campaign-gameplay-hud[\s\S]*border:\s*0/);
assert.match(css, /\.campaign-gameplay-screen \.campaign-core/);
assert.match(css, /data-core-integrity="1"/);
assert.match(css, /\.campaign-core-integrity/);
assert.match(css, /\.campaign-gameplay-screen \.word-visual\.active[\s\S]*border:\s*0[\s\S]*background:\s*transparent/);
assert.match(css, /\.campaign-gameplay-screen \.word-visual\.candidate[\s\S]*border:\s*0[\s\S]*ui-accent-special/);
assert.match(css, /\.campaign-gameplay-screen \.word-visual\.wrong[\s\S]*border:\s*0[\s\S]*ui-accent-danger/);
assert.match(css, /--campaign-burst-angle/);
assert.match(css, /--campaign-burst-reach/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /@media \(max-height: 430px\)/);
assert.match(css, /@media \(max-width: 520px\) and \(max-height: 430px\)[\s\S]*\.campaign-hud-pace \{ grid-area: pace; \}[\s\S]*\.campaign-hud-primary > \.campaign-hud-metric:nth-of-type\(2\) \{ grid-area: acc; \}/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(css, /\.endless-screen/);
assert.doesNotMatch(css, /\.boss-screen/);
assert.doesNotMatch(css, /practice-lab/i);

assert.match(inputCss, /\.campaign-gameplay-screen \.campaign-keyboard-trigger\s*\{[\s\S]*display:\s*none/);
assert.match(inputCss, /min-height:\s*44px/);
assert.match(inputCss, /border:\s*0/);
assert.match(inputCss, /@media \(max-width: 760px\), \(pointer: coarse\) and \(max-width: 1024px\)[\s\S]*\.campaign-gameplay-screen \.campaign-keyboard-trigger\s*\{[\s\S]*display:\s*block/);
assert.match(inputCss, /\.gameplay-input-dock\.keyboard-ready \.campaign-keyboard-trigger/);
assert.match(inputCss, /prefers-reduced-motion/);
assert.doesNotMatch(inputCss, /endless-screen|boss-screen|practice-lab/i);

assert.match(renderer, /\["wrong", "campaign-word-error"\]\.includes\(event\.animationName\)/);
assert.match(renderer, /--campaign-burst-angle/);
assert.match(renderer, /--campaign-burst-reach/);
assert.match(renderer, /Math\.atan2\(deltaY, deltaX\)/);
assert.match(renderer, /Math\.hypot\(deltaX, deltaY\)/);
assert.match(renderer, /campaignPrefersReducedMotion/);
assert.match(renderer, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
assert.match(renderer, /screenShake && !campaignPrefersReducedMotion\(area\)/);

assert.match(workflow, /Certify UI5 Campaign gameplay/);
assert.match(workflow, /tests\/browser\/ui5_campaign_gameplay\.py/);
assert.match(workflow, /tests\/browser\/ui5_campaign_visual\.py/);
assert.match(workflow, /browser-artifacts\/ui5-campaign-gameplay\//);
assert.match(visualTest, /\?seed=\{seed\}/);
assert.doesNotMatch(visualTest, /\?dev=1/);
assert.match(visualTest, /paceArea/);
assert.match(visualTest, /accuracyArea/);
assert.match(visualTest, /keyboardText.*KEYBOARD/s);
assert.match(visualTest, /keyboardHeight.*== 0/s);
assert.match(visualTest, /keyboardDisplay.*== "none"/s);
assert.match(visualTest, /keyboardHeight.*>= 44/s);
assert.match(visualTest, /390x360/);

// UI5 does not alter the disabled Practice Lab registry boundary.
assert.match(modes, /PRACTICE: "practice"/);
assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

console.log("UI5 Campaign gameplay source contracts passed: real Campaign control binding, scoped HUD/Core/word/input presentation, desktop/mobile keyboard visibility, clean visual evidence, short-mobile layout, renderer feedback, reduced motion, mode isolation, and Practice exclusion.");
