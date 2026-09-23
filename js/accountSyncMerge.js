import { migrateModeDataToV2 } from "./modeStorage.js";
import { MODE_IDS } from "./modes.js";

export const ACCOUNT_SNAPSHOT_SCHEMA_VERSION = 2;
export const ACCOUNT_SYNC_METADATA_VERSION = 1;

const LIFETIME_COUNTER_FIELDS = Object.freeze([
  "finalizedSessions",
  "successfulSessions",
  "failedSessions",
  "activePlaytimeMs",
  "wordsCompleted",
  "wordsMissed",
  "charactersCorrect",
  "charactersIncorrect",
  "charactersMissed",
  "totalKeystrokes",
  "accuracyNumerator",
  "accuracyDenominator",
  "wpmWeightedTotal",
  "wpmWeightedDurationMs",
]);

const MODE_COUNTER_FIELDS = Object.freeze([
  "completedSessions",
  "failedSessions",
  "activePlaytimeMs",
]);

const RUSH_COUNTER_FIELDS = Object.freeze([
  "runsStarted",
  "runsCompleted",
  "bossesDefeated",
]);

function clone(value) {
  if (value == null) return value;
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

function finiteNonNegative(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function keyFor(path) {
  return JSON.stringify(path);
}

function pathFromKey(key) {
  try {
    const path = JSON.parse(key);
    return Array.isArray(path) && path.length > 0 && path.every((part) => typeof part === "string")
      ? path
      : null;
  } catch {
    return null;
  }
}

function addCounter(target, path, value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return;
  target[keyFor(path)] = number;
}

function activityCounters(target, path, activity) {
  if (!activity || typeof activity !== "object") return;
  for (const [key, value] of Object.entries(activity)) {
    if (key === "activityVersion") continue;
    addCounter(target, [...path, key], value);
  }
}

export function extractAccountCounters(modeValue) {
  const mode = migrateModeDataToV2(modeValue);
  const counters = {};

  for (const [key, value] of Object.entries(mode.totals || {})) {
    addCounter(counters, ["totals", key], value);
  }
  for (const key of LIFETIME_COUNTER_FIELDS) {
    addCounter(counters, ["lifetime", key], mode.lifetime?.[key]);
  }

  for (const [modeId, summary] of Object.entries(mode.modes || {})) {
    for (const key of MODE_COUNTER_FIELDS) {
      addCounter(counters, ["modes", modeId, key], summary?.[key]);
    }
    activityCounters(counters, ["modes", modeId, "activity"], summary?.activity);

    for (const [configId, value] of Object.entries(summary?.configUsage || {})) {
      addCounter(counters, ["modes", modeId, "configUsage", configId], value);
    }
    for (const [wordSetId, usage] of Object.entries(summary?.wordSetConfigUsage || {})) {
      for (const [configId, value] of Object.entries(usage || {})) {
        addCounter(
          counters,
          ["modes", modeId, "wordSetConfigUsage", wordSetId, configId],
          value,
        );
      }
    }
    for (const [wordSetId, activity] of Object.entries(summary?.wordSetActivity || {})) {
      activityCounters(
        counters,
        ["modes", modeId, "wordSetActivity", wordSetId],
        activity,
      );
    }

    if (modeId === MODE_IDS.ARCADE_RUSH) {
      for (const key of RUSH_COUNTER_FIELDS) {
        addCounter(counters, ["modes", modeId, "records", key], summary?.records?.[key]);
      }
    }
  }

  return counters;
}

function setPath(root, path, value) {
  if (!root || typeof root !== "object" || !Array.isArray(path) || !path.length) return false;
  let cursor = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (!cursor[key] || typeof cursor[key] !== "object" || Array.isArray(cursor[key])) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[path.at(-1)] = value;
  return true;
}

export function applyAccountCounters(modeValue, counters) {
  const mode = migrateModeDataToV2(modeValue);
  for (const [key, value] of Object.entries(counters || {})) {
    const path = pathFromKey(key);
    if (!path) continue;
    setPath(mode, path, finiteNonNegative(value));
  }
  return migrateModeDataToV2(mode);
}

function sanitizeCounterMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const counters = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!pathFromKey(key)) continue;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) continue;
    counters[key] = number;
  }
  return counters;
}

