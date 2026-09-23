import { getSupabaseClient } from "./supabaseClient.js";
import { SUPABASE_CONFIG } from "./supabaseConfig.js";
import { LOCAL_DATA_CHANGED_EVENT } from "./localDataEvents.js";
import { loadModeData, saveModeData } from "./modeStorage.js";
import { loadSave, saveGame } from "./storage.js";
import {
  ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
} from "./accountSyncMerge.js";
import {
  mergeWordStrikeSnapshotsWithSyncState,
} from "./accountDataMerge.js";
import {
  getOrCreateAccountSyncDeviceId,
  loadAccountSyncUserState,
  saveAccountSyncUserState,
} from "./accountSyncState.js";

const FUNCTION_NAME = "wordstrike-profile-sync";
const SYNC_DELAY_MS = 350;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 60000;
const MAX_CONFLICT_RETRIES = 3;

function plain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeNow(now = Date.now) {
  const value = Number(now());
  return Number.isFinite(value) ? value : Date.now();
}

export function createLocalAccountSnapshot(now = Date.now()) {
  const campaign = loadSave();
  const mode = loadModeData();
  return {
    schemaVersion: ACCOUNT_SNAPSHOT_SCHEMA_VERSION,
    updatedAt: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
    campaign: plain(campaign),
    mode: plain(mode),
    settings: plain(campaign?.settings || {}),
  };
}

async function readFunctionError(error) {
  try {
    if (typeof error?.context?.json === "function") return await error.context.json();
  } catch {
    // Fall through to the stable generic sync error.
  }
  return null;
}

async function invokeProfileSync(client, body) {
  const { data, error } = await client.functions.invoke(FUNCTION_NAME, { body });
  let payload = data;
  if ((!payload || payload.ok !== true) && error) {
    payload = await readFunctionError(error) || payload;
  }
  if (!payload || payload.ok !== true) {
    return {
      ok: false,
      code: payload?.error?.code || "SYNC_UNAVAILABLE",
      message: payload?.error?.message || "Cloud save is temporarily unavailable.",
    };
  }
  return { ok: true, profile: payload.data?.profile ?? null };
}

const makeSyncState = ({
  userId = null,
  status = "idle",
  dirty = false,
  syncing = false,
  errorCode = null,
  retryCount = 0,
  retryAt = null,
  lastAttemptAt = null,
  lastSuccessAt = null,
  revision = 0,
} = {}) => Object.freeze({
  userId,
  status,
  dirty: dirty === true,
  syncing: syncing === true,
  errorCode: errorCode ? String(errorCode) : null,
  retryCount: Math.max(0, Math.trunc(Number(retryCount) || 0)),
  retryAt: Number.isFinite(Number(retryAt)) ? Number(retryAt) : null,
  lastAttemptAt: Number.isFinite(Number(lastAttemptAt)) ? Number(lastAttemptAt) : null,
  lastSuccessAt: Number.isFinite(Number(lastSuccessAt)) ? Number(lastSuccessAt) : null,
  revision: Math.max(0, Math.trunc(Number(revision) || 0)),
});

