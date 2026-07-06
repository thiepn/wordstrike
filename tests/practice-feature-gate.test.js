import test from "node:test";
import assert from "node:assert/strict";
import { getAllModes, MODE_IDS } from "../js/modes.js";
import { createPracticeFeatureGate, PRACTICE_LAB_PUBLIC_ENABLED } from "../js/practiceLab/practiceFeatureGate.js";
import { isDevelopmentMode } from "../js/state.js";

test("Practice feature gate preserves public coming-soon mode and enables only developer preview", () => {
  assert.equal(PRACTICE_LAB_PUBLIC_ENABLED, false);
  const publicGate = createPracticeFeatureGate();
  const publicMode = publicGate.resolveModeDefinitions(getAllModes()).find(({ id }) => id === MODE_IDS.PRACTICE);
  assert.equal(publicGate.canAccess(), false);
  assert.equal(publicMode.enabled, false);
  assert.equal(publicMode.status, "coming-soon");
  const devGate = createPracticeFeatureGate({ developerMode: true });
  const devMode = devGate.resolveModeDefinitions(getAllModes()).find(({ id }) => id === MODE_IDS.PRACTICE);
  assert.equal(devGate.canAccess(), true);
  assert.equal(devMode.enabled, true);
  assert.equal(devMode.status, "preview");
  assert.equal(devMode.route, "practice-lab");
});

test("resolving developer mode definitions does not mutate canonical modes", () => {
  const modes = getAllModes();
  createPracticeFeatureGate({ developerMode: true }).resolveModeDefinitions(modes);
  assert.equal(modes.find(({ id }) => id === MODE_IDS.PRACTICE).enabled, false);
});

test("Practice preview reuses the exact existing developer-query semantics", () => {
  assert.equal(isDevelopmentMode("?dev=1"), true);
  for (const search of ["?dev=true", "?dev=0", "?dev=", "?foo=1", "?foo=1&dev=01"]) assert.equal(isDevelopmentMode(search), false, search);
});
