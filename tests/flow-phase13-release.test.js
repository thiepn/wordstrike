import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  FLOW_RELEASE_ASSETS,
  FLOW_RELEASE_QUERY_KEYS,
  buildFlowReleaseUrl,
  isFlowDeveloperRoute,
  isFlowReleaseRoute,
  stripFlowReleaseUrl,
} from "../js/flow/flowRuntimeLoader.js";
import {
  getAllModes,
  getEnabledModes,
  getModeDefinition,
  MODE_IDS,
} from "../js/modes.js";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const loader = await readFile(new URL("../js/flow/flowRuntimeLoader.js", import.meta.url), "utf8");

const modes = getAllModes();
assert.deepEqual(modes.map(({ id }) => id), [
  MODE_IDS.CAMPAIGN,
  MODE_IDS.SPEED_TEST,
  MODE_IDS.ENDLESS,
  MODE_IDS.FLOW,
  MODE_IDS.PRACTICE,
]);
assert.deepEqual(getEnabledModes().map(({ id }) => id), [
  MODE_IDS.CAMPAIGN,
  MODE_IDS.SPEED_TEST,
  MODE_IDS.ENDLESS,
  MODE_IDS.FLOW,
  MODE_IDS.PRACTICE,
]);

const flow = getModeDefinition(MODE_IDS.FLOW);
assert.equal(flow.enabled, true);
assert.equal(flow.visible, true);
assert.equal(flow.status, "available");
assert.equal(flow.route, "flow-release");
const practice = getModeDefinition(MODE_IDS.PRACTICE);
assert.equal(practice.enabled, true);
assert.equal(practice.status, "available");
const rush = getModeDefinition(MODE_IDS.ARCADE_RUSH);
assert.equal(rush.visible, false);
assert.equal(rush.status, "retired");

const source = {
  href: "https://wordstrike.test/?foo=keep&dev=1#section",
  search: "?foo=keep&dev=1",
};
const releaseHref = buildFlowReleaseUrl(source);
const release = new URL(releaseHref);
assert.equal(release.searchParams.get("foo"), "keep");
assert.equal(release.searchParams.has("dev"), false);
for (const key of [
  "mode", "flowRelease", "flowRun", "flowUi", "flowUx",
  "flowModifiers", "flowAdaptive", "flowIntegration", "flowSeed",
]) {
  assert.ok(release.searchParams.has(key), `release URL missing ${key}`);
}
assert.match(release.searchParams.get("flowSeed"), /^release-/);
const explicitSeed = new URL(buildFlowReleaseUrl({
  href: "https://wordstrike.test/?flowSeed=explicit-release-seed",
  search: "?flowSeed=explicit-release-seed",
}));
assert.equal(explicitSeed.searchParams.get("flowSeed"), "explicit-release-seed", "explicit release seeds must remain deterministic");
assert.equal(release.searchParams.get("mode"), "flow");
assert.equal(release.searchParams.get("flowRelease"), "1");
assert.equal(isFlowReleaseRoute({ href: release.href, search: release.search }), true);
assert.equal(isFlowDeveloperRoute({ href: release.href, search: release.search }), false);
assert.equal(isFlowDeveloperRoute({ href: "https://wordstrike.test/?dev=1&mode=flow", search: "?dev=1&mode=flow" }), true);

const dirty = new URL(release.href);
dirty.searchParams.set("flowLength", "quick");
dirty.searchParams.set("flowModifierIds", "sprint");
dirty.searchParams.set("flowWeaknesses", "profile");
dirty.searchParams.set("dev", "1");
const cleaned = new URL(stripFlowReleaseUrl({ href: dirty.href, search: dirty.search }));
assert.equal(cleaned.searchParams.get("foo"), "keep");
assert.equal(cleaned.searchParams.has("dev"), false);
for (const key of FLOW_RELEASE_QUERY_KEYS) {
  assert.equal(cleaned.searchParams.has(key), false, `exit URL retained ${key}`);
}

assert.ok(FLOW_RELEASE_ASSETS.length >= 30, "release cache pack should cover the complete Flow stack");
assert.equal(new Set(FLOW_RELEASE_ASSETS).size, FLOW_RELEASE_ASSETS.length, "release cache pack contains duplicates");
for (const asset of [
  "./js/flow/flowRuntimeLoader.js?v=20260918a",
  "./js/flow/flowEngine.js",
  "./js/flow/flowCadence.js",
  "./js/flow/flowGameplay.js",
  "./js/flow/flowContentExpansion.js",
  "./js/flow/flowLongformContent.js",
  "./js/flow/flowPassages.js",
  "./js/flow/flowPhase1.js?v=20260917b",
  "./js/flow/flowProgression.js",
  "./js/flow/flowUiPhase7KeyboardGuard.js?v=20260917a",
  "./js/flow/flowIntegrationPhase11.js?v=20260916a",
  "./styles/screens/flow-phase1.css?v=20260916d",
  "./styles/screens/flow-integration-phase11.css?v=20260916a",
]) {
  assert.ok(FLOW_RELEASE_ASSETS.includes(asset), `offline pack missing ${asset}`);
}

const mainIndex = index.indexOf('src="js/main.js?v=20260910f"');
const releaseIndex = index.indexOf('src="js/flow/flowRuntimeLoader.js?v=20260918a"');
assert.ok(mainIndex >= 0 && releaseIndex > mainIndex, "main.js must boot before the release loader can temporarily emulate the developer route");
assert.doesNotMatch(index, /src="js\/flow\/flowPhase1\.js/);
assert.doesNotMatch(index, /const flowParams = new URLSearchParams/);
assert.match(loader, /await waitForModeSelect\(\)/);
assert.match(loader, /temporary\.searchParams\.set\("dev", "1"\)/);
assert.match(loader, /removeTemporaryDeveloperFlag\(\)/);
assert.match(loader, /installReleaseExitCleanup\(\)/);
assert.match(loader, /button\[data-mode-id=["']flow["']\]/);
assert.match(loader, /cache\.addAll\(urls\)/);
assert.match(loader, /flowSeed/);

console.log("Flow Phase 13 release contracts passed: public registry, fresh production seed, clean exit, cache-busted performance runtime, longform-aware offline module graph, and offline asset pack.");
