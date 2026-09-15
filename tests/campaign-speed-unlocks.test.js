import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_SPEED_UNLOCKS,
  createDefaultSave,
  getCampaignBest60SecondWpm,
  getCampaignSpeedUnlockLevelFromWpm,
  resetProgress,
  updateLevelResult,
} from "../js/storage.js";
import { createDefaultModeData, saveModeData } from "../js/modeStorage.js";
import { MODE_IDS } from "../js/modes.js";
import { SPEED_TEST_WORD_SET } from "../js/speedTestWords.js";

class MemoryStorage {
  constructor() {
    this.values = new Map();
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

function installBest60SecondWpm(wpm) {
  const data = createDefaultModeData();
  data.modes[MODE_IDS.SPEED_TEST]
    .wordSetRecords[SPEED_TEST_WORD_SET.id]["time-60"].bestWpm = wpm;
  saveModeData(data);
}

test("campaign Typing Test thresholds match the agreed 10 WPM ladder", () => {
  assert.deepEqual(CAMPAIGN_SPEED_UNLOCKS.map(({ wpm, level }) => [wpm, level]), [
    [40, 11],
    [50, 21],
    [60, 31],
    [70, 41],
    [80, 51],
    [90, 61],
    [100, 71],
    [110, 81],
    [120, 91],
  ]);

  assert.equal(getCampaignSpeedUnlockLevelFromWpm(39.99), 1);
  assert.equal(getCampaignSpeedUnlockLevelFromWpm(40), 11);
  assert.equal(getCampaignSpeedUnlockLevelFromWpm(99.9), 61);
  assert.equal(getCampaignSpeedUnlockLevelFromWpm(100), 71);
  assert.equal(getCampaignSpeedUnlockLevelFromWpm(110), 81);
  assert.equal(getCampaignSpeedUnlockLevelFromWpm(120), 91);
  assert.equal(getCampaignSpeedUnlockLevelFromWpm(180), 91);
});

test("best 60-second Typing Test score unlocks access without completing skipped levels", () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage();
  try {
    installBest60SecondWpm(103);
    assert.equal(getCampaignBest60SecondWpm(), 103);

    const save = createDefaultSave();
    assert.equal(save.campaignFurthestLevel, 1);
    assert.equal(save.currentFurthestLevel, 71);
    assert.deepEqual(save.levels, {});

    updateLevelResult(save, 71, {
      grade: "A",
      accuracy: 100,
      wpm: 103,
      score: 1000,
      maxCombo: 10,
      timeRemaining: 5,
      isBoss: false,
    });

    assert.equal(save.campaignFurthestLevel, 72);
    assert.equal(save.currentFurthestLevel, 72);
    assert.equal(Object.keys(save.levels).length, 1);
    assert.ok(save.levels["71"]);
    assert.equal(save.levels["1"], undefined);

    resetProgress(save);
    assert.equal(save.campaignFurthestLevel, 1);
    assert.equal(save.currentFurthestLevel, 71);
    assert.deepEqual(save.levels, {});
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
