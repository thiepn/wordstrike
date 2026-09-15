import { SUPABASE_CONFIG, hasValidSupabaseConfig } from "./supabaseConfig.js";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-hycegznamzjhwinegaai-auth-token";
export const RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY = "wordstrike_supabase_auth_v1";

const THIEPN_OAUTH_RETURN_STORAGE_KEY = "thiepn-oauth-return-v1";
const DIET_OAUTH_RETURN_PATH = "/diet/";

export function handoffMarkedOAuthCallbackToDiet({
  storage = globalThis.localStorage,
  location = globalThis.location,
  now = Date.now(),
} = {}) {
  if (!storage?.getItem || !location?.replace || !location?.origin) return false;

  let marker = null;
  try {
    const raw = storage.getItem(THIEPN_OAUTH_RETURN_STORAGE_KEY);
    if (!raw) return false;
    marker = JSON.parse(raw);
  } catch {
    try { storage.removeItem(THIEPN_OAUTH_RETURN_STORAGE_KEY); } catch {}
    return false;
  }

  const expiresAt = Number(marker?.expiresAt);
  if (marker?.path !== DIET_OAUTH_RETURN_PATH || !Number.isFinite(expiresAt) || expiresAt <= now) {
    try { storage.removeItem(THIEPN_OAUTH_RETURN_STORAGE_KEY); } catch {}
    return false;
  }

  const hashParams = new URLSearchParams((location.hash || "").replace(/^#/, ""));
  const searchParams = new URLSearchParams((location.search || "").replace(/^\?/, ""));
  const isOAuthCallback = hashParams.has("access_token")
    || hashParams.has("error")
    || searchParams.has("code")
    || searchParams.has("error");
  if (!isOAuthCallback) return false;

  try { storage.removeItem(THIEPN_OAUTH_RETURN_STORAGE_KEY); } catch {}
  location.replace(`${location.origin}${DIET_OAUTH_RETURN_PATH}${location.search || ""}${location.hash || ""}`);
  return true;
}

// The shared Supabase project's Site URL currently points at WordStrike. If a
// Diet Copilot OAuth request falls back here, hand the untouched auth response
// back to Diet before WordStrike's Supabase client can consume it.
const dietOAuthHandoffInProgress = handoffMarkedOAuthCallbackToDiet();

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
  if (dietOAuthHandoffInProgress) return null;
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
