import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ARCADE_RUSH_BOSS_ID,
  ARCADE_RUSH_BOSS_MAX_HP,
  ARCADE_RUSH_BOSS_TARGET_DURATION_MS,
  ARCADE_RUSH_BOSS_VERSION,
  ARCADE_RUSH_GENERATOR_VERSION,
  ARCADE_RUSH_PROFILE_STATUS,
  ARCADE_RUSH_RULES_STATUS,
  ARCADE_RUSH_RULES_VERSION,
  ARCADE_RUSH_STARTING_INTEGRITY,
  ARCADE_RUSH_TARGET_RUN_DURATION_MS,
  ARCADE_RUSH_TOTAL_PLANNED_WORDS,
  ARCADE_RUSH_WAVE_COUNT,
  ARCADE_RUSH_WAVE_PROFILES,
  buildArcadeRushSessionResult,
} from "../js/arcadeRush/index.js";
import {
  getAllModes,
  getModeDefinition,
  getRegisteredModes,
  MODE_IDS,
} from "../js/modes.js";
import { Screens, isKnownScreen } from "../js/appScreens.js";
import {
  getStateDomain,
  getStateOwner,
  STATE_DOMAIN_NAMES,
} from "../js/appStateDomains.js";
import {
  createDefaultArcadeRushRecords,
  createDefaultModeData,
  getArcadeRushRecords,
  loadModeData,
  migrateModeDataToV2,
  MODE_DATA_SCHEMA_VERSION,
  MODE_DATA_STORAGE_KEY,
  recordArcadeRushRunStarted,
  recordCompletedSession,
  resetModeData,
} from "../js/modeStorage.js";
import { getStatisticsSnapshot } from "../js/statistics.js";
import {
  getBoardKeyForSelection,
  getLeaderboardSelection,
  LEADERBOARD_BOARDS,
  LEADERBOARD_CATEGORIES,
} from "../js/leaderboardService.js";
import { validateLeaderboardReturnState } from "../js/leaderboardReturnState.js";
import { buildSubmissionPayload } from "../js/leaderboardSubmissionService.js";
import {
  PUBLIC_BOARD_KEYS,
  validateLeaderboardRequest,
} from "../supabase/functions/_shared/leaderboardRead.js";
import {
  SUPPORTED_BOARD_KEYS,
  validateScoreSubmission,
} from "../supabase/functions/_shared/scoreSubmission.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const rootPath = (...parts) => join(ROOT, ...parts);
const readRoot = (...parts) => readFile(rootPath(...parts), "utf8");

const ACTIVE_MODE_IDS = [
  "campaign",
  "speed-test",
  "endless",
  "arcade-rush",
  "practice",
];
const ACTIVE_BOARD_KEYS = [
  "campaign-highest-level-v1",
  "typing-60s-english200-v1",
  "typing-15s-english200-v1",
  "endless-v1",
  "arcade-rush-v1",
];

// 1. Final public registry and navigation surface.
assert.deepEqual(getRegisteredModes().map(({ id }) => id), ACTIVE_MODE_IDS);
assert.deepEqual(getAllModes().map(({ id }) => id), ACTIVE_MODE_IDS);
assert.equal(Object.hasOwn(MODE_IDS, "DAILY"), false);
assert.equal(getModeDefinition("daily"), null);
const rushMode = getModeDefinition(MODE_IDS.ARCADE_RUSH);
assert.deepEqual(
  {
    id: rushMode.id,
    enabled: rushMode.enabled,
    visible: rushMode.visible,
    status: rushMode.status,
    route: rushMode.route,
    storesProgress: rushMode.storesProgress,
  },
  {
    id: "arcade-rush",
    enabled: true,
    visible: true,
    status: "available",
    route: "arcade-rush-ready",
    storesProgress: true,
  },
);
assert.equal(isKnownScreen(Screens.ARCADE_RUSH_READY), true);
assert.equal(isKnownScreen(Screens.ARCADE_RUSH_RESULTS), true);
assert.equal(Object.hasOwn(Screens, "DAILY_READY"), false);
assert.equal(Object.hasOwn(Screens, "DAILY_RESULTS"), false);
assert.equal(STATE_DOMAIN_NAMES.includes("arcadeRush"), true);
assert.equal(STATE_DOMAIN_NAMES.includes("daily"), false);
assert.ok(getStateDomain("arcadeRush"));
assert.equal(getStateDomain("daily"), null);
assert.equal(getStateOwner("arcadeRushResult"), "arcadeRush");
assert.equal(getStateOwner("dailyResult"), null);

