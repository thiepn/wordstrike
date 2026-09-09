import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, css, presentation, audio, storage, designSystem, modes, workflow] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/ui12-global-polish.css", import.meta.url), "utf8"),
  readFile(new URL("../js/ui12GlobalPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../js/uiAudio.js", import.meta.url), "utf8"),
  readFile(new URL("../js/storage.js", import.meta.url), "utf8"),
  readFile(new URL("../docs/UI_DESIGN_SYSTEM.md", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/non-practice-browser.yml", import.meta.url), "utf8"),
]);

assert.equal((index.match(/styles\/screens\/ui12-global-polish\.css/g) || []).length, 1);
assert.equal((index.match(/js\/ui12GlobalPresentation\.js/g) || []).length, 1);
assert.match(index, /profile-leaderboards-settings-ui11-contract\.css[\s\S]*ui12-global-polish\.css[\s\S]*practiceLabV20\.css/);
assert.match(index, /profileLeaderboardsSettingsPresentation\.js[\s\S]*ui12GlobalPresentation\.js/);

assert.match(storage, /soundEffects:\s*false/);
assert.match(storage, /soundEffects:\s*value\.settings\?\.soundEffects === true/);
assert.match(storage, /export function updateSetting\(/);

assert.match(audio, /AudioContext \|\| globalThis\.webkitAudioContext/);
assert.match(audio, /createOscillator\(\)/);
assert.match(audio, /createGain\(\)/);
assert.match(audio, /if \(!enabled\) return false/);
assert.match(audio, /export function setUiAudioEnabled/);
assert.match(audio, /export function playUiAudio/);
assert.doesNotMatch(audio, /fetch\(|new Audio\(|\.mp3|\.wav|\.ogg/i);
assert.doesNotMatch(audio, /autoplay\s*=/i);
assert.doesNotMatch(audio, /\.play\s*\(/);

assert.match(presentation, /import \{ appState \} from "\.\/state\.js"/);
assert.match(presentation, /import \{ updateSetting \} from "\.\/storage\.js"/);
assert.match(presentation, /data-ui12-sound-toggle/);
assert.match(presentation, /role="switch" aria-checked/);
assert.match(presentation, /updateSetting\(appState\.save, "soundEffects", next\)/);
assert.match(presentation, /Typing itself stays silent/);
assert.match(presentation, /isPracticeTarget/);
assert.match(presentation, /\.practice-lab-screen/);
assert.match(presentation, /new MutationObserver/);
assert.doesNotMatch(presentation, /leaderboardService|statistics\.js|gameLoop|bossLoop|endlessMode|arcadeRushRuntime|scoring\.js/);

assert.match(css, /UI12 — Final motion \/ audio \/ global consistency pass/);
assert.match(css, /#app > \.screen:not\(\.practice-lab-screen\)/);
assert.doesNotMatch(css, /(^|\n)\s*::selection\s*\{/);
assert.match(css, /#app > \.screen:not\(\.practice-lab-screen\)::selection/);
assert.match(css, /\.onboarding-root::selection/);
assert.match(css, /\.ui12-audio-setting/);
assert.match(css, /\.ui12-sound-toggle/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /@media \(hover: none\), \(pointer: coarse\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /animation-duration:\s*0\.001ms !important/);
assert.match(css, /transition-duration:\s*0\.001ms !important/);
assert.doesNotMatch(css, /transition:\s*all/i);

assert.match(designSystem, /UI12 — final motion\/audio\/responsive\/accessibility polish/);
assert.match(designSystem, /Motion explains state changes/);
assert.match(designSystem, /prefers-reduced-motion/);

assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

assert.match(workflow, /Certify UI12 final motion, audio, and consistency/);
assert.match(workflow, /tests\/browser\/ui12_final_polish\.py/);
assert.match(workflow, /browser-artifacts\/ui12-final-polish\//);

console.log("UI12 source contracts passed: opt-in lazy audio, global interaction/reduced-motion polish, authoritative save integration, and Practice isolation.");
