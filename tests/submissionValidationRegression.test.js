import assert from "node:assert/strict";
import {
  buildDailySubmissionResult,
  buildTypingSubmissionResult,
  createLeaderboardSubmissionService,
} from "../js/leaderboardSubmissionService.js";
import { validateScoreSubmission } from "../supabase/functions/_shared/scoreSubmission.js";

const auth = { status: "signed-in", user: { id: "user-1" } };
const profile = { profile: { username: "Player_1" } };
const dailyResult = {
  sessionId: "cb37a745-a075-406e-ab80-a448f5d71772",
  sessionSource: "daily-ready",
  developerMode: false,
  success: true,
  failureReason: null,
  score: 32031,
  accuracy: 98.91304347826086,
  activeDurationMs: 102487.2,
  words: { completed: 60, missed: 0, total: 60 },
  modeData: {
    dateKey: "2026-06-28", challengeVersion: 1, dateOverride: false,
    totalWords: 60, recordEligible: true, wordsSpawned: 60,
    wordsResolved: 60, wordsCompleted: 60, integrityRemaining: 3,
    coreHits: 0, coreBreaches: 0, finalWave: 3, wordPoints: 11900,
    completionBonus: 10000, integrityBonus: 6000, accuracyBonus: 1978,
    timeBonus: 2153,
  },
};

// AR15 deliberately leaves the hidden frontend Daily serializer in place until AR16,
// but the current server contract rejects its board key.
const beforeDaily = structuredClone(dailyResult);
assert.equal(buildDailySubmissionResult({
  ...dailyResult,
  words: { ...dailyResult.words, completed: 120 },
  modeData: { ...dailyResult.modeData, wordsCompleted: 120 },
}), null);
const normalizedDaily = buildDailySubmissionResult(dailyResult);
assert.deepEqual(dailyResult, beforeDaily);
assert.equal(normalizedDaily.wordsCompleted, 60);
assert.equal(normalizedDaily.wordsResolved, 60);
const dailyRequest = {
  boardKey: "daily-strike-v1",
  sessionId: dailyResult.sessionId,
  clientVersion: "1.0.0",
  result: normalizedDaily,
};
assert.equal(validateScoreSubmission(dailyRequest).code, "INVALID_BOARD");
assert.equal(validateScoreSubmission({
  ...dailyRequest,
  result: { ...normalizedDaily, wordsCompleted: 120 },
}).code, "INVALID_BOARD");

function typingResult(duration, sessionId, source = "tab-reset") {
  const correctTestCharacters = duration === 60 ? 400 : 100;
  const rawTestCharacters = duration === 60 ? 450 : 110;
  const correctKeystrokes = duration === 60 ? 420 : 105;
  return {
    sessionId,
    sessionSource: source,
    developerMode: false,
    success: true,
    failureReason: null,
    wpm: (correctTestCharacters / 5) / (duration / 60),
    accuracy: correctKeystrokes / rawTestCharacters * 100,
    activeDurationMs: duration * 1000,
    modeData: {
      durationSeconds: duration, configId: `time-${duration}`,
      wordSetId: "english-200", wordSetVersion: 1, metricVersion: 2,
      rawWpm: (rawTestCharacters / 5) / (duration / 60),
      correctTestCharacters, rawTestCharacters, correctKeystrokes,
      incorrectKeystrokes: rawTestCharacters - correctKeystrokes,
      missedCharacters: 0, completedWordCount: duration === 60 ? 85 : 22,
      exactWords: duration === 60 ? 80 : 20,
      incorrectWords: duration === 60 ? 5 : 2,
      recordEligible: true,
    },
  };
}

for (const [duration, source] of [[60, "tab-reset"], [15, "quit-test"]]) {
  const local = typingResult(duration, `123e4567-e89b-42d3-a456-4266141740${duration}`, source);
  const before = structuredClone(local);
  const normalized = buildTypingSubmissionResult(local, duration);
  assert.deepEqual(local, before);
  const request = {
    boardKey: `typing-${duration}s-english200-v1`,
    sessionId: local.sessionId,
    clientVersion: "1.0.0",
    result: normalized,
  };
  assert.equal(validateScoreSubmission(request).valid, true);
  assert.equal(validateScoreSubmission({ ...request, result: { ...normalized, recordEligible: false } }).code, "RECORD_NOT_ELIGIBLE");
  assert.equal(validateScoreSubmission({ ...request, result: { ...normalized, sessionSource: "test" } }).code, "INVALID_SESSION_SOURCE");
  assert.equal(validateScoreSubmission({ ...request, result: { ...normalized, wpm: normalized.wpm + 1 } }).code, "METRIC_MISMATCH");
}

const campaignResult = {
  sessionId: "123e4567-e89b-42d3-a456-426614174200",
  sessionSource: "level-select", developerMode: false, success: true,
  grade: "A", accuracy: 96, activeDurationMs: 83000, variantId: "normal",
  characters: { correct: 100 }, words: { completed: 20 },
  modeData: { level: 12, wordsTotal: 20, correctKeystrokes: 96,
    totalKeystrokes: 100, missedCharacters: 0, recordEligible: true },
};
const typing60 = typingResult(60, "123e4567-e89b-42d3-a456-426614174260", "mode-select");
const typing15 = typingResult(15, "123e4567-e89b-42d3-a456-426614174215", "retry");
const sent = [];
let failNext = false;
const service = createLeaderboardSubmissionService({
  getClient: () => ({ functions: { async invoke(_name, { body }) {
    sent.push(structuredClone(body));
    if (failNext) { failNext = false; return { data: { ok: false, error: { code: "SERVER_ERROR" } } }; }
    return { data: { ok: true, data: { duplicate: false } } };
  } } }),
  invalidateBoard() {},
});
// Hidden Daily client preparation still cannot contaminate a later public result.
service.prepareResultSubmission("daily", dailyResult, auth, profile);
service.prepareResultSubmission("campaign", campaignResult, auth, profile);
await service.submitCurrentResult();
assert.equal(sent.at(-1).boardKey, "campaign-highest-level-v1");
assert.equal(sent.at(-1).sessionId, campaignResult.sessionId);
service.prepareResultSubmission("typing", typing60, auth, profile);
service.prepareResultSubmission("typing", typing15, auth, profile);
failNext = true;
await service.submitCurrentResult();
assert.equal(service.getSubmissionState().status, "error");
await service.retryCurrentSubmission();
assert.equal(sent.at(-1).boardKey, "typing-15s-english200-v1");
assert.equal(sent.at(-1).sessionId, typing15.sessionId);
assert.equal(sent.at(-2).sessionId, typing15.sessionId);

console.log("Retired Daily client normalization remains isolated while active Typing/Campaign validation and cross-mode payload replacement stay correct.");
