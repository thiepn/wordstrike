import assert from "node:assert/strict";
import {
  createDefaultSave,
  isCampaignLevelAccessible,
  updateLevelResult,
} from "../js/storage.js";

const pass = {
  grade: "A",
  accuracy: 95,
  wpm: 60,
  score: 1000,
  maxCombo: 10,
  timeRemaining: 5,
};

{
  const save = createDefaultSave();
  const accessible = Array.from({ length: 31 }, (_, index) => index + 1)
    .filter((level) => isCampaignLevelAccessible(save, level, 31));
  assert.deepEqual(accessible, [1, 11, 21, 31]);
}

{
  const save = createDefaultSave();
  updateLevelResult(save, 31, pass);
  assert.equal(isCampaignLevelAccessible(save, 32, 31), true);
  assert.equal(isCampaignLevelAccessible(save, 22, 31), false);
  assert.equal(isCampaignLevelAccessible(save, 30, 31), false);
  updateLevelResult(save, 32, pass);
  assert.equal(isCampaignLevelAccessible(save, 33, 31), true);
  assert.equal(isCampaignLevelAccessible(save, 34, 31), false);
}

{
  const save = createDefaultSave();
  updateLevelResult(save, 21, pass);
  assert.equal(isCampaignLevelAccessible(save, 22, 31), true);
  assert.equal(isCampaignLevelAccessible(save, 23, 31), false);
}

{
  const save = createDefaultSave();
  updateLevelResult(save, 25, pass);
  assert.equal(isCampaignLevelAccessible(save, 26, 31), false);
}

{
  const save = createDefaultSave();
  updateLevelResult(save, 1, pass);
  assert.equal(isCampaignLevelAccessible(save, 2, 1), true);
  assert.equal(isCampaignLevelAccessible(save, 3, 1), false);
}

{
  const save = createDefaultSave();
  save.currentFurthestLevel = 41;
  assert.equal(save.currentFurthestLevel, 41, "legacy/high-water progress remains intact");
  assert.equal(isCampaignLevelAccessible(save, 40, 31), false, "high-water scalar does not authorize a level");
}

console.log("Campaign checkpoint-only access and sequential continuation tests passed.");
