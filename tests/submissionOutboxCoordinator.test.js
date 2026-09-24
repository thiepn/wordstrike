import assert from "node:assert/strict";
import { createLeaderboardSubmissionService } from "../js/leaderboardSubmissionService.js";
import { createSubmissionOutboxCoordinator } from "../js/submissionOutboxCoordinator.js";
import {
  enqueueSubmissionOutbox,
  listSubmissionOutbox,
  markSubmissionOutboxAttempt,
  removeSubmissionOutbox,
} from "../js/submissionOutbox.js";

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const auth = { status: "signed-in", user: { id: "user-1" } };
const profile = { status: "ready", profile: { username: "Player_1" } };

function endlessPayload(sessionId) {
  return {
    boardKey: "endless-v1",
    sessionId,
    clientVersion: "1.0.0",
    result: {
      score: 1250,
      stage: 1,
      accuracy: 90,
      durationMs: 10000,
      wordsCompleted: 2,
      completed: false,
      failureReason: "core-destroyed",
      recordEligible: true,
      developerMode: false,
      sessionSource: "mode-select",
      metricVersion: 1,
      finalStage: 1,
      stageProgress: 2,
      completedStages: 0,
      survivalPoints: 1000,
      wordPoints: 250,
      stageBonusPoints: 0,
      coreHits: 3,
      coreBreaches: 3,
      startStage: 1,
    },
  };
}

for (const id of ["session-drain-one-0000001", "session-drain-two-0000002"]) {
  assert.equal(enqueueSubmissionOutbox("endless", endlessPayload(id), "user-1", {
    storage,
    now: 1000,
  }).ok, true);
}
assert.equal(enqueueSubmissionOutbox(
  "endless",
  endlessPayload("session-other-user-00003"),
  "user-2",
  { storage, now: 1000 },
).ok, true);

let online = true;
let fail = false;
const requests = [];
const makeService = () => createLeaderboardSubmissionService({
  isOnline: () => online,
  getClient: () => ({ functions: { invoke: async (_name, { body }) => {
    requests.push(body.sessionId);
    return fail
      ? { data: { ok: false, error: { code: "SERVER_ERROR" } } }
      : { data: { ok: true, data: { duplicate: false, rank: 1 } } };
  } } }),
  invalidateBoard() {},
  enqueueOutbox: () => ({ ok: true, error: null, entry: null }),
  markOutboxAttempt: () => true,
  removeOutbox: () => true,
});

const coordinator = createSubmissionOutboxCoordinator({
  list: ({ userId }) => listSubmissionOutbox({ storage, now: 2000, userId }),
  markAttempt: (sessionId, userId, options) => markSubmissionOutboxAttempt(
    sessionId,
    userId,
    { ...options, storage, now: 2000 },
  ),
  remove: (sessionId, userId) => removeSubmissionOutbox(sessionId, userId, { storage, now: 2000 }),
  makeService,
});

const firstDrain = coordinator.drain(auth, profile);
assert.equal(firstDrain, coordinator.drain(auth, profile), "drain must be single-flight");
assert.equal((await firstDrain).status, "drained");
assert.deepEqual(requests, ["session-drain-one-0000001", "session-drain-two-0000002"]);
assert.equal(listSubmissionOutbox({ storage, now: 2000, userId: "user-1" }).length, 0);
assert.equal(listSubmissionOutbox({ storage, now: 2000, userId: "user-2" }).length, 1);

assert.equal(enqueueSubmissionOutbox(
  "endless",
  endlessPayload("session-retry-after-reload-04"),
  "user-1",
  { storage, now: 2100 },
).ok, true);
fail = true;
const deferred = await coordinator.drain(auth, profile);
assert.equal(deferred.status, "deferred");
assert.equal(listSubmissionOutbox({ storage, now: 2200, userId: "user-1" }).length, 1);

fail = false;
online = true;
assert.equal((await coordinator.drain(auth, profile)).status, "drained");
assert.equal(listSubmissionOutbox({ storage, now: 2300, userId: "user-1" }).length, 0);

online = false;
assert.equal(enqueueSubmissionOutbox(
  "endless",
  endlessPayload("session-offline-outbox-0005"),
  "user-1",
  { storage, now: 2400 },
).ok, true);
assert.equal((await coordinator.drain(auth, profile)).status, "deferred");
assert.equal(listSubmissionOutbox({ storage, now: 2500, userId: "user-1" }).length, 1);

