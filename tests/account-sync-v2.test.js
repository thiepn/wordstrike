import assert from "node:assert/strict";
import test from "node:test";
import { mergeWordStrikeSnapshotsWithSyncState } from "../js/accountDataMerge.js";
import { createDefaultModeData } from "../js/modeStorage.js";
import { createDefaultSave } from "../js/storage.js";
import { SPEED_TEST_WORD_SET } from "../js/speedTestWords.js";

function snapshot() {
  const campaign = JSON.parse(JSON.stringify(createDefaultSave()));
  const mode = createDefaultModeData();
  return {
    schemaVersion: 1,
    updatedAt: 1,
    campaign,
    mode,
    settings: JSON.parse(JSON.stringify(campaign.settings)),
  };
}

function localCopy(value) {
  const copy = structuredClone(value);
  delete copy.sync;
  copy.schemaVersion = 2;
  return copy;
}

function setSessionCounters(value, count) {
  value.mode.totals.completedSessions = count;
  value.mode.totals.failedSessions = 0;
  value.mode.lifetime.finalizedSessions = count;
  value.mode.lifetime.successfulSessions = count;
  value.mode.lifetime.failedSessions = 0;

  const typing = value.mode.modes["speed-test"];
  typing.completedSessions = count;
  typing.failedSessions = 0;
  typing.activity.trackedSessions = count;
  typing.configUsage["time-60"] = count;
  typing.wordSetConfigUsage[SPEED_TEST_WORD_SET.id]["time-60"] = count;
  typing.wordSetActivity[SPEED_TEST_WORD_SET.id].trackedSessions = count;
}

test("two devices that advance independently preserve both session increments", () => {
  const legacyCloud = snapshot();
  setSessionCounters(legacyCloud, 10);

  const a0 = mergeWordStrikeSnapshotsWithSyncState(snapshot(), {
    revision: 1,
    data: legacyCloud,
  }, {
    deviceId: "ws-device-a",
    localState: {},
    now: 1000,
  });
  const b0 = mergeWordStrikeSnapshotsWithSyncState(snapshot(), {
    revision: 2,
    data: a0.snapshot,
  }, {
    deviceId: "ws-device-b",
    localState: {},
    now: 1100,
  });
  assert.equal(b0.snapshot.mode.totals.completedSessions, 10);

  const localA = localCopy(a0.snapshot);
  setSessionCounters(localA, 11);
  const a1 = mergeWordStrikeSnapshotsWithSyncState(localA, {
    revision: 3,
    data: b0.snapshot,
  }, {
    deviceId: "ws-device-a",
    localState: a0.localState,
    now: 2000,
  });
  assert.equal(a1.snapshot.mode.totals.completedSessions, 11);

  const localB = localCopy(b0.snapshot);
  setSessionCounters(localB, 11);
  const b1 = mergeWordStrikeSnapshotsWithSyncState(localB, {
    revision: 4,
    data: a1.snapshot,
  }, {
    deviceId: "ws-device-b",
    localState: b0.localState,
    now: 3000,
  });

  assert.equal(b1.snapshot.mode.totals.completedSessions, 12);
  assert.equal(b1.snapshot.mode.lifetime.finalizedSessions, 12);
  assert.equal(b1.snapshot.mode.modes["speed-test"].completedSessions, 12);
  assert.equal(b1.snapshot.mode.modes["speed-test"].activity.trackedSessions, 12);
  assert.equal(b1.snapshot.mode.modes["speed-test"].configUsage["time-60"], 12);
  assert.equal(
    b1.snapshot.mode.modes["speed-test"].wordSetConfigUsage[SPEED_TEST_WORD_SET.id]["time-60"],
    12,
  );
  assert.equal(
    b1.snapshot.mode.modes["speed-test"].wordSetActivity[SPEED_TEST_WORD_SET.id].trackedSessions,
    12,
  );

  const replay = mergeWordStrikeSnapshotsWithSyncState(localCopy(b1.snapshot), {
    revision: 5,
    data: b1.snapshot,
  }, {
    deviceId: "ws-device-b",
    localState: b1.localState,
    now: 4000,
  });
  assert.equal(replay.snapshot.mode.totals.completedSessions, 12,
    "re-merging the same observed totals must be idempotent");
});

