import assert from "node:assert/strict";
import test from "node:test";
import { mergeWordStrikeSnapshots } from "../js/accountDataMerge.js";
import { createDefaultModeData } from "../js/modeStorage.js";
import { createDefaultSave } from "../js/storage.js";
import { SPEED_TEST_WORD_SET } from "../js/speedTestWords.js";

function snapshot() {
  const campaign = JSON.parse(JSON.stringify(createDefaultSave()));
  const mode = createDefaultModeData();
  return { schemaVersion: 1, updatedAt: Date.now(), campaign, mode, settings: campaign.settings };
}

test("account merge never downgrades campaign progress or placement records", () => {
  const local = snapshot();
  const remote = snapshot();
  local.campaign.campaignFurthestLevel = 32;
  local.campaign.currentFurthestLevel = 32;
  local.campaign.levels[31] = { grade: "A", bestWPM: 72, bestAccuracy: 96, bestScore: 900, maxCombo: 14, bestTimeRemaining: 4, bossCleared: false };
  remote.campaign.campaignFurthestLevel = 41;
  remote.campaign.currentFurthestLevel = 41;
  remote.campaign.levels[31] = { grade: "S", bestWPM: 68, bestAccuracy: 99, bestScore: 1100, maxCombo: 12, bestTimeRemaining: 7, bossCleared: false };
  const localRecord = local.mode.modes["speed-test"].wordSetRecords[SPEED_TEST_WORD_SET.id]["time-60"];
  Object.assign(localRecord, { bestWpm: 83, bestAccuracy: 96, bestRawWpm: 89, tieAccuracy: 96, tieRawWpm: 89, sessionId: "local" });
  const remoteRecord = remote.mode.modes["speed-test"].wordSetRecords[SPEED_TEST_WORD_SET.id]["time-60"];
  Object.assign(remoteRecord, { bestWpm: 91, bestAccuracy: 94, bestRawWpm: 95, tieAccuracy: 94, tieRawWpm: 95, sessionId: "remote" });

  const merged = mergeWordStrikeSnapshots(local, { revision: 5, data: remote });
  assert.equal(merged.campaign.campaignFurthestLevel, 41);
  assert.equal(merged.campaign.levels[31].bestWPM, 72);
  assert.equal(merged.campaign.levels[31].bestAccuracy, 99);
  assert.equal(merged.campaign.levels[31].bestScore, 1100);
  const record = merged.mode.modes["speed-test"].wordSetRecords[SPEED_TEST_WORD_SET.id]["time-60"];
  assert.equal(record.bestWpm, 91);
  assert.equal(record.bestRawWpm, 95);
  assert.equal(record.bestAccuracy, 96);
  assert.equal(record.sessionId, "remote");
});

test("fresh local browser restores remote settings while established local browser keeps local settings", () => {
  const fresh = snapshot();
  const remote = snapshot();
  remote.settings.screenShake = false;
  remote.campaign.settings.screenShake = false;
  let merged = mergeWordStrikeSnapshots(fresh, { revision: 1, data: remote });
  assert.equal(merged.settings.screenShake, false);

  fresh.campaign.campaignFurthestLevel = 2;
  fresh.settings.screenShake = true;
  fresh.campaign.settings.screenShake = true;
  merged = mergeWordStrikeSnapshots(fresh, { revision: 1, data: remote });
  assert.equal(merged.settings.screenShake, true);
});
