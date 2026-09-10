import { SUPABASE_CONFIG, hasValidSupabaseConfig } from "./supabaseConfig.js";

export const SUPABASE_AUTH_STORAGE_KEY = "wordstrike_supabase_auth_v1";

let clientSingleton = null;

export function getSupabaseClient({
  config = SUPABASE_CONFIG,
  sdk = globalThis.supabase,
} = {}) {
  if (clientSingleton) return clientSingleton;
  if (!hasValidSupabaseConfig(config) || typeof sdk?.createClient !== "function") return null;
  try {
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
