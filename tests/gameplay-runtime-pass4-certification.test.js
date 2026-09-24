import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const jsFiles = [
  "main.js",
  "runtimeTiming.js",
  "gameLoop.js",
  "bossLoop.js",
  "endlessMode.js",
  "speedTest.js",
  "gameplayVisibilityLifecycle.js",
  "campaignGameplayPresentation.js",
  "endlessGameplayPresentation.js",
  "bossGameplayPresentation.js",
  "speedTestWordProfileV4.js",
  "speedTestPerformanceV1.js",
  "speedTestPerformanceV2.js",
  "speedTestPerformanceV3.js",
  "speedTestPerformanceV4.js",
  "speedTestPerformanceV5.js",
  "speedTestResultsV6b.js",
  "speedTestResultsV7.js",
];

const files = Object.fromEntries(await Promise.all(jsFiles.map(async (name) => [
  name,
  await readFile(new URL("../js/" + name, import.meta.url), "utf8"),
])));

const flow = Object.fromEntries(await Promise.all([
  "flowPhase1.js",
  "flowCadence.js",
  "flowRuntimeLoader.js",
].map(async (name) => [
  name,
  await readFile(new URL("../js/flow/" + name, import.meta.url), "utf8"),
])));

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");

function pausedScreenGuard(source) {
  return source.match(/if \(appState\.screen !== Screens\.PLAYING\) \{[\s\S]*?\n  \}/)?.[0] || "";
}

function versionFromIndex(fileName) {
  const marker = 'src="js/' + fileName + '?v=';
  const markerIndex = index.indexOf(marker);
  assert.ok(markerIndex >= 0, "missing cache-busted " + fileName + " entry in index.html");
  const valueStart = markerIndex + marker.length;
  const valueEnd = index.indexOf('"', valueStart);
  assert.ok(valueEnd > valueStart, "malformed cache version for " + fileName);
  return index.slice(valueStart, valueEnd);
}

assert.match(files["runtimeTiming.js"], /GAMEPLAY_MAX_FRAME_DELTA_MS\s*=\s*100/);
for (const name of ["gameLoop.js", "bossLoop.js", "endlessMode.js"]) {
  assert.match(files[name], /clampGameplayFrameDelta/, name + " must use the shared frame-delta contract");
  const guard = pausedScreenGuard(files[name]);
  assert.match(guard, /lastTimestamp = null/, name + " must reset its frame baseline when gameplay is inactive");
  assert.match(guard, /animationFrameId = null/, name + " must park its RAF when gameplay is inactive");
  assert.doesNotMatch(guard, /requestAnimationFrame\(tick\)/, name + " must not spin a hidden/paused RAF");
}
assert.match(files["gameLoop.js"], /export function suspendGameLoop\(\)/);
assert.match(files["bossLoop.js"], /export function suspendBossLoop\(\)/);
assert.match(files["main.js"], /mode === "normal"\) suspendGameLoop\(\)/);
assert.match(files["main.js"], /mode === "boss"\) suspendBossLoop\(\)/);
assert.match(files["main.js"], /mode === "endless"\) stopEndlessLoop\(\)/);

