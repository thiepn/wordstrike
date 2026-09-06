import test from "node:test";
import assert from "node:assert/strict";

function guardGlobals() {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  let touched = false;
  globalThis.fetch = () => { touched = true; throw new Error("unexpected fetch"); };
  globalThis.setTimeout = () => { touched = true; throw new Error("unexpected timer"); };
  return { get touched() { return touched; }, restore() { globalThis.fetch = originalFetch; globalThis.setTimeout = originalSetTimeout; } };
}

test("PL18 benchmark/transfer registries import with zero fetch/timer side effects", async () => {
  const guard = guardGlobals();
  try {
    await import(`../js/practiceLab/practiceBenchmarkRegistry.js?side-effect-${Date.now()}`);
    await import(`../js/practiceLab/practiceTransferRegistry.js?side-effect-${Date.now()}`);
    assert.equal(guard.touched, false);
  } finally {
    guard.restore();
  }
});
