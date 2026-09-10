import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getSupabaseClient } from "../js/supabaseClient.js";

const calls = [];
const fakeClient = { auth: {} };
const sdk = {
  createClient(url, key, options) {
    calls.push({ url, key, options });
    return fakeClient;
  },
};

const client = getSupabaseClient({ sdk });
assert.equal(client, fakeClient);
assert.equal(calls.length, 1);
const auth = calls[0].options.auth;
assert.equal(auth.flowType, "implicit");
assert.equal(auth.persistSession, true);
assert.equal(auth.autoRefreshToken, true);
assert.equal(auth.detectSessionInUrl, true);
assert.equal(auth.experimental, undefined,
  "Browser-only Google OAuth must not depend on PKCE verifier state");

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
assert.match(index, /@supabase\/supabase-js@2\.116\.0/,
  "Production must load the certified Supabase browser SDK");
assert.match(index, /js\/main\.js\?v=20260910e/,
  "Auth-facing application code should be cache-busted after the session-completion repair");

console.log("Google OAuth client uses current Supabase JS with the client-native implicit flow.");
