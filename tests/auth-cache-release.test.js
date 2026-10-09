import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const index = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const client = readFileSync(new URL("../js/supabaseClient.js", import.meta.url), "utf8");

const mainVersion = index.match(/src="js\/main\.js\?v=(\d{8}[a-z])"/)?.[1];
assert.ok(mainVersion, "Main application entry must be cache-busted");
assert.match(sw, new RegExp(`\\.\\/js\\/main\\.js\\?v=${mainVersion}`),
  "Service worker precache must include the same main.js version as index.html");

const cacheVersion = sw.match(/const CACHE_NAME = CACHE_PREFIX \+ "(v\d+[^"]*)"/)?.[1];
assert.ok(cacheVersion, "PWA cache needs a distinct release version");
assert.notEqual(cacheVersion, "v108-flow-next-text-v42-diet-v2-relay",
  "Auth session release must invalidate the previous service worker cache");
assert.match(sw, /const CORE_SHELL =[\s\S]*?"\.\/js\/authService\.js"/,
  "The current session restoration module must be in the offline shell");
assert.match(sw, /const CORE_SHELL =[\s\S]*?"\.\/js\/supabaseClient\.js"/,
  "The current app-isolated Supabase client must be in the offline shell");
assert.match(index, /updateViaCache:\s*"none"/,
  "The service worker script update must bypass the HTTP cache");
assert.match(index, /registration\.update\(\)/,
  "Page load must actively check for a service worker update");
assert.match(client, /SUPABASE_AUTH_STORAGE_KEY\s*=\s*"wordstrike:auth:session:v2"/,
  "The released client must use Wordstrike's dedicated session storage");

console.log("Auth release uses an updated cache version, refreshes the PWA, and precaches current session modules.");
