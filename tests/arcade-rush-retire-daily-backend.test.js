import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  PUBLIC_BOARD_KEYS,
  rankLeaderboardRows,
  validateLeaderboardRequest,
} from "../supabase/functions/_shared/leaderboardRead.js";
import {
  SUPPORTED_BOARD_KEYS,
  validateScoreSubmission,
} from "../supabase/functions/_shared/scoreSubmission.js";
import { dailySubmission } from "./leaderboardSubmissionFixtures.js";
import { getModeDefinition, MODE_IDS } from "../js/modes.js";

const ACTIVE_BOARDS = [
  "campaign-highest-level-v1",
  "typing-60s-english200-v1",
  "typing-15s-english200-v1",
  "endless-v1",
  "arcade-rush-v1",
];

assert.deepEqual(PUBLIC_BOARD_KEYS, ACTIVE_BOARDS);
assert.deepEqual(SUPPORTED_BOARD_KEYS, ACTIVE_BOARDS);
assert.equal(validateLeaderboardRequest({ boardKey: "daily-strike-v1" }).code, "INVALID_BOARD");
assert.equal(validateLeaderboardRequest({
  boardKey: "daily-strike-v1",
  challengeDate: "2026-09-03",
}).code, "INVALID_BOARD");
assert.equal(validateScoreSubmission(dailySubmission()).code, "INVALID_BOARD");
assert.deepEqual(rankLeaderboardRows([], { boardKey: "daily-strike-v1" }), {
  entries: [],
  viewer: null,
});

const migration = await readFile(
  new URL("../supabase/migrations/20260903083000_retire_daily_strike_backend.sql", import.meta.url),
  "utf8",
);
const activeSubmission = await readFile(
  new URL("../supabase/functions/_shared/scoreSubmission.js", import.meta.url),
  "utf8",
);
const archivedSubmission = await readFile(
  new URL("../supabase/functions/_shared/scoreSubmissionLegacyDaily.js", import.meta.url),
  "utf8",
);
const submitEdge = await readFile(
  new URL("../supabase/functions/submit-score/index.ts", import.meta.url),
  "utf8",
);
const readEdge = await readFile(
  new URL("../supabase/functions/get-leaderboard/index.ts", import.meta.url),
  "utf8",
);

assert.match(migration, /^begin;/);
assert.match(migration, /set is_active = false,[\s\S]*is_visible = false[\s\S]*where board_key = 'daily-strike-v1'/);
assert.doesNotMatch(migration, /delete\s+from\s+public\.leaderboard_submissions/i);
assert.doesNotMatch(migration, /delete\s+from\s+public\.leaderboard_boards/i);
const submitRpc = migration.slice(
  migration.indexOf("create or replace function public.submit_leaderboard_result"),
  migration.indexOf("create or replace function public.get_public_leaderboard"),
);
const readRpc = migration.slice(migration.indexOf("create or replace function public.get_public_leaderboard"));
assert.doesNotMatch(submitRpc, /'daily-strike-v1'/);
assert.doesNotMatch(readRpc, /'daily-strike-v1'/);
for (const boardKey of ACTIVE_BOARDS) {
  assert.match(submitRpc, new RegExp(`'${boardKey}'`));
  assert.match(readRpc, new RegExp(`'${boardKey}'`));
}
assert.doesNotMatch(readRpc, /challenge_version|words_resolved|daily_strike/);
assert.match(migration, /recent_count >= 30/);
assert.match(migration, /moderation_status = 'accepted'/);
assert.match(migration, /from public, anon, authenticated/);
assert.match(migration, /to service_role/);
assert.match(migration, /commit;\s*$/);

assert.match(activeSubmission, /scoreSubmissionLegacyDaily\.js/);
assert.match(activeSubmission, /body\?\.boardKey === RETIRED_DAILY_BOARD_KEY/);
assert.match(archivedSubmission, /function validateDaily/);
assert.match(submitEdge, /_shared\/scoreSubmission\.js/);
assert.doesNotMatch(submitEdge, /scoreSubmissionLegacyDaily/);
assert.doesNotMatch(submitEdge, /CHALLENGE_MISMATCH|Daily Strike/);
assert.doesNotMatch(readEdge, /INVALID_CHALLENGE_DATE|Daily Strike/);

// AR16, not AR15, owns deletion of the hidden Daily app implementation.
const dailyMode = getModeDefinition(MODE_IDS.DAILY);
assert.ok(dailyMode);
assert.equal(dailyMode.visible, false);
assert.equal(dailyMode.enabled, true);
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH).visible, true);

console.log("AR15 retires Daily reads, submissions, ranking, and RPC access while preserving archived data and the hidden AR16 frontend boundary.");
