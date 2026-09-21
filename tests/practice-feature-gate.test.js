import test from "node:test";
import assert from "node:assert/strict";
import { getAllModes, MODE_IDS } from "../js/modes.js";
import { createPracticeFeatureGate, PRACTICE_LAB_PUBLIC_ENABLED } from "../js/practiceLab/practiceFeatureGate.js";
import { isDevelopmentMode } from "../js/state.js";

test("Practice feature gate enables public access and preserves developer mode", () => {
  assert.equal(PRACTICE_LAB_PUBLIC_ENABLED, true);
  const publicGate = createPracticeFeatureGate();
  const publicMode = publicGate.resolveModeDefinitions(getAllModes()).find(({ id }) => id === MODE_IDS.PRACTICE);
  assert.equal(publicGate.canAccess(), true);
  assert.equal(publicMode.enabled, true);
  assert.equal(publicMode.status, "available");
  const devGate = createPracticeFeatureGate({ developerMode: true });
  const devMode = devGate.resolveModeDefinitions(getAllModes()).find(({ id }) => id === MODE_IDS.PRACTICE);
  assert.equal(devGate.canAccess(), true);
  assert.equal(devMode.enabled, true);
  assert.equal(devMode.status, "available");
  assert.equal(devMode.route, "practice-lab");
});

test("resolving developer mode definitions does not mutate canonical modes", () => {
  const modes = getAllModes();
  createPracticeFeatureGate({ developerMode: true }).resolveModeDefinitions(modes);
  assert.equal(modes.find(({ id }) => id === MODE_IDS.PRACTICE).enabled, true);
});

test("Practice developer mode reuses the exact existing developer-query semantics", () => {
  assert.equal(isDevelopmentMode("?dev=1"), true);
  for (const search of ["?dev=true", "?dev=0", "?dev=", "?foo=1", "?foo=1&dev=01"]) assert.equal(isDevelopmentMode(search), false, search);
});

test("Explicit disable switch closes public access and menu without mutating canonical modes", () => {
  const gate = createPracticeFeatureGate({ publicEnabled: false });
  assert.equal(gate.canAccess(), false);
  const mode = gate.resolveModeDefinitions(getAllModes()).find(mode => mode.id === MODE_IDS.PRACTICE);
  assert.equal(mode.enabled, false);
  assert.equal(mode.route, null);
  assert.equal(mode.status, "unavailable");
  assert.equal(getAllModes().find(mode => mode.id === MODE_IDS.PRACTICE).enabled, true);
});
