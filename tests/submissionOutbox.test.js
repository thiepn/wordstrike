import assert from "node:assert/strict";
import {
  clearSubmissionOutbox,
  enqueueSubmissionOutbox,
  listSubmissionOutbox,
  markSubmissionOutboxAttempt,
  removeSubmissionOutbox,
  SUBMISSION_OUTBOX_MAX_AGE_MS,
  SUBMISSION_OUTBOX_STORAGE_KEY,
} from "../js/submissionOutbox.js";

const values = new Map();
const storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};

const payload = (sessionId, boardKey = "endless-v1") => ({
  boardKey,
  sessionId,
  clientVersion: "1.0.0",
  result: { score: 1 },
});

let first = enqueueSubmissionOutbox(
  "endless",
  payload("session-outbox-first-0001"),
  "user-1",
  { storage, now: 1000 },
);
assert.equal(first.ok, true);
assert.equal(listSubmissionOutbox({ storage, now: 1100, userId: "user-1" }).length, 1);

const duplicate = enqueueSubmissionOutbox(
  "endless",
  payload("session-outbox-first-0001"),
  "user-1",
  { storage, now: 1200 },
);
assert.equal(duplicate.ok, true);
assert.equal(duplicate.entry.createdAt, 1000);
assert.equal(listSubmissionOutbox({ storage, now: 1300, userId: "user-1" }).length, 1);

assert.equal(markSubmissionOutboxAttempt("session-outbox-first-0001", "user-1", {
  storage,
  now: 1400,
  errorCode: "OFFLINE",
}), true);
first = listSubmissionOutbox({ storage, now: 1500, userId: "user-1" })[0];
assert.equal(first.attempts, 1);
assert.equal(first.lastErrorCode, "OFFLINE");

assert.equal(enqueueSubmissionOutbox(
  "typing",
  payload("session-outbox-second-0002", "typing-60s-english200-v1"),
  "user-2",
  { storage, now: 1600 },
).ok, true);
assert.equal(listSubmissionOutbox({ storage, now: 1700 }).length, 2);
assert.equal(listSubmissionOutbox({ storage, now: 1700, userId: "user-1" }).length, 1);

assert.equal(removeSubmissionOutbox("session-outbox-first-0001", "user-1", { storage, now: 1800 }), true);
assert.equal(listSubmissionOutbox({ storage, now: 1900, userId: "user-1" }).length, 0);
assert.equal(listSubmissionOutbox({ storage, now: 1900, userId: "user-2" }).length, 1);

values.set(SUBMISSION_OUTBOX_STORAGE_KEY, JSON.stringify([{
  schemaVersion: 1,
  mode: "endless",
  boardKey: "endless-v1",
  sessionId: "session-expired-outbox-003",
  immutablePayload: payload("session-expired-outbox-003"),
  boundUserId: "user-1",
  createdAt: 1000,
  updatedAt: 1000,
  expiresAt: 1000 + SUBMISSION_OUTBOX_MAX_AGE_MS,
  attempts: 0,
}]));
assert.equal(listSubmissionOutbox({
  storage,
  now: 1000 + SUBMISSION_OUTBOX_MAX_AGE_MS,
}).length, 0);

values.set(SUBMISSION_OUTBOX_STORAGE_KEY, "broken-json");
assert.deepEqual(listSubmissionOutbox({ storage, now: 2000 }), []);
assert.doesNotThrow(() => JSON.parse(values.get(SUBMISSION_OUTBOX_STORAGE_KEY)));

const failingStorage = {
  getItem() { return null; },
  setItem() { throw new Error("quota"); },
};
assert.equal(enqueueSubmissionOutbox(
  "endless",
  payload("session-storage-fail-0004"),
  "user-1",
  { storage: failingStorage, now: 2000 },
).ok, false);

assert.equal(clearSubmissionOutbox(storage), true);
assert.equal(values.has(SUBMISSION_OUTBOX_STORAGE_KEY), false);

console.log("Submission outbox is durable, user-bound, deduplicated, expiry-safe, and storage-failure-aware.");