// 2. Frozen rules-v1 gameplay identity. This intentionally cross-checks AR10,
// rather than duplicating its 1000-seed and balance simulations.
assert.equal(ARCADE_RUSH_RULES_VERSION, 1);
assert.equal(ARCADE_RUSH_RULES_STATUS, "FROZEN_V1");
assert.equal(ARCADE_RUSH_GENERATOR_VERSION, 1);
assert.equal(ARCADE_RUSH_PROFILE_STATUS, "FROZEN_V1");
assert.equal(ARCADE_RUSH_WAVE_COUNT, 6);
assert.equal(ARCADE_RUSH_STARTING_INTEGRITY, 5);
assert.equal(ARCADE_RUSH_TOTAL_PLANNED_WORDS, 168);
assert.equal(ARCADE_RUSH_BOSS_TARGET_DURATION_MS, 45_000);
assert.equal(ARCADE_RUSH_TARGET_RUN_DURATION_MS, 300_000);
assert.deepEqual(ARCADE_RUSH_WAVE_PROFILES.map(({ wordCount }) => wordCount), [23, 27, 29, 25, 31, 33]);
assert.deepEqual(ARCADE_RUSH_WAVE_PROFILES.map(({ spawnIntervalMs }) => spawnIntervalMs), [1500, 1350, 1250, 1650, 1200, 1050]);
assert.equal(ARCADE_RUSH_BOSS_ID, "core-breaker");
assert.equal(ARCADE_RUSH_BOSS_VERSION, 1);
assert.equal(ARCADE_RUSH_BOSS_MAX_HP, 8);

