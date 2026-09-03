import assert from "node:assert/strict";
import {
  buildSubmissionPayload,
  buildTypingSubmissionResult,
  createLeaderboardSubmissionService,
} from "../js/leaderboardSubmissionService.js";
import { validateScoreSubmission } from "../supabase/functions/_shared/scoreSubmission.js";

const auth = { status: "signed-in", user: { id: "user-1" } };
const profile = { profile: { username: "Player_1" } };
const retiredDailyResult = {
  sessionId: "cb37a745-a075-406e-ab80-a448f5d71772",
  sessionSource: "daily-ready",
  developerMode: false,
  success: true,
  score: 32031,
  modeData: { recordEligible: true },
};
assert.equal(buildSubmissionPayload("daily", retiredDailyResult), null, "retired Daily must have no client submission serializer");
assert.equal(validateScoreSubmission({
  boardKey: "daily-strike-v1",
  sessionId: retiredDailyResult.sessionId,
  clientVersion: "1.0.0",
  result: {},
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
service.prepareResultSubmission("daily", retiredDailyResult, auth, profile);
assert.equal(service.getSubmissionState().status, "ineligible");
assert.equal(service.getSubmissionState().reason, "invalid-result");
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

console.log("Retired Daily has no client serializer while active Typing/Campaign validation and cross-mode payload replacement remain correct.");
