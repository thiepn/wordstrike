import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, css, ui, onboardingView, onboardingController, rushUi, modes, workflow] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/results-pause-onboarding.css", import.meta.url), "utf8"),
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  readFile(new URL("../js/onboardingView.js", import.meta.url), "utf8"),
  readFile(new URL("../js/onboarding.js", import.meta.url), "utf8"),
  readFile(new URL("../js/arcadeRush/arcadeRushUi.js", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/non-practice-browser.yml", import.meta.url), "utf8"),
]);

assert.equal((index.match(/styles\/screens\/results-pause-onboarding\.css/g) || []).length, 1);
assert.match(index, /arcade-rush-gameplay\.css[\s\S]*results-pause-onboarding\.css[\s\S]*practiceLabV20\.css/);

assert.match(css, /UI10 — Shared Results, Pause & Onboarding/);
assert.match(css, /\.results-screen,/);
assert.match(css, /\.speed-results-screen,/);
assert.match(css, /\.endless-results-screen,/);
assert.match(css, /\.arcade-rush-ui\.arcade-rush-results/);
assert.match(css, /\.results-panel > \.grade/);
assert.match(css, /\.speed-result-headline > div:first-child strong/);
assert.match(css, /\.endless-result-headline > div:first-child strong/);
assert.match(css, /\.arcade-rush-results-card \.arcade-rush-result-score/);
assert.match(css, /\.game-screen > \.pause-overlay/);
assert.match(css, /\.boss-screen > \.pause-overlay/);
assert.match(css, /\.endless-screen > \.pause-overlay/);
assert.match(css, /\.speed-test-screen > \.pause-overlay/);
assert.match(css, /data-rush-role="pause-overlay"/);
assert.match(css, /\.onboarding-backdrop/);
assert.match(css, /\.onboarding-dialog/);
assert.match(css, /\.onboarding-progress > span\.active/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /@media \(max-width: 760px\)/);
assert.match(css, /@media \(max-width: 520px\)/);
assert.match(css, /@media \(max-height: 520px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(css, /practice-lab|practiceLab|\.practice-/i);
assert.doesNotMatch(css, /\.settings-screen|\.profile-|\.leaderboard-/i);

// Existing result semantics and action contracts remain authoritative.
assert.match(ui, /export function renderResults\(/);
assert.match(ui, /const cleared = result\.grade !== "Fail"/);
assert.match(ui, /<div class="grade \$\{cleared/);
assert.match(ui, /result\.wpm/);
assert.match(ui, /result\.accuracy/);
assert.match(ui, /result\.score/);
assert.match(ui, /export function renderSpeedTestResults\(/);
assert.match(ui, /\["RETRY TEST", "retry"\]/);
assert.match(ui, /\["NEXT TEST", "change"\]/);
assert.match(ui, /export function renderEndlessResults\(/);
assert.match(ui, /\["RETRY", "retry"\]/);
assert.match(ui, /export function showPauseOverlay\(/);
assert.match(ui, /export function showEndlessPauseOverlay\(/);
assert.match(ui, /export function showSpeedTestPauseOverlay\(/);
assert.match(ui, /SPEED_TEST_PAUSE_ACTIONS/);
assert.match(ui, /\["RESUME", "resume"\]/);

// Onboarding behavior remains the existing versioned, modal, focus-trapped controller/view.
assert.match(onboardingView, /role="dialog" aria-modal="true"/);
assert.match(onboardingView, /data-onboarding-action="close"/);
assert.match(onboardingView, /data-onboarding-action="skip"/);
assert.match(onboardingView, /data-onboarding-action="previous"/);
assert.match(onboardingView, /event\.key === "Tab"/);
assert.match(onboardingView, /event\.key === "Escape"/);
assert.match(onboardingView, /primary\?\.focus/);
assert.match(onboardingController, /markTutorialSeen/);
assert.match(onboardingController, /shouldOpenAutomatically/);
assert.match(onboardingController, /source === "automatic"/);

// Rush keeps its AR6 result/pause port rather than acquiring a parallel state machine.
assert.match(rushUi, /"renderResults"/);
assert.match(rushUi, /PAUSE: "pause"/);
assert.match(rushUi, /RESUME: "resume"/);
assert.match(rushUi, /PLAY_AGAIN: "play-again"/);
assert.match(rushUi, /MODE_SELECT: "mode-select"/);
assert.match(rushUi, /MAIN_MENU: "main-menu"/);

// Practice remains unavailable publicly and is not part of UI10.
assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

assert.match(workflow, /Certify UI10 shared Results, Pause, and onboarding/);
assert.match(workflow, /tests\/browser\/ui10_results_pause_onboarding\.py/);
assert.match(workflow, /browser-artifacts\/ui10-results-pause-onboarding\//);

console.log("UI10 source contracts passed: shared presentation only, authoritative result/pause/onboarding behavior preserved, responsive/reduced-motion coverage, and Practice/UI11 isolation.");
