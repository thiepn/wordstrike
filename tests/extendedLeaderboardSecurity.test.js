import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PUBLIC_BOARD_KEYS, validateLeaderboardRequest } from "../supabase/functions/_shared/leaderboardRead.js";
import { SUPPORTED_BOARD_KEYS, validateScoreSubmission } from "../supabase/functions/_shared/scoreSubmission.js";
import { dailySubmission } from "./leaderboardSubmissionFixtures.js";

const activeBoards = [
  "campaign-highest-level-v1", "typing-60s-english200-v1",
  "typing-15s-english200-v1", "endless-v1", "arcade-rush-v1",
];
assert.deepEqual(PUBLIC_BOARD_KEYS, activeBoards);
assert.deepEqual(SUPPORTED_BOARD_KEYS, activeBoards);
for (const boardKey of activeBoards) {
  assert.equal(validateLeaderboardRequest({ boardKey }).valid, true);
}
assert.equal(validateLeaderboardRequest({ boardKey: "daily-strike-v1" }).code, "INVALID_BOARD");
assert.equal(validateScoreSubmission(dailySubmission()).code, "INVALID_BOARD");
assert.equal(validateLeaderboardRequest({ boardKey: "arcade-rush-v1", challengeDate: "2026-09-02" }).code, "INVALID_REQUEST");
assert.equal(validateLeaderboardRequest({ boardKey: "endless-v1", user_id: "forged" }).code, "INVALID_REQUEST");

const rushMigration = await readFile(new URL("../supabase/migrations/20260902170000_add_arcade_rush_leaderboard_v1.sql", import.meta.url), "utf8");
const retirement = await readFile(new URL("../supabase/migrations/20260903083000_retire_daily_strike_backend.sql", import.meta.url), "utf8");
const submitEdge = await readFile(new URL("../supabase/functions/submit-score/index.ts", import.meta.url), "utf8");
const readEdge = await readFile(new URL("../supabase/functions/get-leaderboard/index.ts", import.meta.url), "utf8");
assert.match(rushMigration, /'arcade-rush-v1'/);
assert.match(rushMigration, /'arcade_rush'/);
assert.match(retirement, /set is_active = false,[\s\S]*is_visible = false[\s\S]*where board_key = 'daily-strike-v1'/);
assert.match(retirement, /recent_count >= 30/);
assert.match(retirement, /moderation_status = 'accepted'/);
assert.match(retirement, /from public, anon, authenticated/);
assert.match(retirement, /to service_role/);
const submitRpc = retirement.slice(retirement.indexOf("create or replace function public.submit_leaderboard_result"), retirement.indexOf("create or replace function public.get_public_leaderboard"));
const readRpc = retirement.slice(retirement.indexOf("create or replace function public.get_public_leaderboard"));
assert.doesNotMatch(submitRpc, /'daily-strike-v1'/);
assert.doesNotMatch(readRpc, /'daily-strike-v1'/);
assert.match(submitRpc, /'arcade-rush-v1'/);
assert.match(readRpc, /'arcade-rush-v1'/);
assert.match(submitEdge, /auth\.getUser\(token\)/);
assert.doesNotMatch(submitEdge, /CHALLENGE_MISMATCH|Daily Strike/);
assert.doesNotMatch(readEdge, /INVALID_CHALLENGE_DATE|Daily Strike/);
assert.doesNotMatch(submitEdge, /body\.userId|body\.username|error\.message|error\.stack/);

console.log("Five active boards retain verified identity, service-only SQL, accepted moderation, rate limiting, and strict requests; Daily backend access is retired.");
