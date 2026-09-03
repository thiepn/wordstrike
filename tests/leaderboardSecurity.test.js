import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getCorsHeaders } from "../supabase/functions/_shared/leaderboardProfile.js";
import { validateLeaderboardRequest } from "../supabase/functions/_shared/leaderboardRead.js";

assert.equal(validateLeaderboardRequest({ boardKey: "endless-v1" }).valid, true);
assert.equal(validateLeaderboardRequest({ boardKey: "arcade-rush-v1" }).valid, true);
assert.equal(validateLeaderboardRequest({ boardKey: "campaign-highest-level-v1" }).valid, true);
assert.equal(validateLeaderboardRequest({ boardKey: "daily-strike-v1" }).code, "INVALID_BOARD");
assert.equal(validateLeaderboardRequest({ boardKey: "daily-strike-v1", challengeDate: "2026-06-27" }).code, "INVALID_BOARD");
assert.equal(validateLeaderboardRequest({ boardKey: "endless-v1", limit: 1000 }).code, "INVALID_REQUEST");
assert.equal(validateLeaderboardRequest({ boardKey: "endless-v1", orderBy: "raw sql" }).code, "INVALID_REQUEST");
assert.equal(validateLeaderboardRequest({ boardKey: "endless-v1", user_id: "ignored" }).code, "INVALID_REQUEST");
assert.equal(getCorsHeaders("https://evil.example"), null);

const edge = await readFile(new URL("../supabase/functions/get-leaderboard/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260903083000_retire_daily_strike_backend.sql", import.meta.url), "utf8");
const config = await readFile(new URL("../supabase/config.toml", import.meta.url), "utf8");
assert.match(edge, /auth\.getUser\(token\)/);
assert.match(edge, /viewerUserId = null/);
assert.doesNotMatch(edge, /body\.user_id|body\.limit|body\.orderBy/);
assert.match(edge, /get_public_leaderboard/);
assert.doesNotMatch(edge, /INVALID_CHALLENGE_DATE/);
assert.doesNotMatch(edge, /leaderboard_submissions["']\)\.insert|\.insert\(/);
assert.match(migration, /where board_key = 'daily-strike-v1'/);
assert.match(migration, /set is_active = false,[\s\S]*is_visible = false/);
assert.match(migration, /moderation_status = 'accepted'/);
assert.match(migration, /row_number\(\) over \(\s*partition by user_id/s);
assert.match(migration, /where rank <= 100/);
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function[\s\S]*to service_role/);
assert.doesNotMatch(migration.slice(migration.indexOf("create or replace function public.get_public_leaderboard")), /selected_board\.board_key = 'daily-strike-v1'/);
assert.match(config, /\[functions\.get-leaderboard\]\s*verify_jwt = false/);
assert.match(config, /\[functions\.leaderboard-profile\]\s*verify_jwt = false/);

console.log("Public leaderboard API rejects retired Daily reads while active boards retain optional JWT, CORS, read-only behavior, and service-only SQL.");
