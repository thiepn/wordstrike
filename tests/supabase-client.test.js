import assert from "node:assert/strict";

const validConfig = {
  url: "https://abc123project.supabase.co",
  publishableKey: "sb_publishable_public-browser-key",
};
const calls = [];
const client = { auth: {} };
const sdk = {
  createClient(...args) {
    calls.push(args);
    return client;
  },
};
const moduleUrl = new URL(`../js/supabaseClient.js?singleton=${Date.now()}`, import.meta.url);
const {
  getSupabaseClient,
  SUPABASE_AUTH_STORAGE_KEY,
} = await import(moduleUrl);

assert.equal(getSupabaseClient({ config: validConfig, sdk: null }), null);
assert.equal(getSupabaseClient({ config: { ...validConfig, publishableKey: "sb_secret_bad" }, sdk }), null);
assert.equal(getSupabaseClient({ config: validConfig, sdk }), client);
assert.equal(getSupabaseClient({ config: validConfig, sdk }), client);
assert.equal(calls.length, 1);
assert.deepEqual(calls[0], [
  validConfig.url,
  validConfig.publishableKey,
  {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "wordstrike_supabase_auth_v1",
      experimental: {
        appendPkceFlowIdToRedirects: true,
      },
    },
  },
]);
assert.equal(SUPABASE_AUTH_STORAGE_KEY, "wordstrike_supabase_auth_v1");

console.log("Supabase browser client singleton, persistent PKCE, and per-flow verifier options passed.");
