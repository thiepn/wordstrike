import { getSupabaseClient } from "./supabaseClient.js";
import { LOCAL_DATA_CHANGED_EVENT } from "./localDataEvents.js";
import { loadModeData, saveModeData } from "./modeStorage.js";
import { loadSave, saveGame } from "./storage.js";
import { mergeWordStrikeSnapshots } from "./accountDataMerge.js";

const FUNCTION_NAME = "wordstrike-profile-sync";
const SYNC_DELAY_MS = 350;

let activeUserId = null;
let syncPromise = null;
let syncTimer = null;
let syncPending = false;
let suppressLocalEvents = false;
let listenerInstalled = false;
let appliedCallback = null;
let generation = 0;

function plain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function createLocalAccountSnapshot() {
  const campaign = loadSave();
  const mode = loadModeData();
  return {
    schemaVersion: 1,
    updatedAt: Date.now(),
    campaign: plain(campaign),
    mode: plain(mode),
    settings: plain(campaign?.settings || {}),
  };
}

function applyLocalSnapshot(snapshot) {
  suppressLocalEvents = true;
  try {
    saveGame(snapshot.campaign);
    saveModeData(snapshot.mode);
    appliedCallback?.(snapshot);
  } finally {
    suppressLocalEvents = false;
  }
}

async function invokeProfileSync(client, body) {
  const { data, error } = await client.functions.invoke(FUNCTION_NAME, { body });
  if (error || !data || data.ok !== true) {
    return {
      ok: false,
      code: data?.error?.code || "SYNC_UNAVAILABLE",
      message: data?.error?.message || "Cloud save is temporarily unavailable.",
    };
  }
  return { ok: true, profile: data.data?.profile ?? null };
}

async function synchronize(expectedGeneration = generation) {
  if (!activeUserId || expectedGeneration !== generation) return { ok: false, code: "INACTIVE" };
  if (syncPromise) return syncPromise;
  const userId = activeUserId;
  const client = getSupabaseClient();
  if (!client?.functions) return { ok: false, code: "UNAVAILABLE" };

  syncPending = false;
  syncPromise = (async () => {
    const remoteResult = await invokeProfileSync(client, { action: "get" });
    if (!remoteResult.ok || activeUserId !== userId || expectedGeneration !== generation) return remoteResult;

    suppressLocalEvents = true;
    let local;
    try {
      local = createLocalAccountSnapshot();
    } finally {
      suppressLocalEvents = false;
    }
    const merged = mergeWordStrikeSnapshots(local, remoteResult.profile);
    applyLocalSnapshot(merged);

    let expectedRevision = Number(remoteResult.profile?.revision) || 0;
    let put = await invokeProfileSync(client, {
      action: "put",
      expectedRevision,
      data: merged,
    });
    if (!put.ok && put.code === "REVISION_CONFLICT" && activeUserId === userId) {
      const latest = await invokeProfileSync(client, { action: "get" });
      if (latest.ok) {
        const retryMerged = mergeWordStrikeSnapshots(merged, latest.profile);
        applyLocalSnapshot(retryMerged);
        expectedRevision = Number(latest.profile?.revision) || 0;
        put = await invokeProfileSync(client, {
          action: "put",
          expectedRevision,
          data: retryMerged,
        });
      }
    }
    return put;
  })().catch(() => ({ ok: false, code: "SYNC_UNAVAILABLE" })).finally(() => {
    syncPromise = null;
    if (syncPending && activeUserId === userId && expectedGeneration === generation) {
      syncPending = false;
      scheduleSync();
    }
  });

  return syncPromise;
}

function scheduleSync() {
  if (!activeUserId || suppressLocalEvents) return;
  if (syncPromise) {
    syncPending = true;
    return;
  }
  if (syncTimer != null) globalThis.clearTimeout?.(syncTimer);
  const scheduledGeneration = generation;
  syncTimer = globalThis.setTimeout?.(() => {
    syncTimer = null;
    void synchronize(scheduledGeneration);
  }, SYNC_DELAY_MS) ?? null;
}

function installListeners() {
  if (listenerInstalled || typeof globalThis.addEventListener !== "function") return;
  listenerInstalled = true;
  globalThis.addEventListener(LOCAL_DATA_CHANGED_EVENT, scheduleSync);
  globalThis.addEventListener("online", scheduleSync);
}

export function startAccountDataSync(user, { onApplied } = {}) {
  const userId = typeof user?.id === "string" ? user.id : null;
  if (!userId) return stopAccountDataSync();
  installListeners();
  appliedCallback = typeof onApplied === "function" ? onApplied : null;
  if (activeUserId !== userId) {
    activeUserId = userId;
    generation += 1;
  }
  return synchronize(generation);
}

export function stopAccountDataSync() {
  activeUserId = null;
  appliedCallback = null;
  generation += 1;
  if (syncTimer != null) globalThis.clearTimeout?.(syncTimer);
  syncTimer = null;
  syncPending = false;
  return { ok: true };
}

export function getAccountDataSyncState() {
  return Object.freeze({ userId: activeUserId, syncing: Boolean(syncPromise) });
}