export function createAccountDataSyncService({
  getClient = getSupabaseClient,
  createSnapshot = () => createLocalAccountSnapshot(Date.now()),
  mergeSnapshots = mergeWordStrikeSnapshotsWithSyncState,
  loadUserState = loadAccountSyncUserState,
  saveUserState = saveAccountSyncUserState,
  getDeviceId = getOrCreateAccountSyncDeviceId,
  saveCampaign = saveGame,
  saveMode = saveModeData,
  now = () => Date.now(),
  isOnline = () => globalThis.navigator?.onLine !== false,
  schedule = (callback, delay) => globalThis.setTimeout?.(callback, delay),
  cancelSchedule = (timerId) => globalThis.clearTimeout?.(timerId),
  addGlobalListener = (type, handler) => globalThis.addEventListener?.(type, handler),
  documentRef = globalThis.document,
  fetchFn = (...args) => globalThis.fetch?.(...args),
  supabaseUrl = SUPABASE_CONFIG.url,
} = {}) {
  let activeUserId = null;
  let activeAccessToken = null;
  let syncPromise = null;
  let syncTimer = null;
  let syncPending = false;
  let suppressLocalEvents = false;
  let listenerInstalled = false;
  let appliedCallback = null;
  let generation = 0;
  let retryCount = 0;
  let pendingRetryDelay = null;
  let dirty = false;
  let lastRemoteProfile = null;
  let state = makeSyncState();
  const listeners = new Set();

  const publish = (patch = {}) => {
    state = makeSyncState({ ...state, ...patch });
    for (const listener of listeners) listener(state);
    return state;
  };

  const clearTimer = () => {
    if (syncTimer != null) cancelSchedule?.(syncTimer);
    syncTimer = null;
  };

  const applyLocalSnapshot = (snapshot) => {
    suppressLocalEvents = true;
    let campaignPersisted = false;
    let modePersisted = false;
    try {
      campaignPersisted = saveCampaign(snapshot.campaign) === true;
      modePersisted = saveMode(snapshot.mode) === true;
    } finally {
      suppressLocalEvents = false;
    }
    if (!campaignPersisted || !modePersisted) {
      return {
        ok: false,
        code: !campaignPersisted && !modePersisted
          ? "LOCAL_STORAGE_FAILED"
          : !campaignPersisted
            ? "CAMPAIGN_STORAGE_FAILED"
            : "MODE_STORAGE_FAILED",
      };
    }
    appliedCallback?.(snapshot);
    return { ok: true };
  };

  const retryDelay = () => Math.min(
    RETRY_MAX_MS,
    RETRY_BASE_MS * (2 ** Math.min(Math.max(0, retryCount - 1), 6)),
  );

  const scheduleSync = (delay = SYNC_DELAY_MS) => {
    if (!activeUserId || suppressLocalEvents) return false;
    if (!isOnline()) {
      clearTimer();
      publish({
        status: "offline",
        dirty: true,
        syncing: false,
        retryAt: null,
        errorCode: "OFFLINE",
      });
      return false;
    }
    if (syncPromise) {
      syncPending = true;
      return true;
    }
    clearTimer();
    const expectedGeneration = generation;
    const safeDelay = Math.max(0, Number(delay) || 0);
    const retryAt = safeNow(now) + safeDelay;
    syncTimer = schedule?.(() => {
      syncTimer = null;
      void synchronize(expectedGeneration);
    }, safeDelay) ?? null;
    publish({
      status: safeDelay > SYNC_DELAY_MS ? "error" : "pending",
      dirty: true,
      retryAt,
    });
    return true;
  };

  const failAndRetry = (code, expectedGeneration, userId) => {
    if (expectedGeneration !== generation || activeUserId !== userId) {
      return { ok: false, code: "INACTIVE" };
    }
    dirty = true;
    retryCount += 1;
    if (!isOnline()) {
      publish({
        status: "offline",
        dirty: true,
        syncing: false,
        errorCode: code || "OFFLINE",
        retryCount,
        retryAt: null,
      });
      return { ok: false, code: code || "OFFLINE" };
    }
    const delay = retryDelay();
    if (syncPromise) pendingRetryDelay = delay;
    publish({
      status: "error",
      dirty: true,
      syncing: false,
      errorCode: code || "SYNC_UNAVAILABLE",
      retryCount,
      retryAt: safeNow(now) + delay,
    });
    if (!syncPromise) scheduleSync(delay);
    return { ok: false, code: code || "SYNC_UNAVAILABLE" };
  };

  const persistMergedLocalState = (userId, mergeResult, revision, successAt = null) => {
    const nextState = {
      ...mergeResult.localState,
      lastRemoteRevision: Math.max(0, Number(revision) || 0),
      lastSuccessAt: successAt ?? mergeResult.localState?.lastSuccessAt ?? null,
    };
    return saveUserState(userId, nextState)
      ? { ok: true, state: nextState }
      : { ok: false, code: "SYNC_STATE_STORAGE_FAILED" };
  };

  const synchronize = (expectedGeneration = generation) => {
    if (!activeUserId || expectedGeneration !== generation) {
      return Promise.resolve({ ok: false, code: "INACTIVE" });
    }
    if (syncPromise) {
      syncPending = true;
      return syncPromise;
    }

    const userId = activeUserId;
    const client = getClient();
    if (!client?.functions) {
      return Promise.resolve(failAndRetry("UNAVAILABLE", expectedGeneration, userId));
    }
    if (!isOnline()) {
      return Promise.resolve(failAndRetry("OFFLINE", expectedGeneration, userId));
    }

    clearTimer();
    syncPending = false;
    pendingRetryDelay = null;
    const attemptedAt = safeNow(now);
    publish({
      status: "syncing",
      syncing: true,
      dirty,
      errorCode: null,
      retryAt: null,
      lastAttemptAt: attemptedAt,
    });

    syncPromise = (async () => {
      let conflictAttempt = 0;
      let remoteResult = await invokeProfileSync(client, { action: "get" });
      if (!remoteResult.ok) {
        return failAndRetry(remoteResult.code, expectedGeneration, userId);
      }

      while (
        activeUserId === userId &&
        expectedGeneration === generation &&
        conflictAttempt <= MAX_CONFLICT_RETRIES
      ) {
        const capturedAt = safeNow(now);
        const localSnapshot = createSnapshot(capturedAt);
        const deviceId = getDeviceId();
        const userState = loadUserState(userId);
        const mergeResult = mergeSnapshots(localSnapshot, remoteResult.profile, {
          deviceId,
          localState: userState,
          now: capturedAt,
        });

        const applied = applyLocalSnapshot(mergeResult.snapshot);
        if (!applied.ok) {
          return failAndRetry(applied.code, expectedGeneration, userId);
        }

        const expectedRevision = Number(remoteResult.profile?.revision) || 0;
        const localStateWrite = persistMergedLocalState(
          userId,
          mergeResult,
          expectedRevision,
        );
        if (!localStateWrite.ok) {
          return failAndRetry(localStateWrite.code, expectedGeneration, userId);
        }

        const put = await invokeProfileSync(client, {
          action: "put",
          expectedRevision,
          data: mergeResult.snapshot,
        });
        if (activeUserId !== userId || expectedGeneration !== generation) {
          return { ok: false, code: "INACTIVE" };
        }
        if (put.ok) {
          const successAt = safeNow(now);
          const revision = Number(put.profile?.revision) || expectedRevision + 1;
          persistMergedLocalState(userId, mergeResult, revision, successAt);
          lastRemoteProfile = put.profile;
          dirty = false;
          retryCount = 0;
          publish({
            status: "synced",
            dirty: false,
            syncing: false,
            errorCode: null,
            retryCount: 0,
            retryAt: null,
            lastSuccessAt: successAt,
            revision,
          });
          return { ok: true, profile: put.profile, snapshot: mergeResult.snapshot };
        }

        if (put.code !== "REVISION_CONFLICT" || conflictAttempt >= MAX_CONFLICT_RETRIES) {
          return failAndRetry(put.code, expectedGeneration, userId);
        }

        conflictAttempt += 1;
        remoteResult = await invokeProfileSync(client, { action: "get" });
        if (activeUserId !== userId || expectedGeneration !== generation) {
          return { ok: false, code: "INACTIVE" };
        }
        if (!remoteResult.ok) {
          return failAndRetry(remoteResult.code, expectedGeneration, userId);
        }
      }

      return failAndRetry("REVISION_CONFLICT", expectedGeneration, userId);
    })().catch(() => failAndRetry("SYNC_UNAVAILABLE", expectedGeneration, userId)).finally(() => {
      syncPromise = null;
      publish({ syncing: false });
      if (activeUserId !== userId || expectedGeneration !== generation) return;
      if (pendingRetryDelay != null) {
        const delay = pendingRetryDelay;
        pendingRetryDelay = null;
        syncPending = false;
        scheduleSync(delay);
      } else if (syncPending) {
        syncPending = false;
        dirty = true;
        scheduleSync(0);
      }
    });

    return syncPromise;
  };

  const markDirty = () => {
    if (!activeUserId || suppressLocalEvents) return false;
    dirty = true;
    publish({
      status: isOnline() ? "pending" : "offline",
      dirty: true,
      errorCode: isOnline() ? null : "OFFLINE",
    });
    return scheduleSync(SYNC_DELAY_MS);
  };

  const keepaliveFlush = async () => {
    if (syncPromise) return syncPromise;
    if (
      !activeUserId ||
      !activeAccessToken ||
      !lastRemoteProfile ||
      typeof fetchFn !== "function" ||
      !isOnline()
    ) return synchronize(generation);

    clearTimer();
    const userId = activeUserId;
    const accessToken = activeAccessToken;
    const remoteProfile = lastRemoteProfile;
    const expectedGeneration = generation;
    const deviceId = getDeviceId();
    const capturedAt = safeNow(now);
    const mergeResult = mergeSnapshots(
      createSnapshot(capturedAt),
      remoteProfile,
      {
        deviceId,
        localState: loadUserState(userId),
        now: capturedAt,
      },
    );
    const expectedRevision = Number(remoteProfile.revision) || 0;
    if (!saveUserState(userId, {
      ...mergeResult.localState,
      lastRemoteRevision: expectedRevision,
    })) {
      publish({
        status: "error",
        dirty: true,
        errorCode: "SYNC_STATE_STORAGE_FAILED",
      });
      return { ok: false, code: "SYNC_STATE_STORAGE_FAILED" };
    }

    try {
      const response = await fetchFn(
        `${supabaseUrl}/functions/v1/${FUNCTION_NAME}`,
        {
          method: "POST",
          keepalive: true,
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: SUPABASE_CONFIG.publishableKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "put",
            expectedRevision,
            data: mergeResult.snapshot,
          }),
        },
      );
      let payload = null;
      try { payload = await response?.json?.(); } catch {}
      if (activeUserId !== userId || expectedGeneration !== generation) {
        return { ok: false, code: "INACTIVE" };
      }
      if (!response?.ok || payload?.ok !== true) {
        dirty = true;
        publish({
          status: "pending",
          dirty: true,
          errorCode: payload?.error?.code || "FLUSH_DEFERRED",
        });
        return { ok: false, code: payload?.error?.code || "FLUSH_DEFERRED" };
      }

      const profile = payload.data?.profile ?? null;
      const successAt = safeNow(now);
      const revision = Number(profile?.revision) || expectedRevision + 1;
      saveUserState(userId, {
        ...mergeResult.localState,
        lastRemoteRevision: revision,
        lastSuccessAt: successAt,
      });
      lastRemoteProfile = profile;
      dirty = false;
      retryCount = 0;
      publish({
        status: "synced",
        dirty: false,
        errorCode: null,
        retryCount: 0,
        retryAt: null,
        lastSuccessAt: successAt,
        revision,
      });
      return { ok: true, profile };
    } catch {
      dirty = true;
      publish({
        status: "pending",
        dirty: true,
        errorCode: "FLUSH_DEFERRED",
      });
      return { ok: false, code: "FLUSH_DEFERRED" };
    }
  };

  const installListeners = () => {
    if (listenerInstalled) return;
    listenerInstalled = true;
    addGlobalListener?.(LOCAL_DATA_CHANGED_EVENT, markDirty);
    addGlobalListener?.("online", () => {
      if (!activeUserId) return;
      dirty = true;
      retryCount = 0;
      publish({ status: "pending", dirty: true, errorCode: null, retryCount: 0 });
      scheduleSync(0);
    });
    addGlobalListener?.("pagehide", () => {
      if (dirty) void keepaliveFlush();
    });
    documentRef?.addEventListener?.("visibilitychange", () => {
      if (documentRef.visibilityState === "hidden" && dirty) {
        void keepaliveFlush();
      } else if (documentRef.visibilityState === "visible" && dirty) {
        scheduleSync(0);
      }
    });
  };

  const start = (user, { onApplied, accessToken = null } = {}) => {
    const userId = typeof user?.id === "string" ? user.id : null;
    if (!userId) return stop();
    installListeners();
    appliedCallback = typeof onApplied === "function" ? onApplied : null;
    activeAccessToken = typeof accessToken === "string" && accessToken ? accessToken : null;

    if (activeUserId !== userId) {
      activeUserId = userId;
      generation += 1;
      retryCount = 0;
      lastRemoteProfile = null;
      dirty = true;
      clearTimer();
      const localState = loadUserState(userId);
      publish({
        userId,
        status: "pending",
        dirty: true,
        syncing: false,
        errorCode: null,
        retryCount: 0,
        retryAt: null,
        lastSuccessAt: localState.lastSuccessAt,
        revision: localState.lastRemoteRevision,
      });
    }
    return synchronize(generation);
  };

  const stop = () => {
    activeUserId = null;
    activeAccessToken = null;
    appliedCallback = null;
    lastRemoteProfile = null;
    dirty = false;
    generation += 1;
    retryCount = 0;
    pendingRetryDelay = null;
    clearTimer();
    syncPending = false;
    publish(makeSyncState());
    return { ok: true };
  };

  return Object.freeze({
    startAccountDataSync: start,
    stopAccountDataSync: stop,
    updateAccountDataSyncAccessToken(token) {
      activeAccessToken = typeof token === "string" && token ? token : null;
      return Boolean(activeAccessToken);
    },
    syncAccountDataNow: () => synchronize(generation),
    flushAccountDataSync: keepaliveFlush,
    markAccountDataDirty: markDirty,
    getAccountDataSyncState: () => state,
    subscribeToAccountDataSync(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      listener(state);
      return () => listeners.delete(listener);
    },
  });
}

const accountDataSyncService = createAccountDataSyncService();

export const startAccountDataSync = accountDataSyncService.startAccountDataSync;
export const stopAccountDataSync = accountDataSyncService.stopAccountDataSync;
export const updateAccountDataSyncAccessToken = accountDataSyncService.updateAccountDataSyncAccessToken;
export const syncAccountDataNow = accountDataSyncService.syncAccountDataNow;
export const flushAccountDataSync = accountDataSyncService.flushAccountDataSync;
export const getAccountDataSyncState = accountDataSyncService.getAccountDataSyncState;
export const subscribeToAccountDataSync = accountDataSyncService.subscribeToAccountDataSync;
