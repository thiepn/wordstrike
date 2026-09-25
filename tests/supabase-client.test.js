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
assert.equal(auth.storageKey, "sb-hycegznamzjhwinegaai-auth-token");
assert.ok(auth.storage, "browser storage must be supplied explicitly to Supabase");

auth.storage.setItem("session-test", "persisted");
assert.equal(auth.storage.getItem("session-test"), "persisted");
assert.equal(storage.getItem("session-test"), "persisted");
auth.storage.removeItem("session-test");
assert.equal(storage.getItem("session-test"), null);

assert.equal(SUPABASE_AUTH_STORAGE_KEY, "sb-hycegznamzjhwinegaai-auth-token");
assert.equal(createAuthStorageAdapter({}), null);

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
