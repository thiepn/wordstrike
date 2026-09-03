import assert from "node:assert/strict";
import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_MANIFEST_KEY,
  PRACTICE_RECORD_VERSIONS,
} from "../js/practiceLab/practiceConstants.js";
import {
  createDefaultPracticeContext,
  createPracticeContextRecord,
} from "../js/practiceLab/practiceContext.js";
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
  createPracticeId,
  createSkillStatId,
  isPracticeId,
} from "../js/practiceLab/practiceIds.js";
import { createPracticeManifestStore } from "../js/practiceLab/practiceManifestStore.js";
import { createPracticeMemoryStore } from "../js/practiceLab/practiceMemoryStore.js";
import { migratePracticeRecord } from "../js/practiceLab/practiceMigrations.js";
import { createPracticeRepository } from "../js/practiceLab/practiceRepository.js";
import {
  validateCheckpoint,
  validateReviewItem,
  validateSessionSummary,
} from "../js/practiceLab/practiceValidation.js";

const now = () => new Date("2026-09-03T19:00:00.000Z");
const legacySkillStatId = (profileId, entityType, entityKey) => "practice-stat_" + encodeURIComponent(profileId) + "_" + encodeURIComponent(entityType) + "_" + encodeURIComponent(entityKey);
const makeLocalStorage = () => {
  const values = new Map();
  return {
    values,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  };
};

const generatedContextId = createPracticeContextId({ uuid: () => "explicit-context-id-12345678" });
assert.equal(isPracticeId(generatedContextId, "context"), true);

const migrationProfileId = createPracticeId("profile", { uuid: () => "legacy-profile-12345678" });
const migrationContextId = createDefaultPracticeContextId(migrationProfileId);
const currentStat = createDefaultSkillStat({ profileId: migrationProfileId, contextId: migrationContextId, entityType: "bigram", entityKey: "th", now });
const malformedLegacyStat = { ...currentStat, recordVersion: 1, statId: "practice-stat_wrong_identity" };
delete malformedLegacyStat.contextId;
const rejectedLegacyStat = migratePracticeRecord("skillStat", malformedLegacyStat);
assert.equal(rejectedLegacyStat.ok, false);
assert.equal(rejectedLegacyStat.error.code, "PRACTICE_STORAGE_MIGRATION_FAILED");

for (const current of [
  createDefaultReviewItem({ profileId: migrationProfileId, contextId: migrationContextId, now }),
  createDefaultSessionSummary({ profileId: migrationProfileId, contextId: migrationContextId, now }),
  createDefaultCheckpoint({ profileId: migrationProfileId, contextId: migrationContextId, now }),
]) {
  const withoutContext = { ...current };
  delete withoutContext.contextId;
  const validation = current.reviewItemId
    ? validateReviewItem(withoutContext)
    : current.sessionId && current.phase
      ? validateCheckpoint(withoutContext)
      : validateSessionSummary(withoutContext);
  assert.equal(validation.valid, false);
}