test("changing the browser device id never duplicates the old device component", () => {
  const cloud = snapshot();
  setSessionCounters(cloud, 5);

  const first = mergeWordStrikeSnapshotsWithSyncState(snapshot(), {
    revision: 1,
    data: cloud,
  }, {
    deviceId: "ws-device-old",
    localState: {},
    now: 1000,
  });

  const local = localCopy(first.snapshot);
  setSessionCounters(local, 6);
  const oldDeviceIncrement = mergeWordStrikeSnapshotsWithSyncState(local, {
    revision: 2,
    data: first.snapshot,
  }, {
    deviceId: "ws-device-old",
    localState: first.localState,
    now: 2000,
  });
  assert.equal(oldDeviceIncrement.snapshot.mode.totals.completedSessions, 6);

  const sameLocalAfterIdReset = localCopy(oldDeviceIncrement.snapshot);
  const resetIdentity = mergeWordStrikeSnapshotsWithSyncState(sameLocalAfterIdReset, {
    revision: 3,
    data: oldDeviceIncrement.snapshot,
  }, {
    deviceId: "ws-device-new",
    localState: oldDeviceIncrement.localState,
    now: 3000,
  });
  assert.equal(resetIdentity.snapshot.mode.totals.completedSessions, 6);

  const changedAgain = localCopy(resetIdentity.snapshot);
  setSessionCounters(changedAgain, 7);
  const newDeviceIncrement = mergeWordStrikeSnapshotsWithSyncState(changedAgain, {
    revision: 4,
    data: resetIdentity.snapshot,
  }, {
    deviceId: "ws-device-new",
    localState: resetIdentity.localState,
    now: 4000,
  });
  assert.equal(newDeviceIncrement.snapshot.mode.totals.completedSessions, 7);
});

test("retrying a failed first schema-v2 upload does not add the same local delta twice", () => {
  const legacyRemote = snapshot();
  const local = snapshot();
  setSessionCounters(legacyRemote, 10);
  setSessionCounters(local, 11);

  const firstAttempt = mergeWordStrikeSnapshotsWithSyncState(local, {
    revision: 1,
    data: legacyRemote,
  }, {
    deviceId: "ws-device-retry",
    localState: {
      schemaVersion: 1,
      userId: "user-1",
      deviceId: "ws-device-retry",
      observedCounters: {
        [JSON.stringify(["totals", "completedSessions"])]: 10,
        [JSON.stringify(["lifetime", "finalizedSessions"])]: 10,
        [JSON.stringify(["lifetime", "successfulSessions"])]: 10,
        [JSON.stringify(["modes", "speed-test", "completedSessions"])]: 10,
        [JSON.stringify(["modes", "speed-test", "activity", "trackedSessions"])]: 10,
        [JSON.stringify(["modes", "speed-test", "configUsage", "time-60"])]: 10,
        [JSON.stringify(["modes", "speed-test", "wordSetConfigUsage", SPEED_TEST_WORD_SET.id, "time-60"])]: 10,
        [JSON.stringify(["modes", "speed-test", "wordSetActivity", SPEED_TEST_WORD_SET.id, "trackedSessions"])]: 10,
      },
      ownCounters: {},
      observedSettings: local.settings,
      settingClocks: {},
    },
    now: 2000,
  });
  assert.equal(firstAttempt.snapshot.mode.totals.completedSessions, 11);

  // Simulate the local merge/state being written, but the remote PUT failing.
  const retryLocal = localCopy(firstAttempt.snapshot);
  const retry = mergeWordStrikeSnapshotsWithSyncState(retryLocal, {
    revision: 1,
    data: legacyRemote,
  }, {
    deviceId: "ws-device-retry",
    localState: firstAttempt.localState,
    now: 3000,
  });
  assert.equal(retry.snapshot.mode.totals.completedSessions, 11);
  assert.equal(retry.snapshot.mode.lifetime.finalizedSessions, 11);
  assert.equal(retry.snapshot.mode.modes["speed-test"].completedSessions, 11);
});

test("legacy migration uses one high-water baseline instead of double-counting old totals", () => {
  const local = snapshot();
  const remote = snapshot();
  setSessionCounters(local, 12);
  setSessionCounters(remote, 15);

  const merged = mergeWordStrikeSnapshotsWithSyncState(local, {
    revision: 8,
    data: remote,
  }, {
    deviceId: "ws-device-migration",
    localState: {},
    now: 5000,
  });

  assert.equal(merged.snapshot.mode.totals.completedSessions, 15);
  assert.equal(merged.snapshot.sync.counterBase[
    JSON.stringify(["totals", "completedSessions"])
  ], 15);
});

test("lifetime time bounds merge with earliest first and latest last session", () => {
  const local = snapshot();
  const remote = snapshot();
  local.mode.lifetime.firstSessionAt = 200;
  local.mode.lifetime.lastSessionAt = 400;
  remote.mode.lifetime.firstSessionAt = 100;
  remote.mode.lifetime.lastSessionAt = 500;

  const merged = mergeWordStrikeSnapshotsWithSyncState(local, {
    revision: 2,
    data: remote,
  }, {
    deviceId: "ws-device-time",
    localState: {},
    now: 6000,
  }).snapshot;

  assert.equal(merged.mode.lifetime.firstSessionAt, 100);
  assert.equal(merged.mode.lifetime.lastSessionAt, 500);
});

console.log("Account sync v2 preserves concurrent device counters, migrates legacy high-water totals once, and merges lifetime bounds correctly.");
