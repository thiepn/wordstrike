import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  analyzeFlowCadence,
  analyzeFlowCadenceLive,
  FLOW_LIVE_CADENCE_EVENT_WINDOW,
} from "../js/flow/flowCadence.js";
import {
  createFlowTypingRun,
  insertFlowText,
} from "../js/flow/flowEngine.js";
import {
  FLOW_GAMEPLAY_EVENT_RETAIN_LIMIT,
} from "../js/flow/flowGameplay.js";

const longText = ("abcdefghijklmnopqrstuvwxyz ").repeat(240);
const run = createFlowTypingRun(longText, {
  category: "everyday",
  difficulty: "natural",
});

let at = 1000;
for (const character of run.passage) {
  insertFlowText(run, character, at);
  at += 72;
}

const live = analyzeFlowCadenceLive(run);
const exact = analyzeFlowCadence(run);
assert.ok(exact.sampleCount > FLOW_LIVE_CADENCE_EVENT_WINDOW);
assert.ok(live.liveWindowEventCount <= FLOW_LIVE_CADENCE_EVENT_WINDOW);
assert.equal(live.liveWindowTruncated, true);
assert.ok(live.sampleCount <= FLOW_LIVE_CADENCE_EVENT_WINDOW);
assert.equal(live.finalWpm, exact.finalWpm, "bounded live cadence must preserve session-wide WPM");
assert.equal(live.rawWpm, exact.rawWpm, "bounded live cadence must preserve session-wide raw WPM");
assert.deepEqual(live.featureLatencies, []);
assert.deepEqual(live.slowestHesitations, []);

assert.ok(run.gameplayEvents.length <= FLOW_GAMEPLAY_EVENT_RETAIN_LIMIT);
assert.ok(run.gameplayEventsDropped > 0, "duplicate gameplay telemetry should compact during long runs");
assert.equal(
  run.gameplayEvents.length + run.gameplayEventsDropped,
  run.rawKeystrokes.length,
  "telemetry compaction must not affect authoritative raw input history",
);

const [ui11, ui12, serviceWorker, flowLoader, flowPhase1] = await Promise.all([
  readFile(new URL("../js/profileLeaderboardsSettingsPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../js/ui12GlobalPresentation.js", import.meta.url), "utf8"),
  readFile(new URL("../sw.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8"),
  readFile(new URL("../js/flow/flowPhase1.js", import.meta.url), "utf8"),
]);

for (const source of [ui11, ui12]) {
  assert.match(source, /observer\.observe\(root, \{ childList: true \}\)/);
  assert.doesNotMatch(
    source,
    /observer\.observe\(root, \{[^}]*subtree:\s*true/,
    "global presentation observers must not wake on gameplay subtree churn",
  );
}

assert.match(flowPhase1, /analyzeFlowCadenceLive\(run\)/);
assert.match(flowPhase1, /maxCadenceWindowEvents/);
assert.match(flowPhase1, /liveCadenceEventWindow: FLOW_LIVE_CADENCE_EVENT_WINDOW/);
assert.match(flowPhase1, /let launchObserver = null/);
assert.match(flowPhase1, /launchObserver\?\.disconnect\?\.\(\)/);
assert.match(flowLoader, /let releaseExitObserver = null/);
assert.match(flowLoader, /releaseExitObserver\?\.disconnect\?\.\(\)/);

assert.match(serviceWorker, /OPTIONAL_PRECACHE_BATCH_SIZE = 24/);
assert.match(serviceWorker, /cacheOptionalAssets\(cache, optional\)/);
assert.match(serviceWorker, /cacheNetworkResponseInBackground/);
assert.match(serviceWorker, /event\.waitUntil\(cacheUpdate\)/);
const fetchHandler = serviceWorker.slice(serviceWorker.indexOf('self.addEventListener("fetch"'));
assert.doesNotMatch(
  fetchHandler,
  /fetch\(request\)\.then\(async response =>[\s\S]*?await cache\.put/,
  "network responses must not wait for cache writes before being returned",
);

assert.match(flowLoader, /FLOW_OFFLINE_CACHE_BATCH_SIZE = 16/);
assert.match(flowLoader, /cacheFlowAssetsInBatches\(cache, missing\)/);
assert.doesNotMatch(flowLoader, /cache\.addAll\(missing\)/);

console.log("Pass 6 performance/memory contracts passed: bounded live Flow analysis, compact duplicate telemetry, screen-swap-only global observers, and background/batched cache work.");