// Exact old-v1 storage backfill: profile v2 + contextless evidence becomes one truthful unknown context.
const legacyStorage = makeLocalStorage();
const legacyManifest = createDefaultPracticeManifest({ profileId: migrationProfileId, now, overrides: { databaseVersion: 1 } });
legacyStorage.values.set(PRACTICE_MANIFEST_KEY, JSON.stringify(legacyManifest));
const legacyManifestStore = createPracticeManifestStore({
  storage: legacyStorage.storage,
  createDefault: (options) => createDefaultPracticeManifest({ profileId: migrationProfileId, now, ...options }),
  defaultOptions: { profileId: migrationProfileId, now },
});
const legacyDataStore = createPracticeMemoryStore();
await legacyDataStore.open();
const legacyProfile = createDefaultPracticeProfile({ profileId: migrationProfileId, now });
legacyProfile.recordVersion = 2;
delete legacyProfile.activeContextId;
const legacyStat = { ...currentStat, recordVersion: 1, statId: legacySkillStatId(migrationProfileId, currentStat.entityType, currentStat.entityKey) };
delete legacyStat.contextId;
const legacySession = createDefaultSessionSummary({ sessionId: createPracticeId("session", { uuid: () => "legacy-session-12345678" }), profileId: migrationProfileId, contextId: migrationContextId, now });
legacySession.recordVersion = 1;
delete legacySession.contextId;
const legacyReview = createDefaultReviewItem({ reviewItemId: createPracticeId("review", { uuid: () => "legacy-review-12345678" }), profileId: migrationProfileId, contextId: migrationContextId, entityType: "bigram", entityKey: "th", now });
legacyReview.recordVersion = 1;
delete legacyReview.contextId;
const legacyCheckpoint = createDefaultCheckpoint({ profileId: migrationProfileId, contextId: migrationContextId, sessionId: createPracticeId("session", { uuid: () => "legacy-checkpoint-12345678" }), now });
legacyCheckpoint.recordVersion = 1;
delete legacyCheckpoint.contextId;
await legacyDataStore.put("profiles", legacyProfile);
await legacyDataStore.put("skillStats", legacyStat);
await legacyDataStore.put("sessionSummaries", legacySession);
await legacyDataStore.put("reviewItems", legacyReview);
await legacyDataStore.put("activeSessionCheckpoints", legacyCheckpoint);
const legacyRepository = createPracticeRepository({ dataStore: legacyDataStore, manifestStore: legacyManifestStore, now });
const migrated = await legacyRepository.initializePracticeStorage();
assert.equal(migrated.profile.recordVersion, PRACTICE_RECORD_VERSIONS.profile);
assert.equal(migrated.profile.activeContextId, migrationContextId);
const migratedContext = await legacyRepository.getPracticeContext(migrationContextId);
assert.equal(migratedContext.recordVersion, 1);
assert.equal(migratedContext.inputMethod, "unknown");
assert.equal(migratedContext.hardwareProfileId, null);
assert.equal(await legacyDataStore.get("skillStats", legacyStat.statId), null);
const migratedSkill = await legacyDataStore.get("skillStats", createSkillStatId(migrationProfileId, migrationContextId, "bigram", "th"));
assert.equal(migratedSkill.recordVersion, 2);
assert.equal(migratedSkill.contextId, migrationContextId);
assert.equal((await legacyRepository.getSessionSummary(legacySession.sessionId)).contextId, migrationContextId);
assert.equal((await legacyRepository.getReviewItem(legacyReview.reviewItemId)).contextId, migrationContextId);
assert.equal((await legacyRepository.getActiveCheckpoint()).contextId, migrationContextId);
assert.equal(JSON.parse(legacyStorage.values.get(PRACTICE_MANIFEST_KEY)).databaseVersion, PRACTICE_DATABASE_VERSION);
const logicalSnapshot = JSON.stringify({
  profile: await legacyDataStore.get("profiles", migrationProfileId),
  contexts: await legacyDataStore.list("contexts"),
  skillStats: await legacyDataStore.list("skillStats"),
  sessions: await legacyDataStore.list("sessionSummaries"),
  reviews: await legacyDataStore.list("reviewItems"),
  checkpoint: await legacyDataStore.get("activeSessionCheckpoints", migrationProfileId),
});
const migratedAgain = await legacyRepository.initializePracticeStorage();
assert.equal(migratedAgain.reconciliation.reconciled, false);
assert.equal(JSON.stringify({
  profile: await legacyDataStore.get("profiles", migrationProfileId),
  contexts: await legacyDataStore.list("contexts"),
  skillStats: await legacyDataStore.list("skillStats"),
  sessions: await legacyDataStore.list("sessionSummaries"),
  reviews: await legacyDataStore.list("reviewItems"),
  checkpoint: await legacyDataStore.get("activeSessionCheckpoints", migrationProfileId),
}), logicalSnapshot);

