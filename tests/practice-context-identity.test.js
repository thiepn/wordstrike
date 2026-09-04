import assert from "node:assert/strict";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import {
  createDefaultPracticeContext,
  createPracticeContextFingerprint,
  createPracticeContextRecord,
  normalizePracticeDataLocale,
  normalizePracticeKeyboardLayout,
} from "../js/practiceLab/practiceContext.js";
import {
  createDefaultPracticeContextId,
  createPracticeId,
  createSkillStatId,
  isPracticeId,
} from "../js/practiceLab/practiceIds.js";
import {
  createDefaultCheckpoint,
  createDefaultPracticeManifest,
  createDefaultPracticeProfile,
  createDefaultReviewItem,
  createDefaultSessionSummary,
  createDefaultSkillStat,
} from "../js/practiceLab/practiceDefaults.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";
import {
  validateCheckpoint,
  validatePracticeContext,
  validatePracticeProfile,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "../js/practiceLab/practiceValidation.js";
import { buildPracticeRetentionPlan } from "../js/practiceLab/practiceRetention.js";

const now = () => new Date("2026-09-03T18:00:00.000Z");
const profileA = createPracticeId("profile", { uuid: () => "pl5-profile-a-12345678" });
const profileB = createPracticeId("profile", { uuid: () => "pl5-profile-b-12345678" });
const defaultA = createDefaultPracticeContextId(profileA);
assert.equal(defaultA, createDefaultPracticeContextId(profileA));
assert.notEqual(defaultA, createDefaultPracticeContextId(profileB));
assert.equal(isPracticeId(defaultA, "context"), true);
assert.equal(normalizePracticeDataLocale(" de_DE "), "de-DE");
assert.equal(normalizePracticeDataLocale("not a locale !!!"), null);
assert.equal(normalizePracticeKeyboardLayout(" QWERTZ "), "qwertz");
assert.equal(createPracticeContextFingerprint({ dataLocale: "en", keyboardLayout: "QWERTY", inputMethod: "unknown", hardwareProfileId: null }), createPracticeContextFingerprint({ dataLocale: " en ", keyboardLayout: "qwerty", inputMethod: "UNKNOWN", hardwareProfileId: null }));
assert.notEqual(createPracticeContextFingerprint({ dataLocale: "en", keyboardLayout: "qwerty", inputMethod: "physical", hardwareProfileId: null }), createPracticeContextFingerprint({ dataLocale: "en", keyboardLayout: "qwerty", inputMethod: "software", hardwareProfileId: null }));

const defaultContext = createDefaultPracticeContext({ profileId: profileA, dataLocale: "en", keyboardLayout: "qwerty", now });
assert.equal(defaultContext.contextId, defaultA);
assert.equal(defaultContext.recordVersion, 1);
assert.equal(defaultContext.inputMethod, "unknown");
assert.equal(defaultContext.hardwareProfileId, null);
assert.equal(validatePracticeContext(defaultContext).valid, true);
for (const bad of [
  { ...defaultContext, dataLocale: "" },
  { ...defaultContext, keyboardLayout: "" },
  { ...defaultContext, inputMethod: "touchish" },
  { ...defaultContext, contextId: "bad" },
  { ...defaultContext, fingerprint: "v1|wrong" },
  { ...defaultContext, recordVersion: 2 },
]) assert.equal(validatePracticeContext(bad).valid, false);

const profile = createDefaultPracticeProfile({ profileId: profileA, now });
assert.equal(profile.recordVersion, 3);
assert.equal(profile.activeContextId, defaultA);
assert.equal(validatePracticeProfile(profile).valid, true);
const stat = createDefaultSkillStat({ profileId: profileA, contextId: defaultA, entityType: "bigram", entityKey: "er", now });
assert.equal(stat.recordVersion, 2);
assert.equal(stat.statId, createSkillStatId(profileA, defaultA, "bigram", "er"));
assert.equal(validateSkillStat(stat).valid, true);
assert.equal(validateSkillStat({ ...stat, contextId: undefined }).valid, false);
assert.equal(validateSkillStat({ ...stat, statId: createSkillStatId(profileA, createDefaultPracticeContextId(profileB), "bigram", "er") }).valid, false);
assert.throws(() => createSkillStatId(profileA, "bigram", "er"), /requires profileId/);
assert.equal(validateReviewItem(createDefaultReviewItem({ profileId: profileA, contextId: defaultA, now })).valid, true);
assert.equal(validateSessionSummary(createDefaultSessionSummary({ profileId: profileA, contextId: defaultA, now })).valid, true);
assert.equal(validateCheckpoint(createDefaultCheckpoint({ profileId: profileA, contextId: defaultA, now })).valid, true);

const legacyProfile = { ...profile, recordVersion: 2 };
delete legacyProfile.activeContextId;
const migratedProfile = migratePracticeRecord("profile", legacyProfile);
assert.equal(migratedProfile.ok, true);
assert.deepEqual(migratedProfile.steps, ["profile:2->3"]);
assert.equal(migratedProfile.value.activeContextId, defaultA);
assert.equal(legacyProfile.activeContextId, undefined);
const legacyStat = { ...stat, recordVersion: 1, statId: "practice-stat_" + encodeURIComponent(profileA) + "_" + encodeURIComponent(stat.entityType) + "_" + encodeURIComponent(stat.entityKey) };
delete legacyStat.contextId;
const migratedStat = migratePracticeRecord("skillStat", legacyStat);
assert.equal(migratedStat.ok, true);
assert.deepEqual(migratedStat.steps, ["skillStat:1->2"]);
assert.equal(migratedStat.value.contextId, defaultA);
assert.equal(migratedStat.value.statId, createSkillStatId(profileA, defaultA, "bigram", "er"));
assert.equal(migratedStat.value.sampleCount, stat.sampleCount);
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
assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 4);
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
assert.equal((await repository.getActivePracticeContext()).contextId, defaultA);
assert.equal((await repository.initializePracticeStorage()).reconciliation.reconciled, false);

