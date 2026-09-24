import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAllModes } from "../js/modes.js";
import { loadSave } from "../js/storage.js";
import { loadModeData, MODE_DATA_SCHEMA_VERSION } from "../js/modeStorage.js";
import {
  inspectPendingResultSubmission,
  PENDING_RESULT_STORAGE_KEY,
} from "../js/pendingResultSubmission.js";
import {
  listSubmissionOutbox,
  SUBMISSION_OUTBOX_STORAGE_KEY,
} from "../js/submissionOutbox.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

const previousStorage = globalThis.localStorage;
const storage = new MemoryStorage({
  wordstrike_save: "{broken",
  wordstrike_mode_data_v2: "{broken",
  [PENDING_RESULT_STORAGE_KEY]: "{broken",
  [SUBMISSION_OUTBOX_STORAGE_KEY]: '{"not":"an-array"}',
});
globalThis.localStorage = storage;

try {
  const save = loadSave();
  assert.equal(save.currentFurthestLevel >= 1, true);
  assert.ok(save.settings && typeof save.settings === "object");

  const modeData = loadModeData();
  assert.equal(modeData.schemaVersion, MODE_DATA_SCHEMA_VERSION);
  assert.ok(Array.isArray(modeData.recentSessions));

  const pending = inspectPendingResultSubmission({ storage });
  assert.equal(pending.intent, null);
  assert.equal(pending.error, "MALFORMED_INTENT");
  assert.equal(storage.getItem(PENDING_RESULT_STORAGE_KEY), null);

  const outbox = listSubmissionOutbox({ storage });
  assert.deepEqual(outbox, []);
  assert.equal(storage.getItem(SUBMISSION_OUTBOX_STORAGE_KEY), "[]");
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}

const publicModes = getAllModes().map(({ id }) => id);
assert.deepEqual(publicModes, ["campaign", "speed-test", "endless", "flow", "practice"]);

const [
  packageJson,
  manifestJson,
  index,
  serviceWorker,
  main,
  nativeBack,
  flowPhase1,
  flowLoader,
  workflow,
  browserStress,
] = await Promise.all([
  read("../package.json").then(JSON.parse),
  read("../manifest.webmanifest").then(JSON.parse),
  read("../index.html"),
  read("../sw.js"),
  read("../js/main.js"),
  read("../js/nativeBackNavigation.js"),
  read("../js/flow/flowPhase1.js"),
  read("../js/flow/flowRuntimeLoader.js"),
  read("../.github/workflows/non-practice-browser.yml"),
  read("./browser/release_adversarial_pass7.py"),
]);

assert.equal(packageJson.version, "1.0.0");
assert.equal(manifestJson.display, "standalone");
assert.equal(manifestJson.id, "./");
assert.equal(manifestJson.start_url, "./");
assert.equal(manifestJson.scope, "./");

assert.match(nativeBack, /backFlow/);
assert.match(nativeBack, /typeof backFlow === "function" && backFlow\(\) === true/);
assert.match(main, /backFlow: \(\) => \([\s\S]*?wordstrikeFlowPhase1\?\.exitToReturnSurface\?\.\("native-back"\) === true/);
assert.match(flowPhase1, /function exitFlowToReturnSurface\(reason = "exit"\)/);
assert.match(flowPhase1, /exitToReturnSurface: exitFlowToReturnSurface/);
assert.match(flowPhase1, /if \(!active\) return false/);

const mainVersion = index.match(/src="js\/main\.js\?v=([^"]+)"/)?.[1];
assert.ok(mainVersion, "production index must cache-bust main.js");
const mainAsset = `"./js/main.js?v=${mainVersion}"`;
assert.equal(
  serviceWorker.split(mainAsset).length - 1,
  2,
  "APP_SHELL and CORE_SHELL must cache the exact delivered main runtime",
);

const loaderVersion = index.match(/src="js\/flow\/flowRuntimeLoader\.js\?v=([^"]+)"/)?.[1];
assert.ok(loaderVersion, "production index must cache-bust the Flow runtime loader");
assert.ok(
  serviceWorker.includes(`"./js/flow/flowRuntimeLoader.js?v=${loaderVersion}"`),
  "service worker must include the exact Flow loader delivered by index.html",
);
assert.ok(
  flowLoader.includes(`"./js/flow/flowRuntimeLoader.js?v=${loaderVersion}"`),
  "Flow dedicated offline pack must include its exact delivered loader version",
);

const phase1Version = flowLoader.match(/"\.\/js\/flow\/flowPhase1\.js\?v=([^"]+)"/)?.[1];
assert.ok(phase1Version, "Flow offline asset pack must version flowPhase1");
assert.ok(
  flowLoader.includes(`import("./flowPhase1.js?v=${phase1Version}")`),
  "active Flow dynamic import must match its offline-pack phase1 version",
);
assert.ok(
  serviceWorker.includes(`"./js/flow/flowPhase1.js?v=${phase1Version}"`),
  "service worker must cache the active Flow phase1 version",
);

assert.match(serviceWorker, /cacheNetworkResponseInBackground/);
assert.match(serviceWorker, /OPTIONAL_PRECACHE_BATCH_SIZE = 24/);
assert.match(flowLoader, /FLOW_OFFLINE_CACHE_BATCH_SIZE = 16/);

assert.match(workflow, /Certify Pass 7 adversarial release stress/);
assert.match(workflow, /python3 tests\/browser\/release_adversarial_pass7\.py/);
assert.match(workflow, /browser-artifacts\/release-adversarial-pass7\//);

for (const contract of [
  "corrupt persisted state boots safely",
  "80 rapid top-level surface transitions",
  "Flow duplicate launch plus 12 mount/unmount cycles with native Back",
  "service-worker controlled offline restart",
]) {
  assert.ok(browserStress.includes(contract), `missing adversarial browser contract: ${contract}`);
}

assert.doesNotMatch(index, /Daily Strike/i);
assert.doesNotMatch(index, /Arcade Rush/i);

console.log("Pass 7 production contracts passed: corrupt-state recovery, frozen five-mode public surface, Flow-native Back ownership, exact offline/runtime version alignment, and adversarial browser certification wiring.");
