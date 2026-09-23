import assert from "node:assert/strict";
import test from "node:test";

import {
  CAMPAIGN_BACKUP_KEY,
  createDefaultSave,
  getCampaignPlacementSummary,
  getCampaignResumeLevel,
  hasExperiencedCampaignBoss,
  isCampaignEstablished,
  loadSave,
  resetProgress,
  updateLevelResult,
} from "../js/storage.js";
import {
  createDefaultModeData,
  saveModeData,
} from "../js/modeStorage.js";
import {
  consumeLeaderboardReturnState,
  saveLeaderboardReturnState,
  validateLeaderboardReturnState,
} from "../js/leaderboardReturnState.js";

class MemoryStorage {
  constructor({ failPrimaryWrites = false, failAllWrites = false } = {}) {
    this.values = new Map();
    this.failPrimaryWrites = failPrimaryWrites;
    this.failAllWrites = failAllWrites;
  }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failAllWrites || (this.failPrimaryWrites && key === "wordstrike_save")) {
      throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
    }
    this.values.set(key, String(value));
  }
  removeItem(key) { this.values.delete(key); }
}

const result = (overrides = {}) => ({
  grade: "A",
  accuracy: 98.5,
  wpm: 76,
  score: 12345,
  maxCombo: 18,
  timeRemaining: 7,
  isBoss: false,
  ...overrides,
});

test("Campaign resume goes to real progress or a higher placement checkpoint instead of resetting to Level 1", () => {
  const save = createDefaultSave();
  save.campaignFurthestLevel = 37;
  save.currentFurthestLevel = 37;
  assert.equal(getCampaignResumeLevel(save, 1), 37);
  assert.equal(getCampaignResumeLevel(save, 71), 71);
  assert.equal(getCampaignResumeLevel(save, 21), 37);

  assert.equal(isCampaignEstablished(save, 0), true);
  assert.equal(isCampaignEstablished(createDefaultSave(), 0), false);
  assert.equal(isCampaignEstablished(createDefaultSave(), 62), true);
  assert.equal(hasExperiencedCampaignBoss(save), true);
  assert.equal(hasExperiencedCampaignBoss(createDefaultSave()), false);

  assert.deepEqual(getCampaignPlacementSummary(69), {
    bestWpm: 69,
    level: 31,
    placed: true,
    nextWpm: 70,
    nextLevel: 41,
  });
});

