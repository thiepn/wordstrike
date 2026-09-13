import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanupRetiredAuthStorage,
  RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
} from "../js/supabaseClient.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("WORDSTRIKE uses the shared THIEPN Account storage key", () => {
  assert.equal(SUPABASE_AUTH_STORAGE_KEY, "sb-hycegznamzjhwinegaai-auth-token");
  assert.equal(RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY, "wordstrike_supabase_auth_v1");
});

test("retired WORDSTRIKE auth artifacts are deleted without being promoted", () => {
  const shared = JSON.stringify({ access_token: "shared" });
  const storage = memoryStorage({
    [SUPABASE_AUTH_STORAGE_KEY]: shared,
    [RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY]: JSON.stringify({ access_token: "legacy" }),
    [`${RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY}-code-verifier`]: "legacy-verifier",
    [`${RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY}-user`]: "legacy-user",
    "wordstrike-game-progress": "keep-me",
  });

  assert.equal(cleanupRetiredAuthStorage(storage), true);
  assert.equal(storage.getItem(SUPABASE_AUTH_STORAGE_KEY), shared);
  assert.equal(storage.getItem(RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY), null);
  assert.equal(storage.getItem(`${RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY}-code-verifier`), null);
  assert.equal(storage.getItem(`${RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY}-user`), null);
  assert.equal(storage.getItem("wordstrike-game-progress"), "keep-me");
});

test("a retired session alone never creates a shared THIEPN session", () => {
  const storage = memoryStorage({
    [RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY]: JSON.stringify({ access_token: "legacy" }),
  });

  cleanupRetiredAuthStorage(storage);

  assert.equal(storage.getItem(SUPABASE_AUTH_STORAGE_KEY), null);
  assert.equal(storage.getItem(RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY), null);
});
