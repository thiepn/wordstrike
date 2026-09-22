import {
  cloneProfileValue, createPlayerDocument, mergePlayerDocuments, projectPlayerModes,
  projectPlayerSave, stableProfileJSON, validPlayerDocument, writePlayerModes, writePlayerSave,
} from './playerProfileDocument.js';

export const PLAYER_PROFILE_PREFIX = 'wordstrike.player-profile.v1:';
export const PLAYER_MIGRATION_KEY = 'wordstrike.player-profile.migrated.v1';
const AUTH_KEY = 'sb-hycegznamzjhwinegaai-auth-token';
const SAVE_KEY = 'wordstrike_save';
const MODES_KEY = 'wordstrike_mode_data_v2';
const BACKUP_KEY = 'wordstrike_campaign_progress_v1';
const OWNED_KEYS = new Set([SAVE_KEY, MODES_KEY, BACKUP_KEY]);
const guest = 'guest';
const safeStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };
const randomId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const parse = value => { try { return JSON.parse(value); } catch { return null; } };
const validOwner = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);

/** Synchronous game API; IndexedDB transactions provide an independent durable mirror.
 * A per-page writer ID avoids concurrent tabs racing a shared statistics counter.
 * Auth tokens are never mirrored, recovered, or copied by this store.
 */
