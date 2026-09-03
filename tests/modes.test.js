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
assert.equal(MODE_IDS.DAILY, undefined);
assert.equal(getModeDefinition("daily"), null);
assert.equal(isValidModeId("daily"), false);
assert.equal(getModeDefinition(MODE_IDS.PRACTICE).enabled, false);
assert.deepEqual(
  getEnabledModes().map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.ARCADE_RUSH],
);
assert.deepEqual(
  getAllModes().map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.ARCADE_RUSH, MODE_IDS.PRACTICE],
);
assert.deepEqual(
  getRegisteredModes().map(({ id }) => id),
  [MODE_IDS.CAMPAIGN, MODE_IDS.SPEED_TEST, MODE_IDS.ENDLESS, MODE_IDS.ARCADE_RUSH, MODE_IDS.PRACTICE],
);
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

console.log("AR16 final mode registry exposes Arcade Rush publicly, removes Daily entirely, and preserves disabled entries, safe lookup, and immutability.");
