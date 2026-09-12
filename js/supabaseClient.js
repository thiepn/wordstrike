import { SUPABASE_CONFIG, hasValidSupabaseConfig } from "./supabaseConfig.js";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-hycegznamzjhwinegaai-auth-token";
export const LEGACY_WORDSTRIKE_AUTH_STORAGE_KEY = "wordstrike_supabase_auth_v1";

let clientSingleton = null;

export function prepareSharedAuthStorage(storage = globalThis.localStorage) {
  if (!storage?.getItem || !storage?.setItem) return false;
  try {
    for (const suffix of ["", "-code-verifier", "-user"]) {
      const sharedKey = `${SUPABASE_AUTH_STORAGE_KEY}${suffix}`;
      const legacyKey = `${LEGACY_WORDSTRIKE_AUTH_STORAGE_KEY}${suffix}`;
      if (storage.getItem(sharedKey) == null && storage.getItem(legacyKey) != null) {
        storage.setItem(sharedKey, storage.getItem(legacyKey));
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function getSupabaseClient({
  config = SUPABASE_CONFIG,
  sdk = globalThis.supabase,
} = {}) {
  if (clientSingleton) return clientSingleton;
  if (!hasValidSupabaseConfig(config) || typeof sdk?.createClient !== "function") return null;
  try {
    // The legacy WordStrike session was issued by this exact Supabase project,
    // so it is safe to promote once when no shared THIEPN Account session exists.
    prepareSharedAuthStorage();
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
      },
    });
  } catch {
    clientSingleton = null;
  }
  return clientSingleton;
}
