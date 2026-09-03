import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildArcadeRushSessionResult } from "../js/arcadeRush/arcadeRushResult.js";
import { createAutomaticSubmissionController } from "../js/automaticSubmissionController.js";
import { createLeaderboardSubmissionService } from "../js/leaderboardSubmissionService.js";

const AUTH = { status: "signed-in", user: { id: "user-1" } };
const PROFILE = { status: "ready", profile: { username: "Player_1" } };
const SESSION = "123e4567-e89b-42d3-a456-426614174201";

function endlessResult(overrides = {}) {
  return {
    sessionId: SESSION,
    sessionSource: "mode-select",
    developerMode: false,
    success: false,
    failureReason: "core-destroyed",
    score: 1250,
    accuracy: 90,
    activeDurationMs: 10000,
    modeData: {
      highestStage: 1,
      finalStage: 1,
      wordsCompleted: 2,
      stageProgress: 2,
      completedStages: 0,
      recordEligible: true,
      metricVersion: 1,
      survivalPoints: 1000,
      wordPoints: 250,
      stageBonusPoints: 0,
      coreHits: 3,
      coreBreaches: 3,
      startStage: 1,
    },
    ...overrides,
  };
}

function campaignResult(success = true) {
  return {
    sessionId: SESSION, sessionSource: "level-select", developerMode: false, success,
    grade: success ? "A" : "F", accuracy: 96, activeDurationMs: 83000, variantId: "normal",
    characters: { correct: 100 }, words: { completed: success ? 20 : 10 },
    modeData: {
      level: 12, wordsTotal: 20, correctKeystrokes: 96, totalKeystrokes: 100,
      missedCharacters: 0, recordEligible: true,
    },
  };
}

function typingResult(durationSeconds, overrides = {}) {
  const scale = durationSeconds === 60 ? 4 : 1;
  return {
    sessionId: SESSION, sessionSource: "mode-select", developerMode: false, success: true,
    wpm: 80, accuracy: 95, activeDurationMs: durationSeconds * 1000,
    modeData: {
      durationSeconds, configId: `time-${durationSeconds}`, wordSetId: "english-200",
      wordSetVersion: 1, metricVersion: 2, rawWpm: 88,
      correctTestCharacters: 100 * scale, rawTestCharacters: 110 * scale,
      correctKeystrokes: 105 * scale, incorrectKeystrokes: 5 * scale,
      missedCharacters: 0, completedWordCount: 22 * scale, exactWords: 20 * scale,
      incorrectWords: 2 * scale, recordEligible: true,
      ...overrides,
    },
  };
}

function arcadeRushResult(overrides = {}) {
  const durationMs = 250_000;
  const correctCharacters = 1_000;
  const incorrectCharacters = 20;
  const totalKeystrokes = correctCharacters + incorrectCharacters;
  const missedCharacters = 0;
  const accuracy = correctCharacters / (totalKeystrokes + missedCharacters) * 100;
  const wpm = (correctCharacters / 5) / (durationMs / 60_000);
  return buildArcadeRushSessionResult({
    sessionId: SESSION,
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
      missed: missedCharacters,
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
    ...overrides,
  });
}

function harness({ online = true, response = { ok: true, data: { rank: 7 } } } = {}) {
  const requests = [];
  const invalidated = [];
  let isOnline = online;
  let nextResponse = response;
  const service = createLeaderboardSubmissionService({
    isOnline: () => isOnline,
    invalidateBoard: (boardKey) => invalidated.push(boardKey),
    getClient: () => ({ functions: { invoke: async (_name, options) => {
      requests.push(options.body);
      return { data: nextResponse };
    } } }),
  });
  const controller = createAutomaticSubmissionController({
    getState: service.getSubmissionState,
    markPending: service.markAutomaticSubmissionPending,
    expireCheck: service.expireAutomaticSubmissionCheck,
    refreshEligibility: service.refreshSubmissionEligibility,
    submit: service.submitCurrentResult,
  });
  return {
    service,
    controller,
    requests,
    invalidated,
    setOnline(value) { isOnline = value; },
    setResponse(value) { nextResponse = value; },
  };
}

