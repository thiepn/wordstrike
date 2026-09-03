import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Screens } from "../js/appScreens.js";
import { getStateOwner, STATE_DOMAIN_NAMES } from "../js/appStateDomains.js";
import {
  getAllModes,
  getModeDefinition,
  getRegisteredModes,
  MODE_IDS,
} from "../js/modes.js";
import {
  loadModeData,
  migrateModeDataToV2,
} from "../js/modeStorageV2.js";
import {
  getBoardKeyForSelection,
  getLeaderboardSelection,
  LEADERBOARD_BOARDS,
  LEADERBOARD_CATEGORIES,
} from "../js/leaderboardService.js";
import { validateLeaderboardReturnState } from "../js/leaderboardReturnState.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const pathFromRoot = (...parts) => join(ROOT, ...parts);

const EXPECTED_MODE_IDS = [
  "campaign",
  "speed-test",
  "endless",
  "arcade-rush",
  "practice",
];

assert.equal(Object.hasOwn(MODE_IDS, "DAILY"), false);
assert.deepEqual(getRegisteredModes().map(({ id }) => id), EXPECTED_MODE_IDS);
assert.deepEqual(getAllModes().map(({ id }) => id), EXPECTED_MODE_IDS);
assert.equal(getModeDefinition("daily"), null);
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH)?.visible, true);

assert.equal(Object.hasOwn(Screens, "DAILY_READY"), false);
assert.equal(Object.hasOwn(Screens, "DAILY_RESULTS"), false);
assert.equal(STATE_DOMAIN_NAMES.includes("daily"), false);
for (const property of [
  "dailyDateKey",
  "dailyDateOverride",
  "dailyResult",
  "dailyRecordFlags",
  "dailyResultsIndex",
  "dailyResultsReadyAt",
]) {
  assert.equal(getStateOwner(property), null, `${property} must have no app-state owner`);
}

const migrated = migrateModeDataToV2({
  schemaVersion: 1,
  profile: null,
  lifetime: {},
  totals: {},
  modes: {
    daily: { completedSessions: 99, highestScore: 999999 },
  },
  recentSessions: [{
    sessionId: "legacy-daily-session",
    modeId: "daily",
    endedAt: 1,
    success: true,
    score: 999999,
    accuracy: 100,
    wpm: 100,
    activeDurationMs: 1000,
    modeData: {},
  }],
  recordedSessionIds: ["legacy-daily-session"],
});
assert.equal(Object.hasOwn(migrated.modes, "daily"), false);
assert.equal(migrated.recentSessions.some(({ modeId }) => modeId === "daily"), false);
assert.ok(Object.hasOwn(migrated.modes, MODE_IDS.ARCADE_RUSH));

const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const storage = new Map([
  ["wordstrike_daily_legacy_v1", JSON.stringify({ schemaVersion: 1, mode: { completedSessions: 5 } })],
]);
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
  },
});
try {
  loadModeData();
  assert.equal(storage.has("wordstrike_daily_legacy_v1"), false);
} finally {
  if (originalLocalStorage) Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  else delete globalThis.localStorage;
}

assert.equal(Object.hasOwn(LEADERBOARD_BOARDS, "DAILY"), false);
assert.equal(Object.hasOwn(LEADERBOARD_CATEGORIES, "DAILY"), false);
assert.equal(
  getLeaderboardSelection("daily-strike-v1").selectedCategory,
  LEADERBOARD_CATEGORIES.ARCADE_RUSH,
);
assert.equal(
  getBoardKeyForSelection("daily"),
  LEADERBOARD_BOARDS.ARCADE_RUSH,
);
assert.deepEqual(
  validateLeaderboardReturnState({
    screen: "leaderboards",
    selectedCategory: "daily",
    typingDuration: 60,
  }),
  {
    screen: "leaderboards",
    selectedCategory: LEADERBOARD_CATEGORIES.ARCADE_RUSH,
    typingDuration: 60,
  },
);

for (const path of [
  "js/dailyConfig.js",
  "js/dailyDate.js",
  "js/dailyGenerator.js",
  "js/dailyMode.js",
  "js/dailyRecords.js",
  "js/dailyScoring.js",
  "docs/DAILY_STRIKE.md",
]) {
  assert.equal(existsSync(pathFromRoot(path)), false, `${path} must be deleted`);
}

// Backend history intentionally survives AR16; AR15 owns backend retirement.
for (const path of [
  "supabase/functions/_shared/scoreSubmissionLegacyDaily.js",
  "supabase/migrations/20260903083000_retire_daily_strike_backend.sql",
]) {
  assert.equal(existsSync(pathFromRoot(path)), true, `${path} must remain as backend history`);
}

async function collectJsFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectJsFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith(".js")) files.push(absolute);
  }
  return files;
}

const activeFrontendFiles = await collectJsFiles(pathFromRoot("js"));
const forbiddenRuntimePatterns = [
  /from\s+["'][^"']*daily(?:Config|Date|Generator|Mode|Records|Scoring)\.js["']/,
  /MODE_IDS\.DAILY/,
  /Screens\.DAILY_(?:READY|RESULTS)/,
  /appState\.daily(?:DateKey|DateOverride|Result|RecordFlags|ResultsIndex|ResultsReadyAt)/,
  /\bstartDaily\b/,
  /\brenderDaily(?:Ready|Shell|Results)\b/,
  /\bupdateDailyHud\b/,
  /\bshowDailyPauseOverlay\b/,
];
for (const file of activeFrontendFiles) {
  const source = await readFile(file, "utf8");
  for (const pattern of forbiddenRuntimePatterns) {
    assert.doesNotMatch(source, pattern, `${file} must not retain Daily runtime integration`);
  }
}

const readme = await readFile(pathFromRoot("README.md"), "utf8");
assert.doesNotMatch(readme, /\*\*Daily Strike\*\*|### Daily Strike|DAILY_STRIKE\.md/);
assert.match(readme, /\*\*Arcade Rush\*\*/);

console.log("AR16 Daily frontend deletion, local cleanup, and safe legacy redirects passed.");