function maxCounterMaps(...maps) {
  const result = {};
  for (const map of maps) {
    for (const [key, value] of Object.entries(sanitizeCounterMap(map))) {
      result[key] = Math.max(result[key] ?? 0, value);
    }
  }
  return result;
}

function positiveDelta(current, observed) {
  const delta = {};
  for (const key of new Set([
    ...Object.keys(current || {}),
    ...Object.keys(observed || {}),
  ])) {
    const next = finiteNonNegative(current?.[key]);
    const previous = finiteNonNegative(observed?.[key]);
    if (next > previous) delta[key] = next - previous;
  }
  return delta;
}

function addCounterMaps(left, right) {
  const result = { ...sanitizeCounterMap(left) };
  for (const [key, value] of Object.entries(sanitizeCounterMap(right))) {
    result[key] = finiteNonNegative(result[key]) + value;
  }
  return result;
}

function subtractCounterMaps(total, component) {
  const result = {};
  for (const key of new Set([
    ...Object.keys(total || {}),
    ...Object.keys(component || {}),
  ])) {
    result[key] = Math.max(
      0,
      finiteNonNegative(total?.[key]) - finiteNonNegative(component?.[key]),
    );
  }
  return result;
}

function normalizeClock(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const version = Number(value.version ?? value.updatedAt);
  const deviceId = typeof value.deviceId === "string" ? value.deviceId : "";
  if (!Number.isSafeInteger(version) || version < 0 || !deviceId) return null;
  return { version, deviceId: deviceId.slice(0, 160) };
}

function sanitizeClocks(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const clocks = {};
  for (const [path, raw] of Object.entries(value)) {
    if (!pathFromKey(path)) continue;
    const clock = normalizeClock(raw);
    if (clock) clocks[path] = clock;
  }
  return clocks;
}

function compareClocks(left, right) {
  const a = normalizeClock(left);
  const b = normalizeClock(right);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;
  if (a.version !== b.version) return a.version > b.version ? 1 : -1;
  if (a.deviceId === b.deviceId) return 0;
  return a.deviceId > b.deviceId ? 1 : -1;
}

function maxClock(left, right) {
  return compareClocks(left, right) >= 0
    ? normalizeClock(left)
    : normalizeClock(right);
}

function mergeClockMaps(...maps) {
  const result = {};
  for (const map of maps) {
    for (const [path, clock] of Object.entries(sanitizeClocks(map))) {
      const winner = maxClock(result[path], clock);
      if (winner) result[path] = winner;
    }
  }
  return result;
}

function normalizeDevice(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    counters: sanitizeCounterMap(value.counters),
    lastSeenAt: finiteNonNegative(value.lastSeenAt),
  };
}

function normalizeSyncMetadata(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value.version !== ACCOUNT_SYNC_METADATA_VERSION
  ) return null;
  const devices = {};
  for (const [deviceId, raw] of Object.entries(value.devices || {})) {
    if (typeof deviceId !== "string" || !deviceId || deviceId.length > 160) continue;
    const device = normalizeDevice(raw);
    if (device) devices[deviceId] = device;
  }
  return {
    version: ACCOUNT_SYNC_METADATA_VERSION,
    counterBase: sanitizeCounterMap(value.counterBase),
    devices,
    settingClocks: sanitizeClocks(value.settingClocks),
  };
}

function mergeDeviceMaps(...maps) {
  const result = {};
  for (const map of maps) {
    for (const [deviceId, raw] of Object.entries(map || {})) {
      const device = normalizeDevice(raw);
      if (!device) continue;
      const previous = result[deviceId];
      result[deviceId] = {
        counters: maxCounterMaps(previous?.counters, device.counters),
        lastSeenAt: Math.max(
          finiteNonNegative(previous?.lastSeenAt),
          finiteNonNegative(device.lastSeenAt),
        ),
      };
    }
  }
  return result;
}

