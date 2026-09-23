export const SUBMISSION_OUTBOX_STORAGE_KEY = "wordstrike.submission-outbox.v1";
export const SUBMISSION_OUTBOX_SCHEMA_VERSION = 1;
export const SUBMISSION_OUTBOX_MAX_ENTRIES = 50;
export const SUBMISSION_OUTBOX_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const MODES = new Set(["campaign", "typing", "endless", "arcade-rush", "flow"]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function validPayload(payload) {
  return Boolean(
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof payload.boardKey === "string" &&
    payload.boardKey &&
    typeof payload.sessionId === "string" &&
    payload.sessionId &&
    payload.result &&
    typeof payload.result === "object" &&
    !Array.isArray(payload.result)
  );
}

function sanitizeEntry(value, now = Date.now()) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.schemaVersion !== SUBMISSION_OUTBOX_SCHEMA_VERSION) return null;
  if (!MODES.has(value.mode) || !validPayload(value.immutablePayload)) return null;
  if (value.boardKey !== value.immutablePayload.boardKey) return null;
  if (value.sessionId !== value.immutablePayload.sessionId) return null;
  if (typeof value.boundUserId !== "string" || !value.boundUserId) return null;
  if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt) || !Number.isFinite(value.expiresAt)) return null;
  if (value.expiresAt <= now || value.expiresAt - value.createdAt > SUBMISSION_OUTBOX_MAX_AGE_MS) return null;
  return Object.freeze({
    schemaVersion: SUBMISSION_OUTBOX_SCHEMA_VERSION,
    mode: value.mode,
    boardKey: value.boardKey,
    sessionId: value.sessionId,
    immutablePayload: clone(value.immutablePayload),
    boundUserId: value.boundUserId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    expiresAt: value.expiresAt,
    attempts: Number.isSafeInteger(value.attempts) && value.attempts >= 0 ? value.attempts : 0,
    lastAttemptAt: Number.isFinite(value.lastAttemptAt) ? value.lastAttemptAt : null,
    lastErrorCode: typeof value.lastErrorCode === "string" && value.lastErrorCode
      ? value.lastErrorCode
      : null,
  });
}

function readEntries(storage, now) {
  if (!storage?.getItem) return { entries: [], dirty: false, available: false };
  try {
    const raw = storage.getItem(SUBMISSION_OUTBOX_STORAGE_KEY);
    if (!raw) return { entries: [], dirty: false, available: true };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { entries: [], dirty: true, available: true };
    const entries = parsed.map((value) => sanitizeEntry(value, now)).filter(Boolean);
    return { entries, dirty: entries.length !== parsed.length, available: true };
  } catch {
    return { entries: [], dirty: true, available: true };
  }
}

function writeEntries(storage, entries) {
  if (!storage?.setItem) return false;
  try {
    storage.setItem(SUBMISSION_OUTBOX_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function entryKey(entry) {
  return `${entry.boundUserId}:${entry.boardKey}:${entry.sessionId}`;
}

export function listSubmissionOutbox({
  storage = globalThis.localStorage,
  now = Date.now(),
  userId = null,
} = {}) {
  const read = readEntries(storage, now);
  if (read.dirty && read.available) writeEntries(storage, read.entries);
  const entries = typeof userId === "string" && userId
    ? read.entries.filter((entry) => entry.boundUserId === userId)
    : read.entries;
  return Object.freeze([...entries].sort((a, b) => a.createdAt - b.createdAt));
}

export function enqueueSubmissionOutbox(mode, immutablePayload, boundUserId, {
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  if (!MODES.has(mode) || !validPayload(immutablePayload) || typeof boundUserId !== "string" || !boundUserId) {
    return Object.freeze({ ok: false, error: "INVALID_ENTRY", entry: null });
  }
  const read = readEntries(storage, now);
  if (!read.available) return Object.freeze({ ok: false, error: "STORAGE_UNAVAILABLE", entry: null });
  const candidate = sanitizeEntry({
    schemaVersion: SUBMISSION_OUTBOX_SCHEMA_VERSION,
    mode,
    boardKey: immutablePayload.boardKey,
    sessionId: immutablePayload.sessionId,
    immutablePayload: clone(immutablePayload),
    boundUserId,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + SUBMISSION_OUTBOX_MAX_AGE_MS,
    attempts: 0,
    lastAttemptAt: null,
    lastErrorCode: null,
  }, now);
  if (!candidate) return Object.freeze({ ok: false, error: "INVALID_ENTRY", entry: null });

  const key = entryKey(candidate);
  const existingIndex = read.entries.findIndex((entry) => entryKey(entry) === key);
  let next;
  let storedEntry = candidate;
  if (existingIndex >= 0) {
    // A session payload becomes immutable the first time it enters the outbox.
    // Re-preparing the same result must never rewrite metrics that may already
    // be the only durable copy after a crash or local-history write failure.
    storedEntry = read.entries[existingIndex];
    next = read.entries;
  } else {
    if (read.entries.length >= SUBMISSION_OUTBOX_MAX_ENTRIES) {
      return Object.freeze({ ok: false, error: "OUTBOX_FULL", entry: null });
    }
    next = [...read.entries, storedEntry];
  }
  if (!writeEntries(storage, next)) {
    return Object.freeze({ ok: false, error: "STORAGE_ERROR", entry: null });
  }
  return Object.freeze({ ok: true, error: null, entry: storedEntry });
}

export function markSubmissionOutboxAttempt(sessionId, boundUserId, {
  storage = globalThis.localStorage,
  now = Date.now(),
  errorCode = null,
} = {}) {
  const read = readEntries(storage, now);
  if (!read.available) return false;
  const index = read.entries.findIndex((entry) => (
    entry.sessionId === sessionId && entry.boundUserId === boundUserId
  ));
  if (index < 0) return false;
  const next = [...read.entries];
  next[index] = {
    ...next[index],
    updatedAt: now,
    attempts: next[index].attempts + 1,
    lastAttemptAt: now,
    lastErrorCode: typeof errorCode === "string" && errorCode ? errorCode : null,
  };
  return writeEntries(storage, next);
}

export function removeSubmissionOutbox(sessionId, boundUserId = null, {
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  const read = readEntries(storage, now);
  if (!read.available) return false;
  const next = read.entries.filter((entry) => !(
    entry.sessionId === sessionId &&
    (!boundUserId || entry.boundUserId === boundUserId)
  ));
  if (next.length === read.entries.length) return true;
  return writeEntries(storage, next);
}

export function clearSubmissionOutbox(storage = globalThis.localStorage) {
  if (!storage?.removeItem) return false;
  try {
    storage.removeItem(SUBMISSION_OUTBOX_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
