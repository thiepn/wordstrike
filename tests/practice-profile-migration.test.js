import assert from "node:assert/strict";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_MANIFEST_VERSION,
  PRACTICE_RECORD_VERSIONS,
} from "../js/practiceLab/practiceConstants.js";
import {
  createDefaultPracticeManifest,
  createDefaultPracticeProfile,
} from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";
import { validatePracticeProfile } from "../js/practiceLab/practiceValidation.js";

const now = () => new Date("2026-07-05T18:42:13.000Z");
const profileId = createPracticeId("profile", { uuid: () => "migration-profile-12345678" });
const current = createDefaultPracticeProfile({ profileId, now });
const legacy = { ...current, recordVersion: 1 };
delete legacy.lastTrainingDayKey;
const original = structuredClone(legacy);

const migrated = migratePracticeRecord("profile", legacy);
assert.equal(migrated.ok, true);
assert.equal(migrated.fromVersion, 1);
assert.equal(migrated.toVersion, 3);
assert.deepEqual(migrated.steps, ["profile:1->2", "profile:2->3"]);
assert.equal(migrated.value.recordVersion, 3);
assert.equal(migrated.value.lastTrainingDayKey, null);
assert.equal(migrated.value.activeContextId, current.activeContextId);
assert.deepEqual(legacy, original);
assert.deepEqual(migratePracticeRecord("profile", migrated.value).value, migrated.value);

const dated = { ...current, lastTrainingDayKey: "2026-07-05" };
assert.equal(validatePracticeProfile(dated).valid, true);
for (const invalid of ["07/05/2026", "2026-7-5", "today", 123]) {
  assert.equal(validatePracticeProfile({ ...current, lastTrainingDayKey: invalid }).valid, false);
}

const values = new Map();
const storage = {
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, String(value)); },
  removeItem(key) { values.delete(key); },
};
const manifestStore = createPracticeManifestStore({
  storage,
  createDefault: (options) => createDefaultPracticeManifest({ profileId, now, ...options }),
  defaultOptions: { profileId, now },
});
const dataStore = createPracticeMemoryStore({ initialData: { profiles: [legacy] } });
const repository = createPracticeRepository({ dataStore, manifestStore, now });
const initialized = await repository.initializePracticeStorage();
assert.equal(initialized.profile.recordVersion, 3);
assert.equal(initialized.profile.lastTrainingDayKey, null);
assert.deepEqual(await dataStore.get("profiles", profileId), initialized.profile);

assert.equal(PRACTICE_DATABASE_VERSION, 2);
assert.equal(PRACTICE_MANIFEST_VERSION, 1);
assert.deepEqual(PRACTICE_RECORD_VERSIONS, {
  context: 1,
  profile: 3,
  skillStat: 2,
  sessionSummary: 3,
  reviewItem: 2,
  customText: 1,
  preset: 1,
  checkpoint: 2,
  quarantine: 1,
});

console.log("Practice profile v1-to-v2 migration, canonical day key, repository upgrade, and isolated versioning passed.");
