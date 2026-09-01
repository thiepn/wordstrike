import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  ALLOWED_ORIGINS,
  getCorsHeaders,
  toPublicProfile,
  validateUsername,
} from "../supabase/functions/_shared/leaderboardProfile.js";

assert.equal(validateUsername("  WordStriker27  ").username, "WordStriker27");
assert.equal(validateUsername("WordStriker27").normalized, "wordstriker27");
assert.equal(validateUsername("user-name").valid, false);
assert.deepEqual(ALLOWED_ORIGINS, [
  "https://thiepn.dev",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);
assert.equal(getCorsHeaders("https://evil.example"), null);
assert.equal(getCorsHeaders(null)["Access-Control-Allow-Origin"], undefined);
assert.equal(getCorsHeaders("https://thiepn.dev")["Access-Control-Allow-Origin"], "https://thiepn.dev");
assert.equal(getCorsHeaders("http://localhost:8000")["Access-Control-Allow-Origin"], "http://localhost:8000");
assert.match(getCorsHeaders(null)["Access-Control-Allow-Headers"], /authorization.*apikey.*content-type.*x-client-info/);

const initial = toPublicProfile({ username: "FirstName", username_changed_at: null });
assert.deepEqual(initial, { username: "FirstName", usernameChangedAt: null, canChangeAt: null });
const changed = toPublicProfile({ username: "SecondName", username_changed_at: "2030-01-01T00:00:00.000Z" });
assert.equal(changed.canChangeAt, "2030-01-31T00:00:00.000Z");

const edge = await readFile(new URL("../supabase/functions/leaderboard-profile/index.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260627223000_add_leaderboard_profile_username_management.sql", import.meta.url), "utf8");
assert.match(edge, /auth\.getUser\(token\)/);
assert.match(edge, /\["get", "check", "claim", "change"\]/);
assert.match(edge, /p_user_id:\s*userId/);
assert.doesNotMatch(edge, /body\.user_id|body\.email/);
assert.match(migration, /alter column username_changed_at drop default/);
assert.match(migration, /alter column username_changed_at drop not null/);
assert.match(migration, /values \(p_user_id, p_username, null\)/);
assert.match(migration, /for update/);
assert.match(migration, /interval '30 days'/);
assert.match(migration, /when unique_violation/);
assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
assert.match(migration, /grant execute on function[\s\S]*to service_role/);

console.log("Edge helper policy, CORS allowlist, JWT ownership source, and atomic SQL protections passed.");
