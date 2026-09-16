import assert from "node:assert/strict";
import {
  getAllModes,
  getEnabledModes,
  getModeDefinition,
  getRegisteredModes,
  isModeEnabled,
  isValidModeId,
  MODE_IDS,
} from "../js/modes.js";

assert.equal(getModeDefinition(MODE_IDS.CAMPAIGN).enabled, true);
assert.equal(getModeDefinition(MODE_IDS.SPEED_TEST).enabled, true);
assert.equal(getModeDefinition(MODE_IDS.SPEED_TEST).supportsPause, true);
assert.equal(getModeDefinition(MODE_IDS.ENDLESS).enabled, true);

const rush = getModeDefinition(MODE_IDS.ARCADE_RUSH);
assert.equal(rush.enabled, true, "legacy Rush runtime remains available for compatibility diagnostics");
assert.equal(rush.visible, false, "retired Rush must not be publicly discoverable");
assert.equal(rush.route, null, "retired Rush must not expose a production route");
assert.equal(rush.status, "retired");

const flow = getModeDefinition(MODE_IDS.FLOW);
assert.equal(flow.enabled, false);
assert.equal(flow.visible, true);
assert.equal(flow.route, null);
assert.equal(flow.status, "coming-soon");

assert.equal(MODE_IDS.DAILY, undefined);
assert.equal(getModeDefinition("daily"), null);
assert.equal(isValidModeId("daily"), false);
assert.equal(getModeDefinition(MODE_IDS.PRACTICE).enabled, false);

assert.deepEqual(
  getEnabledModes().map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS],
);
assert.deepEqual(
  getEnabledModes({ includeHidden: true }).map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.ARCADE_RUSH],
);
assert.deepEqual(
  getAllModes().map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.FLOW, MODE_IDS.PRACTICE],
);
assert.deepEqual(
  getAllModes({ includeHidden: true }).map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.ARCADE_RUSH, MODE_IDS.FLOW, MODE_IDS.PRACTICE],
);
assert.deepEqual(
  getRegisteredModes().map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.ARCADE_RUSH, MODE_IDS.FLOW, MODE_IDS.PRACTICE],
);

assert.equal(isModeEnabled(MODE_IDS.CAMPAIGN), true);
assert.equal(isModeEnabled(MODE_IDS.ENDLESS), true);
assert.equal(isModeEnabled(MODE_IDS.ARCADE_RUSH), true);
assert.equal(isModeEnabled(MODE_IDS.FLOW), false);
assert.equal(isValidModeId("unknown"), false);
assert.equal(getModeDefinition("unknown"), null);

const modes = getAllModes();
assert.equal(modes.length, 5);
assert.equal(Object.isFrozen(modes[0]), true);
assert.throws(() => { modes[0].enabled = false; }, TypeError);
assert.equal(getModeDefinition(MODE_IDS.CAMPAIGN).enabled, true);

console.log("Flow Phase 0 mode registry hides retired Rush from public discovery while preserving compatibility runtime access, exposes disabled Flow/Practice slots, removes Daily, and remains immutable.");