assert.match(files["gameplayVisibilityLifecycle.js"], /visibilitychange/);
assert.match(files["gameplayVisibilityLifecycle.js"], /removeEventListener\("visibilitychange"/);
assert.match(files["main.js"], /pagehide[\s\S]*pauseForHidden[\s\S]*unmount/);
assert.match(files["main.js"], /pageshow[\s\S]*mount/);

assert.match(files["speedTest.js"], /remainingDurationMs = Math\.max\(0, state\.deadlineMs - nowMs\)/);
assert.match(files["speedTest.js"], /state\.deadlineMs = null/);
assert.match(files["speedTest.js"], /state\.deadlineMs = nowMs \+ state\.remainingDurationMs/);

assert.match(flow["flowPhase1.js"], /reason: "visibility-hidden"/);
assert.match(flow["flowPhase1.js"], /visibilitychange", handleFlowVisibilityChange/);
assert.match(flow["flowCadence.js"], /EXCLUDED_PAUSE_REASONS = new Set\(\["chapter-transition", "visibility-hidden"\]\)/);
assert.match(flow["flowCadence.js"], /excludedPauseOverlapMs\(run, start, finalAt\)/);
assert.match(flow["flowCadence.js"], /crossedExcludedPause/);
assert.match(flow["flowCadence.js"], /rawDelay - excluded/);

const gameplayPresentations = {
  campaign: files["campaignGameplayPresentation.js"],
  endless: files["endlessGameplayPresentation.js"],
  boss: files["bossGameplayPresentation.js"],
};
for (const [name, source] of Object.entries(gameplayPresentations)) {
  assert.match(source, /observe\(appRoot, \{ childList: true \}\)/, name + " presentation should only observe app-level screen swaps");
  assert.doesNotMatch(source, /observe\(appRoot, \{[^}]*subtree:\s*true/);
  assert.doesNotMatch(source, /if \(screen\) frameId = requestAnimationFrame/, name + " must not maintain a shadow gameplay RAF");
  assert.match(source, /window\.addEventListener\("pagehide"/);
  assert.match(source, /window\.addEventListener\("pageshow"/);
}
assert.match(gameplayPresentations.campaign, /export function syncCampaignGameplayPresentation/);
assert.match(gameplayPresentations.endless, /export function syncEndlessGameplayPresentation/);
assert.match(gameplayPresentations.boss, /export function syncBossGameplayPresentation/);
assert.match(files["main.js"], /syncCampaignGameplayPresentation\(currentGame\)/);
assert.match(files["main.js"], /syncEndlessGameplayPresentation\(currentGame\)/);
assert.match(files["main.js"], /syncBossGameplayPresentation\(currentGame\)/);

for (const name of [
  "speedTestPerformanceV1.js",
  "speedTestPerformanceV2.js",
  "speedTestPerformanceV3.js",
  "speedTestPerformanceV4.js",
  "speedTestPerformanceV5.js",
]) {
  assert.match(files[name], /observer\.observe\(root, \{ childList: true \}\)/);
  assert.doesNotMatch(files[name], /observer\.observe\(root, \{[^}]*subtree:\s*true/);
  assert.match(files[name], /pagehide/);
  assert.match(files[name], /pageshow/);
}

const profiler = files["speedTestWordProfileV4.js"];
assert.match(profiler, /observer\.observe\(root, \{ childList: true \}\)/);
assert.doesNotMatch(profiler, /observer\.observe\(root, \{[^}]*subtree:\s*true/);
assert.match(profiler, /pauseStateObserver\.observe\(nextScreen, \{[\s\S]*?attributeFilter:\s*\["class"\]/);
assert.doesNotMatch(profiler, /pauseStateObserver\.observe\(nextScreen, \{[^}]*subtree:\s*true/);
assert.match(profiler, /state\.phase === "PAUSED"[\s\S]*?cancelAnimationFrame/);
assert.match(profiler, /pagehide", teardownSpeedTestWordProfiler/);
assert.match(profiler, /pageshow", installSpeedTestWordProfiler/);

assert.match(files["speedTestResultsV6b.js"], /resultsObserver\?\.disconnect/);
assert.match(files["speedTestResultsV7.js"], /rootObserver\?\.disconnect/);
assert.match(
  files["speedTestResultsV7.js"],
  /if \(!practiceRoot\) \{[\s\S]*?hadObservedPracticeSurface[\s\S]*?scheduleEnhance\(\)/,
);

for (const fileName of [
  "main.js",
  "campaignGameplayPresentation.js",
  "endlessGameplayPresentation.js",
  "bossGameplayPresentation.js",
]) {
  const version = versionFromIndex(fileName);
  assert.ok(
    serviceWorker.includes('"./js/' + fileName + '?v=' + version + '"'),
    "service worker missing versioned " + fileName,
  );
  if (fileName !== "main.js") {
    assert.ok(
      files["main.js"].includes('from "./' + fileName + '?v=' + version + '"'),
      "main.js import version mismatch for " + fileName,
    );
  }
}

const flowLoaderVersion = versionFromIndex("flow/flowRuntimeLoader.js");
assert.ok(flow["flowRuntimeLoader.js"].includes('"./js/flow/flowRuntimeLoader.js?v=' + flowLoaderVersion + '"'));
assert.ok(serviceWorker.includes('"./js/flow/flowRuntimeLoader.js?v=' + flowLoaderVersion + '"'));

const phase1Version = flow["flowRuntimeLoader.js"].match(/import\("\.\/flowPhase1\.js\?v=([^"]+)"\)/)?.[1];
assert.ok(phase1Version, "missing active Flow phase1 import version");
assert.ok(flow["flowRuntimeLoader.js"].includes('"./js/flow/flowPhase1.js?v=' + phase1Version + '"'));
assert.ok(serviceWorker.includes('"./js/flow/flowPhase1.js?v=' + phase1Version + '"'));

const profilerVersion = files["speedTestPerformanceV4.js"].match(/speedTestWordProfileV4\.js\?v=([^"]+)/)?.[1];
assert.ok(profilerVersion, "missing Typing profiler import version");
assert.ok(serviceWorker.includes('"./js/speedTestWordProfileV4.js?v=' + profilerVersion + '"'));

console.log("Pass 4 gameplay/runtime certification passed: capped frame deltas, parked pause loops, hidden-tab fairness, authoritative presentations, observer hot paths, lifecycle cleanup, and cache delivery.");
