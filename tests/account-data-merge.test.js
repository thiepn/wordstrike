import assert from "node:assert/strict";
import test from "node:test";
import {
  mergeWordStrikeSnapshots,
  mergeWordStrikeSnapshotsWithSyncState,
} from "../js/accountDataMerge.js";
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

test("legacy first sync restores remote settings even when the local browser has older progress", () => {
  const local = snapshot();
  const remote = snapshot();
  local.campaign.campaignFurthestLevel = 40;
  local.settings.screenShake = true;
  local.campaign.settings.screenShake = true;
  remote.settings.screenShake = false;
  remote.campaign.settings.screenShake = false;

  const merged = mergeWordStrikeSnapshots(local, { revision: 1, data: remote }, {
    deviceId: "ws-device-a",
    localState: {},
    now: 1000,
  });
  assert.equal(merged.settings.screenShake, false);
  assert.equal(merged.campaign.settings.screenShake, false);
});

test("settings conflicts use causal logical clocks instead of device wall clocks", () => {
  const cloud = snapshot();
  cloud.settings.accent = "blue";
  cloud.campaign.settings.accent = "blue";

  const a0 = mergeWordStrikeSnapshotsWithSyncState(snapshot(), {
    revision: 1,
    data: cloud,
  }, {
    deviceId: "ws-device-a",
    localState: {},
    now: 999999999999,
  });
  const b0 = mergeWordStrikeSnapshotsWithSyncState(snapshot(), {
    revision: 1,
    data: cloud,
  }, {
    deviceId: "ws-device-z",
    localState: {},
    now: 1,
  });

  const localA = structuredClone(a0.snapshot);
  delete localA.sync;
  localA.settings.accent = "red";
  localA.campaign.settings.accent = "red";
  const a1 = mergeWordStrikeSnapshotsWithSyncState(localA, {
    revision: 2,
    data: cloud,
  }, {
    deviceId: "ws-device-a",
    localState: a0.localState,
    now: 999999999999,
  });

  const localB = structuredClone(b0.snapshot);
  delete localB.sync;
  localB.settings.accent = "green";
  localB.campaign.settings.accent = "green";
  const b1 = mergeWordStrikeSnapshotsWithSyncState(localB, {
    revision: 3,
    data: a1.snapshot,
  }, {
    deviceId: "ws-device-z",
    localState: b0.localState,
    now: 1,
  });
  assert.equal(b1.snapshot.settings.accent, "green",
    "concurrent version-1 writes use deterministic device-id tie breaking, not wall-clock time");

  const aObserved = mergeWordStrikeSnapshotsWithSyncState(
    structuredClone(b1.snapshot),
    { revision: 4, data: b1.snapshot },
    {
      deviceId: "ws-device-a",
      localState: a1.localState,
      now: 0,
    },
  );
  const causalEdit = structuredClone(aObserved.snapshot);
  delete causalEdit.sync;
  causalEdit.settings.accent = "purple";
  causalEdit.campaign.settings.accent = "purple";
  const a2 = mergeWordStrikeSnapshotsWithSyncState(causalEdit, {
    revision: 5,
    data: b1.snapshot,
  }, {
    deviceId: "ws-device-a",
    localState: aObserved.localState,
    now: 0,
  });
  assert.equal(a2.snapshot.settings.accent, "purple",
    "a causally later edit increments the logical clock even with a backwards local clock");
});

test("settings use per-field last-writer clocks instead of local-progress preference", () => {
  const remote = snapshot();
  remote.settings.screenShake = false;
  remote.campaign.settings.screenShake = false;

  const initial = mergeWordStrikeSnapshotsWithSyncState(snapshot(), {
    revision: 1,
    data: remote,
  }, {
    deviceId: "ws-device-a",
    localState: {},
    now: 1000,
  });
  assert.equal(initial.snapshot.settings.screenShake, false);

  const changed = structuredClone(initial.snapshot);
  delete changed.sync;
  changed.settings.screenShake = true;
  changed.campaign.settings.screenShake = true;
  const localWins = mergeWordStrikeSnapshotsWithSyncState(changed, {
    revision: 2,
    data: initial.snapshot,
  }, {
    deviceId: "ws-device-a",
    localState: initial.localState,
    now: 2000,
  });
  assert.equal(localWins.snapshot.settings.screenShake, true);

  const staleOtherDevice = structuredClone(initial.snapshot);
  delete staleOtherDevice.sync;
  const staleMerge = mergeWordStrikeSnapshotsWithSyncState(staleOtherDevice, {
    revision: 3,
    data: localWins.snapshot,
  }, {
    deviceId: "ws-device-b",
    localState: initial.localState,
    now: 3000,
  });
  assert.equal(staleMerge.snapshot.settings.screenShake, true);
});
