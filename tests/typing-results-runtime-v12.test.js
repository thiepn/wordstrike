import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createTypingResultsRuntime,
  TYPING_RESULTS_PRACTICE_ATTRIBUTE_FILTER,
  TYPING_RESULTS_RUNTIME_VERSION,
} from "../js/typingResultsRuntime.js";

assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 13);
assert.deepEqual(TYPING_RESULTS_PRACTICE_ATTRIBUTE_FILTER, [
  "data-practice-view",
  "disabled",
  "aria-disabled",
]);

let context = null;
let overlay = null;
let featurePasses = 0;
let featureCallbacks = 0;
const scheduled = [];
const eventListeners = new Map();
let listenerAdds = 0;
let listenerRemoves = 0;
let closeClicks = 0;
let observerCreations = 0;
let observerDisconnects = 0;
const observerInstances = [];

const eventTarget = {
  addEventListener(type, callback, capture) {
    assert.equal(type, "click");
    assert.equal(capture, true);
    listenerAdds += 1;
    eventListeners.set(type, callback);
  },
  removeEventListener(type, callback, capture) {
    assert.equal(type, "click");
    assert.equal(capture, true);
    assert.equal(eventListeners.get(type), callback);
    listenerRemoves += 1;
    eventListeners.delete(type);
  },
};

class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observations = [];
    this.disconnected = false;
    observerCreations += 1;
    observerInstances.push(this);
  }

  observe(target, options) {
    this.observations.push({ target, options: { ...options } });
  }

  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    observerDisconnects += 1;
  }

  emit() {
    this.callback([], this);
  }
}

const runtime = createTypingResultsRuntime({
  dispatchFeatures() {
    featurePasses += 1;
    featureCallbacks += 8;
    return 8;
  },
  resolveContext: () => context,
  resolveOverlay: () => overlay,
  MutationObserverImpl: FakeMutationObserver,
  eventTarget,
  schedule(callback) {
    scheduled.push(callback);
  },
});

assert.equal(runtime.isMounted(), false);
assert.equal(runtime.sync(), false, "non-results presentation passes should stay unmounted");
assert.equal(featurePasses, 1,
  "feature compatibility dispatch remains available outside Results so the pre-test word profiler can start");
assert.equal(listenerAdds, 0);
assert.equal(observerCreations, 0);

context = { sessionId: "session-a", screen: { id: "results-a" }, result: { sessionId: "session-a" } };
assert.equal(runtime.sync(), true);
assert.equal(runtime.isMounted(), true);
assert.equal(listenerAdds, 1, "Results mount should own one temporary document click route");
assert.equal(eventListeners.has("click"), true);
let diagnostics = runtime.getDiagnostics();
assert.equal(diagnostics.mountCount, 1);
assert.equal(diagnostics.syncCount, 1);
assert.equal(diagnostics.destroyCount, 0);
assert.equal(diagnostics.featurePassCount, 2);
assert.equal(diagnostics.featureCallbackCount, 16);

assert.equal(runtime.sync(), true);
diagnostics = runtime.getDiagnostics();
assert.equal(diagnostics.mountCount, 1,
  "re-rendering the same result must resync features without remounting the lifecycle");
assert.equal(diagnostics.syncCount, 2);
assert.equal(listenerAdds, 1);

const closeButton = {
  click() {
    closeClicks += 1;
    overlay = null;
  },
};
overlay = {
  id: "coach-overlay-a",
  querySelector(selector) {
    return selector === "[data-coach-close-practice]" ? closeButton : null;
  },
};
assert.equal(runtime.sync(), true);
assert.equal(observerCreations, 1, "Coach overlay should receive one scoped observer while it exists");
assert.equal(observerInstances[0].observations.length, 1);
assert.equal(observerInstances[0].observations[0].target, overlay);
assert.deepEqual(observerInstances[0].observations[0].options, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["data-practice-view", "disabled", "aria-disabled"],
});

observerInstances[0].emit();
observerInstances[0].emit();
observerInstances[0].emit();
assert.equal(scheduled.length, 1, "overlay mutation bursts must coalesce into one explicit runtime sync");
assert.equal(runtime.getDiagnostics().queuedSyncCount, 1);
scheduled.shift()();
assert.equal(runtime.getDiagnostics().syncCount, 4);

