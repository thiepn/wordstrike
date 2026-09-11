import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createTypingResultsRuntime,
  TYPING_RESULTS_RUNTIME_VERSION,
} from "../js/typingResultsRuntime.js";

assert.equal(TYPING_RESULTS_RUNTIME_VERSION, 12);

let context = null;
let passes = 0;
let adds = 0;
let removes = 0;
const target = {
  addEventListener() { adds += 1; },
  removeEventListener() { removes += 1; },
};
const runtime = createTypingResultsRuntime({
  dispatchFeatures() { passes += 1; return 7; },
  resolveContext: () => context,
  resolveOverlay: () => null,
  eventTarget: target,
  schedule(callback) { callback(); },
});

assert.equal(runtime.sync(), false);
context = { sessionId: "smoke", screen: {}, result: { sessionId: "smoke" } };
assert.equal(runtime.sync(), true);
assert.equal(runtime.sync(), true);
assert.equal(runtime.getDiagnostics().mountCount, 1);
assert.equal(runtime.getDiagnostics().syncCount, 2);
context = null;
assert.equal(runtime.sync(), false);
assert.equal(runtime.getDiagnostics().destroyCount, 1);
assert.equal(adds, 1);
assert.equal(removes, 1);
assert.equal(passes, 4);

const root = new URL("../", import.meta.url);
const [hub, bootstrap] = await Promise.all([
  readFile(new URL("js/speedTestResultsObserverHub.js", root), "utf8"),
  readFile(new URL("js/presentationBootstrap.js", root), "utf8"),
]);
assert.doesNotMatch(hub, /new NativeMutationObserver\(/);
assert.match(hub, /runSpeedTestResultsObserverCallbacks/);
assert.match(bootstrap, /id: "typing-results"/);

console.log("WORDSTRIKE V12 Typing Results runtime smoke lifecycle passed before legacy result-contract suites.");