const contextB = createPracticeContextRecord({
  contextId: createPracticeId("context", { uuid: () => "german-qwertz-12345678" }),
  profileId: profileA,
  dataLocale: "de-DE",
  keyboardLayout: "qwertz",
  inputMethod: "physical",
  now,
});
await repository.savePracticeContext(contextB);
const sameLogical = await repository.createPracticeContext({ profileId: profileA, dataLocale: "de_de", keyboardLayout: "QWERTZ", inputMethod: "physical" });
assert.equal(sameLogical.created, false);
assert.equal(sameLogical.context.contextId, contextB.contextId);

const aStat = createDefaultSkillStat({ profileId: profileA, contextId: defaultA, entityType: "bigram", entityKey: "er", now });
const bStat = createDefaultSkillStat({ profileId: profileA, contextId: contextB.contextId, entityType: "bigram", entityKey: "er", now });
await repository.saveSkillStat(aStat);
await repository.saveSkillStat(bStat);
assert.notEqual(aStat.statId, bStat.statId);
assert.equal((await repository.listSkillStats(profileA, defaultA)).length, 1);
assert.equal((await repository.listSkillStats(profileA, contextB.contextId)).length, 1);
const aReview = createDefaultReviewItem({ reviewItemId: createPracticeId("review", { uuid: () => "review-a-12345678" }), profileId: profileA, contextId: defaultA, entityType: "bigram", entityKey: "er", now });
const bReview = createDefaultReviewItem({ reviewItemId: createPracticeId("review", { uuid: () => "review-b-12345678" }), profileId: profileA, contextId: contextB.contextId, entityType: "bigram", entityKey: "er", now });
await repository.saveReviewItem(aReview);
await repository.saveReviewItem(bReview);
assert.equal((await repository.listDueReviewItems(profileA, defaultA)).length, 1);
assert.equal((await repository.listDueReviewItems(profileA, contextB.contextId)).length, 1);

const oldSession = createDefaultSessionSummary({ sessionId: createPracticeId("session", { uuid: () => "history-a-12345678" }), profileId: profileA, contextId: defaultA, now });
await repository.saveSessionSummary(oldSession);
const oldCheckpoint = createDefaultCheckpoint({ profileId: profileA, contextId: defaultA, sessionId: createPracticeId("session", { uuid: () => "checkpoint-a-12345678" }), now });
await repository.saveActiveCheckpoint(oldCheckpoint);
await repository.setActivePracticeContext(profileA, contextB.contextId);
assert.equal((await repository.getPracticeProfile()).activeContextId, contextB.contextId);
assert.equal((await repository.getSessionSummary(oldSession.sessionId)).contextId, defaultA);
assert.equal((await repository.getActiveCheckpoint()).contextId, defaultA);

const foreignContext = createDefaultPracticeContext({ profileId: profileB, now });
await dataStore.put("profiles", createDefaultPracticeProfile({ profileId: profileB, now }));
await dataStore.put("contexts", foreignContext);
await assert.rejects(repository.saveSkillStat(createDefaultSkillStat({ profileId: profileA, contextId: foreignContext.contextId, now })), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");
await assert.rejects(repository.setActivePracticeContext(profileA, foreignContext.contextId), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");

const mixedSummary = createDefaultSessionSummary({ sessionId: createPracticeId("session", { uuid: () => "mixed-session-12345678" }), profileId: profileA, contextId: contextB.contextId, now });
const wrongContextStat = createDefaultSkillStat({ profileId: profileA, contextId: defaultA, now });
await assert.rejects(repository.commitCompletedPracticeSession({ sessionSummary: mixedSummary, updatedSkillStats: [wrongContextStat], clearCheckpoint: false }), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");
assert.equal(await repository.getSessionSummary(mixedSummary.sessionId), null);

const retention = buildPracticeRetentionPlan({ reviewItems: [aReview, bReview], now });
assert.equal(retention.reviewItems.length, 0);

await repository.resetPracticeData();
assert.equal((await dataStore.list("contexts")).length, 0);
console.log("PL5 context identity, migrations, ownership, isolation, history, checkpoint, commit, retention, and reset passed.");
