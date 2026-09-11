import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
}

globalThis.MutationObserver = FakeNativeMutationObserver;
const reportedErrors = [];
globalThis.reportError = (error) => reportedErrors.push(error);

const hubUrl = new URL("../js/speedTestResultsObserverHub.js", import.meta.url);
hubUrl.searchParams.set("test", `${Date.now()}-${Math.random()}`);
const hub = await import(hubUrl.href);

try {
  assert.notEqual(globalThis.MutationObserver, FakeNativeMutationObserver,
    "V12 still captures historical observer construction during module boot");
  const VirtualMutationObserver = globalThis.MutationObserver;

  const app = { id: "app" };
  const body = { id: "body" };
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

  assert.equal(nativeInstances.length, 0,
    "V12 compatibility registrations must be inert and must not create an app/body native observer");
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().nativeObservationEnabled, false);
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().activeVirtualObserverCount, 3);

  assert.equal(hub.runSpeedTestResultsObserverCallbacks(), 3);
  assert.deepEqual(calls, { first: 1, second: 1, body: 1 },
    "one explicit runtime pass must invoke each active historical callback once in registration order");
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().manualDispatchPasses, 1);
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().callbackInvocations, 3);

  second.disconnect();
  assert.equal(hub.runSpeedTestResultsObserverCallbacks(), 2);
  assert.deepEqual(calls, { first: 2, second: 1, body: 2 },
    "disconnected compatibility callbacks must stay excluded from explicit runtime passes");

  const throwing = new VirtualMutationObserver(() => { throw new Error("isolated failure"); });
  throwing.observe(app, { childList: true, subtree: true });
  assert.equal(hub.runSpeedTestResultsObserverCallbacks(), 2,
    "a throwing compatibility feature must not prevent the remaining feature callbacks from running");
  assert.equal(calls.first, 3);
  assert.equal(calls.body, 3);
  assert.equal(reportedErrors.length, 1);
  assert.equal(hub.getSpeedTestResultsObserverHubDiagnostics().callbackErrors, 1);

  assert.equal(hub.releaseSpeedTestResultsObserverCapture(), true);
  assert.equal(hub.releaseSpeedTestResultsObserverCapture(), false, "capture release must be idempotent");
  assert.equal(globalThis.MutationObserver, FakeNativeMutationObserver,
    "V12 must restore the browser-native constructor before normal runtime");

  const unrelated = new globalThis.MutationObserver(() => {});
  unrelated.observe(app, { childList: true });
  assert.equal(nativeInstances.length, 1,
    "observers created after boot release must be native and outside the compatibility bridge");
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
    "./typingResultsRuntime.js",
    "releaseSpeedTestResultsObserverCapture();",
  ];
  let cursor = -1;
  for (const token of orderedTokens) {
    const index = feature.indexOf(token);
    assert.ok(index > cursor, `V12 feature bootstrap order must preserve ${token}`);
    cursor = index;
  }
  assert.match(feature, /SPEED_TEST_RESULTS_LIFECYCLE_VERSION/);
  assert.match(hubSource, /class VirtualMutationObserver/);
  assert.match(hubSource, /runSpeedTestResultsObserverCallbacks/);
  assert.doesNotMatch(hubSource, /new NativeMutationObserver\(/,
    "V12 compatibility bridge must not own a live native observer");
  assert.doesNotMatch(hubSource, /setInterval\(|requestAnimationFrame\(/,
    "the compatibility bridge must not introduce polling or frame loops");

  console.log("V11 compatibility capture is safely superseded by V12 manual runtime dispatch and native constructor restoration.");
} finally {
  globalThis.MutationObserver = originalMutationObserver;
  globalThis.reportError = originalReportError;
}
