import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = [
  "../js/speedTestPerformanceV1.js",
  "../js/speedTestPerformanceV2.js",
  "../js/speedTestPerformanceV3.js",
  "../js/speedTestPerformanceV4.js",
  "../js/speedTestPerformanceV5.js",
  "../js/speedTestResultsV6b.js",
  "../js/speedTestResultsV7.js",
  "../js/campaignGameplayPresentation.js",
  "../js/endlessGameplayPresentation.js",
  "../js/bossGameplayPresentation.js",
  "../js/arcadeRushGameplayPresentation.js",
  "../js/speedTestWordProfileV4.js",
];
const sources = Object.fromEntries(await Promise.all(paths.map(async (path) => [
  path,
  await readFile(new URL(path, import.meta.url), "utf8"),
])));

for (const path of paths.slice(0, 5)) {
  const source = sources[path];
  assert.match(source, /observer\.observe\(root, \{ childList: true \}\);/);
  assert.doesNotMatch(source, /observer\.observe\(root, \{[^}]*subtree:\s*true/);
  assert.match(source, /window\.addEventListener\("pagehide"/);
  assert.match(source, /window\.addEventListener\("pageshow"/);
}

const v6 = sources["../js/speedTestResultsV6b.js"];
assert.match(v6, /resultsObserver\.observe\(root, \{ childList: true \}\);/);
assert.doesNotMatch(v6, /resultsObserver\.observe\([^;]*subtree:\s*true/);
assert.match(v6, /practiceStructureObserver\.observe\(root, \{ childList: true \}\);/);
assert.match(v6, /practiceAttributeObserver\.observe\(root, \{[\s\S]*?attributeFilter:\s*\["disabled", "aria-disabled", "data-practice-view"\]/);

const v7 = sources["../js/speedTestResultsV7.js"];
assert.match(v7, /rootObserver\.observe\(root, \{ childList: true \}\);/);
assert.match(v7, /bodyObserver\.observe\(document\.body, \{ childList: true \}\);/);
assert.match(v7, /practiceStructureObserver\.observe\(practiceRoot, \{ childList: true \}\);/);
assert.match(v7, /practiceViewObserver\.observe\(practiceRoot, \{[\s\S]*?attributes:\s*true,[\s\S]*?attributeFilter:\s*\["data-practice-view"\]/);
assert.doesNotMatch(v7, /observe\(document\.body, \{ childList: true, subtree: true/);
assert.match(v7, /document\.removeEventListener\("click", onDocumentClickCapture, true\)/);
assert.match(v7, /window\.addEventListener\("pageshow", install\)/);

const profiler = sources["../js/speedTestWordProfileV4.js"];
assert.match(profiler, /observer\.observe\(root, \{ childList: true \}\);/);
assert.doesNotMatch(profiler, /observer\.observe\(root, \{[^}]*subtree:\s*true/);
assert.match(profiler, /if \(state\.phase === "PAUSED"\) return;/);
assert.match(profiler, /window\.addEventListener\("pagehide", teardownSpeedTestWordProfiler\)/);
assert.match(profiler, /window\.addEventListener\("pageshow", installSpeedTestWordProfiler\)/);

const campaign = sources["../js/campaignGameplayPresentation.js"];
const endless = sources["../js/endlessGameplayPresentation.js"];
const boss = sources["../js/bossGameplayPresentation.js"];
for (const [name, source] of Object.entries({ campaign, endless, boss })) {
  assert.match(source, /observe\(appRoot, \{ childList: true \}\);/, `${name} presentation must only watch app-level screen swaps`);
  assert.doesNotMatch(source, /observe\(appRoot, \{[^}]*subtree:\s*true/);
}

const arcade = sources["../js/arcadeRushGameplayPresentation.js"];
assert.match(arcade, /rootObserver\.observe\(app, \{ childList: true \}\);/);
assert.doesNotMatch(arcade, /rootObserver\.observe\(app, \{[^}]*subtree:\s*true/);
assert.match(arcade, /viewObserver\.observe\(nextView, \{[\s\S]*?subtree:\s*true/);
assert.match(arcade, /disconnectViewObserver\(\)/);

console.log("Results, profiler, and presentation observers stay off unrelated typing mutation hot paths and clean up lifecycle state.");
