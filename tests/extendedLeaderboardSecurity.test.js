import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PUBLIC_BOARD_KEYS, validateLeaderboardRequest } from "../supabase/functions/_shared/leaderboardRead.js";

assert.deepEqual(PUBLIC_BOARD_KEYS, [
  "campaign-highest-level-v1", "typing-60s-english200-v1",
  "typing-15s-english200-v1", "endless-v1", "daily-strike-v1", "arcade-rush-v1",
]);
for (const boardKey of PUBLIC_BOARD_KEYS.filter((key) => key !== "daily-strike-v1")) {
  assert.equal(validateLeaderboardRequest({ boardKey }).valid, true);
}
assert.equal(validateLeaderboardRequest({ boardKey: "arcade-rush-v1", challengeDate: "2026-09-02" }).code, "INVALID_REQUEST");
assert.equal(validateLeaderboardRequest({ boardKey: "endless-v1", user_id: "forged" }).code, "INVALID_REQUEST");
const migration = await readFile(new URL("../supabase/migrations/20260628023000_complete_global_leaderboards.sql", import.meta.url), "utf8");
const rushMigration = await readFile(new URL("../supabase/migrations/20260902170000_add_arcade_rush_leaderboard_v1.sql", import.meta.url), "utf8");
const edge = await readFile(new URL("../supabase/functions/submit-score/index.ts", import.meta.url), "utf8");
assert.match(migration, /is_active = true[\s\S]*is_visible = true/);
assert.match(migration, /moderation_status,?[\s\S]*'accepted'/);
assert.match(migration, /recent_count >= 30/);
assert.match(migration, /from public, anon, authenticated/);
assert.match(migration, /to service_role/);
assert.match(rushMigration, /'arcade-rush-v1'/);
assert.match(rushMigration, /'arcade_rush'/);
assert.match(rushMigration, /recent_count >= 30/);
assert.match(rushMigration, /moderation_status = 'accepted'/);
assert.match(rushMigration, /from public, anon, authenticated/);
assert.match(rushMigration, /to service_role/);
assert.match(edge, /auth\.getUser\(token\)/);
assert.doesNotMatch(edge, /body\.userId|body\.username|error\.message|error\.stack/);

console.log("All six boards retain verified identity, service-only SQL, accepted moderation, rate limiting, and strict public requests.");
