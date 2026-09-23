import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { FLOW_V2_BOARD_KEYS, FLOW_SCORE_V2_RULES } from "../js/flow/flowScoreV2.js";
import {
  EXPECTED_LEADERBOARD_RULES_VERSIONS,
  LEADERBOARD_BOARDS,
  LEADERBOARD_CATEGORIES,
  getLeaderboardSelection,
} from "../js/leaderboardService.js";
import { FLOW_BOARD_KEYS, validateScoreSubmission } from "../supabase/functions/_shared/scoreSubmission.js";
import { PUBLIC_BOARD_KEYS, validateLeaderboardRequest } from "../supabase/functions/_shared/leaderboardRead.js";

const [
  index, loader, phase1, appRouting, main, outbox, pending,
  migration, submitEdge, readEdge, packageJson,
] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
  readFile(new URL("../js/appClickRouting.js", import.meta.url), "utf8"),
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../js/submissionOutbox.js", import.meta.url), "utf8"),
  readFile(new URL("../js/pendingResultSubmission.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260923172506_flow_global_leaderboards_v1.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/submit-score/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/get-leaderboard/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

assert.deepEqual(FLOW_V2_BOARD_KEYS, {
  quick: "flow-quick-v1",
  standard: "flow-standard-v1",
  long: "flow-long-v1",
});
assert.equal(FLOW_SCORE_V2_RULES.rulesVersion, 2);
assert.deepEqual(FLOW_BOARD_KEYS, [
  LEADERBOARD_BOARDS.FLOW_QUICK,
  LEADERBOARD_BOARDS.FLOW_STANDARD,
  LEADERBOARD_BOARDS.FLOW_LONG,
]);
for (const boardKey of FLOW_BOARD_KEYS) {
  assert.equal(PUBLIC_BOARD_KEYS.includes(boardKey), true);
  assert.equal(validateLeaderboardRequest({ boardKey }).valid, true);
  assert.equal(EXPECTED_LEADERBOARD_RULES_VERSIONS[boardKey], 2);
  assert.equal(getLeaderboardSelection(boardKey).selectedCategory, LEADERBOARD_CATEGORIES.FLOW);
}

assert.match(loader, /const FLOW_RELEASE_VERSION = 6/);
assert.match(loader, /wordstrike-flow-release-v9/);
assert.match(index, /js\/flow\/flowRuntimeLoader\.js\?v=20260923h/);
for (const asset of [
  "./js/authService.js",
  "./js/leaderboardProfileService.js",
  "./js/leaderboardSubmissionService.js",
  "./js/leaderboardService.js",
  "./js/leaderboardReturnState.js",
  "./js/pendingResultSubmission.js",
  "./js/submissionOutbox.js",
  "./js/supabaseConfig.js",
  "./js/supabaseClient.js",
  "./js/gameVersion.js",
  "./js/leaderboardUsername.js",
  "./js/arcadeRushLeaderboard.js",
  "./js/arcadeRush/arcadeRushResult.js",
  "./js/flow/flowScoreV2.js",
  "./js/flow/flowScoreV2.js?v=20260923a",
  "./js/flow/flowScoreV2.js?v=20260923f",
  "./js/flow/flowRecordsV2.js?v=20260923a",
  "./js/flow/flowRecordsV2.js?v=20260923f",
]) {
  assert.equal(loader.includes(JSON.stringify(asset)), true, "offline pack missing " + asset);
}

assert.match(phase1, /session-flow-v2-/);
assert.match(phase1, /prepareResultSubmission\("flow"/);
assert.match(phase1, /savePendingResultSubmission\("flow"/);
assert.match(phase1, /data-flow-global-submission/);
assert.match(phase1, /wordstrike:open-leaderboard/);
assert.match(outbox, /"flow"/);
assert.match(pending, /"flow"/);

for (const action of [
  "leaderboard-select-flow",
  "leaderboard-flow-select-quick",
  "leaderboard-flow-select-standard",
  "leaderboard-flow-select-long",
]) {
  assert.equal(appRouting.includes(action), true);
  assert.equal(main.includes(action), true);
}
assert.match(main, /wordstrike:open-leaderboard/);
assert.match(main, /wordstrike:open-account-settings/);

for (const boardKey of FLOW_BOARD_KEYS) assert.equal(migration.includes(boardKey), true);
assert.match(migration, /on conflict \(board_key\) do update/);
assert.match(migration, /create index if not exists leaderboard_submissions_flow_rank_idx/);
assert.match(migration, /case when selected_board\.board_key like 'flow-%' then score end desc/);
assert.match(migration, /case when selected_board\.board_key like 'flow-%' then accuracy end desc/);
assert.match(migration, /case when selected_board\.board_key like 'flow-%' then wpm end desc/);
assert.match(migration, /revoke all on function public\.submit_leaderboard_result[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.submit_leaderboard_result[\s\S]*to service_role/);
assert.match(migration, /revoke all on function public\.get_public_leaderboard[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function public\.get_public_leaderboard[\s\S]*to service_role/);

assert.match(submitEdge, /auth\.getUser\(token\)/);
assert.doesNotMatch(submitEdge, /body\.userId|body\.user_id|body\.username/);
assert.match(submitEdge, /validateScoreSubmission\(body\)/);
assert.match(readEdge, /validateLeaderboardRequest\(body\)/);
assert.match(readEdge, /viewerUserId = null/);

assert.equal(validateLeaderboardRequest({ boardKey: "daily-strike-v1" }).code, "INVALID_BOARD");
assert.equal(validateScoreSubmission({
  boardKey: "daily-strike-v1",
  sessionId: "session-retired-daily-12345678",
  clientVersion: "1.0.0",
  result: {},
}).code, "INVALID_BOARD");

const pkg = JSON.parse(packageJson);
assert.equal(pkg.scripts["validate:flow-corpus"], "node scripts/validateFlowCorpusV2.mjs");
const migrations = (await readdir(new URL("../supabase/migrations/", import.meta.url)))
  .filter((name) => name.endsWith(".sql"));
assert.equal(
  migrations.filter((name) => name.includes("flow_global_leaderboards_v1")).length,
  1,
  "Flow leaderboard migration must have exactly one canonical repository file",
);

console.log("Flow V2 RC certification contracts passed.");