// Existing context IDs cannot be relabeled by changing their canonical fingerprint.
const explicit = await legacyRepository.createPracticeContext({
  profileId: migrationProfileId,
  dataLocale: "de-DE",
  keyboardLayout: "qwertz",
  inputMethod: "physical",
});
const relabeled = createPracticeContextRecord({
  contextId: explicit.context.contextId,
  profileId: migrationProfileId,
  dataLocale: "fr",
  keyboardLayout: "azerty",
  inputMethod: "physical",
  now,
});
await assert.rejects(legacyRepository.savePracticeContext(relabeled), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");
assert.equal((await legacyRepository.getPracticeContext(explicit.context.contextId)).fingerprint, explicit.context.fingerprint);

// Canonical review uniqueness is profile/context/entity, regardless of review state.
const uniqueReviewA = createDefaultReviewItem({
  reviewItemId: createPracticeId("review", { uuid: () => "unique-review-a-12345678" }),
  profileId: migrationProfileId,
  contextId: explicit.context.contextId,
  entityType: "bigram",
  entityKey: "er",
  now,
});
const uniqueReviewB = createDefaultReviewItem({
  reviewItemId: createPracticeId("review", { uuid: () => "unique-review-b-12345678" }),
  profileId: migrationProfileId,
  contextId: explicit.context.contextId,
  entityType: "bigram",
  entityKey: "er",
  now,
  overrides: { state: "suspended" },
});
await legacyRepository.saveReviewItem(uniqueReviewA);
await assert.rejects(legacyRepository.saveReviewItem(uniqueReviewB), (error) => error.code === "PRACTICE_STORAGE_DUPLICATE");

// Every context-sensitive repository write rejects profile/context cross-ownership.
const foreignProfileId = createPracticeId("profile", { uuid: () => "foreign-profile-12345678" });
const foreignProfile = createDefaultPracticeProfile({ profileId: foreignProfileId, now });
const foreignContext = createDefaultPracticeContext({ profileId: foreignProfileId, now });
await legacyDataStore.put("profiles", foreignProfile);
await legacyDataStore.put("contexts", foreignContext);
const foreignSession = createDefaultSessionSummary({
  sessionId: createPracticeId("session", { uuid: () => "foreign-session-12345678" }),
  profileId: migrationProfileId,
  contextId: foreignContext.contextId,
  now,
});
const foreignReview = createDefaultReviewItem({
  reviewItemId: createPracticeId("review", { uuid: () => "foreign-review-12345678" }),
  profileId: migrationProfileId,
  contextId: foreignContext.contextId,
  now,
});
await assert.rejects(legacyRepository.saveSessionSummary(foreignSession), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");
await assert.rejects(legacyRepository.saveReviewItem(foreignReview), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");

// Atomic completion rejects a review from another context and leaves no partial session.
const mixedSession = createDefaultSessionSummary({
  sessionId: createPracticeId("session", { uuid: () => "mixed-review-session-12345678" }),
  profileId: migrationProfileId,
  contextId: explicit.context.contextId,
  now,
});
const wrongContextReview = createDefaultReviewItem({
  reviewItemId: createPracticeId("review", { uuid: () => "wrong-context-review-12345678" }),
  profileId: migrationProfileId,
  contextId: migrationContextId,
  entityType: "bigram",
  entityKey: "zz",
  now,
});
await assert.rejects(legacyRepository.commitCompletedPracticeSession({
  sessionSummary: mixedSession,
  reviewItemChanges: [wrongContextReview],
  clearCheckpoint: false,
}), (error) => error.code === "PRACTICE_STORAGE_VALIDATION_FAILED");
assert.equal(await legacyRepository.getSessionSummary(mixedSession.sessionId), null);

// Checkpoint restore never substitutes the currently active context when its own context disappears.
const isolatedCheckpoint = createDefaultCheckpoint({
  profileId: migrationProfileId,
  contextId: explicit.context.contextId,
  sessionId: createPracticeId("session", { uuid: () => "missing-context-checkpoint-12345678" }),
  now,
});
await legacyRepository.saveActiveCheckpoint(isolatedCheckpoint);
await legacyRepository.setActivePracticeContext(migrationProfileId, migrationContextId);
await legacyDataStore.delete("contexts", explicit.context.contextId);
await assert.rejects(legacyRepository.getActiveCheckpoint(), (error) => error.code === "PRACTICE_STORAGE_RECOVERY_REQUIRED");

// A malformed active legacy profile cannot mark PL5 reconciliation complete.
const brokenStorage = makeLocalStorage();
const brokenProfileId = createPracticeId("profile", { uuid: () => "broken-profile-12345678" });
const brokenManifest = createDefaultPracticeManifest({ profileId: brokenProfileId, now, overrides: { databaseVersion: 1 } });
brokenStorage.values.set(PRACTICE_MANIFEST_KEY, JSON.stringify(brokenManifest));
const brokenManifestStore = createPracticeManifestStore({
  storage: brokenStorage.storage,
  createDefault: (options) => createDefaultPracticeManifest({ profileId: brokenProfileId, now, ...options }),
  defaultOptions: { profileId: brokenProfileId, now },
});
const brokenDataStore = createPracticeMemoryStore();
await brokenDataStore.open();
const brokenProfile = createDefaultPracticeProfile({ profileId: brokenProfileId, now });
brokenProfile.recordVersion = 2;
brokenProfile.dataLocale = "";
delete brokenProfile.activeContextId;
await brokenDataStore.put("profiles", brokenProfile);
const brokenRepository = createPracticeRepository({ dataStore: brokenDataStore, manifestStore: brokenManifestStore, now });
await assert.rejects(brokenRepository.initializePracticeStorage(), (error) => error.code === "PRACTICE_STORAGE_RECOVERY_REQUIRED");
assert.equal(await brokenDataStore.get("meta", "pl5ContextIdentity"), null);

console.log("PL5 migration hardening, manifest persistence, immutability, ownership, uniqueness, and retry safety passed.");
