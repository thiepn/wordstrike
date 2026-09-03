import { buildSubmissionPayload } from "./leaderboardSubmissionService.js";

export const PENDING_RESULT_STORAGE_KEY = "wordstrike.pending-result-submission.v1";
export const PENDING_RESULT_MAX_AGE_MS = 30 * 60 * 1000;
const MODES = new Set(["campaign", "typing", "endless", "arcade-rush"]);

function invalidIntentReason(value, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "MALFORMED_INTENT";
  if (value.schemaVersion !== 1 || value.source !== "result-google-sign-in") return "MALFORMED_INTENT";
  if (!MODES.has(value.mode) || !value.immutablePayload || typeof value.immutablePayload !== "object") return "MALFORMED_INTENT";
  if (value.boardKey !== value.immutablePayload.boardKey || value.sessionId !== value.immutablePayload.sessionId) return "MALFORMED_INTENT";
  if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.expiresAt)) return "MALFORMED_INTENT";
  if (value.expiresAt <= now) return "EXPIRED";
  if (value.expiresAt - value.createdAt > PENDING_RESULT_MAX_AGE_MS) return "MALFORMED_INTENT";
  if (value.returnDestination !== "leaderboard") return "MALFORMED_INTENT";
  if (value.boundUserId != null && (typeof value.boundUserId !== "string" || !value.boundUserId)) return "MALFORMED_INTENT";
  return null;
}

function validIntent(value, now) {
  if (invalidIntentReason(value, now)) return null;
  return Object.freeze({
    schemaVersion: 1,
    boardKey: value.boardKey,
    sessionId: value.sessionId,
    mode: value.mode,
    immutablePayload: value.immutablePayload,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    source: "result-google-sign-in",
    returnDestination: "leaderboard",
    boundUserId: value.boundUserId ?? null,
  });
}

export function savePendingResultSubmission(mode, result, {
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  const immutablePayload = buildSubmissionPayload(mode, result);
  if (!immutablePayload || !storage?.setItem) return null;
  const intent = {
    schemaVersion: 1,
    boardKey: immutablePayload.boardKey,
    sessionId: immutablePayload.sessionId,
    mode,
    immutablePayload,
    createdAt: now,
    expiresAt: now + PENDING_RESULT_MAX_AGE_MS,
    source: "result-google-sign-in",
    returnDestination: "leaderboard",
    boundUserId: null,
  };
  try {
    storage.setItem(PENDING_RESULT_STORAGE_KEY, JSON.stringify(intent));
    return validIntent(intent, now);
  } catch {
    return null;
  }
}

export function bindPendingResultSubmission(userId, {
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  if (typeof userId !== "string" || !userId) return Object.freeze({ intent: null, error: "AUTH_REQUIRED" });
  const intent = loadPendingResultSubmission({ storage, now });
  if (!intent) return Object.freeze({ intent: null, error: "INTENT_UNAVAILABLE" });
  if (intent.boundUserId && intent.boundUserId !== userId) {
    clearPendingResultSubmission(storage);
    return Object.freeze({ intent: null, error: "USER_MISMATCH" });
  }
  const bound = { ...intent, boundUserId: userId };
  try {
    storage.setItem(PENDING_RESULT_STORAGE_KEY, JSON.stringify(bound));
    return Object.freeze({ intent: validIntent(bound, now), error: null });
  } catch {
    return Object.freeze({ intent: null, error: "STORAGE_ERROR" });
  }
}

export function loadPendingResultSubmission({
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  return inspectPendingResultSubmission({ storage, now }).intent;
}

export function inspectPendingResultSubmission({
  storage = globalThis.localStorage,
  now = Date.now(),
} = {}) {
  if (!storage?.getItem) return Object.freeze({ intent: null, error: null });
  try {
    const raw = storage.getItem(PENDING_RESULT_STORAGE_KEY);
    if (!raw) return Object.freeze({ intent: null, error: null });
    const parsed = JSON.parse(raw);
    const error = invalidIntentReason(parsed, now);
    if (!error) return Object.freeze({ intent: validIntent(parsed, now), error: null });
    clearPendingResultSubmission(storage);
    return Object.freeze({ intent: null, error });
  } catch {
    clearPendingResultSubmission(storage);
    return Object.freeze({ intent: null, error: "MALFORMED_INTENT" });
  }
}

export function clearPendingResultSubmission(storage = globalThis.localStorage) {
  try { storage?.removeItem?.(PENDING_RESULT_STORAGE_KEY); return true; } catch { return false; }
}
