import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ui = await readFile(new URL("../js/ui.js", import.meta.url), "utf8");
const rushUi = await readFile(new URL("../js/arcadeRush/arcadeRushUi.js", import.meta.url), "utf8");
const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
const leaderboard = await readFile(new URL("../js/leaderboardUi.js", import.meta.url), "utf8");
const statistics = await readFile(new URL("../js/statisticsUi.js", import.meta.url), "utf8");

for (const renderer of ["renderGameplayShell", "renderBossShell", "renderEndlessShell", "renderSpeedTestRun"]) {
  const start = ui.indexOf(`export function ${renderer}`);
  const end = ui.indexOf("export function ", start + 20);
  const source = ui.slice(start, end < 0 ? undefined : end);
  assert.match(source, /gameplayPauseButton\(\)/, `${renderer} needs a visible Back/Pause control`);
  assert.match(source, /wireGameplayAction\(app\(\), "pause"/, `${renderer} must route Back to pause`);
}

for (const screen of ["mode-screen", "endless-ready-screen", "speed-results-screen", "endless-results-screen", "results-screen", "settings-screen", "level-screen"]) {
  assert.match(ui, new RegExp(`${screen}[\\s\\S]{0,5000}(?:screenBackButton|data-action=\\"back\\")`), `${screen} needs a visible Back route`);
}
assert.match(rushUi, /data-rush-action="back"/, "Arcade Rush ready view needs a Back route");
assert.match(rushUi, /data-rush-action="pause"/, "Arcade Rush gameplay needs a Pause route");
assert.match(leaderboard, /screen-back-button[\s\S]*leaderboard-main-menu/);
assert.match(statistics, /screen-back-button[\s\S]*data-stats-action="back"/);
assert.match(main, /renderEndlessShell\(game, appState\.devMode, \{ pause: pauseGame \}\)/);
assert.match(main, /deactivateGameplayInput\.blur\?\.\(\)[\s\S]*changeScreen\(Screens\.PAUSED\)/);
assert.doesNotMatch(main, /renderDailyShell|Screens\.DAILY_/);
assert.equal(main.split('document.addEventListener("keydown"').length - 1, 1);

console.log("Every current non-root flow exposes a visible Back route, and active-mode Back controls pause safely.");
