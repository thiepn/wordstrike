import { getPlayerPersistence } from "./playerPersistence.js";
import { SUPABASE_CONFIG, hasValidSupabaseConfig } from "./supabaseConfig.js";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-hycegznamzjhwinegaai-auth-token";
export const RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY = "wordstrike_supabase_auth_v1";

let clientSingleton = null;

export function cleanupRetiredAuthStorage(storage) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { return false; } }
  if (!storage?.removeItem) return false;
  try {
    // A6: migration is over. WordStrike must never promote an app-specific
    // access/refresh token into THIEPN Account storage. Remove only the retired
    // auth artifacts; application/game data is intentionally untouched.
    for (const suffix of ["", "-code-verifier", "-user"]) {
      storage.removeItem(`${RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY}${suffix}`);
    }
    return true;
  } catch {
    return false;
  }
}


/** Explicit shared storage prevents the SDK silently falling back to an ephemeral
 * in-memory session when its localStorage capacity probe fails. No shadow tokens.
 */
export function createSharedAuthStorage({ getStorage = () => globalThis.localStorage, reclaim = () => getPlayerPersistence()?.releaseLocalMirror() } = {}) {
  const reserveKey = 'wordstrike.auth-space-reserve.v1';
  const storage = () => {
    const value = getStorage();
    if (!value?.getItem || !value?.setItem) throw new Error('Persistent account storage is unavailable.');
    return value;
  };
  return {
    getItem(key) { return storage().getItem(key); },
    async setItem(key, value) {
      const target = storage();
      try { target.setItem(key, value); }
      catch (error) {
        if (!['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error?.name)) throw error;
        target.removeItem(reserveKey);
        try { target.setItem(key, value); }
        catch { await reclaim?.(); target.setItem(key, value); }
      }
      // A little replaceable headroom for the next refresh-token rotation.
      try { if (!target.getItem(reserveKey)) target.setItem(reserveKey, ' '.repeat(8192)); } catch { /* Optional capacity reserve. */ }
    },
    removeItem(key) { storage().removeItem(key); },
  };
}

export function getSupabaseClient({
  config = SUPABASE_CONFIG,
  sdk = globalThis.supabase,
} = {}) {
  if (clientSingleton) return clientSingleton;
  if (!hasValidSupabaseConfig(config) || typeof sdk?.createClient !== "function") return null;
  try {
    cleanupRetiredAuthStorage();
    clientSingleton = sdk.createClient(config.url, config.publishableKey, {
      auth: {
        // WordStrike is a client-only static site. Use Supabase's browser-native
        // implicit OAuth flow so the returned session can be consumed directly
        // from the URL fragment without a PKCE verifier/code exchange round-trip.
        flowType: "implicit",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        storage: createSharedAuthStorage(),
      },
    });
  } catch {
    clientSingleton = null;
  }
  return clientSingleton;
}