{
  const h = harness();
  let timeoutCallback = null;
  const controller = createAutomaticSubmissionController({
    getState: h.service.getSubmissionState,
    markPending: h.service.markAutomaticSubmissionPending,
    expireCheck: h.service.expireAutomaticSubmissionCheck,
    refreshEligibility: h.service.refreshSubmissionEligibility,
    submit: h.service.submitCurrentResult,
    schedule(callback) { timeoutCallback = callback; return 1; },
    cancelSchedule() {},
  });
  const loadingAuth = { status: "loading" };
  h.service.prepareResultSubmission("endless", endlessResult(), loadingAuth, { status: "idle" });
  controller.armPreparedResult(loadingAuth, { status: "idle" });
  timeoutCallback();
  assert.equal(h.service.getSubmissionState().status, "error");
  assert.equal(h.service.getSubmissionState().error.code, "ACCOUNT_CHECK_TIMEOUT");
  await controller.handleStateChange(AUTH, PROFILE);
  assert.equal(h.requests.length, 0);
  assert.equal(h.service.getSubmissionState().status, "ready");
  assert.equal(h.service.getSubmissionState().automatic, false);
}

async function prepareAndEvaluate(h, result = endlessResult(), auth = AUTH, profile = PROFILE) {
  h.service.prepareResultSubmission("endless", result, auth, profile);
  h.controller.armPreparedResult(auth, profile);
  return h.controller.handleStateChange(auth, profile);
}

for (const [mode, result, boardKey] of [
  ["campaign", campaignResult(), "campaign-highest-level-v1"],
  ["typing", typingResult(60), "typing-60s-english200-v1"],
  ["typing", typingResult(15), "typing-15s-english200-v1"],
  ["endless", endlessResult(), "endless-v1"],
  ["arcade-rush", arcadeRushResult(), "arcade-rush-v1"],
]) {
  const h = harness();
  h.service.prepareResultSubmission(mode, result, AUTH, PROFILE);
  assert.equal(h.controller.armPreparedResult(AUTH, PROFILE), true);
  await h.controller.handleStateChange(AUTH, PROFILE);
  assert.equal(h.requests.length, 1, `${boardKey} should automatically submit`);
  assert.equal(h.requests[0].boardKey, boardKey);
}

for (const [mode, result] of [
  ["campaign", campaignResult(false)],
  ["typing", typingResult(30)],
  ["typing", typingResult(60, { wordSetId: "legacy-common-740" })],
  ["arcade-rush", arcadeRushResult({ developerMode: true })],
]) {
  const h = harness();
  h.service.prepareResultSubmission(mode, result, AUTH, PROFILE);
  assert.equal(h.controller.armPreparedResult(AUTH, PROFILE), false);
  await h.controller.handleStateChange(AUTH, PROFILE);
  assert.equal(h.requests.length, 0);
}

{
  const h = harness();
  await prepareAndEvaluate(h);
  await h.controller.handleStateChange(AUTH, PROFILE);
  assert.equal(h.requests.length, 1);
  assert.equal(h.service.getSubmissionState().status, "submitted");
  assert.equal(h.service.getSubmissionState().rank, 7);
  assert.deepEqual(h.invalidated, ["endless-v1"]);
}

for (const [auth, profile, expectedReason] of [
  [{ status: "signed-out" }, { status: "idle" }, "signed-out"],
  [AUTH, { status: "needs-username", profile: null }, "username-required"],
]) {
  const h = harness();
  h.service.prepareResultSubmission("endless", endlessResult(), auth, profile);
  assert.equal(h.service.getSubmissionState().reason, expectedReason);
  assert.equal(h.controller.armPreparedResult(auth, profile), false);
  await h.controller.handleStateChange(AUTH, PROFILE);
  assert.equal(h.requests.length, 0, "later account changes must not submit an old result");
  assert.equal(h.service.getSubmissionState().status, "ready", "the existing manual path remains available");
  assert.equal(h.service.getSubmissionState().automatic, false);
}

for (const result of [
  endlessResult({ sessionId: null }),
  endlessResult({ developerMode: true }),
  endlessResult({ modeData: { ...endlessResult().modeData, recordEligible: false } }),
]) {
  const h = harness();
  h.service.prepareResultSubmission("endless", result, AUTH, PROFILE);
  assert.equal(h.controller.armPreparedResult(AUTH, PROFILE), false);
  await h.controller.handleStateChange(AUTH, PROFILE);
  assert.equal(h.requests.length, 0);
}

{
  const h = harness();
  const loadingProfile = { status: "loading", profile: null };
  h.service.prepareResultSubmission("endless", endlessResult(), AUTH, loadingProfile);
  assert.equal(h.service.getSubmissionState().status, "checking");
  assert.equal(h.controller.armPreparedResult(AUTH, loadingProfile), true);
  await h.controller.handleStateChange(AUTH, loadingProfile);
  assert.equal(h.requests.length, 0);
  await Promise.all([
    h.controller.handleStateChange(AUTH, PROFILE),
    h.controller.handleStateChange(AUTH, PROFILE),
  ]);
  assert.equal(h.requests.length, 1);
}