export function createPlayerPersistence({ storage = safeStorage(), indexedDB = globalThis.indexedDB, actor = randomId(), channelFactory = name => typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null } = {}) {
  let owner = guest, doc = createPlayerDocument(), db = null, channel = null;
  let ready = false, switching = 0, localStatus = 'loading', initialization = null;
  let pendingWrites = new Set();
  const listeners = new Set();
  const keyFor = id => PLAYER_PROFILE_PREFIX + id;
  const emit = reason => {
    for (const listener of listeners) { try { listener({ owner, document: doc, localStatus, reason }); } catch { /* One view must not prevent persistence. */ } }
  };
  const rawRead = key => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
  const readLocal = id => {
    const value = parse(rawRead(keyFor(id)));
    return validPlayerDocument(value) ? value : null;
  };
  const writeLocal = (id, value) => {
    try {
      if (!storage?.setItem) return false;
      storage.setItem(keyFor(id), JSON.stringify(value));
      return true;
    } catch { return false; }
  };
  const readDatabaseRaw = id => new Promise(resolve => {
    if (!db) return resolve(null);
    try {
      const request = db.transaction('profiles', 'readonly').objectStore('profiles').get(id);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  const readDatabase = async id => { const value = await readDatabaseRaw(id); return validPlayerDocument(value) ? value : null; };
  const openDatabase = () => new Promise(resolve => {
    if (!indexedDB?.open) return resolve(null);
    let completed = false;
    const finish = value => { if (!completed) { completed = true; clearTimeout(timer); resolve(value); } else value?.close?.(); };
    const timer = setTimeout(() => finish(null), 4000);
    try {
      const request = indexedDB.open('wordstrike-player-profiles', 1);
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('profiles')) request.result.createObjectStore('profiles'); };
      request.onsuccess = () => finish(request.result);
      request.onerror = () => finish(null);
      request.onblocked = () => finish(null);
    } catch { finish(null); }
  });
  function persist(reason = 'local-write', broadcast = true) {
    const id = owner, snapshot = cloneProfileValue(doc);
    const localOK = writeLocal(id, snapshot);
    localStatus = localOK ? 'saved' : db ? 'saving' : 'error';
    if (db) {
      const promise = new Promise(resolve => {
        try {
          // Read/merge/write in ONE readwrite transaction. Two tabs cannot overwrite
          // each other's earned progress even when both close before a storage event.
          const tx = db.transaction('profiles', 'readwrite');
          const store = tx.objectStore('profiles');
          const get = store.get(id);
          let merged = snapshot;
          get.onsuccess = () => { merged = mergePlayerDocuments(snapshot, get.result); store.put(merged, id); };
          tx.oncomplete = () => {
            if (owner === id) {
              const next = mergePlayerDocuments(doc, merged);
              const changed = stableProfileJSON(doc) !== stableProfileJSON(next);
              doc = next;
              writeLocal(id, doc);
              localStatus = 'saved';
              emit(changed ? 'recovered' : 'durable');
            }
            resolve(true);
          };
          tx.onabort = tx.onerror = () => {
            if (owner === id) { localStatus = localOK ? 'saved' : 'error'; emit('storage-error'); }
            resolve(false);
          };
        } catch {
          if (owner === id) localStatus = localOK ? 'saved' : 'error';
          resolve(false);
        }
      });
      pendingWrites.add(promise);
      void promise.finally(() => pendingWrites.delete(promise));
    }
    if (broadcast) { try { channel?.postMessage({ owner: id, document: snapshot }); } catch { /* Optional cross-tab acceleration. */ } }
    emit(reason);
    // True means accepted by a synchronous durable write OR an already-started
    // IndexedDB transaction. The visible status distinguishes saving from saved.
    return localOK || Boolean(db);
  }
  const adopt = (value, reason = 'cloud') => {
    const merged = mergePlayerDocuments(doc, value);
    if (stableProfileJSON(merged) === stableProfileJSON(doc)) return false;
    doc = merged;
    persist(reason);
    return true;
  };
  async function initialize({ legacySave = {}, legacyModes = {}, initialOwner } = {}) {
    if (initialization) return initialization;
    initialization = (async () => {
      const storedUser = parse(rawRead(AUTH_KEY))?.user?.id;
      owner = validOwner(initialOwner) ? initialOwner : validOwner(storedUser) ? storedUser : guest;
      db = await openDatabase();
      if (db) db.onversionchange = () => { db.close(); db = null; };
      const local = readLocal(owner), disk = await readDatabase(owner);
      const migrated = Boolean(rawRead(PLAYER_MIGRATION_KEY)) || (await readDatabaseRaw('_migration'))?.migrated === true;
      doc = local || disk ? mergePlayerDocuments(local, disk) : createPlayerDocument(migrated ? {} : legacySave, migrated ? {} : legacyModes);
      if (!local && !disk && !migrated) {
        const originalModes = parse(rawRead(MODES_KEY));
        if (objectRecord(originalModes)) doc.placementWpm = Math.max(doc.placementWpm, createPlayerDocument({}, originalModes).placementWpm);
      }
      ready = true;
      persist('initialized', false);
      // Keep old raw saves untouched as a recovery source. Never reassign them to
      // a later account once migration has completed successfully.
      const protectedOnDisk = (await Promise.all([...pendingWrites])).some(Boolean);
      if (localStatus === 'saved' || protectedOnDisk) {
        try { storage?.setItem(PLAYER_MIGRATION_KEY, '1'); } catch { /* Cache remains protected in IndexedDB. */ }
        if (db) {
          try { db.transaction('profiles', 'readwrite').objectStore('profiles').put({ migrated: true }, '_migration'); } catch { /* Optional marker mirror. */ }
        }
      }
      try {
        channel = channelFactory('wordstrike-player-profiles-v1');
        if (channel) channel.onmessage = event => {
          if (event.data?.owner === owner) adopt(event.data.document, 'other-tab');
        };
      } catch { channel = null; }
      return api;
    })();
    return initialization;
  }
  async function selectOwner(userId) {
    const id = validOwner(userId) ? userId : guest;
    const generation = ++switching;
    if (!ready || id === owner) return false;
    const priorOwner = owner;
    let prior = cloneProfileValue(doc);
    await Promise.all([...pendingWrites]);
    if (priorOwner === guest) prior = mergePlayerDocuments(prior, mergePlayerDocuments(readLocal(guest), await readDatabase(guest)));
    const next = mergePlayerDocuments(readLocal(id), await readDatabase(id));
    if (generation !== switching) return false;
    // Guest play is adopted only when explicitly signing in from that guest.
    // A -> B and A -> guest never copy A's statistics or queued progress.
    doc = priorOwner === guest && id !== guest ? mergePlayerDocuments(next, { ...prior, generation: '' }) : next;
    owner = id;
    persist('owner-change');
    if (priorOwner === guest && id !== guest) {
      const empty = createPlayerDocument();
      empty.clock = Math.max(Date.now(), prior.clock + 1);
      empty.generation = `${String(empty.clock).padStart(16, '0')}:${actor}`;
      writeLocal(guest, empty);
      try { channel?.postMessage({ owner: guest, document: empty }); } catch { /* Optional notification. */ }
      if (db) { try { db.transaction('profiles', 'readwrite').objectStore('profiles').put(empty, guest); } catch { /* No authenticated data goes to the guest. */ } }
    }
    return true;
  }
  const storageAdapter = {
    getItem(key) {
      if (!OWNED_KEYS.has(key)) return rawRead(key);
      if (key === SAVE_KEY) return JSON.stringify(projectPlayerSave(doc));
      if (key === MODES_KEY) return JSON.stringify(projectPlayerModes(doc));
      const save = projectPlayerSave(doc);
      return JSON.stringify({ version: 1, campaignFurthestLevel: save.campaignFurthestLevel, levels: save.levels, updatedAt: doc.clock });
    },
    setItem(key, value) {
      if (!OWNED_KEYS.has(key)) { if (!storage?.setItem) throw new Error('Storage unavailable'); return storage.setItem(key, value); }
      const next = parse(value);
      if (!next || !objectRecord(next)) throw new TypeError('Invalid game save');
      const before = stableProfileJSON(doc);
      const projected = key === MODES_KEY ? projectPlayerModes(doc) : projectPlayerSave(doc);
      if (key === MODES_KEY && stableProfileJSON(next) === stableProfileJSON(projected)) return;
      if (key === SAVE_KEY && stableProfileJSON(next) === stableProfileJSON(projected)) return;
      const candidate = key === MODES_KEY ? writePlayerModes(doc, next, actor) : writePlayerSave(doc, next, actor, { settings: key === SAVE_KEY });
      if (stableProfileJSON({ ...candidate, clock: doc.clock }) === before) return;
      doc = candidate;
      // Backups and load-time normalization must not start an endless cloud loop.
      if (before !== stableProfileJSON(doc) && !persist()) throw new Error('Storage unavailable');
    },
    removeItem(key) { if (!OWNED_KEYS.has(key)) storage?.removeItem?.(key); },
  };
  const api = {
    initialize, selectOwner, getStorage: () => ready ? storageAdapter : storage,
    getDocument: () => cloneProfileValue(doc), getOwner: () => owner,
    getStatus: () => ({ owner, localStatus, ready }),
    merge: adopt, flush: () => Promise.all([...pendingWrites]),
    async releaseLocalMirror() {
      if (!db) return false;
      const id = owner;
      await Promise.all([...pendingWrites]);
      const durable = await readDatabase(id);
      if (!durable || id !== owner || stableProfileJSON(mergePlayerDocuments(doc, durable)) !== stableProfileJSON(durable)) return false;
      // Only discard our redundant localStorage copy after confirming the full
      // profile is durable in IndexedDB. Never remove another app's data.
      try { storage?.removeItem?.(keyFor(id)); return true; } catch { return false; }
    },
    placementWpm: () => ready ? doc.placementWpm : 0,
    resetCampaign(save) { if (!ready) return false; doc = writePlayerSave(doc, save, actor, { reset: true }); persist(); return true; },
    resetModes(modes) { if (!ready) return false; doc = writePlayerModes(doc, modes, actor, { reset: true }); persist(); return true; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    handleStorageEvent(event) { if (event.key === keyFor(owner) && event.newValue) adopt(parse(event.newValue), 'other-tab'); },
    destroy() { switching++; channel?.close?.(); db?.close?.(); listeners.clear(); },
  };
  return api;
}
function objectRecord(value) { return value && typeof value === 'object' && !Array.isArray(value); }

let activeStore = null;
export async function initializePlayerPersistence(options) {
  activeStore ??= createPlayerPersistence();
  await activeStore.initialize(options);
  globalThis.addEventListener?.('storage', activeStore.handleStorageEvent);
  return activeStore;
}
export const getPlayerPersistence = () => activeStore;
export const getGameStorage = () => activeStore?.getStorage() ?? safeStorage();
export const getPersistedPlacementWpm = () => activeStore?.getStatus().ready ? activeStore.placementWpm() : null;
export const resetPersistentCampaign = save => activeStore?.resetCampaign(save) ?? false;
export const resetPersistentModes = modes => activeStore?.resetModes(modes) ?? false;
