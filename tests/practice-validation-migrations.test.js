import assert from "node:assert/strict";
import {
  createDefaultCheckpoint,
  createDefaultCustomText,
  createDefaultPracticeManifest,
  createDefaultPracticeProfile,
  createDefaultPreset,
  createDefaultReviewItem,
  createDefaultSessionSummary,
  createDefaultSkillStat,
} from "../js/practiceLab/practiceDefaults.js";
import { createPracticeId } from "../js/practiceLab/practiceIds.js";
import {
  migratePracticeManifest,
  migratePracticeRecord,
} from "../js/practiceLab/practiceMigrations.js";
import {
  normalizePracticeSettings,
  validateCheckpoint,
  validateCustomText,
  validatePracticeProfile,
  validatePreset,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "../js/practiceLab/practiceValidation.js";

const now = () => new Date("2026-07-05T18:42:13.000Z");
const profileId = createPracticeId("profile", { uuid: () => "profile-12345678" });
const sessionId = createPracticeId("session", { uuid: () => "session-12345678" });

const invalidCases = [
  [validatePracticeProfile, (() => { const value = createDefaultPracticeProfile({ profileId, now }); delete value.profileId; return value; })()],
  [validatePracticeProfile, { ...createDefaultPracticeProfile({ profileId, now }), updatedAt: "not-a-timestamp" }],
  [validatePracticeProfile, { ...createDefaultPracticeProfile({ profileId, now }), totalCompletedSessions: -1 }],
  [validateSkillStat, { ...createDefaultSkillStat({ profileId, now }), sampleCount: -1 }],
  [validateSkillStat, { ...createDefaultSkillStat({ profileId, now }), entityType: "trigram", entityKey: "tion" }],
  [validateSkillStat, { ...createDefaultSkillStat({ profileId, now }), statId: "wrong-stat-id" }],
  [validateSessionSummary, { ...createDefaultSessionSummary({ profileId, sessionId, now }), accuracy: 101 }],
  [validateSessionSummary, { ...createDefaultSessionSummary({ profileId, sessionId, now }), typedCharacterCount: 1, correctCharacterCount: 2 }],
  [validateSessionSummary, { ...createDefaultSessionSummary({ profileId, sessionId, now }), activeDurationMs: 2000, wallDurationMs: 0 }],
  [validateReviewItem, { ...createDefaultReviewItem({ profileId, now }), state: "tomorrow" }],
  [validateCustomText, createDefaultCustomText({ profileId, now, text: "x".repeat(250001) })],
  [validatePreset, { ...createDefaultPreset({ profileId, now }), configuration: { value: Infinity } }],
  [validateCheckpoint, { ...createDefaultCheckpoint({ profileId, sessionId, now }), expiresAt: "2020-01-01T00:00:00.000Z" }],
];
for (const [validator, value] of invalidCases) assert.equal(validator(value).valid, false);

const normalized = normalizePracticeSettings({
  dailySessionLengthMinutes: "12",
  punctuationFrequency: "HIGH",
  keyboardLayout: " QWERTY ",
});
assert.equal(normalized.dailySessionLengthMinutes, 12);
assert.equal(normalized.punctuationFrequency, "high");
assert.equal(normalized.keyboardLayout, "qwerty");

const manifest = createDefaultPracticeManifest({ profileId, now });
const original = structuredClone(manifest);
const first = migratePracticeManifest(manifest);
const second = migratePracticeManifest(first.value);
assert.equal(first.ok, true);
assert.equal(first.migrated, false);
assert.deepEqual(second.value, first.value);
assert.deepEqual(manifest, original);

const profile = createDefaultPracticeProfile({ profileId, now });
const profileOriginal = structuredClone(profile);
assert.equal(migratePracticeRecord("profile", profile).ok, true);
assert.deepEqual(profile, profileOriginal);
const v0 = { ...profile };
delete v0.recordVersion;
const migratedV0 = migratePracticeRecord("profile", v0);
assert.equal(migratedV0.ok, true);
assert.equal(migratedV0.value.recordVersion, 1);
assert.equal(migratedV0.migrated, true);
assert.deepEqual(migratePracticeRecord("profile", migratedV0.value).value, migratedV0.value);

assert.equal(migratePracticeManifest({ ...manifest, manifestVersion: 99 }).ok, false);
assert.equal(migratePracticeRecord("profile", { ...profile, recordVersion: 99 }).ok, false);
assert.equal(migratePracticeRecord("profile", { recordVersion: 1 }).ok, false);
assert.equal(migratePracticeRecord("unknown", profile).ok, false);

console.log("Practice structured validation, normalization, identity/v0 migrations, idempotence, and future-version rejection passed.");
