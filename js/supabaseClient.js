import { SUPABASE_CONFIG, hasValidSupabaseConfig } from "./supabaseConfig.js";
import {
  createResilientBrowserStorage,
  getResilientBrowserStorage,
} from "./browserStorage.js";

export const SUPABASE_AUTH_STORAGE_KEY = "sb-hycegznamzjhwinegaai-auth-token";
export const RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY = "wordstrike_supabase_auth_v1";

let clientSingleton = null;

function wrapExplicitStorage(storage) {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function"
  ) return null;

  const resilient = createResilientBrowserStorage({
    localStorage: storage,
    sessionStorage: null,
  });
  return resilient;
}

export function createAuthStorageAdapter(storage = undefined) {
  const target = storage === undefined
    ? getResilientBrowserStorage()
    : wrapExplicitStorage(storage);
  if (!target) return null;

  // Supabase always receives an explicit storage implementation so browser
  // capability differences cannot silently downgrade authentication to memory.
  // The shared adapter retries each failed persistent write in sessionStorage,
  // including cases where a tiny localStorage probe would have succeeded but a
  // larger token write later fails under Firefox storage/quota restrictions.
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
  const target = createAuthStorageAdapter(storage);
  if (!target) return false;
  let cleaned = false;
  for (const suffix of ["", "-code-verifier", "-user"]) {
    try {
      target.removeItem(`${RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY}${suffix}`);
      cleaned = true;
    } catch {
      // Retired-key cleanup must never prevent creation of the live auth client.
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