// 3. Schema-v2 persistence, legacy Daily cleanup, exact-once terminal storage,
// and statistics exposure.
assert.equal(MODE_DATA_SCHEMA_VERSION, 2);
assert.equal(MODE_DATA_STORAGE_KEY, "wordstrike_mode_data_v2");
const defaults = createDefaultModeData();
assert.deepEqual(Object.keys(defaults.modes), ACTIVE_MODE_IDS);
assert.deepEqual(defaults.modes[MODE_IDS.ARCADE_RUSH].records, createDefaultArcadeRushRecords());
assert.equal(Object.hasOwn(defaults.modes, "daily"), false);
const migrated = migrateModeDataToV2({
  schemaVersion: 1,
  profile: null,
  lifetime: {},
  totals: {},
  modes: {
    campaign: { highestScore: 321 },
    daily: { completedSessions: 50, highestScore: 999999 },
  },
  recentSessions: [
    { sessionId: "legacy-daily", modeId: "daily", endedAt: 1, success: true, score: 999999, modeData: {} },
    { sessionId: "legacy-campaign", modeId: "campaign", endedAt: 2, success: true, score: 321, modeData: { level: 1 } },
  ],
  recordedSessionIds: ["legacy-daily", "legacy-campaign"],
});
assert.equal(migrated.modes.campaign.highestScore, 321);
assert.equal(Object.hasOwn(migrated.modes, "daily"), false);
assert.equal(migrated.recentSessions.some(({ modeId }) => modeId === "daily"), false);
assert.ok(migrated.modes[MODE_IDS.ARCADE_RUSH]);

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const values = new Map([["wordstrike_daily_legacy_v1", JSON.stringify({ obsolete: true })]]);
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  },
});
try {
  resetModeData();
  values.set("wordstrike_daily_legacy_v1", JSON.stringify({ obsolete: true }));
  loadModeData();
  assert.equal(values.has("wordstrike_daily_legacy_v1"), false);
  assert.equal(recordArcadeRushRunStarted({ developerMode: false }), true);
  assert.equal(recordArcadeRushRunStarted({ developerMode: true }), false);

  const durationMs = 250_000;
  const correctCharacters = 1_000;
  const incorrectCharacters = 20;
  const totalKeystrokes = correctCharacters + incorrectCharacters;
  const accuracy = correctCharacters / totalKeystrokes * 100;
  const wpm = (correctCharacters / 5) / (durationMs / 60_000);
  const success = buildArcadeRushSessionResult({
    sessionId: "session-ar17-success-0001",
    sessionSource: "arcade-rush-ready",
    startedAt: 1_000,
    endedAt: 251_000,
    durationMs,
    activeDurationMs: durationMs,
    seed: 123_456_789,
    developerMode: false,
    success: true,
    accuracy,
    wpm,
    characters: {
      correct: correctCharacters,
      incorrect: incorrectCharacters,
      missed: 0,
      totalKeystrokes,
    },
    words: { completed: 184, missed: 0, total: 184 },
    combo: { maximum: 91, final: 24 },
    wavesCompleted: 6,
    bossDefeated: true,
    bossTimeRemainingMs: 15_000,
    integrityRemaining: 5,
    perfectWaves: 2,
    wordPoints: 50_000,
  });
  assert.ok(success);
  assert.equal(success.modeData.rulesVersion, 1);
  assert.equal(success.modeData.recordEligible, true);
  assert.equal(recordCompletedSession(success), true);
  assert.equal(recordCompletedSession(success), false, "terminal result persistence must be exact-once");
  const records = getArcadeRushRecords();
  assert.equal(records.runsStarted, 1);
  assert.equal(records.runsCompleted, 1);
  assert.equal(records.bossesDefeated, 1);
  assert.equal(records.highestScore, success.score);
  const stats = getStatisticsSnapshot(loadModeData(), { currentFurthestLevel: 1, levels: {} });
  assert.ok(stats.arcadeRush);
  assert.equal(Object.hasOwn(stats, "daily"), false);
  assert.equal(stats.arcadeRush.runsStarted, 1);
  assert.equal(stats.arcadeRush.runsCompleted, 1);

  const devSuccess = buildArcadeRushSessionResult({
    ...success,
    sessionId: "session-ar17-dev-000002",
    developerMode: true,
    rulesVersion: 1,
  });
  assert.ok(devSuccess);
  assert.equal(devSuccess.modeData.recordEligible, false);
  assert.equal(recordCompletedSession(devSuccess), false);

  // 4. Client leaderboard payload and server eligibility line up.
  assert.equal(LEADERBOARD_BOARDS.ARCADE_RUSH, "arcade-rush-v1");
  assert.equal(Object.hasOwn(LEADERBOARD_BOARDS, "DAILY"), false);
  assert.equal(Object.hasOwn(LEADERBOARD_CATEGORIES, "DAILY"), false);
  const payload = buildSubmissionPayload("arcade-rush", success);
  assert.ok(payload);
  assert.equal(payload.boardKey, "arcade-rush-v1");
  assert.equal(validateScoreSubmission(payload).valid, true);
  const devPayload = buildSubmissionPayload("arcade-rush", devSuccess);
  assert.ok(devPayload);
  assert.equal(validateScoreSubmission(devPayload).valid, false);

  const failure = buildArcadeRushSessionResult({
    sessionId: "session-ar17-fail-000003",
    sessionSource: "arcade-rush-ready",
    startedAt: 1_000,
    endedAt: 181_000,
    durationMs: 180_000,
    activeDurationMs: 180_000,
    seed: 987_654_321,
    developerMode: false,
    success: false,
    accuracy: 94,
    wpm: 70,
    characters: { correct: 600, incorrect: 20, missed: 30, totalKeystrokes: 620 },
    words: { completed: 90, missed: 5, total: 95 },
    combo: { maximum: 35, final: 0 },
    wavesCompleted: 4,
    bossDefeated: false,
    bossTimeRemainingMs: 0,
    integrityRemaining: 0,
    perfectWaves: 1,
    wordPoints: 30_000,
  });
  assert.ok(failure);
  assert.equal(buildSubmissionPayload("arcade-rush", failure), null);
} finally {
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else delete globalThis.localStorage;
}

// 5. Final public leaderboard/server board contract and safe legacy redirects.
assert.deepEqual(PUBLIC_BOARD_KEYS, ACTIVE_BOARD_KEYS);
assert.deepEqual(SUPPORTED_BOARD_KEYS, ACTIVE_BOARD_KEYS);
assert.equal(validateLeaderboardRequest({ boardKey: "daily-strike-v1" }).code, "INVALID_BOARD");
assert.equal(validateScoreSubmission({ boardKey: "daily-strike-v1" }).code, "INVALID_BOARD");
assert.equal(getLeaderboardSelection("daily-strike-v1").selectedCategory, LEADERBOARD_CATEGORIES.ARCADE_RUSH);
assert.equal(getBoardKeyForSelection("daily"), LEADERBOARD_BOARDS.ARCADE_RUSH);
assert.deepEqual(validateLeaderboardReturnState({
  screen: "leaderboards",
  selectedCategory: "daily",
  typingDuration: 60,
}), {
  screen: "leaderboards",
  selectedCategory: LEADERBOARD_CATEGORIES.ARCADE_RUSH,
  typingDuration: 60,
});