export function composeAccountCounters(sync) {
  const normalized = normalizeSyncMetadata(sync);
  if (!normalized) return {};
  let counters = { ...normalized.counterBase };
  for (const device of Object.values(normalized.devices)) {
    counters = addCounterMaps(counters, device.counters);
  }
  return counters;
}

function reconcileUnknownCounters(base, devices, observed) {
  const composed = composeAccountCounters({
    version: ACCOUNT_SYNC_METADATA_VERSION,
    counterBase: base,
    devices,
    settingClocks: {},
  });
  const next = { ...base };
  for (const [key, value] of Object.entries(sanitizeCounterMap(observed))) {
    const known = finiteNonNegative(composed[key]);
    if (value > known) next[key] = finiteNonNegative(next[key]) + (value - known);
  }
  return next;
}

function flattenLeaves(value, path = [], target = {}) {
  if (
    value == null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Date
  ) {
    target[keyFor(path)] = clone(value);
    return target;
  }
  const entries = Object.entries(value);
  if (!entries.length) {
    target[keyFor(path)] = {};
    return target;
  }
  for (const [key, nested] of entries) flattenLeaves(nested, [...path, key], target);
  return target;
}

function settingsEqual(left, right) {
  try { return JSON.stringify(left) === JSON.stringify(right); }
  catch { return left === right; }
}

function inflateLeaves(flat) {
  const result = {};
  for (const [key, value] of Object.entries(flat || {})) {
    const path = pathFromKey(key);
    if (!path?.length) continue;
    setPath(result, path, clone(value));
  }
  return result;
}

function hasLocalObservation(localState) {
  return Boolean(
    localState?.observedSettings &&
    typeof localState.observedSettings === "object" &&
    !Array.isArray(localState.observedSettings)
  ) || Object.keys(localState?.observedCounters || {}).length > 0
    || Number(localState?.lastRemoteRevision) > 0
    || Number(localState?.lastSuccessAt) > 0;
}

function mergedSettings({
  localSettings,
  remoteSettings,
  localMeta,
  remoteMeta,
  localState,
  deviceId,
  now,
  remoteExists,
}) {
  const localFlat = flattenLeaves(localSettings || {});
  const remoteFlat = flattenLeaves(remoteSettings || {});
  const observedFlat = localState?.observedSettings
    ? flattenLeaves(localState.observedSettings)
    : {};
  const localClocks = mergeClockMaps(
    localMeta?.settingClocks,
    localState?.settingClocks,
  );
  const remoteClocks = sanitizeClocks(remoteMeta?.settingClocks);

  if (hasLocalObservation(localState)) {
    for (const key of new Set([...Object.keys(localFlat), ...Object.keys(observedFlat)])) {
      if (!settingsEqual(localFlat[key], observedFlat[key])) {
        const baseVersion = Math.max(
          normalizeClock(localClocks[key])?.version ?? 0,
          normalizeClock(remoteClocks[key])?.version ?? 0,
        );
        localClocks[key] = { version: baseVersion + 1, deviceId };
      }
    }
  } else if (!remoteExists) {
    for (const key of Object.keys(localFlat)) {
      localClocks[key] = { version: 1, deviceId };
    }
  }

  const chosen = {};
  const clocks = {};
  for (const key of new Set([
    ...Object.keys(localFlat),
    ...Object.keys(remoteFlat),
    ...Object.keys(localClocks),
    ...Object.keys(remoteClocks),
  ])) {
    const localHas = Object.hasOwn(localFlat, key);
    const remoteHas = Object.hasOwn(remoteFlat, key);
    const localClock = localClocks[key];
    const remoteClock = remoteClocks[key];
    const comparison = compareClocks(localClock, remoteClock);

    if (comparison > 0 && localHas) chosen[key] = clone(localFlat[key]);
    else if (comparison < 0 && remoteHas) chosen[key] = clone(remoteFlat[key]);
    else if (comparison === 0 && localClock && remoteClock) {
      chosen[key] = localHas ? clone(localFlat[key]) : clone(remoteFlat[key]);
    } else if (localClock && localHas) chosen[key] = clone(localFlat[key]);
    else if (remoteClock && remoteHas) chosen[key] = clone(remoteFlat[key]);
    else if (remoteExists && remoteHas) chosen[key] = clone(remoteFlat[key]);
    else if (localHas) chosen[key] = clone(localFlat[key]);
    else if (remoteHas) chosen[key] = clone(remoteFlat[key]);

    const clock = maxClock(localClock, remoteClock);
    if (clock) clocks[key] = clock;
  }

  return {
    settings: inflateLeaves(chosen),
    settingClocks: clocks,
  };
}

