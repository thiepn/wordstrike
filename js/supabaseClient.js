import { SUPABASE_CONFIG, hasValidSupabaseConfig } from "./supabaseConfig.js";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-hycegznamzjhwinegaai-auth-token";
export const RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY = "wordstrike_supabase_auth_v1";
const AUTH_STORAGE_PROBE_KEY = "wordstrike_auth_storage_probe_v1";

let clientSingleton = null;

function safeGlobalStorage(name) {
  try {
    return globalThis?.[name] ?? null;
  } catch {
    // Firefox can throw while merely reading a Web Storage property in
    // restricted contexts. Treat that storage backend as unavailable.
    return null;
  }
}

function browserStorageCandidates() {
  return [
    safeGlobalStorage("localStorage"),
    safeGlobalStorage("sessionStorage"),
  ].filter(Boolean);
}

function isUsableStorage(storage) {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) return false;

  try {
    storage.setItem(AUTH_STORAGE_PROBE_KEY, "1");
    const readable = storage.getItem(AUTH_STORAGE_PROBE_KEY) === "1";
    storage.removeItem(AUTH_STORAGE_PROBE_KEY);
    return readable;
  } catch {
    try { storage.removeItem(AUTH_STORAGE_PROBE_KEY); } catch {}
    return false;
  }
}

export function createAuthStorageAdapter(storage = undefined) {
  const candidates = storage === undefined ? browserStorageCandidates() : [storage];
  const target = candidates.find(isUsableStorage) ?? null;
  if (!target) return null;

  // Supplying storage explicitly prevents supabase-js from silently falling
  // back to in-memory auth when its own localStorage capability check differs
  // across browsers. localStorage remains preferred; sessionStorage is a
  // refresh-safe fallback when Firefox rejects persistent localStorage.
  return Object.freeze({
    getItem(key) {
      return target.getItem(key);
    },
    setItem(key, value) {
      target.setItem(key, value);
    },
    removeItem(key) {
      target.removeItem(key);
    },
  });
}

export function cleanupRetiredAuthStorage(storage = undefined) {
  const targets = storage === undefined ? browserStorageCandidates() : [storage];
  let cleaned = false;
  for (const target of targets) {
    if (!target?.removeItem) continue;
    try {
      for (const suffix of ["", "-code-verifier", "-user"]) {
        target.removeItem(`${RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY}${suffix}`);
      }
      cleaned = true;
    } catch {
      // Keep checking other storage backends. Retired-key cleanup must never
      // prevent the live Supabase client from being created.
    }
  }
  return cleaned;
}

export function getSupabaseClient({
  config = SUPABASE_CONFIG,
  sdk = globalThis.supabase,
  storage = undefined,
} = {}) {
  if (clientSingleton) return clientSingleton;
  if (!hasValidSupabaseConfig(config) || typeof sdk?.createClient !== "function") return null;

  try {
    cleanupRetiredAuthStorage(storage);
    const authStorage = createAuthStorageAdapter(storage);
    const auth = {
      // WordStrike is a client-only static site. Use Supabase's browser-native
      // implicit OAuth flow so the returned session can be consumed directly
      // from the URL fragment without a PKCE verifier/code exchange round-trip.
      flowType: "implicit",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
    };
    if (authStorage) auth.storage = authStorage;

    clientSingleton = sdk.createClient(config.url, config.publishableKey, { auth });
  } catch {
    clientSingleton = null;
  }
  return clientSingleton;
}
