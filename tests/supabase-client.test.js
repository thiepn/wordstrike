import assert from "node:assert/strict";

const validConfig = {
  url: "https://abc123project.supabase.co",
  publishableKey: "sb_publishable_public-browser-key",
};
const calls = [];
const client = { auth: {} };
const values = new Map();
const storage = {
  getItem(key) { return values.has(key) ? values.get(key) : null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};
const sdk = {
  createClient(...args) {
    calls.push(args);
    return client;
  },
};
const moduleUrl = new URL(`../js/supabaseClient.js?singleton=${Date.now()}`, import.meta.url);
const {
  createAuthStorageAdapter,
  getSupabaseClient,
  SUPABASE_AUTH_STORAGE_KEY,
} = await import(moduleUrl);

assert.equal(getSupabaseClient({ config: validConfig, sdk: null }), null);
assert.equal(getSupabaseClient({ config: { ...validConfig, publishableKey: "sb_secret_bad" }, sdk }), null);
assert.equal(getSupabaseClient({ config: validConfig, sdk, storage }), client);
assert.equal(getSupabaseClient({ config: validConfig, sdk, storage }), client);
assert.equal(calls.length, 1);

const auth = calls[0][2].auth;
assert.equal(auth.flowType, "implicit");
assert.equal(auth.persistSession, true);
assert.equal(auth.autoRefreshToken, true);
assert.equal(auth.detectSessionInUrl, true);
assert.equal(auth.storageKey, "wordstrike:auth:session:v2");
assert.ok(auth.storage, "browser storage must be supplied explicitly to Supabase");

auth.storage.setItem("session-test", "persisted");
assert.equal(auth.storage.getItem("session-test"), "persisted");
assert.equal(storage.getItem("session-test"), "persisted");
auth.storage.removeItem("session-test");
assert.equal(storage.getItem("session-test"), null);

assert.equal(SUPABASE_AUTH_STORAGE_KEY, "wordstrike:auth:session:v2");
assert.equal(createAuthStorageAdapter({}), null);

const DIET_AUTH_STORAGE_KEY = "sb-hycegznamzjhwinegaai-auth-token";
assert.notEqual(SUPABASE_AUTH_STORAGE_KEY, DIET_AUTH_STORAGE_KEY,
  "Wordstrike must not share Diet Copilot's origin-scoped refresh token");

// Wordstrike and Diet share the thiepn.dev origin, not a session lifecycle.
// Logging out of Wordstrike must not delete Diet's refresh token and vice versa.
{
  const entries = new Map([
    [DIET_AUTH_STORAGE_KEY, JSON.stringify({ access_token: "diet-token" })],
  ]);
  const sharedOriginStorage = {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: key => entries.delete(key),
  };
  const wordstrikeStorage = createAuthStorageAdapter(sharedOriginStorage);
  wordstrikeStorage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify({ access_token: "wordstrike-token" }));

  assert.equal(JSON.parse(wordstrikeStorage.getItem(SUPABASE_AUTH_STORAGE_KEY)).access_token,
    "wordstrike-token");
  assert.equal(JSON.parse(sharedOriginStorage.getItem(DIET_AUTH_STORAGE_KEY)).access_token,
    "diet-token");

  const reloadedWordstrike = createAuthStorageAdapter(sharedOriginStorage);
  assert.equal(JSON.parse(reloadedWordstrike.getItem(SUPABASE_AUTH_STORAGE_KEY)).access_token,
    "wordstrike-token");
  reloadedWordstrike.removeItem(SUPABASE_AUTH_STORAGE_KEY);
  assert.equal(reloadedWordstrike.getItem(SUPABASE_AUTH_STORAGE_KEY), null);
  assert.equal(JSON.parse(sharedOriginStorage.getItem(DIET_AUTH_STORAGE_KEY)).access_token,
    "diet-token");

  // No implicit migration from the shared credential: copying its refresh token
  // would let two clients independently rotate and invalidate the same token.
  const newlyLoadedWordstrike = createAuthStorageAdapter(sharedOriginStorage);
  assert.equal(newlyLoadedWordstrike.getItem(SUPABASE_AUTH_STORAGE_KEY), null);
}

console.log("Wordstrike's session key is isolated from Diet and survives reloads.");

const oldLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const oldSessionStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const fallbackValues = new Map();
const fallbackStorage = {
  getItem(key) { return fallbackValues.has(key) ? fallbackValues.get(key) : null; },
  setItem(key, value) { fallbackValues.set(key, String(value)); },
  removeItem(key) { fallbackValues.delete(key); },
};
try {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw Object.assign(new Error("storage unavailable"), { name: "NS_ERROR_NOT_AVAILABLE" });
    },
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: fallbackStorage,
  });
  const firefoxStorage = createAuthStorageAdapter();
  assert.ok(firefoxStorage, "Firefox must fall back to sessionStorage when localStorage access throws");
  firefoxStorage.setItem("firefox-session", "kept-across-refresh");
  assert.equal(fallbackStorage.getItem("firefox-session"), "kept-across-refresh");
} finally {
  if (oldLocalStorage) Object.defineProperty(globalThis, "localStorage", oldLocalStorage);
  else delete globalThis.localStorage;
  if (oldSessionStorage) Object.defineProperty(globalThis, "sessionStorage", oldSessionStorage);
  else delete globalThis.sessionStorage;
}


const quotaLocalValues = new Map();
const quotaLocal = {
  getItem(key) { return quotaLocalValues.get(key) ?? null; },
  setItem(key, value) {
    if (key === "sb-large-token") throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    quotaLocalValues.set(key, String(value));
  },
  removeItem(key) { quotaLocalValues.delete(key); },
};
const quotaSessionValues = new Map();
const quotaSession = {
  getItem(key) { return quotaSessionValues.get(key) ?? null; },
  setItem(key, value) { quotaSessionValues.set(key, String(value)); },
  removeItem(key) { quotaSessionValues.delete(key); },
};
const oldQuotaLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
const oldQuotaSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
try {
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: quotaLocal });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: quotaSession });
  const resilientAuthStorage = createAuthStorageAdapter();
  resilientAuthStorage.setItem("sb-large-token", "large-refresh-token");
  assert.equal(quotaSession.getItem("sb-large-token"), "large-refresh-token");
  assert.equal(resilientAuthStorage.getItem("sb-large-token"), "large-refresh-token");
} finally {
  if (oldQuotaLocal) Object.defineProperty(globalThis, "localStorage", oldQuotaLocal);
  else delete globalThis.localStorage;
  if (oldQuotaSession) Object.defineProperty(globalThis, "sessionStorage", oldQuotaSession);
  else delete globalThis.sessionStorage;
}

console.log("Supabase browser client uses an explicit persistent auth storage adapter.");

// Recreating the adapter (as happens on a page reload) must reuse the same
// durable session instead of silently falling back to an in-memory client.
{
  const persistent = new Map();
  const local = {
    getItem: key => persistent.get(key) ?? null,
    setItem: (key, value) => persistent.set(key, String(value)),
    removeItem: key => persistent.delete(key),
  };
  const firstPage = createAuthStorageAdapter(local);
  firstPage.setItem(SUPABASE_AUTH_STORAGE_KEY, JSON.stringify({ access_token: "persisted-token" }));
  const reloadedPage = createAuthStorageAdapter(local);
  assert.equal(
    JSON.parse(reloadedPage.getItem(SUPABASE_AUTH_STORAGE_KEY)).access_token,
    "persisted-token",
  );
}

// A browser that blocks both storage APIs must not silently create an
// apparently signed-in session that disappears at the next page load.
{
  const noStorageModule = await import(new URL(
    `../js/supabaseClient.js?storage-blocked=${Date.now()}`, import.meta.url,
  ));
  const previousLocal = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const previousSession = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  try {
    for (const key of ["localStorage", "sessionStorage"]) {
      Object.defineProperty(globalThis, key, {
        configurable: true,
        get() { throw new Error("Storage access denied"); },
      });
    }
    assert.equal(noStorageModule.getSupabaseClient({ config: validConfig, sdk }), null);
    assert.equal(calls.length, 1, "SDK must not run without persistent storage");
  } finally {
    if (previousLocal) Object.defineProperty(globalThis, "localStorage", previousLocal);
    else delete globalThis.localStorage;
    if (previousSession) Object.defineProperty(globalThis, "sessionStorage", previousSession);
    else delete globalThis.sessionStorage;
  }
}
console.log("Storage-denied and page-reload persistence regression tests passed.");
