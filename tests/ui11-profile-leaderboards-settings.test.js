import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [index, appCss, presentationBootstrap, css, narrowContract, presentation, statisticsUi, leaderboardUi, ui, modes, workflow] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../styles/app.css", import.meta.url), "utf8"),
  readFile(new URL("../js/presentationBootstrap.js", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/profile-leaderboards-settings.css", import.meta.url), "utf8"),
  readFile(new URL("../styles/screens/profile-leaderboards-settings-ui11-contract.css", import.meta.url), "utf8"),
  readFile(new URL("../js/profileLeaderboardsSettingsPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../js/statisticsUi.js", import.meta.url), "utf8"),
  readFile(new URL("../js/leaderboardUi.js", import.meta.url), "utf8"),
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  readFile(new URL("../js/modes.js", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/non-practice-browser.yml", import.meta.url), "utf8"),
]);

assert.match(index, /styles\/app\.css\?v=20260911v8/,
  "V8 should expose UI11 through the semantic application stylesheet boundary");
assert.doesNotMatch(index, /styles\/screens\/profile-leaderboards-settings(?:-ui11-contract)?\.css/,
  "UI11 styles must not return as direct index.html resources");
assert.equal((appCss.match(/\.\/screens\/profile-leaderboards-settings\.css/g) || []).length, 1);
assert.equal((appCss.match(/\.\/screens\/profile-leaderboards-settings-ui11-contract\.css/g) || []).length, 1);
assert.match(appCss, /results-pause-onboarding\.css[\s\S]*profile-leaderboards-settings\.css[\s\S]*profile-leaderboards-settings-ui11-contract\.css[\s\S]*practice-lab\.css/,
  "V8 must preserve UI11 cascade placement before Practice Lab");
assert.doesNotMatch(index, /js\/profileLeaderboardsSettingsPresentation\.js/,
  "UI11 presentation must load through presentationBootstrap.js");
assert.match(presentationBootstrap, /arcadeRushGameplayPresentation\.js[\s\S]*profileLeaderboardsSettingsPresentation\.js/,
  "presentationBootstrap must preserve Arcade Rush → UI11 presentation order");

assert.match(css, /UI11 — Profile \/ Leaderboards \/ Settings/);
assert.match(css, /\.profile-stats-screen\[data-ui11-surface="profile"\]/);
assert.match(css, /\.leaderboards-screen\[data-ui11-surface="leaderboards"\]/);
assert.match(css, /\.settings-screen\[data-ui11-surface="settings"\]/);
assert.match(css, /grid-template-areas:[\s\S]*"tabs panel"/);
assert.match(css, /\.leaderboard-table-head,/);
assert.match(css, /\.leaderboard-row\.viewer-row/);
assert.match(css, /\.settings-account-management/);
assert.match(css, /\.toggle\[role="switch"\]/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /@media \(max-width: 900px\)/);
assert.match(css, /@media \(max-width: 680px\)/);
assert.match(css, /@media \(max-height: 430px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.doesNotMatch(css, /\.game-screen|\.boss-screen|\.speed-test-screen|\.endless-screen|arcade-rush-gameplay/);
assert.doesNotMatch(css, /practice-lab|practiceLab|\.practice-/i);

// The narrow visual contract prevents the mobile GLOBAL LEADERBOARDS heading from orphaning its final letter.
assert.match(narrowContract, /UI11 narrow-screen visual contract/);
assert.match(narrowContract, /@media \(max-width: 680px\)/);
assert.match(narrowContract, /\.leaderboards-screen\[data-ui11-surface="leaderboards"\] \.leaderboards-panel > h1/);
assert.match(narrowContract, /font-size:\s*clamp\(2\.05rem, 10vw, 3rem\)/);
assert.match(narrowContract, /word-break:\s*normal/);
assert.match(narrowContract, /hyphens:\s*none/);
assert.doesNotMatch(narrowContract, /practice-lab|practiceLab|\.practice-/i);

// UI11 augments semantics and presentation; it does not import or own app state.
assert.doesNotMatch(presentation, /^import\s/m);
assert.match(presentation, /new MutationObserver/);
assert.match(presentation, /childList:\s*true/);
assert.match(presentation, /dataset\.ui11Surface = "profile"/);
assert.match(presentation, /dataset\.ui11Surface = "leaderboards"/);
assert.match(presentation, /dataset\.ui11Surface = "settings"/);
assert.match(presentation, /"role", "tablist"/);
assert.match(presentation, /"role", "tabpanel"/);
assert.match(presentation, /"aria-pressed"/);
assert.match(presentation, /"role", "columnheader"/);
assert.match(presentation, /index === 0 \? "rowheader" : "cell"/);
assert.match(presentation, /"role", "switch"/);
assert.match(presentation, /"aria-checked"/);
assert.doesNotMatch(presentation, /localStorage|sessionStorage|fetch\(|supabase|leaderboardService|statistics\.js|modeStorage/i);

// Existing Profile & Stats data model and interactions remain authoritative.
assert.match(statisticsUi, /STATISTICS_TABS = Object\.freeze\(\[/);
for (const label of ["OVERVIEW", "CAMPAIGN", "TYPING TEST", "ENDLESS", "ARCADE RUSH", "RECENT", "PROFILE"]) {
  assert.match(statisticsUi, new RegExp(`"${label}"`));
}
assert.match(statisticsUi, /data-stats-tab="\$\{index\}"/);
assert.match(statisticsUi, /data-stats-action="edit-name"/);
assert.match(statisticsUi, /data-stats-action="copy-id"/);
assert.match(statisticsUi, /renderGlobalAccount/);
assert.match(statisticsUi, /getRecentSessionStatistics/);

// Existing global leaderboard services/categories/actions remain authoritative.
assert.match(leaderboardUi, /getLeaderboardSelection/);
assert.match(leaderboardUi, /LEADERBOARD_CATEGORIES/);
assert.match(leaderboardUi, /leaderboard-select-campaign/);
assert.match(leaderboardUi, /leaderboard-select-typing/);
assert.match(leaderboardUi, /leaderboard-select-endless/);
assert.match(leaderboardUi, /leaderboard-select-arcade-rush/);
assert.match(leaderboardUi, /leaderboard-refresh/);
assert.match(leaderboardUi, /leaderboard-google-sign-in/);

// Existing Settings values, toggle routing, tutorial/reset actions and account markup remain intact.
assert.match(ui, /export function renderSettings\(/);
assert.match(ui, /\["Strict mode", "strictMode", "Wrong keys break combo"\]/);
assert.match(ui, /\["Particles", "particles", "Lightweight word burst effect"\]/);
assert.match(ui, /\["Screen shake", "screenShake", "Damage impact movement"\]/);
assert.match(ui, /data-setting="\$\{key\}"/);
assert.match(ui, /handlers\.toggle\(button\.dataset\.setting\)/);
assert.match(ui, /data-tutorial-reset="hints"/);
assert.match(ui, /data-tutorial-reset="all"/);
assert.match(ui, /RESET PROGRESS/);

// The disabled mode registry boundary remains untouched.
assert.match(modes, /id: MODE_IDS\.PRACTICE,[\s\S]*enabled: false,[\s\S]*status: "coming-soon",[\s\S]*route: null/);

assert.match(workflow, /Certify UI11 Profile, Leaderboards, and Settings/);
assert.match(workflow, /tests\/browser\/ui11_profile_leaderboards_settings\.py/);
assert.match(workflow, /tests\/browser\/ui11_mobile_heading_contract\.py/);
assert.match(workflow, /browser-artifacts\/ui11-profile-leaderboards-settings\//);

console.log("UI11 source contracts passed: semantic V8 resource ownership, Profile/Stats, Leaderboards and Settings presentation, and existing data/auth/routing/persistence boundaries.");