test("existing valid Campaign progress seeds the compact recovery snapshot on first load", () => {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  try {
    storage.setItem("wordstrike_save", JSON.stringify({
      currentFurthestLevel: 28,
      campaignFurthestLevel: 28,
      levels: {
        "27": {
          grade: "A", bestWPM: 81, bestAccuracy: 98,
          bestScore: 7600, maxCombo: 22, bestTimeRemaining: 0, bossCleared: false,
        },
      },
      settings: {},
    }));
    const loaded = loadSave();
    assert.equal(loaded.campaignFurthestLevel, 28);
    const backup = JSON.parse(storage.getItem(CAMPAIGN_BACKUP_KEY));
    assert.equal(backup.campaignFurthestLevel, 28);
    assert.equal(backup.levels["27"].bestScore, 7600);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("Campaign progress survives when the large shared save cannot be written", () => {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage({ failPrimaryWrites: true });
  globalThis.localStorage = storage;
  try {
    const save = createDefaultSave();
    assert.equal(updateLevelResult(save, 12, result()), true,
      "compact Campaign backup should persist even when the primary save is at quota");
    assert.ok(storage.getItem(CAMPAIGN_BACKUP_KEY));
    assert.equal(storage.getItem("wordstrike_save"), null);

    const recovered = loadSave();
    assert.equal(recovered.campaignFurthestLevel, 13);
    assert.equal(recovered.levels["12"].bestScore, 12345);
    assert.equal(recovered.levels["12"].grade, "S");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("Campaign recovery preserves sparse legacy level records without inventing result fields", () => {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  try {
    storage.setItem("wordstrike_save", JSON.stringify({
      currentFurthestLevel: 7,
      levels: { "1": { bestWPM: 78 } },
      settings: {},
    }));

    const first = loadSave();
    assert.deepEqual(first.levels, { "1": { bestWPM: 78 } });
    const second = loadSave();
    assert.deepEqual(second.levels, { "1": { bestWPM: 78 } });
    assert.deepEqual(JSON.parse(storage.getItem("wordstrike_save")).levels, {
      "1": { bestWPM: 78 },
    });
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("already-lost Campaign progress can recover from independent recent session history", () => {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  try {
    const modeData = createDefaultModeData();
    modeData.recentSessions = [{
      sessionId: "campaign-recovery-history-1",
      modeId: "campaign",
      variantId: "normal",
      endedAt: 123456,
      success: true,
      score: 8800,
      grade: "A",
      accuracy: 97.2,
      wpm: 84,
      activeDurationMs: 42000,
      modeData: { level: 26, maxCombo: 19 },
    }];
    assert.equal(saveModeData(modeData), true);
    assert.equal(storage.getItem("wordstrike_save"), null);
    assert.equal(storage.getItem(CAMPAIGN_BACKUP_KEY), null);

    const recovered = loadSave();
    assert.equal(recovered.campaignFurthestLevel, 27);
    assert.equal(recovered.levels["26"].bestScore, 8800);
    assert.equal(recovered.levels["26"].bestWPM, 84);
    assert.equal(recovered.levels["26"].grade, "A");
    assert.ok(storage.getItem(CAMPAIGN_BACKUP_KEY),
      "history recovery should immediately seed the durable Campaign backup");
    assert.ok(storage.getItem("wordstrike_save"),
      "history recovery should heal the primary Campaign save when storage is writable");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("Campaign reports a total persistence failure instead of silently claiming progress was saved", () => {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage({ failAllWrites: true });
  globalThis.localStorage = storage;
  try {
    const save = createDefaultSave();
    assert.equal(updateLevelResult(save, 9, result()), false);
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("Campaign backup recovers a malformed or stale primary save without rewriting it during load", () => {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  try {
    const save = createDefaultSave();
    updateLevelResult(save, 22, result({ score: 5000, accuracy: 99 }));
    storage.setItem("wordstrike_save", "{malformed");
    const malformedBefore = storage.getItem("wordstrike_save");

    const recovered = loadSave();
    assert.equal(recovered.campaignFurthestLevel, 23);
    assert.equal(recovered.levels["22"].bestScore, 5000);
    assert.equal(storage.getItem("wordstrike_save"), malformedBefore,
      "load must not overwrite a recoverable malformed save with defaults");
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("intentional Campaign reset also resets the recovery backup", () => {
  const previous = globalThis.localStorage;
  const storage = new MemoryStorage();
  globalThis.localStorage = storage;
  try {
    const save = createDefaultSave();
    updateLevelResult(save, 44, result());
    assert.equal(loadSave().campaignFurthestLevel, 45);

    assert.equal(resetProgress(save), true);
    const reloaded = loadSave();
    assert.equal(reloaded.campaignFurthestLevel, 1);
    assert.deepEqual(reloaded.levels, {});
  } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
});

test("Google auth can round-trip directly back to Campaign", () => {
  assert.deepEqual(validateLeaderboardReturnState({ screen: "campaign" }), { screen: "campaign" });
  const storage = new MemoryStorage();
  assert.equal(saveLeaderboardReturnState({ screen: "campaign" }, storage), true);
  assert.deepEqual(consumeLeaderboardReturnState(storage), { screen: "campaign" });
  assert.equal(consumeLeaderboardReturnState(storage), null);
});

test("Campaign results source exposes a visible save failure warning", async () => {
  const fs = await import("node:fs/promises");
  const [mainSource, uiSource] = await Promise.all([
    fs.readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  ]);
  assert.match(mainSource, /persistenceWarning/);
  assert.match(uiSource, /result-save-warning/);
  assert.match(uiSource, /role="alert"/);
});

test("Campaign placement result is a complete round trip back to Campaign", async () => {
  const fs = await import("node:fs/promises");
  const [mainSource, uiSource] = await Promise.all([
    fs.readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    fs.readFile(new URL("../js/ui.js", import.meta.url), "utf8"),
  ]);
  assert.match(mainSource, /sessionSource === "campaign-placement"/);
  assert.match(mainSource, /campaign: \(\) => openLevelSelect\("placement-result"\)/);
  assert.match(mainSource, /state\?\.sessionSource === "campaign-placement"/);
  assert.match(mainSource, /startCampaignPlacement\(\)/);
  assert.match(uiSource, /RETURN TO CAMPAIGN/);
  assert.match(uiSource, /PLACEMENT COMPLETE/);
  assert.match(uiSource, /campaign-placement-result/);
});
