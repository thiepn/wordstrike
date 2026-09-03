import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const replaceOnce = (file, from, to) => {
  const source = read(file);
  if (!source.includes(from)) throw new Error(`PL5 final-audit anchor missing in ${file}: ${from.slice(0, 120)}`);
  write(file, source.replace(from, to));
};
const insertAfter = (file, anchor, addition) => {
  const source = read(file);
  if (!source.includes(anchor)) throw new Error(`PL5 final-audit insertion anchor missing in ${file}: ${anchor}`);
  write(file, source.replace(anchor, anchor + addition));
};

// ---------------------------------------------------------------------------
// MIGRATION HARDENING: validate historical skill identity before remapping.
// ---------------------------------------------------------------------------
insertAfter(
  "js/practiceLab/practiceMigrations.js",
  "const migrations = Object.freeze({",
  ""
);
replaceOnce(
  "js/practiceLab/practiceMigrations.js",
  [
    "function promoteForCurrentValidation(type, value, version) {",
  ].join("\n"),
  [
    "function createLegacySkillStatId(profileId, entityType, entityKey) {",
    "  return \"practice-stat_\" + encodeURIComponent(profileId) + \"_\" + encodeURIComponent(entityType) + \"_\" + encodeURIComponent(entityKey);",
    "}",
    "",
    "function validateHistoricalRecord(type, value, version) {",
    "  const errors = [];",
    "  if (type === \"skillStat\" && version === 1) {",
    "    const validIdentity = typeof value.profileId === \"string\"",
    "      && typeof value.entityType === \"string\"",
    "      && typeof value.entityKey === \"string\"",
    "      && value.statId === createLegacySkillStatId(value.profileId, value.entityType, value.entityKey);",
    "    if (!validIdentity) errors.push({",
    "      path: \"statId\",",
    "      code: \"IDENTITY_MISMATCH\",",
    "      message: \"legacy statId does not match the historical profile/entity identity\",",
    "    });",
    "  }",
    "  return errors;",
    "}",
    "",
    "function promoteForCurrentValidation(type, value, version) {",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceMigrations.js",
  [
    "  while (currentVersion < targetVersion) {",
    "    const migrateStep = migrations[type]?.[currentVersion]",
  ].join("\n"),
  [
    "  while (currentVersion < targetVersion) {",
    "    const historicalErrors = validateHistoricalRecord(type, value, currentVersion);",
    "    if (historicalErrors.length) return failure(",
    "      PRACTICE_STORAGE_ERROR_CODES.MIGRATION_FAILED,",
    "      type + \" failed historical validation before version \" + (currentVersion + 1),",
    "      { cause: historicalErrors },",
    "    );",
    "    const migrateStep = migrations[type]?.[currentVersion]",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceMigrations.js",
  [
    "function validateIntermediate(type, value, version, validate) {",
    "  try {",
  ].join("\n"),
  [
    "function validateIntermediate(type, value, version, validate) {",
    "  const historicalErrors = validateHistoricalRecord(type, value, version);",
    "  if (historicalErrors.length) return { valid: false, errors: historicalErrors };",
    "  try {",
  ].join("\n")
);

// ---------------------------------------------------------------------------
// REPOSITORY HARDENING: semantic equality, immutable context identity,
// fail-closed reconciliation, canonical review uniqueness, race-safe creation.
// ---------------------------------------------------------------------------
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  [
    "function equivalent(left, right) {",
    "  return JSON.stringify(left) === JSON.stringify(right);",
    "}",
  ].join("\n"),
  [
    "function canonicalizePracticeValue(value) {",
    "  if (Array.isArray(value)) return value.map(canonicalizePracticeValue);",
    "  if (value && typeof value === \"object\") {",
    "    return Object.keys(value).sort().reduce((result, key) => {",
    "      result[key] = canonicalizePracticeValue(value[key]);",
    "      return result;",
    "    }, {});",
    "  }",
    "  return value;",
    "}",
    "",
    "function equivalent(left, right) {",
    "  return JSON.stringify(canonicalizePracticeValue(left)) === JSON.stringify(canonicalizePracticeValue(right));",
    "}",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  [
    "    await dataStore.runTransaction([storeName, \"quarantine\"], \"readwrite\", async (transaction) => {",
    "      const existing = await transaction.get(storeName, nextKey);",
    "      if (!existing) await transaction.put(storeName, migrated);",
    "      else if (!equivalent(existing, migrated)) await transaction.put(\"quarantine\", makeQuarantineEntry(storeName, migrated, \"migration-primary-key-conflict\"));",
    "      await transaction.delete(storeName, requestedKey);",
    "    });",
    "    return migrated;",
  ].join("\n"),
  [
    "    let resolved = migrated;",
    "    await dataStore.runTransaction([storeName, \"quarantine\"], \"readwrite\", async (transaction) => {",
    "      const existing = await transaction.get(storeName, nextKey);",
    "      if (!existing) await transaction.put(storeName, migrated);",
    "      else {",
    "        resolved = existing;",
    "        if (!equivalent(existing, migrated)) await transaction.put(\"quarantine\", makeQuarantineEntry(storeName, migrated, \"migration-primary-key-conflict\"));",
    "      }",
    "      await transaction.delete(storeName, requestedKey);",
    "    });",
    "    return resolved;",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  [
    "        if (!migration.ok) {",
    "          await transaction.put(\"quarantine\", makeQuarantineEntry(\"profiles\", raw, \"profile-migration-failed\"));",
    "          await transaction.delete(\"profiles\", raw.profileId);",
    "          continue;",
    "        }",
  ].join("\n"),
  [
    "        if (!migration.ok) {",
    "          await transaction.put(\"quarantine\", makeQuarantineEntry(\"profiles\", raw, \"profile-migration-failed\"));",
    "          await transaction.delete(\"profiles\", raw.profileId);",
    "          if (raw?.profileId === ensureManifest().profileId) return { reconciled: false, fatal: \"active-profile-invalid\", ids: [raw.profileId] };",
    "          continue;",
    "        }",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  [
    "        if (!migration.ok) {",
    "          await transaction.put(\"quarantine\", makeQuarantineEntry(\"contexts\", raw, \"context-validation-failed\"));",
    "          if ([...profiles.values()].some((profile) => profile.activeContextId === raw.contextId)) invalidActiveContextIds.add(raw.contextId);",
    "          continue;",
    "        }",
  ].join("\n"),
  [
    "        if (!migration.ok) {",
    "          await transaction.put(\"quarantine\", makeQuarantineEntry(\"contexts\", raw, \"context-validation-failed\"));",
    "          await transaction.delete(\"contexts\", raw.contextId);",
    "          if ([...profiles.values()].some((profile) => profile.activeContextId === raw.contextId)) invalidActiveContextIds.add(raw.contextId);",
    "          continue;",
    "        }",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  [
    "        if (!profiles.has(context.profileId)) {",
    "          await transaction.put(\"quarantine\", makeQuarantineEntry(\"contexts\", raw, \"context-owner-missing\"));",
    "          continue;",
    "        }",
  ].join("\n"),
  [
    "        if (!profiles.has(context.profileId)) {",
    "          await transaction.put(\"quarantine\", makeQuarantineEntry(\"contexts\", raw, \"context-owner-missing\"));",
    "          await transaction.delete(\"contexts\", raw.contextId);",
    "          continue;",
    "        }",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  [
    "    async savePracticeContext(context) {",
    "      validate(\"contexts\", context);",
    "      const profile = await readValidated(\"profiles\", context.profileId);",
    "      if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, \"Practice context owner does not exist\", { operation: \"save-context\", storeName: \"profiles\", recordId: context.profileId, recoverable: true });",
    "      const duplicates = await dataStore.query(\"contexts\", \"profileFingerprint\", [context.profileId, context.fingerprint]);",
    "      const conflict = duplicates.find((candidate) => candidate.contextId !== context.contextId);",
    "      if (conflict) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, \"Equivalent Practice context already exists for this profile\", { operation: \"save-context\", storeName: \"contexts\", recordId: context.contextId, recoverable: true });",
    "      return putValidated(\"contexts\", context);",
    "    },",
  ].join("\n"),
  [
    "    async savePracticeContext(context) {",
    "      validate(\"contexts\", context);",
    "      const profile = await readValidated(\"profiles\", context.profileId);",
    "      if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, \"Practice context owner does not exist\", { operation: \"save-context\", storeName: \"profiles\", recordId: context.profileId, recoverable: true });",
    "      const existingById = await dataStore.get(\"contexts\", context.contextId);",
    "      if (existingById && (existingById.profileId !== context.profileId || existingById.fingerprint !== context.fingerprint)) {",
    "        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, \"Practice context identity is immutable\", { operation: \"save-context\", storeName: \"contexts\", recordId: context.contextId, recoverable: true });",
    "      }",
    "      const duplicates = await dataStore.query(\"contexts\", \"profileFingerprint\", [context.profileId, context.fingerprint]);",
    "      const conflict = duplicates.find((candidate) => candidate.contextId !== context.contextId);",
    "      if (conflict) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, \"Equivalent Practice context already exists for this profile\", { operation: \"save-context\", storeName: \"contexts\", recordId: context.contextId, recoverable: true });",
    "      try {",
    "        return await putValidated(\"contexts\", context);",
    "      } catch (cause) {",
    "        if (cause?.name !== \"ConstraintError\") throw cause;",
    "        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, \"Equivalent Practice context already exists for this profile\", { operation: \"save-context\", storeName: \"contexts\", recordId: context.contextId, recoverable: true, cause });",
    "      }",
    "    },",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  [
    "      const existing = await dataStore.query(\"contexts\", \"profileFingerprint\", [profileId, context.fingerprint]);",
    "      if (existing.length) return { created: false, reused: true, context: existing[0] };",
    "      await putValidated(\"contexts\", context);",
    "      return { created: true, reused: false, context };",
  ].join("\n"),
  [
    "      const existing = await dataStore.query(\"contexts\", \"profileFingerprint\", [profileId, context.fingerprint]);",
    "      if (existing.length) return { created: false, reused: true, context: existing[0] };",
    "      try {",
    "        await putValidated(\"contexts\", context);",
    "        return { created: true, reused: false, context };",
    "      } catch (cause) {",
    "        if (cause?.name !== \"ConstraintError\") throw cause;",
    "        const canonical = await dataStore.query(\"contexts\", \"profileFingerprint\", [profileId, context.fingerprint]);",
    "        if (canonical.length) return { created: false, reused: true, context: canonical[0] };",
    "        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, \"Equivalent Practice context already exists for this profile\", { operation: \"create-context\", storeName: \"contexts\", recordId: context.contextId, recoverable: true, cause });",
    "      }",
  ].join("\n")
);
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  "      const conflict = existing.find((record) => record.reviewItemId !== item.reviewItemId && activeReviewStates.has(record.state) && activeReviewStates.has(item.state));",
  "      const conflict = existing.find((record) => record.reviewItemId !== item.reviewItemId);"
);
replaceOnce(
  "js/practiceLab/practiceRepository.js",
  "      if (conflict) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, \"An active Practice review item already exists for this context/entity\", { operation: \"save-review-item\", storeName: \"reviewItems\", recordId: item.reviewItemId });",
  "      if (conflict) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, \"A canonical Practice review item already exists for this context/entity\", { operation: \"save-review-item\", storeName: \"reviewItems\", recordId: item.reviewItemId });"
);

// Persist manifest normalization once so legacy databaseVersion=1 does not remain on disk.
replaceOnce(
  "js/practiceLab/practiceManifestStore.js",
  "      if (primary) return { ok: true, manifest: primary, recovery: \"none\" };",
  [
    "      if (primary) {",
    "        if (primaryRaw !== JSON.stringify(primary)) save(primary);",
    "        return { ok: true, manifest: primary, recovery: \"none\" };",
    "      }",
  ].join("\n")
);

// Existing focused migration fixture must use the actual historical v1 stat ID.
replaceOnce(
  "tests/practice-context-identity.test.js",
  "const legacyStat = { ...stat, recordVersion: 1, statId: \"legacy-\" + stat.statId };",
  "const legacyStat = { ...stat, recordVersion: 1, statId: \"practice-stat_\" + encodeURIComponent(profileA) + \"_\" + encodeURIComponent(stat.entityType) + \"_\" + encodeURIComponent(stat.entityKey) };"
);

// ---------------------------------------------------------------------------
// ADDITIONAL PL5 HARDENING TESTS.
// ---------------------------------------------------------------------------
write("tests/practice-context-migration-hardening.test.js", `import assert from "node:assert/strict";
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
`);

write("tests/practice-context-import-safety.test.js", `import assert from "node:assert/strict";

const names = ["indexedDB", "localStorage", "addEventListener", "setInterval", "setTimeout"];
const descriptors = new Map(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const touched = [];
const trapObject = (name) => new Proxy({}, {
  get() {
    touched.push(name);
    throw new Error(name + " must not be touched during Practice context import");
  },
});

try {
  Object.defineProperty(globalThis, "indexedDB", { configurable: true, writable: true, value: trapObject("indexedDB") });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: trapObject("localStorage") });
  Object.defineProperty(globalThis, "addEventListener", { configurable: true, writable: true, value: () => { touched.push("addEventListener"); throw new Error("listener installation is forbidden during import"); } });
  Object.defineProperty(globalThis, "setInterval", { configurable: true, writable: true, value: () => { touched.push("setInterval"); throw new Error("timers are forbidden during import"); } });
  Object.defineProperty(globalThis, "setTimeout", { configurable: true, writable: true, value: () => { touched.push("setTimeout"); throw new Error("timers are forbidden during import"); } });
  const module = await import("../js/practiceLab/practiceContext.js?pl5-import-safety=1");
  assert.equal(typeof module.createDefaultPracticeContext, "function");
  assert.deepEqual(touched, []);
} finally {
  for (const name of names) {
    const descriptor = descriptors.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}

console.log("PL5 context module import is zero-side-effect.");
`);

// ---------------------------------------------------------------------------
// DOCUMENTATION: replace stale Prompt-2 data contract with current PL5 truth.
// ---------------------------------------------------------------------------
write("docs/PRACTICE_LAB_DATA_ARCHITECTURE.md", `# Practice Lab Data Architecture

Status: PL5 context identity foundation
Database generation: 2
Runtime integration: explicit Practice-only use; public Practice remains developer gated

## 1. Canonical identity boundary

Practice adaptive evidence is now identified by:

~~~text
PROFILE
  ↓
CONTEXT
  ↓
EVIDENCE
~~~

The durable context boundary exists so English/QWERTY, German/QWERTZ, software-keyboard, alternative-layout, and future hardware-specific evidence cannot be silently mixed. Fine-grained aggregation across contexts is not a default repository behavior.

The authoritative PL5 contract is also documented in **PRACTICE_LAB_CONTEXT_IDENTITY.md**.

## 2. Protected boundaries

Practice persistence remains completely separate from **wordstrike_save**, ranked Typing Test records, Campaign, Endless, Daily Strike, Arcade Rush, leaderboard submissions, authentication, access tokens, Supabase, and global leaderboards. Practice modules do not require auth or cloud services.

Raw per-key input traces remain memory-bounded session data. Durable Practice storage contains summaries and aggregates, not continuous keyboard telemetry.

## 3. Storage tiers

| Tier | Owns | Must not own |
| --- | --- | --- |
| Session memory | normalized input, high-frequency timing, bounded event trace, uncommitted observations | durable history |
| localStorage manifest | settings, profile/database pointer, onboarding/assessment cache, dashboard cache, storage health | context identity, histories, custom text bodies, skill maps |
| IndexedDB | profiles, contexts, skill evidence, summaries, reviews, custom text, presets, one checkpoint/profile, quarantine, metadata | ranked/auth/cloud state |

The manifest remains schema version 1. Its database pointer is reconciled to IndexedDB structural version 2. Canonical **activeContextId** lives only on the profile in IndexedDB; PL5 does not duplicate it into the manifest.

## 4. IndexedDB structural version 2

Database: **wordstrike-practice-lab**

| Store | Key path | Important indexes |
| --- | --- | --- |
| meta | key | none |
| profiles | profileId | updatedAt |
| contexts | contextId | profileId, updatedAt, lastUsedAt, unique [profileId, fingerprint] |
| skillStats | statId | profileId, contextId, entityType, updatedAt, priority, confidenceLevel, masteryState, unique [profileId, contextId, entityType, entityKey] |
| sessionSummaries | sessionId | profileId, contextId, experimentId, startedAtUtc, completedAtUtc, status, localDayKey |
| reviewItems | reviewItemId | profileId, contextId, dueAtUtc, localDueDayKey, state, entityType, entityKey, unique [profileId, contextId, entityType, entityKey] |
| customTexts | customTextId | profileId, updatedAt, lastUsedAt, normalizedTitle |
| presets | presetId | profileId, experimentId, updatedAt |
| activeSessionCheckpoints | profileId | unique sessionId, expiresAt |
| quarantine | quarantineId | sourceStore, detectedAt |

Database upgrade reconciles declared stores/indexes inside the IndexedDB version-change transaction. It explicitly removes the obsolete **skillStats.profileEntity** and **reviewItems.profileEntity** indexes, creates the context-aware replacements, and never deletes unknown stores blindly.

Fresh-v2 creation and v1→v2 upgrade are tested to converge on the same declared structure.

## 5. Record versions

| Record | Version |
| --- | ---: |
| context | 1 |
| profile | 3 |
| skillStat | 2 |
| sessionSummary | 2 |
| reviewItem | 2 |
| checkpoint | 2 |
| customText | 1 |
| preset | 1 |
| quarantine | 1 |

Database, record, session, experiment, and generator versions remain independent contracts.

## 6. Context record

A Practice context contains **contextId**, **profileId**, timestamps, **dataLocale**, **keyboardLayout**, **inputMethod**, nullable **hardwareProfileId**, and a versioned deterministic **fingerprint**.

Context normalization is conservative. Locale strings are trimmed, underscore separators may become hyphens, malformed/empty values are rejected, and layout identifiers are trimmed/lowercased within a bounded safe-string contract. Input method is exactly **unknown**, **physical**, or **software**. PL5 never infers input method or keyboard hardware from user agent, screen size, or touch support.

Fingerprint semantics are explicitly versioned. One profile may own at most one context for a normalized fingerprint. Existing context identity is immutable: a saved contextId cannot later be reassigned to another profile or fingerprint.

## 7. Deterministic default context

Every profile has a deterministic default context ID derived only from profileId. It is stable across reloads and does not depend on the clock or browser locale.

The default context uses the profile's existing locale/layout preferences plus:

~~~text
inputMethod: "unknown"
hardwareProfileId: null
~~~

Historical v1 evidence is mapped to this default context because old records did not distinguish physical from software input. PL5 never invents missing historical precision.

## 8. Profile and settings semantics

Profile v3 adds required **activeContextId** while retaining **dataLocale** and **keyboardLayout**. Those retained fields are defaults/preferences for future context creation; they are no longer sufficient identity for persisted skill evidence.

Likewise **settings.keyboardLayout** remains a preference. No context-sensitive query may infer historical identity from current settings. Evidence identity is the record's **contextId**.

## 9. Context-sensitive records

### Skill statistics

Skill identity is now:

~~~text
profileId + contextId + entityType + entityKey
~~~

**createSkillStatId()** requires all four components and has no contextless overload. Skill-stat v2 validation verifies the ID against that exact identity.

### Review items

Canonical uniqueness is one review item per **profile/context/entity**. The same entity may have independent review state in multiple contexts. Repository and IndexedDB uniqueness both enforce this boundary.

### Session summaries

Every summary permanently stores the context in which the session produced evidence. Historical summaries never derive context later from the profile's current active context.

### Checkpoints

The one-checkpoint-per-profile architecture remains. Each checkpoint now also stores immutable **contextId**. Restore resolves that exact context and returns a recoverable failure if it is missing/corrupt; it never substitutes today's active context.

## 10. Migration and bounded reconciliation

Record migration remains cloned, sequential, deterministic, validation-backed, future-version rejecting, and idempotent.

PL5 adds:

- profile 2→3: deterministic activeContextId;
- skillStat 1→2: deterministic default context plus recomputed four-part statId;
- sessionSummary 1→2: deterministic default context;
- reviewItem 1→2: deterministic default context;
- checkpoint 1→2: deterministic default context.

Historical skill-stat identity is validated against the actual v1 profile/entity ID contract before remapping. Current-version validators never accept contextless records; only migration adapters understand historical schemas.

Storage initialization performs one bounded PL5 reconciliation over the retained Practice stores. It creates missing deterministic default contexts from profile defaults, validates ownership, backfills context-sensitive records, replaces old skill primary keys, and writes the PL5 completion marker only after successful reconciliation. Subsequent initialization is cheap and does not rescan all Practice evidence indefinitely.

If both a legacy skill record and canonical v2 record resolve to one new key, semantically equivalent duplicates collapse to the canonical record. Independent evidence that cannot be safely merged is quarantined; PL5 does not invent statistical merge formulas.

Malformed records follow bounded quarantine/recovery policy. An invalid active profile/context fails closed and cannot mark PL5 migration complete.

## 11. Repository query and ownership contracts

Context repository operations support get/list/save/create, active-context resolution, and atomic active-context switching. Logical duplicate contexts reuse the existing canonical record where possible.

Context-sensitive adaptation queries are context-specific by default. Explicit cross-context administrative methods are named as such. Session history may list all contexts, but each summary always exposes its own contextId.

Every context-sensitive write verifies **context.profileId === record.profileId**. Atomic session completion verifies the summary context and rejects skill/review/checkpoint changes from any other profile/context before committing.

Switching active context changes future evidence only. It never relabels prior stats, sessions, reviews, or an existing checkpoint.

## 12. Session completion and retention

Completed-session persistence remains atomic across summaries, stats, reviews, profile updates, checkpoints, and reconciliation metadata. A failed mixed-context commit produces no partial session write and preserves existing recovery semantics.

Retention caps remain bounded. Skill stats are never merged across contexts, and review deduplication keys include contextId. Existing session/stat/review/quarantine limits otherwise remain unchanged.

## 13. Reset and privacy

**resetPracticeData()** clears all ten Practice stores, including **contexts**, plus the three namespaced Practice manifest keys. It never calls **localStorage.clear()** and never touches gameplay/ranked/auth storage.

Contexts are durable identity records. PL5 implements no arbitrary context deletion/archive UI because dependent historical evidence would require explicit handling.

## 14. Explicit PL5 non-goals

PL5 does not implement physical/software auto-detection, a context-selection UI, hardware keyboard profiles, multilingual corpora, ability/weakness models, Coach logic, adaptive experiments, assessment UI, advanced telemetry, leaderboard behavior, or cloud sync.
`);

// Session documentation: preserve detailed Prompt-3 mechanics, update identity-sensitive passages.
replaceOnce("docs/PRACTICE_LAB_SESSION_ENGINE.md", "Status: Prompt 3 headless foundation", "Status: Prompt 3 headless foundation + PL5 context identity");
insertAfter(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "The engine imports Prompt 2 Practice contracts and a repository interface. It never accesses IndexedDB, localStorage, DOM, Supabase, authentication, leaderboard services, ranked Typing records, or WORDSTRIKE saves. **js/main.js** does not import it.\n",
  `\n### PL5 immutable identity\n\nBefore an engine is created, the caller must resolve one valid **profileId + contextId** pair. The engine receives both as constructor identity and never re-reads activeContextId while the session is running. The frozen context propagates through snapshots, checkpoints, analyzer output validation, summaries, and atomic completion. Locale/layout/input-method decisions remain above the generic engine.\n`
);
replaceOnce(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "**createPracticeSessionEngine()** exposes prepare, start, handleInput, pause, resume, handleVisibilityState, appendContent, tick, flushCheckpoint, complete, abandon, interrupt, destroy, snapshots, metrics, trace, observations, diagnostics, and subscribe.",
  "**createPracticeSessionEngine()** requires a resolved **profileId** and **contextId**, then exposes prepare, start, handleInput, pause, resume, handleVisibilityState, appendContent, tick, flushCheckpoint, complete, abandon, interrupt, destroy, snapshots, metrics, trace, observations, diagnostics, and subscribe. Session identity is immutable after construction."
);
replaceOnce(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "**buildPracticeCheckpoint()** uses the Prompt 2 schema: identity/versions, configuration, full bounded content snapshot and descriptor/hash, cursor/typed buffer, completed units, durations, aggregate metrics, original start/timezone context, and at most 32 recent input events.",
  "**buildPracticeCheckpoint()** uses the current schema: immutable **profileId + contextId + sessionId**, versions, configuration, full bounded content snapshot and descriptor/hash, cursor/typed buffer, completed units, durations, aggregate metrics, original start/timezone context, and at most 32 recent input events."
);
replaceOnce(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "Restore validates schema/expiry/profile/experiment/session/content versions, resumability, content hash, cursor bounds, and reconstructed content.",
  "Restore validates schema/expiry/profile/**context**/experiment/session/content versions, context ownership, resumability, content hash, cursor bounds, and reconstructed content. A checkpoint whose context is missing or no longer belongs to its profile fails recoverably and is never restored under the currently active context."
);
replaceOnce(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "**buildPracticeSessionResult()** maps identity/version, content descriptor, UTC/local time, durations, generic metrics, targets, and bounded optional analysis into a Prompt 2-valid Practice summary.",
  "**buildPracticeSessionResult()** maps immutable **profileId + contextId + sessionId**, version, content descriptor, UTC/local time, durations, generic metrics, targets, and bounded optional analysis into a current Practice summary. The historical contextId is persisted permanently and is never derived later from activeContextId."
);
replaceOnce(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  "Optional **analyzeResult()** receives immutable snapshot, metrics, bounded in-memory trace, and observations.",
  "Optional **analyzeResult()** receives an immutable snapshot containing the frozen profile/context identity, metrics, bounded in-memory trace, and observations. Any returned skill/review updates must match the completing summary's profileId and contextId; mixed-context output is rejected before commit."
);
replaceOnce(
  "docs/PRACTICE_LAB_SESSION_ENGINE.md",
  " -> repository.commitCompletedPracticeSession()",
  " -> repository.commitCompletedPracticeSession() [profile/context ownership enforced]"
);

// Historical audit documents remain valuable evidence, but their pre-PL5 identity claims are explicitly superseded.
insertAfter(
  "docs/PRACTICE_LAB_ARCHITECTURE_AUDIT.md",
  "# Practice Lab Architecture Audit",
  `\n\n> **PL5 current-state notice:** This audit records the pre-PL5 foundation baseline. Any statements below describing IndexedDB structural version 1, profile→entity evidence identity, contextless skill/review/session/checkpoint records, or profile/entity uniqueness are historical and are superseded by **PRACTICE_LAB_CONTEXT_IDENTITY.md** and **PRACTICE_LAB_DATA_ARCHITECTURE.md**. The current canonical boundary is **profile → context → evidence**, with IndexedDB structural version 2.\n`
);
insertAfter(
  "docs/PRACTICE_LAB_FOUNDATION_INTEGRATION_AUDIT.md",
  "# Practice Lab Foundation Integration Audit",
  `\n\n> **PL5 current-state notice:** This integration audit predates the context-identity migration. Its Phase-0/Prompt-2 storage and profile/entity identity descriptions are retained as historical audit evidence, not current schema documentation. Current Practice identity is **profile → context → evidence**; see **PRACTICE_LAB_CONTEXT_IDENTITY.md** and **PRACTICE_LAB_DATA_ARCHITECTURE.md**.\n`
);

console.log("PL5 final hardening audit patch applied.");
