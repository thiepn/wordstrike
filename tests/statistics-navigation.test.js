import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Screens } from "../js/state.js";
import { clearSession, getCurrentSession } from "../js/sessionManager.js";

assert.equal(Screens.PROFILE_STATS, "PROFILE_STATS");
clearSession();
assert.equal(getCurrentSession(), null);

const [main, keyboard, ui] = await Promise.all([
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/appKeyboardController.js", import.meta.url), "utf8"),
  readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
]);
assert.match(ui, /PROFILE & STATS/);
assert.match(ui, /data-action="profile"/);
assert.match(main, /function openProfileStatistics\(\)/);
assert.match(main, /cleanupCampaignAttempt\("profile-stats"\)/);
assert.match(main, /changeScreen\(Screens\.PROFILE_STATS\)/);
assert.match(main, /statisticsTabIndex = 0/);
assert.match(keyboard, /state\.profileEditing[\s\S]*cancelProfileNameEdit\(\)/);
assert.match(keyboard, /Screens\.PROFILE_STATS[\s\S]*event\.key === "Escape"/);
assert.match(main, /renderProfileStatistics/);
assert.match(main, /createGlobalKeyboardController\(\{/);
assert.equal(main.split('addEventListener("keydown"').length - 1, 1);
assert.doesNotMatch(main, /setInterval\(/);
assert.doesNotMatch(main, /beginSession\([^)]*PROFILE/s);

console.log("Profile & Stats title action, cleanup route, default tab, edit Escape, no session, and extracted keyboard routing tests passed.");
