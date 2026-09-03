import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { DAILY_CHALLENGE_VERSION as CLIENT_DAILY_VERSION } from "../js/dailyConfig.js";
import { EXPECTED_LEADERBOARD_RULES_VERSIONS } from "../js/leaderboardService.js";
import { LEADERBOARD_RULES_VERSION, PUBLIC_BOARD_KEYS } from "../supabase/functions/_shared/leaderboardRead.js";
import { SUPPORTED_BOARD_KEYS, validateScoreSubmission } from "../supabase/functions/_shared/scoreSubmission.js";
import { dailySubmission } from "./leaderboardSubmissionFixtures.js";

const migrationsUrl = new URL("../supabase/migrations/", import.meta.url);
const migrations = (await readdir(migrationsUrl)).filter((name) => name.endsWith(".sql")).sort();
const incrementName = "20260630170000_increment_ranked_gameplay_rules_versions.sql";
const rollbackName = "20260701010000_restore_original_leaderboard_rules.sql";
const retirementName = "20260903083000_retire_daily_strike_backend.sql";
assert.ok(migrations.includes(incrementName));
assert.ok(migrations.includes(rollbackName));
assert.ok(migrations.includes(retirementName));
assert.ok(migrations.indexOf(rollbackName) > migrations.indexOf(incrementName));
assert.ok(migrations.indexOf(retirementName) > migrations.indexOf(rollbackName));

const increment = await readFile(new URL(incrementName, migrationsUrl), "utf8");
const rollback = await readFile(new URL(rollbackName, migrationsUrl), "utf8");
const retirement = await readFile(new URL(retirementName, migrationsUrl), "utf8");
const databaseContract = await readFile(
  new URL("../supabase/migrations/20260628023000_complete_global_leaderboards.sql", import.meta.url),
  "utf8",
);

assert.match(increment, /set rules_version = 2/);
assert.doesNotMatch(increment, /typing-15s|typing-60s/);
assert.match(rollback, /^begin;/);
assert.match(rollback, /update public\.leaderboard_boards\s+set rules_version = 1/s);
for (const boardKey of ["campaign-highest-level-v1", "endless-v1", "daily-strike-v1"]) {
  assert.match(rollback, new RegExp(`'${boardKey}'`));
}
assert.doesNotMatch(rollback, /typing-15s|typing-60s/);
assert.doesNotMatch(rollback, /public\.leaderboard_submissions/);
assert.doesNotMatch(rollback, /\bdelete\s+from\b/i);
assert.match(rollback, /commit;\s*$/);

// The historical Daily rules remain in old migrations, but AR15 archives the board
// instead of rewriting or deleting historical submissions.
assert.match(databaseContract, /s\.challenge_version = 1/);
assert.match(retirement, /where board_key = 'daily-strike-v1'/);
assert.match(retirement, /set is_active = false,[\s\S]*is_visible = false/);
assert.doesNotMatch(retirement, /delete from public\.leaderboard_submissions/i);
assert.doesNotMatch(retirement, /delete from public\.leaderboard_boards/i);

assert.equal(LEADERBOARD_RULES_VERSION, 1);
assert.equal(CLIENT_DAILY_VERSION, 1);
assert.equal(PUBLIC_BOARD_KEYS.includes("daily-strike-v1"), false);
assert.equal(SUPPORTED_BOARD_KEYS.includes("daily-strike-v1"), false);
assert.ok(Object.values(EXPECTED_LEADERBOARD_RULES_VERSIONS).every((version) => version === 1));
assert.equal(validateScoreSubmission(dailySubmission()).code, "INVALID_BOARD");

console.log("Historical rules migrations remain immutable, while AR15 archives Daily without deleting submissions and removes it from current server contracts.");
