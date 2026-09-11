import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createPresentationLifecycle,
  PRESENTATION_OBSERVER_OPTIONS,
} from "../js/presentationLifecycle.js";

const observed = [];
let disconnected = 0;
let observerCallback = null;
class FakeMutationObserver {
  constructor(callback) {
    observerCallback = callback;
  }
  observe(root, options) {
    observed.push({ root, options });
  }
  disconnect() {
    disconnected += 1;
  }
}

let nextHandle = 1;
const scheduled = new Map();
const cancelled = [];
const schedule = (callback) => {
  const handle = nextHandle++;
  scheduled.set(handle, callback);
  return handle;
};
const cancel = (handle) => {
  cancelled.push(handle);
  scheduled.delete(handle);
};
const runNextFrame = () => {
  const entry = scheduled.entries().next().value;
  assert.ok(entry, "expected a queued presentation frame");
  const [handle, callback] = entry;
  scheduled.delete(handle);
  callback();
};

const root = { id: "app" };
const calls = [];
const errors = [];
const lifecycle = createPresentationLifecycle({
  root,
  MutationObserverImpl: FakeMutationObserver,
  schedule,
  cancel,
  onError(error, presenter) {
    errors.push({ message: error.message, id: presenter.id });
  },
  presenters: [
    { id: "first", sync: () => calls.push("first") },
    { id: "broken", sync: () => { calls.push("broken"); throw new Error("boom"); } },
    { id: "last", sync: () => calls.push("last") },
  ],
});

assert.deepEqual(lifecycle.presenterIds, ["first", "broken", "last"]);
assert.equal(lifecycle.isRunning(), false);
assert.equal(lifecycle.start(), true);
assert.equal(lifecycle.start(), false, "start must be idempotent");
assert.equal(lifecycle.isRunning(), true);
assert.equal(observed.length, 1, "one lifecycle should create one app observer");
assert.equal(observed[0].root, root);
assert.deepEqual(observed[0].options, PRESENTATION_OBSERVER_OPTIONS);
assert.equal(scheduled.size, 1, "start should schedule exactly one initial presentation pass");

observerCallback?.([]);
observerCallback?.([]);
observerCallback?.([]);
assert.equal(scheduled.size, 1, "mutation bursts must coalesce into the already queued frame");
runNextFrame();
assert.deepEqual(calls, ["first", "broken", "last"], "presenters must run once in declared order");
assert.deepEqual(errors, [{ message: "boom", id: "broken" }], "one presenter failure should be isolated and reported");

observerCallback?.([]);
observerCallback?.([]);
assert.equal(scheduled.size, 1, "a later mutation burst should still queue only one frame");
runNextFrame();
assert.deepEqual(calls, ["first", "broken", "last", "first", "broken", "last"]);

observerCallback?.([]);
assert.equal(scheduled.size, 1);
assert.equal(lifecycle.stop(), true);
assert.equal(lifecycle.stop(), false, "stop must be idempotent");
assert.equal(disconnected, 1);
assert.equal(cancelled.length, 1, "stop must cancel a queued frame");
assert.equal(scheduled.size, 0);
assert.equal(lifecycle.isRunning(), false);
assert.equal(lifecycle.queue(), false, "stopped lifecycles must not schedule work");

const rootUrl = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, rootUrl), "utf8");
const [
  bootstrap,
  coordinator,
  campaign,
  endless,
  boss,
  arcade,
  utilities,
  ui12,
] = await Promise.all([
  read("js/presentationBootstrap.js"),
  read("js/presentationLifecycle.js"),
  read("js/campaignGameplayPresentation.js"),
  read("js/endlessGameplayPresentation.js"),
  read("js/bossGameplayPresentation.js"),
  read("js/arcadeRushGameplayPresentation.js"),
  read("js/profileLeaderboardsSettingsPresentation.js"),
  read("js/ui12GlobalPresentation.js"),
]);

assert.match(bootstrap, /createPresentationLifecycle/);
assert.match(bootstrap, /presentationLifecycle\.start\(\)/);
const presenterOrder = [
  "syncCampaignGameplayPresentation",
  "syncEndlessGameplayPresentation",
  "syncBossGameplayPresentation",
  "syncArcadeRushGameplayPresentation",
  "syncProfileLeaderboardsSettingsPresentation",
  "syncUi12GlobalPresentation",
];
let previousIndex = -1;
for (const token of presenterOrder) {
  const currentIndex = bootstrap.indexOf(token);
  assert.ok(currentIndex > previousIndex, `V10 presentation order is invalid at ${token}`);
  previousIndex = currentIndex;
}

assert.match(coordinator, /new MutationObserverImpl\(queue\)/,
  "the shared coordinator must own production app observation");
for (const [name, source] of [
  ["campaign", campaign],
  ["endless", endless],
  ["boss", boss],
  ["profile/settings", utilities],
  ["ui12", ui12],
]) {
  assert.doesNotMatch(source, /new MutationObserver\(/,
    `${name} presentation must not self-observe the app after V10`);
}
assert.match(arcade, /export function startArcadeRushGameplayPresentation\(\)/,
  "Arcade Rush may retain an explicit compatibility lifecycle hook");
assert.doesNotMatch(arcade, /\nstartArcadeRushGameplayPresentation\(\);\s*$/,
  "Arcade Rush compatibility observation must not auto-start in production");

console.log("WORDSTRIKE V10 shared presentation lifecycle, coalescing, ordering, cleanup, and observer ownership passed.");
