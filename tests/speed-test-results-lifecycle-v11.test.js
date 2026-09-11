import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const originalMutationObserver = globalThis.MutationObserver;
const originalReportError = globalThis.reportError;

const nativeInstances = [];
class FakeNativeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observations = [];
    this.disconnectCount = 0;
    nativeInstances.push(this);
  }

  observe(target, options) {
    this.observations.push({ target, options: { ...options } });
  }

  disconnect() {
    this.disconnectCount += 1;
    this.observations = [];
  }

  takeRecords() {
    return [];
  }

  emit(records) {
    this.callback(records, this);
  }
}

globalThis.MutationObserver = FakeNativeMutationObserver;
const reportedErrors = [];
globalThis.reportError = (error) => reportedErrors.push(error);

const hubUrl = new URL("../js/speedTestResultsObserverHub.js", import.meta.url);
hubUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
const hub = await import(hubUrl.href);

try {
  assert.notEqual(globalThis.MutationObserver, FakeNativeMutationObserver, "V11 should temporarily virtualize MutationObserver during historical results boot");
  const VirtualMutationObserver = globalThis.MutationObserver;

  const app = {
    id: "app",
    contains(target) {
      return target === this || target?.insideApp === true;
    },
  };
  const body = {
    id: "body",
    contains(target) {
      return target === this || target?.insideBody === true || target?.insideApp === true;
    },
  };
  const appChild = { insideApp: true, insideBody: true };
  const overlayChild = { insideBody: true };

  const calls = { first: 0, second: 0, body: 0 };
  const first = new VirtualMutationObserver(() => { calls.first += 1; });
  const second = new VirtualMutationObserver(() => { calls.second += 1; });
  const bodyObserver = new VirtualMutationObserver(() => { calls.body += 1; });

  first.observe(app, { childList: true, subtree: true });
  second.observe(app, { childList: true, subtree: true });
  bodyObserver.observe(body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-practice-view"],
  });

  assert.equal(nativeInstances.length, 1, "all captured historical observers must share exactly one native observer");
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().nativeObserverCreations, 1);
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().activeVirtualObserverCount, 3);

  const native = nativeInstances[0];
  assert.equal(native.observations.length, 2, "the hub should collapse duplicate app targets while retaining the body target");
  const appObservation = native.observations.find((entry) => entry.target === app);
  const bodyObservation = native.observations.find((entry) => entry.target === body);
  assert.deepEqual(appObservation?.options, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false,
  });
  assert.deepEqual(bodyObservation?.options, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: false,
    attributeFilter: ["data-practice-view"],
  });

  native.emit([{ type: "childList", target: appChild }]);
  assert.deepEqual(calls, { first: 1, second: 1, body: 1 }, "one native mutation batch should fan out once to each relevant historical observer");

  native.emit([{ type: "attributes", target: overlayChild, attributeName: "data-practice-view" }]);
  assert.deepEqual(calls, { first: 1, second: 1, body: 2 }, "body-only Practice overlay attributes must not wake app-only result observers");

  native.emit([{ type: "attributes", target: overlayChild, attributeName: "class" }]);
  assert.deepEqual(calls, { first: 1, second: 1, body: 2 }, "attribute filters must retain V7's historical observation semantics");

  second.disconnect();
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().activeVirtualObserverCount, 2);
  native.emit([{ type: "childList", target: appChild }]);
  assert.deepEqual(calls, { first: 2, second: 1, body: 3 }, "disconnecting one virtual observer must not disconnect the shared native hub");

  const throwing = new VirtualMutationObserver(() => { throw new Error("isolated failure"); });
  throwing.observe(app, { childList: true, subtree: true });
  native.emit([{ type: "childList", target: appChild }]);
  assert.equal(calls.first, 3);
  assert.equal(calls.body, 4);
  assert.equal(reportedErrors.length, 1, "one legacy callback failure must not block the remaining result layers");

  assert.equal(hub.releaseSpeedTestResultsObserverCapture(), true);
  assert.equal(hub.releaseSpeedTestResultsObserverCapture(), false, "capture release must be idempotent");
  assert.equal(globalThis.MutationObserver, FakeNativeMutationObserver, "V11 must restore the native constructor for unrelated runtime observers");
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().captureReleased, true);

  native.emit([{ type: "childList", target: appChild }]);
  assert.equal(calls.first, 4, "captured virtual observers must remain live after the global constructor is restored");
  assert.equal(calls.body, 5);

  const unrelated = new globalThis.MutationObserver(() => {});
  assert.equal(nativeInstances.length, 2, "observers created after release must be native and stay outside the V11 results hub");
  unrelated.disconnect();

  const feature = fs.readFileSync(path.join(repoRoot, "js/speedTestResultsFeature.js"), "utf8");
  const hubSource = fs.readFileSync(path.join(repoRoot, "js/speedTestResultsObserverHub.js"), "utf8");
  const orderedTokens = [
    "./speedTestResultsObserverHub.js",
    "./speedTestPerformanceV1.js",
    "./speedTestPerformanceV2.js",
    "./speedTestPerformanceV3.js",
    "./speedTestPerformanceV4.js",
    "./speedTestPerformanceV5.js",
    "./speedTestResultsV6b.js",
    "./speedTestResultsV7.js",
    "releaseSpeedTestResultsObserverCapture();",
  ];
  let cursor = -1;
  for (const token of orderedTokens) {
    const index = feature.indexOf(token);
    assert.ok(index > cursor, `V11 feature bootstrap order must preserve ${token}`);
    cursor = index;
  }
  assert.match(feature, /SPEED_TEST_RESULTS_LIFECYCLE_VERSION/);
  assert.match(hubSource, /class VirtualMutationObserver/);
  assert.match(hubSource, /new NativeMutationObserver\(dispatchRecords\)/);
  assert.doesNotMatch(hubSource, /setInterval\(|requestAnimationFrame\(/, "the observer hub must not add polling or a second frame loop");

  console.log("V11 Typing Test results observer hub, routing, release, failure isolation, and semantic bootstrap contracts passed.");
} finally {
  globalThis.MutationObserver = originalMutationObserver;
  globalThis.reportError = originalReportError;
}
