import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("../js/supabaseClient.js", import.meta.url), "utf8");
const presentationSource = fs.readFileSync(
  new URL("../js/thiepnAccountPresentation.js", import.meta.url),
  "utf8",
);

test("THIEPN Account uses the shared Supabase project storage key", () => {
  assert.match(source, /SUPABASE_AUTH_STORAGE_KEY\s*=\s*["']sb-hycegznamzjhwinegaai-auth-token["']/);
});

test("WordStrike retires its app-specific auth key without promoting it", () => {
  assert.match(
    source,
    /RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY\s*=\s*["']wordstrike_supabase_auth_v1["']/,
  );
  assert.match(source, /cleanupRetiredAuthStorage\(/);
  assert.match(source, /storage\.removeItem\(`\$\{RETIRED_WORDSTRIKE_AUTH_STORAGE_KEY\}\$\{suffix\}`\)/);
  assert.doesNotMatch(source, /prepareSharedAuthStorage\(/);
  assert.doesNotMatch(source, /LEGACY_WORDSTRIKE_AUTH_STORAGE_KEY/);
});

test("shared THIEPN Account storage is configured on the Supabase client", () => {
  assert.match(source, /storageKey:\s*SUPABASE_AUTH_STORAGE_KEY/);
  assert.match(source, /cleanupRetiredAuthStorage\(\)/);
});

test("THIEPN Account presentation enhancer is idempotent under its MutationObserver", () => {
  assert.match(
    presentationSource,
    /heading\s*&&\s*heading\.textContent\s*!==\s*["']THIEPN ACCOUNT["']/,
  );
});
