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
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: SUPABASE_AUTH_STORAGE_KEY,
        experimental: {
          // Keep the PKCE verifier tied to the OAuth attempt that created it.
          // This prevents a second/repeated Google sign-in from overwriting the
          // verifier needed when the first redirect returns to WordStrike.
          appendPkceFlowIdToRedirects: true,
        },
      },
    });
  } catch {
    clientSingleton = null;
  }
  return clientSingleton;
}
