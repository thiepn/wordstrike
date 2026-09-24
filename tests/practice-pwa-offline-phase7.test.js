import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Phase 7 manifest is installable and orientation-safe", async () => {
  const manifest=JSON.parse(await readFile(new URL("../manifest.webmanifest",import.meta.url),"utf8"));
  assert.equal(manifest.id,"./");
  assert.equal(manifest.start_url,"./");
  assert.equal(manifest.scope,"./");
  assert.equal(manifest.display,"standalone");
  assert.equal(manifest.orientation,"any");
  assert.ok(manifest.icons.some(icon=>icon.sizes==="192x192"));
  assert.ok(manifest.icons.some(icon=>icon.sizes==="512x512"));
  assert.ok(manifest.icons.some(icon=>String(icon.purpose).includes("maskable")));
});

test("Phase 7 service worker has resilient core and optional precache layers", async () => {
  const source=await readFile(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(source,/const CORE_SHELL = Object\.freeze/);
  assert.match(source,/await cache\.addAll\(CORE_SHELL\)/);
  assert.match(source,/const OPTIONAL_PRECACHE_BATCH_SIZE = 24/);
  assert.match(source,/cacheOptionalAssets\(cache, optional\)/);
  assert.match(source,/Promise\.allSettled\(batch\.map\(asset => cache\.add\(asset\)\)\)/);
  assert.doesNotMatch(source,/cache\.addAll\(APP_SHELL\)/);
});

test("Phase 7 service worker backgrounds cache writes and handles query-version drift", async () => {
  const source=await readFile(new URL("../sw.js",import.meta.url),"utf8");
  assert.match(source,/function cacheNetworkResponseInBackground\(/);
  assert.match(source,/event\.waitUntil\(cacheUpdate\)/);
  assert.match(source,/await cache\.put\(cacheKey, response\.clone\(\)\)/);
  const fetchHandler=source.slice(source.indexOf('self.addEventListener("fetch"'));
  assert.doesNotMatch(fetchHandler,/fetch\(request\)\.then\(async response =>[\s\S]*?await cache\.put/);
  assert.match(source,/caches\.match\(request, \{ ignoreSearch: true \}\)/);
  assert.match(source,/caches\.match\("\.\/index\.html", \{ ignoreSearch: true \}\)/);
});
