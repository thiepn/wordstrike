import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_WORDSTRIKE_AUTH_STORAGE_KEY,
  SUPABASE_AUTH_STORAGE_KEY,
  prepareSharedAuthStorage,
} from "../js/supabaseClient.js";

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("THIEPN Account uses the shared Supabase project storage key", () => {
  assert.equal(SUPABASE_AUTH_STORAGE_KEY, "sb-hycegznamzjhwinegaai-auth-token");
});

test("legacy WordStrike session is promoted only when shared session is absent", () => {
  const storage = memoryStorage({
    [LEGACY_WORDSTRIKE_AUTH_STORAGE_KEY]: "legacy-session",
  });

  assert.equal(prepareSharedAuthStorage(storage), true);
  assert.equal(storage.getItem(SUPABASE_AUTH_STORAGE_KEY), "legacy-session");
});

test("existing shared THIEPN Account session always wins", () => {
  const storage = memoryStorage({
    [LEGACY_WORDSTRIKE_AUTH_STORAGE_KEY]: "legacy-session",
    [SUPABASE_AUTH_STORAGE_KEY]: "shared-session",
  });

  prepareSharedAuthStorage(storage);
  assert.equal(storage.getItem(SUPABASE_AUTH_STORAGE_KEY), "shared-session");
});