const clickListener = eventListeners.get("click");
clickListener?.({});
clickListener?.({});
assert.equal(scheduled.length, 1, "result/overlay clicks must also coalesce before resync");
scheduled.shift()();
assert.equal(runtime.getDiagnostics().syncCount, 5);

context = { sessionId: "session-b", screen: { id: "results-b" }, result: { sessionId: "session-b" } };
assert.equal(runtime.sync(), true, "a new result session should replace the previous mount cleanly");
diagnostics = runtime.getDiagnostics();
assert.equal(diagnostics.mountCount, 2);
assert.equal(diagnostics.destroyCount, 1);
assert.equal(listenerAdds, 2);
assert.equal(listenerRemoves, 1);
assert.equal(observerDisconnects, 1);
assert.equal(closeClicks, 1,
  "session replacement must close the legacy Coach overlay through its real close action");
assert.equal(diagnostics.overlayObserverActive, false);

context = null;
assert.equal(runtime.sync(), false);
diagnostics = runtime.getDiagnostics();
assert.equal(diagnostics.destroyCount, 2);
assert.equal(diagnostics.mounted, false);
assert.equal(diagnostics.documentClickListenerActive, false);
assert.equal(listenerAdds, listenerRemoves, "leaving Results must release every temporary click listener");
assert.equal(runtime.destroy(), false, "destroy must be idempotent after teardown");

// Stress the explicit lifecycle rather than relying on MutationObserver cleanup.
let stressContext = null;
let stressAdds = 0;
let stressRemoves = 0;
const stressTarget = {
  addEventListener() { stressAdds += 1; },
  removeEventListener() { stressRemoves += 1; },
};
const stressRuntime = createTypingResultsRuntime({
  dispatchFeatures: () => 7,
  resolveContext: () => stressContext,
  resolveOverlay: () => null,
  eventTarget: stressTarget,
  schedule(callback) { callback(); },
});
for (let index = 0; index < 100; index += 1) {
  stressContext = { sessionId: `stress-${index}`, screen: {}, result: { sessionId: `stress-${index}` } };
  assert.equal(stressRuntime.sync(), true);
  stressContext = null;
  assert.equal(stressRuntime.sync(), false);
}
const stressDiagnostics = stressRuntime.getDiagnostics();
assert.equal(stressDiagnostics.mountCount, 100);
assert.equal(stressDiagnostics.destroyCount, 100);
assert.equal(stressDiagnostics.mounted, false);
assert.equal(stressAdds, 100);
assert.equal(stressRemoves, 100,
  "100 Results enter/exit cycles must leave no accumulated document listeners");

const rootUrl = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");
const [runtimeSource, featureSource, v6Source, v7Source, profileSource, bootstrapSource] = await Promise.all([
  read("js/typingResultsRuntime.js"),
  read("js/speedTestResultsFeature.js"),
  read("js/speedTestResultsV6b.js"),
  read("js/speedTestResultsV7.js"),
  read("js/speedTestWordProfileV4.js"),
  read("js/presentationBootstrap.js"),
]);

assert.match(runtimeSource, /export function createTypingResultsRuntime/);
assert.match(runtimeSource, /runSpeedTestResultsFeatures/);
assert.match(featureSource, /SPEED_TEST_RESULTS_LIFECYCLE_VERSION = 13/);
assert.doesNotMatch(featureSource, /speedTestResultsObserverHub/);
assert.doesNotMatch(v6Source, /new MutationObserver/);
assert.doesNotMatch(v7Source, /new MutationObserver/);
assert.doesNotMatch(profileSource, /new MutationObserver/);
assert.match(bootstrapSource, /\{ id: "typing-results", sync: syncTypingResultsRuntime \}/,
  "Typing Results must execute inside the one shared production presentation lifecycle");

console.log("WORDSTRIKE V13 native Typing Results mount/sync/destroy, single scoped Coach observation, stress cleanup, and shared lifecycle ownership passed.");
