import assert from "node:assert/strict";
import {
  PRACTICE_MANIFEST_BACKUP_KEY,
  PRACTICE_MANIFEST_KEY,
  PRACTICE_MANIFEST_TEMP_KEY,
} from "../js/practiceLab/practiceConstants.js";
import { createDefaultPracticeManifest } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";

function storageFrom(entries = []) {
  const values = new Map(entries);
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const profileId = createPracticeId("profile", { uuid: () => "manifest-12345678" });
const now = () => new Date("2026-07-05T18:42:13.000Z");
const storage = storageFrom([["wordstrike_save", '{"currentFurthestLevel":42}']]);
const store = createPracticeManifestStore({ storage, defaultOptions: { profileId, now } });
const created = store.load();
assert.equal(created.recovery, "created");
assert.equal(created.manifest.profileId, profileId);
assert.ok(storage.values.has(PRACTICE_MANIFEST_KEY));
assert.equal(storage.values.get("wordstrike_save"), '{"currentFurthestLevel":42}');

const updated = {
  ...created.manifest,
  updatedAt: "2026-07-05T18:43:13.000Z",
  storageHealth: "degraded",
};
assert.equal(store.save(updated).manifest.storageHealth, "degraded");
assert.ok(storage.values.has(PRACTICE_MANIFEST_BACKUP_KEY));
assert.equal(storage.values.has(PRACTICE_MANIFEST_TEMP_KEY), false);
assert.deepEqual(store.load().manifest, updated);

storage.values.set(PRACTICE_MANIFEST_KEY, "{broken");
const recovered = store.load();
assert.equal(recovered.recovery, "backup");
assert.equal(recovered.manifest.storageHealth, "healthy");

storage.values.set(PRACTICE_MANIFEST_KEY, "{broken");
storage.values.set(PRACTICE_MANIFEST_BACKUP_KEY, "{also-broken");
const controlled = store.load();
assert.equal(controlled.recovery, "defaults-after-corruption");
assert.equal(controlled.manifest.storageHealth, "recovery-required");

const oversized = createDefaultPracticeManifest({
  profileId,
  now,
  overrides: { dashboardSummary: { ...created.manifest.dashboardSummary, padding: "x".repeat(70000) } },
});
assert.throws(() => store.save(oversized), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");

store.clear();
assert.equal(storage.values.has(PRACTICE_MANIFEST_KEY), false);
assert.equal(storage.values.has(PRACTICE_MANIFEST_BACKUP_KEY), false);
assert.equal(storage.values.get("wordstrike_save"), '{"currentFurthestLevel":42}');



function quotaError() {
  const error = new Error("The quota has been exceeded.");
  error.name = "QuotaExceededError";
  return error;
}

{
  const legacy = createDefaultPracticeManifest({
    profileId,
    now,
    overrides: { databaseVersion: 12 },
  });
  const values = new Map([[PRACTICE_MANIFEST_KEY, JSON.stringify(legacy)]]);
  const quotaStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem() { throw quotaError(); },
    removeItem(key) { values.delete(key); },
  };
  const quotaStore = createPracticeManifestStore({ storage: quotaStorage, defaultOptions: { profileId, now } });
  const loaded = quotaStore.load();
  assert.equal(loaded.manifest.databaseVersion, 13);
  assert.equal(loaded.recovery, "quota-readonly");
  assert.equal(JSON.parse(values.get(PRACTICE_MANIFEST_KEY)).databaseVersion, 12, "full localStorage must not make a valid existing manifest unreadable");
}

{
  const legacy = createDefaultPracticeManifest({
    profileId,
    now,
    overrides: { databaseVersion: 12 },
  });
  const values = new Map([[PRACTICE_MANIFEST_KEY, JSON.stringify(legacy)]]);
  const quotaStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) {
      if (key !== PRACTICE_MANIFEST_KEY) throw quotaError();
      values.set(key, String(value));
    },
    removeItem(key) { values.delete(key); },
  };
  const quotaStore = createPracticeManifestStore({ storage: quotaStorage, defaultOptions: { profileId, now } });
  const loaded = quotaStore.load();
  assert.equal(loaded.recovery, "quota-direct");
  assert.equal(JSON.parse(values.get(PRACTICE_MANIFEST_KEY)).databaseVersion, 13, "in-place overwrite should recover when only temporary headroom is missing");
}

{
  const current = createDefaultPracticeManifest({ profileId, now });
  const values = new Map([[PRACTICE_MANIFEST_KEY, JSON.stringify(current)]]);
  const quotaStorage = {
    getItem(key) { return values.get(key) ?? null; },
    setItem() { throw quotaError(); },
    removeItem(key) { values.delete(key); },
  };
  const quotaStore = createPracticeManifestStore({ storage: quotaStorage, defaultOptions: { profileId, now } });
  assert.throws(
    () => quotaStore.save({ ...current, updatedAt: "2026-07-05T18:44:13.000Z" }),
    (error) => error.code === "PRACTICE_STORAGE_QUOTA_EXCEEDED" && error.operation === "manifest-write",
    "explicit writes that truly cannot persist must report quota instead of a generic transaction failure",
  );
}

console.log("Practice manifest creation, round-trip, low-quota recovery, backup recovery, controlled corruption, and scoped reset passed.");

