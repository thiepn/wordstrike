import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, presentation, css, runtime, config, ui, workflow, modes] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/arcadeRushGameplayPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/arcade-rush-gameplay.css", import.meta.url), "utf8"),
  readFile(new URL("../js/arcadeRush/arcadeRushRuntime.js", import.meta.url), "utf8"),
  readFile(new URL("../js/arcadeRush/arcadeRushConfig.js", import.meta.url), "utf8"),
  readFile(new URL("../js/arcadeRush/arcadeRushUi.js", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/non-practice-browser.yml", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
]);

assert.equal((index.match(/styles\/screens\/arcade-rush-gameplay\.css/g) || []).length, 1);
assert.equal((index.match(/js\/arcadeRushGameplayPresentation\.js/g) || []).length, 1);
assert.match(index, /typing-test-ui8-contract\.css[\s\S]*arcade-rush-gameplay\.css[\s\S]*practiceLabV20\.css/);
assert.match(index, /bossGameplayPresentation\.js[\s\S]*arcadeRushGameplayPresentation\.js/);

assert.match(presentation, /ARCADE_RUSH_STARTING_INTEGRITY/);
assert.match(presentation, /ARCADE_RUSH_WAVE_COUNT/);
assert.match(presentation, /getArcadeRushWaveProfile/);
assert.match(presentation, /arcade-rush-route-visual/);
assert.match(presentation, /arcade-rush-core-integrity/);
assert.match(presentation, /role", "progressbar"/);
assert.match(presentation, /Arcade Rush Core integrity/);
assert.match(presentation, /Core Breaker health/);
assert.match(presentation, /data\.ui9Wave/);
assert.match(presentation, /data\.ui9Integrity/);
assert.match(presentation, /data\.ui9ComboTier/);
assert.match(presentation, /data\.ui9Phase/);
assert.match(presentation, /attributeFilter:\s*\["hidden"\]/);
assert.doesNotMatch(presentation, /localStorage|sessionStorage|fetch\(|Supabase|leaderboard/i);
assert.doesNotMatch(presentation, /arcadeRushRuntime|arcadeRushScoring|buildArcadeRushSessionResult/);
assert.doesNotMatch(presentation, /practice/i);

assert.match(css, /UI9/);
assert.match(css, /\.arcade-rush-ui\.arcade-rush-ready \.arcade-rush-ready-card[\s\S]*border:\s*0[\s\S]*background:\s*transparent/);
assert.match(css, /\.arcade-rush-route-track/);
assert.match(css, /\.arcade-rush-ui\.arcade-rush-gameplay \.arcade-rush-hud[\s\S]*border:\s*0/);
assert.match(css, /\.arcade-rush-ui\.arcade-rush-gameplay \.arcade-rush-core[\s\S]*border:\s*0[\s\S]*background:\s*transparent/);
assert.match(css, /\.arcade-rush-core-integrity/);
assert.match(css, /data-ui9-integrity="1"/);
assert.match(css, /\.arcade-rush-ui\.arcade-rush-gameplay \.word-visual[\s\S]*border:\s*0[\s\S]*background:\s*transparent/);
assert.match(css, /\.word-visual\.active/);
assert.match(css, /\.word-visual\.candidate/);
assert.match(css, /\.word-visual\.wrong/);
assert.match(css, /data-rush-role="transition-overlay"/);
assert.match(css, /\.arcade-rush-boss-panel[\s\S]*border:\s*0/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /@media \(max-height: 430px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(css, /\.campaign-gameplay-screen|\.endless-gameplay-screen|\.boss-screen|practice-lab/i);

// UI9 is layered over the existing certified AR6 runtime/config/UI port.
assert.match(runtime, /export const ARCADE_RUSH_RUNTIME_VERSION = 2/);
assert.match(runtime, /ARCADE_RUSH_WAVE_TRANSITION_MS = 2_500/);
assert.match(runtime, /ARCADE_RUSH_BOSS_INTRO_MS = 2_500/);
assert.match(runtime, /calculateArcadeRushWordPoints/);
assert.match(runtime, /calculateArcadeRushWaveClearBonus/);
assert.match(runtime, /calculateArcadeRushPerfectWaveBonus/);
assert.doesNotMatch(runtime, /arcadeRushGameplayPresentation/);
assert.match(config, /name: "Ignition"/);
assert.match(config, /name: "Acceleration"/);
assert.match(config, /name: "Crossfire"/);
assert.match(config, /name: "Heavy Words"/);
assert.match(config, /name: "Overdrive"/);
assert.match(config, /name: "Critical"/);
assert.match(ui, /ARCADE_RUSH_UI_VERSION = 1/);
assert.match(ui, /data-rush-role="score"/);
assert.match(ui, /data-rush-role="combo"/);
assert.match(ui, /data-rush-role="core"/);
assert.match(ui, /data-rush-role="wave"/);
assert.match(ui, /data-rush-role="boss-panel"/);

assert.match(workflow, /Certify UI9 Arcade Rush unified gameplay/);
assert.match(workflow, /tests\/browser\/ui9_arcade_rush\.py/);
assert.match(workflow, /browser-artifacts\/ui9-arcade-rush\//);

// Practice remains disabled and outside UI9.
assert.match(modes, /PRACTICE: "practice"/);
assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

console.log("UI9 Arcade Rush source contracts passed: presentation-only route/HUD/Core/word/wave/boss treatment, responsive and reduced-motion coverage, AR6 runtime preservation, and Practice isolation.");
