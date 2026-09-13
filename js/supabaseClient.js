import { SUPABASE_CONFIG, hasValidSupabaseConfig } from "./supabaseConfig.js";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-hycegznamzjhwinegaai-auth-token";
export const RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY = "wordstrike_supabase_auth_v1";

let clientSingleton = null;

export function cleanupRetiredAuthStorage(storage = globalThis.localStorage) {
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
      },
    });
  } catch {
    clientSingleton = null;
  }
  return clientSingleton;
}
