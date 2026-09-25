import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { FLOW_SCORE_V3_RULES, FLOW_V3_BOARD_KEY } from "../js/flow/flowScoreV3.js";
import {
  EXPECTED_LEADERBOARD_RULES_VERSIONS,
  LEADERBOARD_BOARDS,
  LEADERBOARD_CATEGORIES,
  getLeaderboardSelection,
} from "../js/leaderboardService.js";
import { FLOW_BOARD_KEYS, validateScoreSubmission } from "../supabase/functions/_shared/scoreSubmission.js";
import { PUBLIC_BOARD_KEYS, validateLeaderboardRequest } from "../supabase/functions/_shared/leaderboardRead.js";

const [
  index, loader, phase1, outbox, pending,
  migration, submitEdge, readEdge, packageJson,
] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
  readFile(new URL("../js/submissionOutbox.js", import.meta.url), "utf8"),
  readFile(new URL("../js/pendingResultSubmission.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260923213343_flow_v3_instant_play.sql", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/submit-score/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/get-leaderboard/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
]);

assert.equal(FLOW_V3_BOARD_KEY, "flow-standard-v1");
assert.equal(FLOW_SCORE_V3_RULES.rulesVersion, 3);
assert.equal(FLOW_SCORE_V3_RULES.metricVersion, 2);
assert.deepEqual(FLOW_BOARD_KEYS, [LEADERBOARD_BOARDS.FLOW_STANDARD]);
assert.equal(PUBLIC_BOARD_KEYS.includes(LEADERBOARD_BOARDS.FLOW_STANDARD), true);
assert.equal(PUBLIC_BOARD_KEYS.includes(LEADERBOARD_BOARDS.FLOW_QUICK), false);
assert.equal(PUBLIC_BOARD_KEYS.includes(LEADERBOARD_BOARDS.FLOW_LONG), false);
assert.equal(validateLeaderboardRequest({ boardKey: LEADERBOARD_BOARDS.FLOW_STANDARD }).valid, true);
assert.equal(validateLeaderboardRequest({ boardKey: LEADERBOARD_BOARDS.FLOW_QUICK }).code, "INVALID_BOARD");
assert.equal(EXPECTED_LEADERBOARD_RULES_VERSIONS[LEADERBOARD_BOARDS.FLOW_STANDARD], 3);
assert.equal(getLeaderboardSelection(LEADERBOARD_BOARDS.FLOW_STANDARD).selectedCategory, LEADERBOARD_CATEGORIES.FLOW);

assert.match(loader, /const FLOW_RELEASE_VERSION = \d+/);
assert.match(loader, /wordstrike-flow-release-v\d+/);

const loaderVersion = index.match(/js\/flow\/flowRuntimeLoader\.js\?v=([^"]+)/)?.[1];
assert.ok(loaderVersion, "index must version the Flow runtime loader");
assert.equal(
  loader.includes(`"./js/flow/flowRuntimeLoader.js?v=${loaderVersion}"`),
  true,
  "Flow offline pack must contain the exact delivered loader version",
);

const phase1Version = loader.match(/import\("\.\/flowPhase1\.js\?v=([^"]+)"\)/)?.[1];
assert.ok(phase1Version, "loader must version the active Flow controller");
assert.equal(
  loader.includes(`"./js/flow/flowPhase1.js?v=${phase1Version}"`),
  true,
  "offline pack must contain the exact active Flow controller",
);

for (const [moduleName, source] of [
  ["flowStreamPlanV3", phase1],
  ["flowScoreV3", phase1],
  ["flowCadence", phase1],
]) {
  const version = source.match(new RegExp(`\\./${moduleName}\\.js\\?v=([^"]+)`))?.[1];
  assert.ok(version, "active Flow controller must version " + moduleName);
  assert.equal(
    loader.includes(`"./js/flow/${moduleName}.js?v=${version}"`),
    true,
    "offline pack must match active " + moduleName,
  );
}

for (const asset of [
  "./js/authService.js",
  "./js/leaderboardProfileService.js",
  "./js/leaderboardSubmissionService.js",
  "./js/leaderboardSubmissionService.js?v=20260925a",
  "./js/leaderboardService.js",
  "./js/submissionOutbox.js",
  "./js/pendingResultSubmission.js",
  "./js/flow/flowScoreV3.js",
  "./js/flow/flowRecordsV3.js",
  "./styles/screens/flow-session-v4.css",
  "./js/flow/flowSessionV4.js",
]) {
  assert.equal(loader.includes(JSON.stringify(asset)), true, "offline pack missing " + asset);
}

assert.match(phase1, /session-flow-v3-/);
assert.match(phase1, /continuous-stream/);
assert.match(phase1, /rerollPublicStream/);
assert.match(phase1, /event\.key === "Tab"/);
assert.match(phase1, /data-flow-theme-select/);
assert.match(phase1, /createLeaderboardSubmissionService/);
assert.match(outbox, /"flow"/);
assert.match(pending, /"flow"/);

assert.match(migration, /rules_version = 3/);
assert.match(migration, /where board_key = 'flow-standard-v1'/);
assert.match(migration, /where board_key in \('flow-quick-v1', 'flow-long-v1'\)/);
assert.match(migration, /is_active = false/);
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
  migrations.filter((name) => name.includes("flow_v3_instant_play")).length,
  1,
  "Flow V3 cutover must have exactly one canonical repository migration",
);

console.log("Flow V3 release certification contracts passed: instant stream, cumulative scoring, one board, offline runtime, and service-only backend RPCs.");
