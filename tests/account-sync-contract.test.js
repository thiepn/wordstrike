import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [client, edge, main, config, migration, serviceWorker] = await Promise.all([
  readFile(new URL("../js/accountDataSync.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/functions/wordstrike-profile-sync/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  readFile(new URL("../supabase/config.toml", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260922235104_wordstrike_profile_server_only.sql", import.meta.url), "utf8"),
  readFile(new URL("../sw.js", import.meta.url), "utf8"),
]);
assert.match(client, /functions\.invoke\(FUNCTION_NAME/);
assert.match(client, /LOCAL_DATA_CHANGED_EVENT/);
assert.match(client, /syncPending = true/);
assert.match(client, /if \(syncPending[\s\S]*scheduleSync\(\)/);
assert.match(client, /REVISION_CONFLICT/);
assert.match(client, /mergeWordStrikeSnapshots/);
assert.match(client, /saveGame\(snapshot\.campaign\)/);
assert.match(client, /saveModeData\(snapshot\.mode\)/);
assert.match(edge, /serverClient\.auth\.getUser\(token\)/);
assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
assert.match(edge, /eq\("revision", expectedRevision\)/);
assert.match(edge, /REVISION_CONFLICT/);
assert.match(main, /startAccountDataSync\(authState\.user/);
assert.match(main, /stopAccountDataSync\(\)/);
assert.match(config, /\[functions\.wordstrike-profile-sync\][\s\S]*verify_jwt = false/);
assert.match(migration, /revoke all on public\.wordstrike_player_profiles from public, anon, authenticated/);
for (const modulePath of ["accountDataMerge.js", "accountDataSync.js", "localDataEvents.js", "screenScroll.js"]) {
  assert.ok(serviceWorker.includes(`./js/${modulePath}`));
}
assert.doesNotMatch(client, /\.from\("wordstrike_player_profiles"\)/);
console.log("Account cloud-save contract keeps writes server-authenticated and syncs local-first progress.");
