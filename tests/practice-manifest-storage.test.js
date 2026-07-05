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

console.log("Practice manifest creation, round-trip, bounded writes, backup recovery, controlled corruption, and scoped reset passed.");