// 6. Browser integration stays behind the app boundary; pure Arcade Rush modules
// remain independent of app state, storage, leaderboard, backend, and Daily code.
const mainSource = await readRoot("js", "main.js");
const appControllerSource = await readRoot("js", "arcadeRushAppController.js");
const clickRoutingSource = await readRoot("js", "appClickRouting.js");
assert.match(mainSource, /route === "arcade-rush-ready"\) openArcadeRushReady\("mode-select"\)/);
assert.match(mainSource, /function startArcadeRush\(/);
assert.doesNotMatch(mainSource, /function openArcadeRushReady[\s\S]{0,140}if \(!appState\.devMode\)/);
assert.doesNotMatch(mainSource, /function startArcadeRush[\s\S]{0,140}if \(!appState\.devMode\)/);
assert.doesNotMatch(mainSource, /from ["']\.\/arcadeRush\//);
assert.match(appControllerSource, /from "\.\/arcadeRush\/index\.js"/);
assert.match(clickRoutingSource, /"leaderboard-select-arcade-rush"/);
assert.doesNotMatch(clickRoutingSource, /"leaderboard-select-daily"/);
assert.doesNotMatch(mainSource, /\bstartDaily\b|\brenderDaily(?:Ready|Shell|Results)\b|Screens\.DAILY_/);

const pureFiles = (await readdir(rootPath("js", "arcadeRush"))).filter((name) => name.endsWith(".js"));
for (const name of pureFiles) {
  const source = await readRoot("js", "arcadeRush", name);
  for (const forbidden of [
    /from ["']\.\.\/main\.js["']/,
    /from ["']\.\.\/state\.js["']/,
    /from ["']\.\.\/appStateDomains\.js["']/,
    /from ["']\.\.\/modeStorage(?:V2)?\.js["']/,
    /from ["']\.\.\/leaderboard/,
    /from ["'][^"']*supabase/i,
    /from ["'][^"']*daily/i,
  ]) {
    assert.doesNotMatch(source, forbidden, `${name} must remain pure-subsystem isolated`);
  }
}

// 7. AR15 backend retirement remains non-destructive and edge functions use the
// current wrappers rather than directly reviving Daily behavior.
const retirementMigration = await readRoot("supabase", "migrations", "20260903083000_retire_daily_strike_backend.sql");
assert.match(retirementMigration, /where board_key = 'daily-strike-v1'/);
assert.match(retirementMigration, /set is_active = false,[\s\S]*is_visible = false/);
assert.doesNotMatch(retirementMigration, /delete\s+from\s+public\.leaderboard_(?:submissions|boards)/i);
assert.equal(existsSync(rootPath("supabase", "functions", "_shared", "scoreSubmissionLegacyDaily.js")), true);
const submitEdge = await readRoot("supabase", "functions", "submit-score", "index.ts");
const readEdge = await readRoot("supabase", "functions", "get-leaderboard", "index.ts");
assert.match(submitEdge, /_shared\/scoreSubmission\.js/);
assert.doesNotMatch(submitEdge, /scoreSubmissionLegacyDaily/);
assert.doesNotMatch(submitEdge, /Daily Strike|CHALLENGE_MISMATCH/);
assert.doesNotMatch(readEdge, /Daily Strike|INVALID_CHALLENGE_DATE/);

// 8. Repository/deployment gate remains wired for PRs and main, and docs point
// to the canonical deployed site.
const workflow = await readRoot(".github", "workflows", "test.yml");
assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
assert.match(workflow, /pull_request:/);
assert.match(workflow, /run:\s*npm test/);
const readme = await readRoot("README.md");
assert.match(readme, /https:\/\/thiepn\.dev\/wordstrike\//);
assert.match(readme, /\*\*Arcade Rush\*\*/);
assert.doesNotMatch(readme, /\*\*Daily Strike\*\*|### Daily Strike/);

console.log("AR17 final certification passed: Arcade Rush rules v1, public routing, storage, statistics, leaderboard, backend retirement, isolation, and deployment contracts are coherent.");
