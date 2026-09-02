import assert from "node:assert/strict";
import {
  getSpeedTestRecord,
  getSpeedTestRecordFlags,
  loadModeData,
  MODE_DATA_STORAGE_KEY,
  recordCompletedSession,
  resetModeData,
} from "../js/modeStorage.js";
import {
  LEGACY_SPEED_TEST_WORD_SET_ID,
  SPEED_TEST_WORD_SET,
} from "../js/speedTestWords.js";

const values = new Map([["wordstrike_save", '{"currentFurthestLevel":90}']]);
globalThis.localStorage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
};
resetModeData();

const result = (sessionId, configId, overrides = {}) => ({
  schemaVersion: 1,
  sessionId,
  modeId: "speed-test",
  variantId: configId.startsWith("time") ? "time" : "words",
  endedAt: 1000,
  success: true,
  score: null,
  grade: null,
  accuracy: 95,
  wpm: 60,
  activeDurationMs: 15000,
  developerMode: false,
  characters: { correct: 75, incorrect: 4, missed: 1, totalKeystrokes: 80 },
  words: { completed: 15 },
  modeData: {
    metricVersion: 2,
    configId,
    rawWpm: 64,
    correctTestCharacters: 75,
    rawTestCharacters: 80,
    correctSpaces: 14,
    validSpaces: 14,
    backspaces: 3,
    wordDeletes: 1,
    exactWords: 14,
    completedWordCount: 15,
  },
  ...overrides,
});

const first = result("speed-1", "time-15");
assert.deepEqual(getSpeedTestRecordFlags(first), {
  newWpmRecord: true,
  newRawWpmRecord: true,
  newAccuracyRecord: true,
});
assert.equal(recordCompletedSession(first), true);
assert.equal(getSpeedTestRecord("time-15", LEGACY_SPEED_TEST_WORD_SET_ID).bestWpm, 60);
assert.equal(getSpeedTestRecord("time-15").bestWpm, null);
assert.equal(getSpeedTestRecord("time-30").bestWpm, null);

assert.equal(recordCompletedSession(result("speed-2", "time-15", {
  wpm: 60,
  accuracy: 96,
  modeData: { ...first.modeData, rawWpm: 63 },
  endedAt: 2000,
})), true);
assert.equal(getSpeedTestRecord("time-15", LEGACY_SPEED_TEST_WORD_SET_ID).sessionId, "speed-2");

assert.equal(recordCompletedSession(result("speed-3", "time-15", {
  wpm: 60,
  accuracy: 96,
  modeData: { ...first.modeData, rawWpm: 65 },
  endedAt: 3000,
})), true);
let record = getSpeedTestRecord("time-15", LEGACY_SPEED_TEST_WORD_SET_ID);
assert.equal(record.sessionId, "speed-3");
assert.equal(record.bestRawWpm, 65);
assert.equal(record.bestAccuracy, 96);
assert.equal(recordCompletedSession(result("speed-later-tie", "time-15", {
  wpm: 60,
  accuracy: 96,
  modeData: { ...first.modeData, rawWpm: 65 },
  endedAt: 5000,
})), true);
assert.equal(getSpeedTestRecord("time-15", LEGACY_SPEED_TEST_WORD_SET_ID).sessionId, "speed-3");

assert.equal(recordCompletedSession(result("speed-4", "words-25", {
  wpm: 55,
  accuracy: 100,
  modeData: {
    ...first.modeData,
    configId: "words-25",
    rawWpm: 58,
    exactWords: 25,
  },
})), true);
assert.equal(getSpeedTestRecord("words-25", LEGACY_SPEED_TEST_WORD_SET_ID).bestWpm, 55);
assert.equal(getSpeedTestRecord("time-15", LEGACY_SPEED_TEST_WORD_SET_ID).bestWpm, 60);
const englishResult = result("english-1", "time-15", {
  wpm: 52,
  modeData: {
    ...first.modeData,
    wordSetId: SPEED_TEST_WORD_SET.id,
    wordSetName: SPEED_TEST_WORD_SET.name,
    wordSetVersion: SPEED_TEST_WORD_SET.version,
    wordSetWordCount: SPEED_TEST_WORD_SET.wordCount,
  },
});
assert.equal(recordCompletedSession(englishResult), true);
assert.equal(getSpeedTestRecord("time-15").bestWpm, 52);
assert.equal(getSpeedTestRecord("time-15", LEGACY_SPEED_TEST_WORD_SET_ID).bestWpm, 60);
assert.equal(recordCompletedSession(result("english-better", "time-15", {
  wpm: 70,
  modeData: { ...englishResult.modeData },
})), true);
assert.equal(recordCompletedSession(result("english-inferior", "time-15", {
  wpm: 65,
  modeData: { ...englishResult.modeData },
})), true);
assert.equal(getSpeedTestRecord("time-15").bestWpm, 70);
assert.equal(getSpeedTestRecord("time-30").bestWpm, null);
assert.equal(values.get("wordstrike_save"), '{"currentFurthestLevel":90}');

const beforeDeveloper = JSON.stringify(loadModeData());
assert.equal(recordCompletedSession(result("dev", "time-15", { developerMode: true })), false);
assert.equal(JSON.stringify(loadModeData()), beforeDeveloper);
assert.equal(loadModeData().modes.campaign.completedSessions, 0);
assert.equal(loadModeData().totals.failedSessions, 0);
assert.equal(loadModeData().recentSessions[0].modeData.configId, "time-15");
assert.equal(loadModeData().recentSessions[0].modeData.metricVersion, 2);
assert.equal(loadModeData().recentSessions[0].modeData.wordDeletes, 1);
assert.equal(loadModeData().recentSessions[0].modeData.wordSetId, "english-200");
assert.equal(loadModeData().recentSessions[0].modeData.wordSetName, "English 200");
assert.equal(loadModeData().recentSessions[0].modeData.wordSetWordCount, 199);
assert.equal(
  loadModeData().recentSessions.find(({ sessionId }) => sessionId === "speed-4")
    .modeData.wordSetId,
  null,
);

const stored = loadModeData();
values.set(MODE_DATA_STORAGE_KEY, JSON.stringify({
  ...stored,
  modes: {
    ...stored.modes,
    "speed-test": {
      ...stored.modes["speed-test"],
      records: { "time-15": { bestWpm: "broken" } },
    },
  },
}));
record = getSpeedTestRecord("time-15", LEGACY_SPEED_TEST_WORD_SET_ID);
assert.equal(record.bestWpm, null);
assert.ok(getSpeedTestRecord("words-100"));

console.log("Typing Test configuration records, tie-breaks, aggregates, summaries, and Campaign isolation tests passed.");