assert.equal((await coordinator.drain({ status: "signed-out" }, profile)).status, "waiting");
assert.equal(listSubmissionOutbox({ storage, now: 2500, userId: "user-1" }).length, 1);

online = true;
const requestsBeforeSkip = requests.length;
const skipped = await coordinator.drain(auth, profile, {
  skipSessionId: "session-offline-outbox-0005",
});
assert.equal(skipped.status, "empty");
assert.equal(requests.length, requestsBeforeSkip);
assert.equal(listSubmissionOutbox({ storage, now: 2500, userId: "user-1" }).length, 1);


const makeDeferredRequest = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

// Cross-account lifecycle stress: B must be able to replace A's active drain,
// and A's late completion must not mutate either outbox or clear B's ownership.
{
  const requestA = makeDeferredRequest();
  const requestB = makeDeferredRequest();
  const raceEntries = {
    "user-a": [{
      mode: "campaign",
      sessionId: "outbox-session-user-a-0001",
      immutablePayload: { sessionId: "outbox-session-user-a-0001" },
    }],
    "user-b": [{
      mode: "campaign",
      sessionId: "outbox-session-user-b-0002",
      immutablePayload: { sessionId: "outbox-session-user-b-0002" },
    }],
  };
  const removals = [];
  const attempts = [];
  let serviceCount = 0;
  const raceCoordinator = createSubmissionOutboxCoordinator({
    list: ({ userId }) => raceEntries[userId] || [],
    markAttempt: (sessionId, userId, options) => {
      attempts.push({ sessionId, userId, options });
      return true;
    },
    remove: (sessionId, userId) => {
      removals.push({ sessionId, userId });
      raceEntries[userId] = (raceEntries[userId] || []).filter((entry) => entry.sessionId !== sessionId);
      return true;
    },
    makeService: () => {
      serviceCount += 1;
      let hydratedUserId = null;
      return {
        restorePreparedSubmission(_mode, payload, authState) {
          hydratedUserId = authState.user.id;
          return { status: "ready", sessionId: payload.sessionId };
        },
        submitCurrentResult() {
          return hydratedUserId === "user-a" ? requestA.promise : requestB.promise;
        },
      };
    },
  });

  const drainA = raceCoordinator.drain({ status: "signed-in", user: { id: "user-a" } }, profile);
  assert.equal(raceCoordinator.isActive(), true);
  const drainB = raceCoordinator.drain({ status: "signed-in", user: { id: "user-b" } }, profile);
  assert.notEqual(drainB, drainA);
  assert.equal(serviceCount, 2);

  requestA.resolve({ status: "submitted" });
  await drainA;
  assert.deepEqual(removals, []);
  assert.deepEqual(attempts, []);
  assert.equal(raceCoordinator.isActive(), true, "stale A finalizer must not clear B's active drain");

  requestB.resolve({ status: "submitted" });
  assert.equal((await drainB).status, "drained");
  assert.deepEqual(removals, [{
    sessionId: "outbox-session-user-b-0002",
    userId: "user-b",
  }]);
  assert.equal(raceCoordinator.isActive(), false);
}

// Sign-out must detach an active account drain instead of returning that
// account's promise to an unauthenticated lifecycle.
{
  const request = makeDeferredRequest();
  const signoutCoordinator = createSubmissionOutboxCoordinator({
    list: ({ userId }) => userId === "user-a" ? [{
      mode: "campaign",
      sessionId: "outbox-session-signout-0003",
      immutablePayload: { sessionId: "outbox-session-signout-0003" },
    }] : [],
    markAttempt: () => true,
    remove: () => true,
    makeService: () => ({
      restorePreparedSubmission: (_mode, payload) => ({ status: "ready", sessionId: payload.sessionId }),
      submitCurrentResult: () => request.promise,
    }),
  });
  const activeDrain = signoutCoordinator.drain({ status: "signed-in", user: { id: "user-a" } }, profile);
  const signedOutState = await signoutCoordinator.drain(
    { status: "signed-out", user: null },
    { status: "idle", profile: null },
  );
  assert.equal(signedOutState.status, "waiting");
  assert.equal(signoutCoordinator.isActive(), false);
  request.resolve({ status: "submitted" });
  await activeDrain;
  assert.equal(signoutCoordinator.getState().status, "waiting");
}

console.log("Submission outbox drains after reload, stays user-bound, skips foreground-owned results, retries later, never drops offline failures, and invalidates stale drains on account changes.");