export function mergeAccountSyncState(localSnapshot, remoteSnapshot, {
  deviceId = "ws-device-local",
  localState = {},
  now = Date.now(),
} = {}) {
  const remoteData = remoteSnapshot?.data || null;
  const localCounters = extractAccountCounters(localSnapshot?.mode);
  const remoteCounters = extractAccountCounters(remoteData?.mode);
  const localMeta = normalizeSyncMetadata(localSnapshot?.sync);
  const remoteMeta = normalizeSyncMetadata(remoteData?.sync);
  const hasMetadata = Boolean(localMeta || remoteMeta);

  const localStateOwn = localState?.deviceId === deviceId
    ? sanitizeCounterMap(localState?.ownCounters)
    : {};
  const inferredLegacyBase = hasLocalObservation(localState)
    ? subtractCounterMaps(localState?.observedCounters, localStateOwn)
    : {};
  let counterBase = hasMetadata
    ? maxCounterMaps(localMeta?.counterBase, remoteMeta?.counterBase)
    : hasLocalObservation(localState)
      ? maxCounterMaps(remoteCounters, inferredLegacyBase)
      : maxCounterMaps(localCounters, remoteCounters);
  let devices = mergeDeviceMaps(localMeta?.devices, remoteMeta?.devices);

  if (hasMetadata && remoteData) {
    counterBase = reconcileUnknownCounters(counterBase, devices, remoteCounters);
  }

  const previousOwn = maxCounterMaps(
    devices[deviceId]?.counters,
    localStateOwn,
  );
  const observed = hasLocalObservation(localState)
    ? sanitizeCounterMap(localState?.observedCounters)
    : composeAccountCounters({
      version: ACCOUNT_SYNC_METADATA_VERSION,
      counterBase,
      devices,
      settingClocks: {},
    });
  const localDelta = positiveDelta(localCounters, observed);
  const ownCounters = addCounterMaps(previousOwn, localDelta);
  devices = {
    ...devices,
    [deviceId]: {
      counters: ownCounters,
      lastSeenAt: now,
    },
  };

  const counters = composeAccountCounters({
    version: ACCOUNT_SYNC_METADATA_VERSION,
    counterBase,
    devices,
    settingClocks: {},
  });

  const settingMerge = mergedSettings({
    localSettings: localSnapshot?.settings || localSnapshot?.campaign?.settings || {},
    remoteSettings: remoteData?.settings || remoteData?.campaign?.settings || {},
    localMeta,
    remoteMeta,
    localState,
    deviceId,
    now,
    remoteExists: Boolean(remoteData),
  });

  const sync = {
    version: ACCOUNT_SYNC_METADATA_VERSION,
    counterBase,
    devices,
    settingClocks: settingMerge.settingClocks,
  };

  return {
    sync,
    counters,
    settings: settingMerge.settings,
    localState: {
      ...clone(localState || {}),
      deviceId,
      observedCounters: { ...counters },
      ownCounters: { ...ownCounters },
      observedSettings: clone(settingMerge.settings),
      settingClocks: { ...settingMerge.settingClocks },
    },
  };
}
