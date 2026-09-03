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
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH).enabled, true);
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH).visible, true);
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH).route, "arcade-rush-ready");
assert.equal(getModeDefinition(MODE_IDS.ARCADE_RUSH).status, "available");
assert.equal(getModeDefinition(MODE_IDS.DAILY).enabled, true);
assert.equal(getModeDefinition(MODE_IDS.DAILY).visible, false);
assert.equal(getModeDefinition(MODE_IDS.DAILY).route, "daily-ready");
assert.equal(getModeDefinition(MODE_IDS.DAILY).status, "retired-pending-removal");
assert.equal(getModeDefinition(MODE_IDS.PRACTICE).enabled, false);
assert.deepEqual(
  getEnabledModes().map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.ARCADE_RUSH],
);
assert.deepEqual(
  getAllModes().map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.ARCADE_RUSH, MODE_IDS.PRACTICE],
);
assert.equal(getRegisteredModes().some(({ id }) => id === MODE_IDS.DAILY), true);
assert.equal(isModeEnabled(MODE_IDS.CAMPAIGN), true);
assert.equal(isModeEnabled(MODE_IDS.ENDLESS), true);
assert.equal(isModeEnabled(MODE_IDS.ARCADE_RUSH), true);
assert.equal(isValidModeId("unknown"), false);
assert.equal(getModeDefinition("unknown"), null);

const modes = getAllModes();
assert.equal(modes.length, 5);
assert.equal(Object.isFrozen(modes[0]), true);
assert.throws(() => { modes[0].enabled = false; }, TypeError);
assert.equal(getModeDefinition(MODE_IDS.CAMPAIGN).enabled, true);

console.log("AR14 mode registry exposes Arcade Rush publicly, retains hidden Daily rollback metadata, and preserves disabled entries, safe lookup, and immutability.");
