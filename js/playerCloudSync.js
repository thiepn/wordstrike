import { getSupabaseClient } from './supabaseClient.js';
import { mergePlayerDocuments, stableProfileJSON, validPlayerDocument } from './playerProfileDocument.js';

export const PLAYER_CLOUD_TABLE = 'wordstrike_player_profiles';
/** One serialized sync loop, authenticated user binding, optimistic concurrency,
 * and idempotent merges. A cloud outage never signs the player out or erases a save.
 */
export function createPlayerCloudSync({ store, getClient = getSupabaseClient, schedule = setTimeout, cancel = clearTimeout, onStatus = () => {}, onOwnerChange = () => {} } = {}) {
  let userId = null, generation = 0, timer = null, running = false, stopped = false;
  let switching = false, retry = 0, acknowledged = '', lastStatus = 'local';
  const status = value => { lastStatus = value; try { onStatus(value); } catch { /* View isolation. */ } };
  const later = (delay = 1200) => {
    if (stopped || !userId || switching) return;
    if (timer != null) cancel(timer);
    timer = schedule(() => { timer = null; void sync(); }, delay);
    timer?.unref?.();
  };
  const unsubscribe = store.subscribe(event => {
    if (event.reason !== 'durable' && event.reason !== 'owner-change' && !switching && userId === store.getOwner()) {
      status('pending');
      if (!running) later();
    }
  });
  async function request(builder) {
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15000);
    try { return await (typeof builder.abortSignal === 'function' ? builder.abortSignal(abort.signal) : builder); }
    finally { clearTimeout(timeout); }
  }
  async function sync() {
    if (stopped || running || switching || !userId || userId !== store.getOwner()) return false;
    const client = getClient();
    if (!client?.from) { status('pending'); later(15000); return false; }
    const id = userId, requestGeneration = generation;
    const current = () => !stopped && !switching && generation === requestGeneration && userId === id && store.getOwner() === id;
    running = true;
    status('syncing');
    let success = false;
    try {
      for (let attempt = 0; attempt < 4 && current(); attempt++) {
        const read = await request(client.from(PLAYER_CLOUD_TABLE).select('revision,data').eq('user_id', id).maybeSingle());
        if (!current()) return false;
        if (read.error) throw read.error;
        if (read.data && !validPlayerDocument(read.data.data)) throw new Error('Unsupported cloud save');
        const merged = mergePlayerDocuments(store.getDocument(), read.data?.data);
        const serialized = stableProfileJSON(merged);
        if (read.data && serialized === stableProfileJSON(read.data.data)) {
          store.merge(merged, 'cloud');
          acknowledged = serialized;
          success = true;
          break;
        }
        let write;
        if (read.data) {
          const revision = Number(read.data.revision);
          if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('Invalid cloud revision');
          write = await request(client.from(PLAYER_CLOUD_TABLE).update({ data: merged, revision: revision + 1, updated_at: new Date().toISOString() })
            .eq('user_id', id).eq('revision', revision).select('revision').maybeSingle());
        } else {
          write = await request(client.from(PLAYER_CLOUD_TABLE).insert({ user_id: id, revision: 1, data: merged }).select('revision').maybeSingle());
        }
        if (!current()) return false;
        if (write.error?.code === '23505' || (!write.error && !write.data)) continue; // Another device won; merge its version, never overwrite it.
        if (write.error) throw write.error;
        store.merge(merged, 'cloud');
        acknowledged = serialized;
        success = true;
        break;
      }
      if (!current()) return false;
      if (!success) throw new Error('Concurrent save retry');
      retry = 0;
      const dirty = acknowledged !== stableProfileJSON(store.getDocument());
      status(dirty ? 'pending' : 'synced');
      later(dirty ? 1000 : 60000); // Also pull changes made on another device while this tab is idle.
      return true;
    } catch {
      if (current()) {
        status('pending');
        later(Math.min(300000, 5000 * (2 ** Math.min(retry++, 6))));
      }
      return false;
    } finally {
      running = false;
      // Account B may have become ready while A's request was being cancelled.
      if (userId && (generation !== requestGeneration || switching)) later(0);
    }
  }
  async function setAuthState(auth) {
    if (!['signed-in', 'signed-out'].includes(auth?.status)) return;
    const next = auth.status === 'signed-in' ? auth.user?.id ?? null : null;
    if (next === userId && (next ?? 'guest') === store.getOwner()) { if (next && lastStatus !== 'synced') later(0); return; }
    const requestGeneration = ++generation;
    userId = next;
    switching = true;
    if (timer != null) { cancel(timer); timer = null; }
    acknowledged = '';
    status(next ? 'syncing' : 'local');
    const changed = await store.selectOwner(next);
    if (stopped || requestGeneration !== generation) return;
    switching = false;
    if (changed) onOwnerChange();
    if (next) later(0);
  }
  return {
    setAuthState, sync, wake: () => later(0), getStatus: () => lastStatus,
    stop() { stopped = true; generation++; unsubscribe(); if (timer != null) cancel(timer); },
  };
}
