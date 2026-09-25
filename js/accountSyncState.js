import { getResilientBrowserStorage } from "./browserStorage.js";

export const ACCOUNT_SYNC_DEVICE_STORAGE_KEY = "wordstrike.account-sync-device.v1";
export const ACCOUNT_SYNC_STATE_PREFIX = "wordstrike.account-sync-state.v1:";
export const ACCOUNT_SYNC_LOCAL_STATE_VERSION = 1;

let fallbackDeviceId = null;

function storageRef(storage = getResilientBrowserStorage()) {
  try { return storage ?? null; } catch { return null; }
}

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function deviceIdCandidate(cryptoSource = globalThis.crypto) {
  try {
    if (typeof cryptoSource?.randomUUID === "function") return `ws-device-${cryptoSource.randomUUID()}`;
    if (typeof cryptoSource?.getRandomValues === "function") {
      const bytes = cryptoSource.getRandomValues(new Uint8Array(16));
      return `ws-device-${[...bytes].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
    }
  } catch {}
  const now = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2);
  return `ws-device-${now}-${random}`;
}

export function getOrCreateAccountSyncDeviceId({
  storage = getResilientBrowserStorage(),
  cryptoSource = globalThis.crypto,
} = {}) {
  const target = storageRef(storage);
  try {
    const existing = target?.getItem?.(ACCOUNT_SYNC_DEVICE_STORAGE_KEY);
    if (typeof existing === "string" && /^ws-device-[A-Za-z0-9-]{8,128}$/.test(existing)) {
      fallbackDeviceId = existing;
      return existing;
    }
  } catch {}

  if (!fallbackDeviceId) fallbackDeviceId = deviceIdCandidate(cryptoSource);
  try { target?.setItem?.(ACCOUNT_SYNC_DEVICE_STORAGE_KEY, fallbackDeviceId); } catch {}
  return fallbackDeviceId;
}

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function nullableFinite(value) {
  if (value == null) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function sanitizeCounterMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = [];
  for (const [key, raw] of Object.entries(value)) {
    if (typeof key !== "string" || !key || key.length > 512) continue;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) continue;
    entries.push([key, number]);
  }
  return Object.fromEntries(entries);
}

function sanitizeClocks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clocks = {};
  for (const [path, raw] of Object.entries(value)) {
    if (
      typeof path !== "string" ||
      !path ||
      path.length > 512 ||
      !raw ||
      typeof raw !== "object" ||
      Array.isArray(raw)
    ) continue;
    const version = Number(raw.version ?? raw.updatedAt);
    const deviceId = typeof raw.deviceId === "string" ? raw.deviceId : "";
    if (!Number.isSafeInteger(version) || version < 0 || !deviceId) continue;
    clocks[path] = { version, deviceId: deviceId.slice(0, 160) };
  }
  return clocks;
}

export function createDefaultAccountSyncUserState(userId) {
  return {
    schemaVersion: ACCOUNT_SYNC_LOCAL_STATE_VERSION,
    userId: typeof userId === "string" ? userId : "",
    deviceId: null,
    observedCounters: {},
    ownCounters: {},
    observedSettings: null,
    settingClocks: {},
    lastSuccessAt: null,
    lastRemoteRevision: 0,
  };
}

function sanitizeUserState(value, userId) {
  const defaults = createDefaultAccountSyncUserState(userId);
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.schemaVersion !== ACCOUNT_SYNC_LOCAL_STATE_VERSION ||
    value.userId !== userId
  ) return defaults;
  return {
    schemaVersion: ACCOUNT_SYNC_LOCAL_STATE_VERSION,
    userId,
    deviceId: typeof value.deviceId === "string" && value.deviceId
      ? value.deviceId.slice(0, 160)
      : null,
    observedCounters: sanitizeCounterMap(value.observedCounters),
    ownCounters: sanitizeCounterMap(value.ownCounters),
    observedSettings: value.observedSettings && typeof value.observedSettings === "object" && !Array.isArray(value.observedSettings)
      ? clone(value.observedSettings)
      : null,
    settingClocks: sanitizeClocks(value.settingClocks),
    lastSuccessAt: nullableFinite(value.lastSuccessAt),
    lastRemoteRevision: Math.max(0, Math.trunc(finiteNonNegative(value.lastRemoteRevision))),
  };
}

function stateKey(userId) {
  return `${ACCOUNT_SYNC_STATE_PREFIX}${encodeURIComponent(userId)}`;
}

export function loadAccountSyncUserState(userId, {
  storage = getResilientBrowserStorage(),
} = {}) {
  if (typeof userId !== "string" || !userId) return createDefaultAccountSyncUserState("");
  const target = storageRef(storage);
  try {
    const raw = target?.getItem?.(stateKey(userId));
    if (!raw) return createDefaultAccountSyncUserState(userId);
    return sanitizeUserState(JSON.parse(raw), userId);
  } catch {
    return createDefaultAccountSyncUserState(userId);
  }
}

export function saveAccountSyncUserState(userId, value, {
  storage = getResilientBrowserStorage(),
} = {}) {
  if (typeof userId !== "string" || !userId) return false;
  const target = storageRef(storage);
  if (!target?.setItem) return false;
  const sanitized = sanitizeUserState({
    ...value,
    schemaVersion: ACCOUNT_SYNC_LOCAL_STATE_VERSION,
    userId,
  }, userId);
  try {
    target.setItem(stateKey(userId), JSON.stringify(sanitized));
    return true;
  } catch {
    return false;
  }
}

export function clearAccountSyncUserState(userId, {
  storage = getResilientBrowserStorage(),
} = {}) {
  if (typeof userId !== "string" || !userId) return false;
  try {
    storageRef(storage)?.removeItem?.(stateKey(userId));
    return true;
  } catch {
    return false;
  }
}