{
  const h = harness();
  const loadingAuth = { status: "loading" };
  h.service.prepareResultSubmission("endless", endlessResult(), loadingAuth, { status: "idle" });
  h.controller.armPreparedResult(loadingAuth, { status: "idle" });
  await h.controller.handleStateChange({ status: "signed-out" }, { status: "idle" });
  await h.controller.handleStateChange(AUTH, PROFILE);
  assert.equal(h.requests.length, 0, "sign-in after a signed-out resolution is unrelated to the completed run");
}

{
  const h = harness();
  const loadingAuth = { status: "loading" };
  const loadingProfile = { status: "loading" };
  h.service.prepareResultSubmission("endless", endlessResult(), loadingAuth, { status: "idle" });
  h.controller.armPreparedResult(loadingAuth, { status: "idle" });
  await h.controller.handleStateChange(AUTH, loadingProfile);
  await h.controller.handleStateChange(AUTH, PROFILE);
  assert.equal(h.requests.length, 1, "initial authenticated-session resolution submits at most once");
}

{
  const h = harness({ response: { ok: false, error: { code: "SERVER_ERROR" } } });
  const mutableResult = endlessResult();
  await prepareAndEvaluate(h, mutableResult);
  assert.equal(h.service.getSubmissionState().status, "error");
  mutableResult.score = 999999;
  h.setResponse({ ok: true, data: { duplicate: true, rank: 9 } });
  await h.service.retryCurrentSubmission();
  assert.equal(h.requests.length, 2);
  assert.strictEqual(h.requests[0], h.requests[1]);
  assert.equal(h.requests[1].score, undefined);
  assert.equal(h.requests[1].result.score, 1250);
  assert.equal(h.requests[1].sessionId, SESSION);
  assert.equal(h.service.getSubmissionState().status, "already-submitted");
}

{
  const h = harness({ online: false });
  await prepareAndEvaluate(h);
  assert.equal(h.service.getSubmissionState().status, "offline");
  assert.equal(h.requests.length, 0);
  h.setOnline(true);
  await h.service.retryCurrentSubmission();
  assert.equal(h.requests.length, 1);
}

const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
for (const [finishName, mode] of [
  ["finishSpeedTest", "typing"],
  ["finishEndless", "endless"],
  ["finishArcadeRush", "arcade-rush"],
  ["finishLevel", "campaign"],
]) {
  const start = main.indexOf(`function ${finishName}`);
  assert.ok(start >= 0, `${finishName} must remain wired`);
  const nextFunction = main.indexOf("\nfunction ", start + 1);
  const body = main.slice(start, nextFunction >= 0 ? nextFunction : undefined);
  assert.match(body, new RegExp(`prepareAutomaticResultSubmission\\(\"${mode}\"`));
  assert.ok(body.indexOf("renderCurrentScreen()") < body.indexOf("startPreparedAutomaticSubmission()"));
}
const speed = await readFile(new URL("../js/speedTest.js", import.meta.url), "utf8");
const endless = await readFile(new URL("../js/endlessMode.js", import.meta.url), "utf8");
assert.ok(speed.indexOf("recordCompletedSession(result)") < speed.indexOf("callbacks.onComplete?.(currentSpeedTest, result)"));
assert.ok(endless.indexOf("recordCompletedSession(result)") < endless.indexOf("callbacks.onComplete?.(game, result)"));
const campaignFinish = main.slice(main.indexOf("function finishLevel"), main.indexOf("function pauseGame"));
assert.ok(campaignFinish.indexOf("finalizeCampaignSession") < campaignFinish.indexOf("prepareAutomaticResultSubmission"));
assert.ok(campaignFinish.indexOf("updateLevelResult") < campaignFinish.indexOf("prepareAutomaticResultSubmission"));
assert.doesNotMatch(main, /finishDaily|dailyMode\.js|prepareAutomaticResultSubmission\(\"daily\"/);
assert.match(main, /clearAutomaticSubmission\(\);\s*clearSubmissionState\(\);/);
assert.doesNotMatch(main, /setInterval\s*\(/);

console.log("Automatic score submission is completion-armed for active modes, account-gated, single-flight, retry-stable, local-first, and stale-safe.");
