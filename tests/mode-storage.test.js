import assert from "node:assert/strict";
import {
  createDefaultModeData,
  getModeSummary,
  getRecentSessions,
  loadModeData,
  MAX_RECENT_SESSIONS,
  MODE_DATA_SCHEMA_VERSION,
  MODE_DATA_STORAGE_KEY,
  recordCompletedSession,
  resetModeData,
} from "../js/modeStorage.js";

const values = new Map([["wordstrike_save", '{"currentFurthestLevel":42}']]);
globalThis.localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
};

assert.equal(MODE_DATA_SCHEMA_VERSION, 2);
assert.deepEqual(loadModeData(), createDefaultModeData());
values.set(MODE_DATA_STORAGE_KEY, "{broken");
assert.deepEqual(loadModeData(), createDefaultModeData());
resetModeData();

const makeResult = (id, overrides = {}) => ({
  schemaVersion: 1,
  sessionId: id,
  modeId: "campaign",
  variantId: "normal",
  endedAt: 1000 + Number(id.replace(/\D/g, "") || 0),
  success: true,
  score: 100,
  grade: "A",
  accuracy: 95,
  wpm: 50,
  activeDurationMs: 1000,
  developerMode: false,
  characters: {
    correct: 8,
    incorrect: 2,
    missed: 1,
    totalKeystrokes: 10,
  },
  words: { completed: 2 },
  modeData: { level: 1, modifierId: null },
  ...overrides,
});

assert.equal(recordCompletedSession(makeResult("session-1")), true);
assert.equal(recordCompletedSession(makeResult("session-1")), false);
assert.equal(recordCompletedSession(makeResult("dev", { developerMode: true })), false);
assert.equal(recordCompletedSession(makeResult("aborted", { sessionState: "aborted" })), false);
assert.equal(recordCompletedSession(makeResult("failed", {
  success: false,
  wpm: 40,
  accuracy: 80,
  score: 50,
})), true);
assert.equal(values.get("wordstrike_save"), '{"currentFurthestLevel":42}');

let data = loadModeData();
assert.equal(data.schemaVersion, 2);
assert.equal(data.totals.completedSessions, 2);
assert.equal(data.totals.failedSessions, 1);
assert.equal(data.totals.activePlaytimeMs, 2000);
assert.equal(data.totals.charactersTyped, 20);
assert.equal(data.totals.correctCharacters, 16);
assert.equal(data.totals.incorrectCharacters, 4);
assert.equal(data.totals.missedCharacters, 2);
assert.equal(data.totals.wordsCompleted, 4);
assert.deepEqual(
  {
    bestWpm: getModeSummary("campaign").bestWpm,
    bestAccuracy: getModeSummary("campaign").bestAccuracy,
    highestScore: getModeSummary("campaign").highestScore,
  },
  { bestWpm: 50, bestAccuracy: 95, highestScore: 100 },
);

for (let index = 2; index < 40; index += 1) {
  recordCompletedSession(makeResult(`session-${index}`, {
    wpm: 50 + index,
    accuracy: Math.min(100, 90 + index),
    score: 100 + index,
  }));
}
data = loadModeData();
assert.equal(data.recentSessions.length, MAX_RECENT_SESSIONS);
assert.equal(getRecentSessions()[0].sessionId, "session-39");
assert.equal(data.modes.campaign.bestWpm, 89);
assert.equal(data.modes.campaign.bestAccuracy, 100);
assert.equal(data.modes.campaign.highestScore, 139);
assert.equal(Object.hasOwn(data.modes, "daily"), false);
assert.ok(data.modes["arcade-rush"]);

values.set(MODE_DATA_STORAGE_KEY, JSON.stringify({
  ...data,
  futureField: { safe: true },
  modes: { ...data.modes, future: { anything: true } },
}));
assert.equal(loadModeData().schemaVersion, 2);
assert.ok(loadModeData().modes.campaign);
assert.equal(loadModeData().modes.future, undefined);

console.log("Mode storage v2, aggregates, duplicate guards, developer exclusion, Daily isolation, and bounded history tests passed.");
