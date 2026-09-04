import assert from "node:assert/strict";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import {
  createDefaultCheckpoint,
  createDefaultPracticeManifest,
  createDefaultPracticeProfile,
  createDefaultReviewItem,
  createDefaultSessionSummary,
  createDefaultSkillStat,
} from "../js/practiceLab/practiceDefaults.js";
import {
  createDefaultPracticeContextId,
  createPracticeContextId,
  createSkillStatId,
} from "../js/practiceLab/practiceIds.js";
import {
  createDefaultPracticeContext,
  createPracticeContextRecord,
  createPracticeContextFingerprint,
} from "../js/practiceLab/practiceContext.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";
import {
  validatePracticeContext,
  validateSessionSummary,
  validateSkillStat,
} from "../js/practiceLab/practiceValidation.js";

const now = () => new Date("2026-07-08T12:00:00.000Z");
const profileA = "practice-profile_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const profileB = "practice-profile_bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const defaultA = createDefaultPracticeContextId(profileA);
const defaultB = createDefaultPracticeContextId(profileB);

assert.equal(createDefaultPracticeContextId(profileA), defaultA);
assert.notEqual(defaultA, defaultB);
assert.match(defaultA, /^practice-context_[a-z0-9_-]+_default$/);
assert.equal(createPracticeContextId({ uuid: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" }), "practice-context_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

const normalized = createPracticeContextFingerprint({
  dataLocale: " en_US ",
  keyboardLayout: " QWERTY ",
  inputMethod: "unknown",
  hardwareProfileId: null,
});
assert.equal(normalized, "v1|en-US|qwerty|unknown|none");
assert.equal(normalized, createPracticeContextFingerprint({ dataLocale: "en-US", keyboardLayout: "qwerty", inputMethod: "unknown", hardwareProfileId: null }));
assert.notEqual(normalized, createPracticeContextFingerprint({ dataLocale: "de-DE", keyboardLayout: "qwertz", inputMethod: "unknown", hardwareProfileId: null }));

const defaultContext = createDefaultPracticeContext({
  profileId: profileA,
  dataLocale: "en-US",
  keyboardLayout: "QWERTY",
  now,
});
assert.equal(defaultContext.recordVersion, 1);
assert.equal(defaultContext.contextId, defaultA);
assert.equal(defaultContext.profileId, profileA);
assert.equal(defaultContext.inputMethod, "unknown");
assert.equal(defaultContext.hardwareProfileId, null);
assert.equal(defaultContext.fingerprint, "v1|en-US|qwerty|unknown|none");
assert.equal(validatePracticeContext(defaultContext).valid, true);

for (const bad of [
  { ...defaultContext, dataLocale: "" },
  { ...defaultContext, keyboardLayout: "" },
  { ...defaultContext, inputMethod: "touch" },
  { ...defaultContext, contextId: "bad" },
  { ...defaultContext, fingerprint: "v1|wrong" },
  { ...defaultContext, recordVersion: 99 },
]) assert.equal(validatePracticeContext(bad).valid, false);

const profileV2 = {
  ...createDefaultPracticeProfile({ profileId: profileA, now }),
  recordVersion: 2,
};
delete profileV2.activeContextId;
const profileSource = structuredClone(profileV2);
const migratedProfile = migratePracticeRecord("profile", profileV2);
assert.equal(migratedProfile.ok, true);
assert.equal(migratedProfile.value.recordVersion, 3);
assert.equal(migratedProfile.value.activeContextId, defaultA);
assert.deepEqual(profileV2, profileSource);
assert.equal(migratePracticeRecord("profile", migratedProfile.value).migrated, false);

const statV1 = {
  ...createDefaultSkillStat({ profileId: profileA, contextId: defaultA, entityType: "bigram", entityKey: "th", now }),
  recordVersion: 1,
};
delete statV1.contextId;
statV1.statId = "practice-stat_legacy-th";
const migratedStat = migratePracticeRecord("skillStat", statV1);
assert.equal(migratedStat.ok, true);
assert.equal(migratedStat.value.recordVersion, 2);
assert.equal(migratedStat.value.contextId, defaultA);
assert.equal(migratedStat.value.statId, createSkillStatId(profileA, defaultA, "bigram", "th"));
assert.equal(validateSkillStat(migratedStat.value).valid, true);
assert.equal(migratePracticeRecord("skillStat", migratedStat.value).migrated, false);
assert.equal(migratePracticeRecord("skillStat", { ...migratedStat.value, recordVersion: 99 }).error.code, "PRACTICE_STORAGE_UNSUPPORTED_VERSION");
for (const [type, current] of [
  ["reviewItem", createDefaultReviewItem({ profileId: profileA, contextId: defaultA, now })],
  ["sessionSummary", createDefaultSessionSummary({ profileId: profileA, contextId: defaultA, now })],
  ["checkpoint", createDefaultCheckpoint({ profileId: profileA, contextId: defaultA, now })],
]) {
  const old = { ...current, recordVersion: 1 };
  delete old.contextId;
  const migrated = migratePracticeRecord(type, old);
  assert.equal(migrated.ok, true);
  assert.equal(migrated.value.contextId, defaultA);
}

assert.equal(PRACTICE_DATABASE_VERSION, 2);
assert.equal(PRACTICE_RECORD_VERSIONS.profile, 3);
assert.equal(PRACTICE_RECORD_VERSIONS.context, 1);
assert.equal(PRACTICE_RECORD_VERSIONS.skillStat, 2);
assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 3);
assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 2);
assert.equal(PRACTICE_RECORD_VERSIONS.checkpoint, 2);
assert.equal(PRACTICE_STORE_DEFINITIONS.skillStats.indexes.some((index) => index.name === "profileEntity"), false);
assert.equal(PRACTICE_STORE_DEFINITIONS.reviewItems.indexes.some((index) => index.name === "profileEntity"), false);

const values = new Map();
const localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
const manifestStore = createPracticeManifestStore({
  storage: localStorage,
  createDefault: (options) => createDefaultPracticeManifest({ profileId: profileA, now, ...options }),
  defaultOptions: { profileId: profileA, now },
});
const dataStore = createPracticeMemoryStore();
const repository = createPracticeRepository({ dataStore, manifestStore, now });
const initialized = await repository.initializePracticeStorage();
assert.equal(initialized.profile.activeContextId, defaultA);
assert.equal(initialized.context.contextId, defaultA);
assert.equal(initialized.context.profileId, profileA);

const contextB = createPracticeContextRecord({
  contextId: createPracticeContextId({ uuid: () => "bbbbbbbb-cccc-dddd-eeee-ffffffffffff" }),
  profileId: profileA,
  dataLocale: "de-DE",
  keyboardLayout: "qwertz",
  inputMethod: "physical",
  hardwareProfileId: null,
  now,
});
await repository.savePracticeContext(contextB);
const contexts = await repository.listPracticeContexts(profileA);
assert.equal(contexts.length, 2);
const switched = await repository.setActivePracticeContext(profileA, contextB.contextId);
assert.equal(switched.profile.activeContextId, contextB.contextId);
assert.equal((await repository.getActivePracticeContext(profileA)).contextId, contextB.contextId);

const statA = createDefaultSkillStat({ profileId: profileA, contextId: defaultA, entityType: "bigram", entityKey: "er", now });
const statB = createDefaultSkillStat({ profileId: profileA, contextId: contextB.contextId, entityType: "bigram", entityKey: "er", now });
await repository.saveSkillStat(statA);
await repository.saveSkillStat(statB);
assert.notEqual(statA.statId, statB.statId);
assert.equal((await repository.listSkillStats(profileA, defaultA)).length, 1);
assert.equal((await repository.listSkillStats(profileA, contextB.contextId)).length, 1);
assert.equal((await repository.listSkillStatsAcrossContexts(profileA)).length, 2);

const summaryA = createDefaultSessionSummary({
  profileId: profileA,
  contextId: defaultA,
  now,
  overrides: { sessionId: "practice-session_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
});
assert.equal(validateSessionSummary(summaryA).valid, true);
await repository.saveSessionSummary(summaryA);
await repository.setActivePracticeContext(profileA, contextB.contextId);
assert.equal((await repository.getSessionSummary(summaryA.sessionId)).contextId, defaultA);

const reviewA = createDefaultReviewItem({
  profileId: profileA,
  contextId: defaultA,
  entityType: "bigram",
  entityKey: "er",
  now,
  overrides: { reviewItemId: "practice-review_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
});
const reviewB = createDefaultReviewItem({
  profileId: profileA,
  contextId: contextB.contextId,
  entityType: "bigram",
  entityKey: "er",
  now,
  overrides: { reviewItemId: "practice-review_bbbbbbbb-cccc-dddd-eeee-ffffffffffff" },
});
await repository.saveReviewItem(reviewA);
await repository.saveReviewItem(reviewB);
assert.equal((await repository.listDueReviewItems(profileA, defaultA)).length, 1);
assert.equal((await repository.listDueReviewItems(profileA, contextB.contextId)).length, 1);

const foreign = createPracticeContextRecord({
  contextId: createPracticeContextId({ uuid: () => "cccccccc-dddd-eeee-ffff-000000000000" }),
  profileId: profileB,
  dataLocale: "en",
  keyboardLayout: "qwerty",
  inputMethod: "unknown",
  hardwareProfileId: null,
  now,
});
await dataStore.put("contexts", foreign);
await assert.rejects(repository.setActivePracticeContext(profileA, foreign.contextId));
await assert.rejects(repository.saveSkillStat({ ...statA, contextId: foreign.contextId, statId: createSkillStatId(profileA, foreign.contextId, "bigram", "er") }));

console.log("PL5 context identity, migrations, ownership, isolation, history, checkpoint, commit, retention, and reset passed.");
