import assert from "node:assert/strict";
import { createLeaderboardSubmissionService } from "../js/leaderboardSubmissionService.js";

const SESSION = "123e4567-e89b-42d3-a456-426614174901";
const auth = { status: "signed-in", user: { id: "user-1" } };
const profile = { status: "ready", profile: { username: "Player_1" } };
const result = {
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
};

{
  const events = [];
  let online = false;
  const service = createLeaderboardSubmissionService({
    isOnline: () => online,
    enqueueOutbox: (mode, payload, userId) => {
      events.push(["enqueue", mode, payload.sessionId, userId]);
      return { ok: true, error: null, entry: {} };
    },
    markOutboxAttempt: (sessionId, userId, { errorCode }) => {
      events.push(["attempt", sessionId, userId, errorCode]);
      return true;
    },
    removeOutbox: (...args) => {
      events.push(["remove", ...args]);
      return true;
    },
  });
  const prepared = service.prepareResultSubmission("endless", result, auth, { status: "loading", profile: null });
  assert.equal(prepared.status, "checking");
  assert.equal(prepared.retryPersisted, true, "signed-in results must be durable before profile lookup/network");
  service.refreshSubmissionEligibility(auth, profile);
  const offline = await service.submitCurrentResult();
  assert.equal(offline.status, "offline");
  assert.equal(offline.retryPersisted, true);
  assert.deepEqual(events[0], ["enqueue", "endless", SESSION, "user-1"]);
  assert.deepEqual(events[1], ["attempt", SESSION, "user-1", "OFFLINE"]);
  assert.equal(events.some(([type]) => type === "remove"), false);

  online = true;
  service.clearSubmissionState();
}

{
  const events = [];
  const service = createLeaderboardSubmissionService({
    getClient: () => ({ functions: { invoke: async () => ({
      data: { ok: true, data: { duplicate: false, rank: 3 } },
      error: null,
    }) } }),
    enqueueOutbox: (mode, payload, userId) => {
      events.push(["enqueue", mode, payload.sessionId, userId]);
      return { ok: true, error: null, entry: {} };
    },
    markOutboxAttempt: () => true,
    removeOutbox: (sessionId, userId) => {
      events.push(["remove", sessionId, userId]);
      return true;
    },
    invalidateBoard() {},
  });
  service.prepareResultSubmission("endless", result, auth, profile);
  const submitted = await service.submitCurrentResult();
  assert.equal(submitted.status, "submitted");
  assert.equal(submitted.retryPersisted, false);
  assert.deepEqual(events[0], ["enqueue", "endless", SESSION, "user-1"]);
  assert.deepEqual(events[1], ["remove", SESSION, "user-1"]);
}

{
  const service = createLeaderboardSubmissionService({
    isOnline: () => false,
    enqueueOutbox: () => ({ ok: false, error: "STORAGE_ERROR", entry: null }),
    markOutboxAttempt: () => false,
  });
  service.prepareResultSubmission("endless", result, auth, profile);
  const state = await service.submitCurrentResult();
  assert.equal(state.status, "offline");
  assert.equal(state.retryPersisted, false);
  assert.equal(state.retryPersistenceError, "STORAGE_ERROR");
}

console.log("Leaderboard submission persists retry intent before network, retains failures, and clears durable intent after success.");
