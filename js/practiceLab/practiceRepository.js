import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_LIMITS,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_NAMES,
} from "./practiceConstants.js";
import { createDefaultPracticeProfile, createDefaultSkillStat } from "./practiceDefaults.js";
import { createDefaultPracticeAbilityState, mergePracticeAbilityObservation } from "./practiceAbilityEstimator.js";
import { createDefaultPracticePerformanceState, getCurrentPerformanceStateFromRecord, mergePracticePerformanceStateDelta } from "./practicePerformanceState.js";
import { validatePracticePerformanceState, validatePracticePerformanceStateDelta } from "./practicePerformanceValidation.js";
import { validatePracticeAbilityObservation, validatePracticeAbilityState } from "./practiceAbilityValidation.js";
import { mergePracticeSkillEvidence } from "./practiceSkillEvidenceMerge.js";
import { validatePracticeSkillEvidenceBatch } from "./practiceSkillEvidenceDelta.js";
import {
  createDefaultPracticeContext,
  createPracticeContextRecord,
} from "./practiceContext.js";
import { migratePracticeRecord } from "./practiceMigrations.js";
import {
  createDefaultPracticeContextId,
  createPracticeContextId,
  createPracticeAbilityStateId,
  createPracticePerformanceStateId,
  createPracticeQuarantineId,
  createSkillStatId,
} from "./practiceIds.js";
import { buildPracticeRetentionPlan } from "./practiceRetention.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  getPracticeStoreKey,
  isQuotaExceededError,
  practiceStorageError,
} from "./practiceStorageContract.js";
import {
  validateCheckpoint,
  validateCustomText,
  validatePracticeContext,
  validatePracticeProfile,
  validatePracticeSettings,
  validatePreset,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "./practiceValidation.js";
import { toPracticeUtcIso } from "./practiceTime.js";

const CONTEXT_BACKFILL_META_KEY = "pl5ContextIdentity";
const CONTEXT_BACKFILL_VERSION = 1;
const activeReviewStates = new Set(["new", "due", "learning", "improving", "stable"]);

const validators = Object.freeze({
  profiles: validatePracticeProfile,
  contexts: validatePracticeContext,
  skillStats: validateSkillStat,
  abilityStates: validatePracticeAbilityState,
  performanceStates: validatePracticePerformanceState,
  sessionSummaries: validateSessionSummary,
  reviewItems: validateReviewItem,
  customTexts: validateCustomText,
  presets: validatePreset,
  activeSessionCheckpoints: validateCheckpoint,
});
const recordTypesByStore = Object.freeze({
  profiles: "profile",
  contexts: "context",
  skillStats: "skillStat",
  abilityStates: "abilityState",
  performanceStates: "performanceState",
  sessionSummaries: "sessionSummary",
  reviewItems: "reviewItem",
  customTexts: "customText",
  presets: "preset",
  activeSessionCheckpoints: "checkpoint",
});

function recordId(record) {
  return record?.performanceStateId || record?.abilityStateId || record?.contextId || record?.sessionId || record?.profileId || record?.statId || record?.reviewItemId || record?.customTextId || record?.presetId || null;
}

function validationError(storeName, record, validation, operation = "save") {
  return practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, `Practice ${storeName} record failed validation`, {
    operation, storeName, recordId: recordId(record), recoverable: true, cause: validation.errors,
  });
}

function canonicalizePracticeValue(value) {
  if (Array.isArray(value)) return value.map(canonicalizePracticeValue);
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalizePracticeValue(value[key]);
      return result;
    }, {});
  }
  return value;
}

function equivalent(left, right) {
  return JSON.stringify(canonicalizePracticeValue(left)) === JSON.stringify(canonicalizePracticeValue(right));
}

export function createPracticeRepository({ dataStore, manifestStore, now = Date.now } = {}) {
  if (!dataStore || !manifestStore) throw new TypeError("Practice repository requires explicit data and manifest stores");
  let manifest = null;

  const ensureManifest = () => {
    if (!manifest) manifest = manifestStore.load().manifest;
    return manifest;
  };
  const validate = (storeName, record) => {
    const outcome = validators[storeName]?.(record);
    if (outcome && !outcome.valid) throw validationError(storeName, record, outcome);
    return record;
  };
  const saveManifestPatch = (patch) => {
    const current = ensureManifest();
    const next = { ...current, ...patch, updatedAt: toPracticeUtcIso(now) };
    const result = manifestStore.save(next);
    manifest = result.manifest;
    return manifest;
  };
  const makeQuarantineEntry = (storeName, record, reason) => {
    const detectedAt = toPracticeUtcIso(now);
    return {
      quarantineId: createPracticeQuarantineId(),
      recordVersion: PRACTICE_RECORD_VERSIONS.quarantine,
      createdAt: detectedAt,
      updatedAt: detectedAt,
      sourceStore: storeName,
      sourceKey: String(recordId(record) || "unknown"),
      reason: String(reason).slice(0, 300),
      detectedAt,
      originalRecord: record,
    };
  };
  const quarantine = async (storeName, record, reason) => {
    const entry = makeQuarantineEntry(storeName, record, reason);
    await dataStore.put("quarantine", entry);
    return entry;
  };

  const persistMigratedRead = async (storeName, requestedKey, migrated) => {
    const nextKey = getPracticeStoreKey(storeName, migrated);
    if (JSON.stringify(nextKey) === JSON.stringify(requestedKey)) {
      await dataStore.put(storeName, migrated);
      return migrated;
    }
    let resolved = migrated;
    await dataStore.runTransaction([storeName, "quarantine"], "readwrite", async (transaction) => {
      const existing = await transaction.get(storeName, nextKey);
      if (!existing) await transaction.put(storeName, migrated);
      else {
        resolved = existing;
        if (!equivalent(existing, migrated)) await transaction.put("quarantine", makeQuarantineEntry(storeName, migrated, "migration-primary-key-conflict"));
      }
      await transaction.delete(storeName, requestedKey);
    });
    return resolved;
  };

  const readValidated = async (storeName, key) => {
    const record = await dataStore.get(storeName, key);
    if (!record) return null;
    const recordType = recordTypesByStore[storeName];
    const migration = recordType ? migratePracticeRecord(recordType, record) : null;
    if (migration?.ok) {
      if (migration.migrated) await persistMigratedRead(storeName, key, migration.value);
      return migration.value;
    }
    const outcome = validators[storeName]?.(record);
    if (!migration && (!outcome || outcome.valid)) return record;
    await quarantine(storeName, record, "record-validation-failed");
    await dataStore.delete(storeName, key);
    if (migration?.error) throw migration.error;
    throw validationError(storeName, record, outcome, "read");
  };

  const assertContextOwnership = async (profileId, contextId, { transaction = null, operation = "context-ownership" } = {}) => {
    const context = transaction
      ? await transaction.get("contexts", contextId)
      : await readValidated("contexts", contextId);
    if (!context) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice context does not exist", { operation, storeName: "contexts", recordId: contextId, recoverable: true });
    const validation = validatePracticeContext(context);
    if (!validation.valid) throw validationError("contexts", context, validation, operation);
    if (context.profileId !== profileId) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice context belongs to another profile", { operation, storeName: "contexts", recordId: contextId, recoverable: true });
    return context;
  };

  const reconcileContextIdentity = async () => {
    const stores = ["profiles", "contexts", "skillStats", "sessionSummaries", "reviewItems", "activeSessionCheckpoints", "quarantine", "meta"];
    const outcome = await dataStore.runTransaction(stores, "readwrite", async (transaction) => {
      const marker = await transaction.get("meta", CONTEXT_BACKFILL_META_KEY);
      if (marker?.status === "complete" && marker?.version === CONTEXT_BACKFILL_VERSION) return { reconciled: false, marker };

      const rawProfiles = await transaction.list("profiles");
      if (!rawProfiles.some((candidate) => candidate?.profileId === ensureManifest().profileId)) {
        const profile = createDefaultPracticeProfile({ profileId: ensureManifest().profileId, now, keyboardLayout: ensureManifest().settings.keyboardLayout });
        const context = createDefaultPracticeContext({ profileId: profile.profileId, dataLocale: profile.dataLocale, keyboardLayout: profile.keyboardLayout, now });
        await transaction.put("profiles", profile);
        await transaction.put("contexts", context);
        rawProfiles.push(profile);
      }

      const profiles = new Map();
      const contexts = new Map();
      for (const raw of rawProfiles) {
        const migration = migratePracticeRecord("profile", raw);
        if (!migration.ok) {
          await transaction.put("quarantine", makeQuarantineEntry("profiles", raw, "profile-migration-failed"));
          await transaction.delete("profiles", raw.profileId);
          if (raw?.profileId === ensureManifest().profileId) return { reconciled: false, fatal: "active-profile-invalid", ids: [raw.profileId] };
          continue;
        }
        const profile = migration.value;
        await transaction.put("profiles", profile);
        profiles.set(profile.profileId, profile);
      }

      const rawContexts = await transaction.list("contexts");
      const invalidActiveContextIds = new Set();
      for (const raw of rawContexts) {
        const migration = migratePracticeRecord("context", raw);
        if (!migration.ok) {
          await transaction.put("quarantine", makeQuarantineEntry("contexts", raw, "context-validation-failed"));
          await transaction.delete("contexts", raw.contextId);
          if ([...profiles.values()].some((profile) => profile.activeContextId === raw.contextId)) invalidActiveContextIds.add(raw.contextId);
          continue;
        }
        const context = migration.value;
        if (!profiles.has(context.profileId)) {
          await transaction.put("quarantine", makeQuarantineEntry("contexts", raw, "context-owner-missing"));
          await transaction.delete("contexts", raw.contextId);
          continue;
        }
        contexts.set(context.contextId, context);
        await transaction.put("contexts", context);
      }

      if (invalidActiveContextIds.size) return { reconciled: false, fatal: "active-context-invalid", ids: [...invalidActiveContextIds] };

      for (const profile of profiles.values()) {
        let context = contexts.get(profile.activeContextId);
        if (!context) {
          const defaultContextId = createDefaultPracticeContextId(profile.profileId);
          if (profile.activeContextId !== defaultContextId) return { reconciled: false, fatal: "active-context-missing", ids: [profile.activeContextId] };
          context = createDefaultPracticeContext({ profileId: profile.profileId, dataLocale: profile.dataLocale, keyboardLayout: profile.keyboardLayout, now });
          await transaction.put("contexts", context);
          contexts.set(context.contextId, context);
        }
        if (context.profileId !== profile.profileId) return { reconciled: false, fatal: "active-context-owner-mismatch", ids: [context.contextId] };
      }

      const migrateStore = async (storeName, recordType) => {
        const records = await transaction.list(storeName);
        for (const raw of records) {
          const migration = migratePracticeRecord(recordType, raw);
          if (!migration.ok) {
            await transaction.put("quarantine", makeQuarantineEntry(storeName, raw, "record-migration-failed"));
            await transaction.delete(storeName, getPracticeStoreKey(storeName, raw));
            continue;
          }
          const migrated = migration.value;
          const context = contexts.get(migrated.contextId);
          if (!context || context.profileId !== migrated.profileId) {
            await transaction.put("quarantine", makeQuarantineEntry(storeName, raw, "context-ownership-invalid"));
            await transaction.delete(storeName, getPracticeStoreKey(storeName, raw));
            continue;
          }
          const oldKey = getPracticeStoreKey(storeName, raw);
          const newKey = getPracticeStoreKey(storeName, migrated);
          if (storeName === "skillStats" && oldKey !== newKey) {
            const canonical = await transaction.get(storeName, newKey);
            if (!canonical) await transaction.put(storeName, migrated);
            else if (!equivalent(canonical, migrated)) await transaction.put("quarantine", makeQuarantineEntry(storeName, raw, "legacy-skill-stat-conflict"));
            await transaction.delete(storeName, oldKey);
          } else {
            await transaction.put(storeName, migrated);
          }
        }
      };

      await migrateStore("skillStats", "skillStat");
      await migrateStore("sessionSummaries", "sessionSummary");
      await migrateStore("reviewItems", "reviewItem");
      await migrateStore("activeSessionCheckpoints", "checkpoint");

      const timestamp = toPracticeUtcIso(now);
      const markerValue = { key: CONTEXT_BACKFILL_META_KEY, version: CONTEXT_BACKFILL_VERSION, status: "complete", createdAt: timestamp, updatedAt: timestamp };
      await transaction.put("meta", markerValue);
      await transaction.put("meta", { key: "schemaVersion", value: 2, createdAt: ensureManifest().createdAt, updatedAt: timestamp });
      return { reconciled: true, marker: markerValue };
    });
    if (outcome.fatal) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Practice context reconciliation requires recovery", { operation: "pl5-context-reconciliation", storeName: "contexts", recordId: outcome.ids?.[0] ?? null, recoverable: true });
    return outcome;
  };

  const runRetention = async () => {
    const [checkpoints, sessionSummaries, skillStats, reviewItems, quarantineRecords] = await Promise.all([
      dataStore.list("activeSessionCheckpoints"), dataStore.list("sessionSummaries"), dataStore.list("skillStats"), dataStore.list("reviewItems"), dataStore.list("quarantine"),
    ]);
    const plan = buildPracticeRetentionPlan({ now, checkpoints, sessionSummaries, skillStats, reviewItems, quarantine: quarantineRecords });
    const deletions = [["activeSessionCheckpoints", plan.activeSessionCheckpoints], ["sessionSummaries", plan.sessionSummaries], ["reviewItems", plan.reviewItems], ["skillStats", plan.skillStats], ["quarantine", plan.quarantine]];
    await dataStore.runTransaction(deletions.map(([store]) => store), "readwrite", async (transaction) => {
      for (const [storeName, ids] of deletions) for (const id of ids) await transaction.delete(storeName, id);
    });
    return plan;
  };

  const writeWithQuotaRecovery = async (operation, write) => {
    try { return await write(); } catch (firstError) {
      if (!isQuotaExceededError(firstError)) throw firstError;
      await runRetention();
      try { return await write(); } catch (secondError) {
        if (!isQuotaExceededError(secondError)) throw secondError;
        try { saveManifestPatch({ storageHealth: "quota-exceeded" }); } catch {}
        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.QUOTA_EXCEEDED, "Practice storage quota remained exceeded after one recovery attempt", { operation, recoverable: true, cause: secondError });
      }
    }
  };
  const putValidated = (storeName, record) => {
    validate(storeName, record);
    return writeWithQuotaRecovery(`put:${storeName}`, () => dataStore.put(storeName, record));
  };
  const resolveContextId = async (profileId, contextId = null) => {
    if (contextId) { await assertContextOwnership(profileId, contextId); return contextId; }
    const profile = await readValidated("profiles", profileId);
    if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice profile does not exist", { operation: "resolve-context", storeName: "profiles", recordId: profileId, recoverable: true });
    await assertContextOwnership(profileId, profile.activeContextId);
    return profile.activeContextId;
  };

  const repository = {
    async initializePracticeStorage() {
      const manifestResult = manifestStore.load();
      manifest = manifestResult.manifest;
      await dataStore.open();
      const reconciliation = await reconcileContextIdentity();
      const profile = await readValidated("profiles", manifest.profileId);
      if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Practice profile could not be initialized", { operation: "initialize", storeName: "profiles", recordId: manifest.profileId, recoverable: true });
      const context = await assertContextOwnership(profile.profileId, profile.activeContextId, { operation: "initialize" });
      if (manifest.databaseVersion !== PRACTICE_DATABASE_VERSION) saveManifestPatch({ databaseVersion: PRACTICE_DATABASE_VERSION });
      return { manifest: ensureManifest(), profile, context, recovery: manifestResult.recovery, backend: dataStore.kind, reconciliation };
    },

    getPracticeProfile() { return readValidated("profiles", ensureManifest().profileId); },
    async savePracticeProfile(profile) {
      if (profile.profileId !== ensureManifest().profileId) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice profile does not match the active manifest profile", { operation: "save-profile", storeName: "profiles", recordId: profile.profileId });
      validate("profiles", profile);
      await assertContextOwnership(profile.profileId, profile.activeContextId, { operation: "save-profile" });
      return putValidated("profiles", profile);
    },

    getPracticeSettings() { return clonePracticeValue(ensureManifest().settings); },
    savePracticeSettings(settings) {
      const outcome = validatePracticeSettings(settings);
      if (!outcome.valid) throw validationError("manifest.settings", settings, outcome);
      return saveManifestPatch({ settings: clonePracticeValue(settings) }).settings;
    },

    getPracticeContext(contextId) { return readValidated("contexts", contextId); },
    async listPracticeContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("contexts", "profileId", profileId);
      return records.filter((record) => validatePracticeContext(record).valid);
    },
    async savePracticeContext(context) {
      validate("contexts", context);
      const profile = await readValidated("profiles", context.profileId);
      if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice context owner does not exist", { operation: "save-context", storeName: "profiles", recordId: context.profileId, recoverable: true });
      const existingById = await dataStore.get("contexts", context.contextId);
      if (existingById && (existingById.profileId !== context.profileId || existingById.fingerprint !== context.fingerprint)) {
        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice context identity is immutable", { operation: "save-context", storeName: "contexts", recordId: context.contextId, recoverable: true });
      }
      const duplicates = await dataStore.query("contexts", "profileFingerprint", [context.profileId, context.fingerprint]);
      const conflict = duplicates.find((candidate) => candidate.contextId !== context.contextId);
      if (conflict) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "Equivalent Practice context already exists for this profile", { operation: "save-context", storeName: "contexts", recordId: context.contextId, recoverable: true });
      try {
        return await putValidated("contexts", context);
      } catch (cause) {
        if (cause?.name !== "ConstraintError") throw cause;
        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "Equivalent Practice context already exists for this profile", { operation: "save-context", storeName: "contexts", recordId: context.contextId, recoverable: true, cause });
      }
    },
    async createPracticeContext({ profileId = ensureManifest().profileId, contextId = createPracticeContextId(), dataLocale, keyboardLayout, inputMethod = "unknown", hardwareProfileId = null } = {}) {
      const profile = await readValidated("profiles", profileId);
      if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice profile does not exist", { operation: "create-context", storeName: "profiles", recordId: profileId, recoverable: true });
      const context = createPracticeContextRecord({ contextId, profileId, dataLocale: dataLocale ?? profile.dataLocale, keyboardLayout: keyboardLayout ?? profile.keyboardLayout, inputMethod, hardwareProfileId, now });
      const existing = await dataStore.query("contexts", "profileFingerprint", [profileId, context.fingerprint]);
      if (existing.length) return { created: false, reused: true, context: existing[0] };
      try {
        await putValidated("contexts", context);
        return { created: true, reused: false, context };
      } catch (cause) {
        if (cause?.name !== "ConstraintError") throw cause;
        const canonical = await dataStore.query("contexts", "profileFingerprint", [profileId, context.fingerprint]);
        if (canonical.length) return { created: false, reused: true, context: canonical[0] };
        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "Equivalent Practice context already exists for this profile", { operation: "create-context", storeName: "contexts", recordId: context.contextId, recoverable: true, cause });
      }
    },
    async getActivePracticeContext(profileId = ensureManifest().profileId) {
      const profile = await readValidated("profiles", profileId);
      if (!profile) return null;
      return assertContextOwnership(profileId, profile.activeContextId, { operation: "get-active-context" });
    },
    async setActivePracticeContext(profileId, contextId) {
      const timestamp = toPracticeUtcIso(now);
      return dataStore.runTransaction(["profiles", "contexts"], "readwrite", async (transaction) => {
        const profile = await transaction.get("profiles", profileId);
        if (!profile) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECORD_NOT_FOUND, "Practice profile does not exist", { operation: "set-active-context", storeName: "profiles", recordId: profileId, recoverable: true });
        validate("profiles", profile);
        const context = await assertContextOwnership(profileId, contextId, { transaction, operation: "set-active-context" });
        const nextProfile = { ...profile, activeContextId: contextId, updatedAt: timestamp };
        const nextContext = { ...context, lastUsedAt: timestamp, updatedAt: timestamp };
        validate("profiles", nextProfile);
        validate("contexts", nextContext);
        await transaction.put("profiles", nextProfile);
        await transaction.put("contexts", nextContext);
        return { profile: nextProfile, context: nextContext };
      });
    },

    getSkillStat(profileId, contextId, entityType, entityKey) {
      return readValidated("skillStats", createSkillStatId(profileId, contextId, entityType, entityKey));
    },
    async saveSkillStat(stat) {
      validate("skillStats", stat);
      await assertContextOwnership(stat.profileId, stat.contextId, { operation: "save-skill-stat" });
      return putValidated("skillStats", stat);
    },
    async listSkillStats(profileId = ensureManifest().profileId, contextId = null) {
      const resolved = await resolveContextId(profileId, contextId);
      const records = await dataStore.query("skillStats", "contextId", resolved);
      return records.filter((record) => record.profileId === profileId && validateSkillStat(record).valid);
    },
    async listSkillStatsAcrossContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("skillStats", "profileId", profileId);
      return records.filter((record) => validateSkillStat(record).valid);
    },

    async getAbilityState(profileId, contextId, channel) {
      await assertContextOwnership(profileId, contextId, { operation: "get-ability-state" });
      return readValidated("abilityStates", createPracticeAbilityStateId(profileId, contextId, channel));
    },
    async listAbilityStates(profileId = ensureManifest().profileId, contextId = null) {
      const resolved = await resolveContextId(profileId, contextId);
      const records = await dataStore.query("abilityStates", "contextId", resolved);
      return records.filter((record) => record.profileId === profileId && validatePracticeAbilityState(record).valid);
    },
    async listAbilityStatesAcrossContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("abilityStates", "profileId", profileId);
      return records.filter((record) => validatePracticeAbilityState(record).valid);
    },

    async getPerformanceState(profileId, contextId) {
      await assertContextOwnership(profileId, contextId, { operation: "get-performance-state" });
      return readValidated("performanceStates", createPracticePerformanceStateId(profileId, contextId));
    },
    async getCurrentPerformanceState(profileId, contextId, channel, queryNow = now) {
      const state = await this.getPerformanceState(profileId, contextId);
      return getCurrentPerformanceStateFromRecord(state, channel, queryNow);
    },
    async listPerformanceStatesAcrossContexts(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("performanceStates", "profileId", profileId);
      return records.filter((record) => validatePracticePerformanceState(record, { maxBytes: PRACTICE_LIMITS.performanceStateBytes }).valid);
    },

    async saveSessionSummary(summary) {
      validate("sessionSummaries", summary);
      await assertContextOwnership(summary.profileId, summary.contextId, { operation: "save-session" });
      const previous = await dataStore.get("sessionSummaries", summary.sessionId);
      if (previous) {
        if (equivalent(previous, summary)) return { saved: false, idempotent: true, summary: previous };
        throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "A different Practice session summary already uses this sessionId", { operation: "save-session", storeName: "sessionSummaries", recordId: summary.sessionId });
      }
      await putValidated("sessionSummaries", summary);
      return { saved: true, idempotent: false, summary };
    },
    getSessionSummary(sessionId) { return readValidated("sessionSummaries", sessionId); },
    async listSessionSummaries(profileId = ensureManifest().profileId, { contextId = null } = {}) {
      const records = contextId
        ? await dataStore.query("sessionSummaries", "contextId", contextId)
        : await dataStore.query("sessionSummaries", "profileId", profileId);
      return records.filter((record) => record.profileId === profileId && (!contextId || record.contextId === contextId));
    },

    async saveReviewItem(item) {
      validate("reviewItems", item);
      await assertContextOwnership(item.profileId, item.contextId, { operation: "save-review-item" });
      const existing = await dataStore.query("reviewItems", "profileContextEntity", [item.profileId, item.contextId, item.entityType, item.entityKey]);
      const conflict = existing.find((record) => record.reviewItemId !== item.reviewItemId);
      if (conflict) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "A canonical Practice review item already exists for this context/entity", { operation: "save-review-item", storeName: "reviewItems", recordId: item.reviewItemId });
      return putValidated("reviewItems", item);
    },
    getReviewItem(reviewItemId) { return readValidated("reviewItems", reviewItemId); },
    async listDueReviewItems(profileId = ensureManifest().profileId, contextId = null, dueAtUtc = toPracticeUtcIso(now)) {
      const resolved = await resolveContextId(profileId, contextId);
      const records = await dataStore.query("reviewItems", "contextId", resolved);
      return records.filter((record) => record.profileId === profileId && activeReviewStates.has(record.state) && record.dueAtUtc <= dueAtUtc)
        .sort((a, b) => a.dueAtUtc.localeCompare(b.dueAtUtc) || b.priority - a.priority);
    },
    async listReviewItemsAcrossContexts(profileId = ensureManifest().profileId) { return dataStore.query("reviewItems", "profileId", profileId); },

    async saveCustomText(record) {
      validate("customTexts", record);
      const records = await dataStore.query("customTexts", "profileId", record.profileId);
      const existing = records.find((candidate) => candidate.customTextId === record.customTextId);
      if (!existing && records.length >= PRACTICE_LIMITS.customTextCount) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED, "Practice custom-text limit reached", { operation: "save-custom-text", storeName: "customTexts", recordId: record.customTextId });
      const total = records.reduce((sum, candidate) => sum + (candidate.customTextId === record.customTextId ? 0 : candidate.characterCount), record.characterCount);
      if (total > PRACTICE_LIMITS.customTextTotalCharacters) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED, "Practice total custom-text character limit reached", { operation: "save-custom-text", storeName: "customTexts", recordId: record.customTextId });
      return putValidated("customTexts", record);
    },
    getCustomText(customTextId) { return readValidated("customTexts", customTextId); },
    listCustomTexts(profileId = ensureManifest().profileId) { return dataStore.query("customTexts", "profileId", profileId); },
    deleteCustomText(customTextId) { return dataStore.delete("customTexts", customTextId); },

    async savePreset(record) {
      validate("presets", record);
      const records = await dataStore.query("presets", "profileId", record.profileId);
      if (!records.some((candidate) => candidate.presetId === record.presetId) && records.length >= PRACTICE_LIMITS.presetCount) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED, "Practice preset limit reached", { operation: "save-preset", storeName: "presets", recordId: record.presetId });
      return putValidated("presets", record);
    },
    listPresets(profileId = ensureManifest().profileId) { return dataStore.query("presets", "profileId", profileId); },
    deletePreset(presetId) { return dataStore.delete("presets", presetId); },

    async saveActiveCheckpoint(record) {
      validate("activeSessionCheckpoints", record);
      await assertContextOwnership(record.profileId, record.contextId, { operation: "save-checkpoint" });
      return putValidated("activeSessionCheckpoints", record);
    },
    async getActiveCheckpoint(profileId = ensureManifest().profileId) {
      const checkpoint = await readValidated("activeSessionCheckpoints", profileId);
      if (!checkpoint) return null;
      try { await assertContextOwnership(checkpoint.profileId, checkpoint.contextId, { operation: "restore-checkpoint" }); }
      catch (cause) { throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Practice checkpoint context is missing or invalid", { operation: "restore-checkpoint", storeName: "activeSessionCheckpoints", recordId: profileId, recoverable: true, cause }); }
      return checkpoint;
    },
    clearActiveCheckpoint(profileId = ensureManifest().profileId) { return dataStore.delete("activeSessionCheckpoints", profileId); },

    getStorageHealth() { return { status: ensureManifest().storageHealth, backend: dataStore.kind, databaseOpen: dataStore.isOpen }; },
    runPracticeRetention: runRetention,

    async commitCompletedPracticeSession({ sessionSummary, skillEvidenceDeltas = [], abilityObservation = null, performanceStateDelta = null, updatedSkillStats = null, reviewItemChanges = [], updatedProfileSummary = null, clearCheckpoint = true }) {
      validate("sessionSummaries", sessionSummary);
      if (abilityObservation != null) {
        const abilityValidation = validatePracticeAbilityObservation(abilityObservation);
        if (!abilityValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice ability observation failed validation", { operation: "commit-session", storeName: "abilityStates", recordId: sessionSummary.sessionId, cause: abilityValidation.errors });
        if (abilityObservation.sessionId !== sessionSummary.sessionId || abilityObservation.profileId !== sessionSummary.profileId || abilityObservation.contextId !== sessionSummary.contextId || sessionSummary.abilityMeasurementSummary?.status !== "eligible" || sessionSummary.abilityMeasurementSummary?.channel !== abilityObservation.channel) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice ability observation does not match the completed session measurement contract", { operation: "commit-session", storeName: "abilityStates", recordId: sessionSummary.sessionId });
      }
      if (performanceStateDelta != null) {
        const performanceValidation = validatePracticePerformanceStateDelta(performanceStateDelta);
        if (!performanceValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice performance-state delta failed validation", { operation: "commit-session", storeName: "performanceStates", recordId: sessionSummary.sessionId, cause: performanceValidation.errors });
        const expectedKind = performanceStateDelta.type === "frontier" ? "control-frontier" : "state-probe";
        if (performanceStateDelta.sessionId !== sessionSummary.sessionId || performanceStateDelta.profileId !== sessionSummary.profileId || performanceStateDelta.contextId !== sessionSummary.contextId || sessionSummary.performanceMeasurementSummary?.status !== "measured" || sessionSummary.performanceMeasurementSummary?.measurementKind !== expectedKind) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice performance delta does not match the completed session measurement contract", { operation: "commit-session", storeName: "performanceStates", recordId: sessionSummary.sessionId });
      }
      if (Array.isArray(updatedSkillStats) && updatedSkillStats.length) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Direct full skill-stat replacement is disabled; use canonical skill evidence deltas", { operation: "commit-session", storeName: "skillStats", recordId: sessionSummary.sessionId });
      const batchValidation = validatePracticeSkillEvidenceBatch(skillEvidenceDeltas, { sessionId: sessionSummary.sessionId, profileId: sessionSummary.profileId, contextId: sessionSummary.contextId });
      if (!batchValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice skill evidence batch failed validation", { operation: "commit-session", storeName: "skillStats", recordId: sessionSummary.sessionId, cause: batchValidation.errors });
      reviewItemChanges.filter((change) => change?.action !== "delete").forEach((record) => validate("reviewItems", record));
      if (updatedProfileSummary) validate("profiles", updatedProfileSummary);
      const activeProfileId = ensureManifest().profileId;
      const mismatch = sessionSummary.profileId !== activeProfileId
        || reviewItemChanges.some((change) => change?.action !== "delete" && (change.profileId !== sessionSummary.profileId || change.contextId !== sessionSummary.contextId))
        || (abilityObservation && (abilityObservation.profileId !== sessionSummary.profileId || abilityObservation.contextId !== sessionSummary.contextId))
        || (performanceStateDelta && (performanceStateDelta.profileId !== sessionSummary.profileId || performanceStateDelta.contextId !== sessionSummary.contextId))
        || (updatedProfileSummary && updatedProfileSummary.profileId !== sessionSummary.profileId);
      if (mismatch) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice completion records must belong to the session profile/context", { operation: "commit-session", storeName: "profiles", recordId: sessionSummary.profileId });
      await assertContextOwnership(sessionSummary.profileId, sessionSummary.contextId, { operation: "commit-session" });
      const stores = ["contexts", "sessionSummaries", "skillStats", "abilityStates", "performanceStates", "reviewItems", "profiles", "activeSessionCheckpoints", "meta"];
      const transactionResult = await writeWithQuotaRecovery("commit-session", () => dataStore.runTransaction(stores, "readwrite", async (transaction) => {
        await assertContextOwnership(sessionSummary.profileId, sessionSummary.contextId, { transaction, operation: "commit-session" });
        const existing = await transaction.get("sessionSummaries", sessionSummary.sessionId);
        if (existing) {
          if (equivalent(existing, sessionSummary)) return { committed: false, idempotent: true, profileSummary: await transaction.get("profiles", sessionSummary.profileId) };
          throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.DUPLICATE, "A different completed Practice session already uses this sessionId", { operation: "commit-session", storeName: "sessionSummaries", recordId: sessionSummary.sessionId });
        }
        let mergedAbilityState = null;
        if (abilityObservation) {
          const abilityStateId = createPracticeAbilityStateId(abilityObservation.profileId, abilityObservation.contextId, abilityObservation.channel);
          let abilityState = await transaction.get("abilityStates", abilityStateId);
          if (abilityState) {
            const migration = migratePracticeRecord("abilityState", abilityState);
            if (!migration.ok) throw migration.error;
            abilityState = migration.value;
          } else {
            abilityState = createDefaultPracticeAbilityState({ profileId: abilityObservation.profileId, contextId: abilityObservation.contextId, channel: abilityObservation.channel, now: () => new Date(abilityObservation.completedAtUtc) });
          }
          mergedAbilityState = mergePracticeAbilityObservation(abilityState, abilityObservation);
          const mergedAbilityValidation = validatePracticeAbilityState(mergedAbilityState, { maxBytes: PRACTICE_LIMITS.abilityStateBytes });
          if (!mergedAbilityValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Merged Practice ability state failed validation", { operation: "commit-session", storeName: "abilityStates", recordId: abilityStateId, cause: mergedAbilityValidation.errors });
        }
        let mergedPerformanceState = null;
        if (performanceStateDelta) {
          const performanceStateId = createPracticePerformanceStateId(performanceStateDelta.profileId, performanceStateDelta.contextId);
          let performanceState = await transaction.get("performanceStates", performanceStateId);
          if (performanceState) {
            const migration = migratePracticeRecord("performanceState", performanceState);
            if (!migration.ok) throw migration.error;
            performanceState = migration.value;
          } else {
            performanceState = createDefaultPracticePerformanceState({ profileId: performanceStateDelta.profileId, contextId: performanceStateDelta.contextId, now: () => new Date(sessionSummary.completedAtUtc) });
          }
          mergedPerformanceState = mergePracticePerformanceStateDelta(performanceState, performanceStateDelta);
          const mergedPerformanceValidation = validatePracticePerformanceState(mergedPerformanceState, { maxBytes: PRACTICE_LIMITS.performanceStateBytes });
          if (!mergedPerformanceValidation.valid) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Merged Practice performance state failed validation", { operation: "commit-session", storeName: "performanceStates", recordId: performanceStateId, cause: mergedPerformanceValidation.errors });
        }
        const checkpoint = await transaction.get("activeSessionCheckpoints", sessionSummary.profileId);
        if (checkpoint && (checkpoint.profileId !== sessionSummary.profileId || checkpoint.contextId !== sessionSummary.contextId)) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Practice checkpoint does not match the completing session context", { operation: "commit-session", storeName: "activeSessionCheckpoints", recordId: sessionSummary.profileId, recoverable: true });
        if (updatedProfileSummary) await assertContextOwnership(updatedProfileSummary.profileId, updatedProfileSummary.activeContextId, { transaction, operation: "commit-session-profile" });
        for (const change of reviewItemChanges) if (change?.action === "delete") {
          const existingReview = await transaction.get("reviewItems", change.reviewItemId);
          if (existingReview && (existingReview.profileId !== sessionSummary.profileId || existingReview.contextId !== sessionSummary.contextId)) throw practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED, "Deleted review does not belong to the completing session context", { operation: "commit-session", storeName: "reviewItems", recordId: change.reviewItemId, recoverable: true });
        }
        const mergedStats = [];
        for (const delta of skillEvidenceDeltas) {
          let stat = await transaction.get("skillStats", delta.statId);
          if (stat) {
            const migration = migratePracticeRecord("skillStat", stat);
            if (!migration.ok) throw migration.error;
            stat = migration.value;
          } else {
            stat = createDefaultSkillStat({ statId: delta.statId, profileId: delta.profileId, contextId: delta.contextId, entityType: delta.entityType, entityKey: delta.entityKey, now: () => new Date(delta.observedAt) });
          }
          const merged = mergePracticeSkillEvidence(stat, delta);
          validate("skillStats", merged);
          mergedStats.push(merged);
        }
        for (const merged of mergedStats) await transaction.put("skillStats", merged);
        if (mergedAbilityState) await transaction.put("abilityStates", mergedAbilityState);
        if (mergedPerformanceState) await transaction.put("performanceStates", mergedPerformanceState);
        for (const change of reviewItemChanges) {
          if (change?.action === "delete") await transaction.delete("reviewItems", change.reviewItemId);
          else await transaction.put("reviewItems", change);
        }
        if (updatedProfileSummary) await transaction.put("profiles", updatedProfileSummary);
        await transaction.put("sessionSummaries", sessionSummary);
        if (clearCheckpoint) await transaction.delete("activeSessionCheckpoints", sessionSummary.profileId);
        await transaction.put("meta", { key: "manifestReconciliation", status: "pending", sessionId: sessionSummary.sessionId, createdAt: toPracticeUtcIso(now), updatedAt: toPracticeUtcIso(now) });
        return { committed: true, idempotent: false, mergedSkillStatCount: mergedStats.length, abilityUpdated: Boolean(mergedAbilityState), performanceUpdated: Boolean(mergedPerformanceState) };
      }));
      try {
        const reconciliationProfile = transactionResult.profileSummary ?? updatedProfileSummary;
        saveManifestPatch({
          lastCompletedSessionAt: sessionSummary.status === "completed" ? sessionSummary.completedAtUtc : ensureManifest().lastCompletedSessionAt,
          dashboardSummary: reconciliationProfile?.dashboardSummary ?? ensureManifest().dashboardSummary,
          storageHealth: "healthy",
        });
        await dataStore.put("meta", { key: "manifestReconciliation", status: "resolved", sessionId: sessionSummary.sessionId, createdAt: sessionSummary.completedAtUtc, updatedAt: toPracticeUtcIso(now) });
        const { profileSummary: _profileSummary, ...publicResult } = transactionResult;
        return { ...publicResult, manifestUpdated: true };
      } catch (cause) {
        const { profileSummary: _profileSummary, ...publicResult } = transactionResult;
        return { ...publicResult, manifestUpdated: false, recoveryRequired: true, error: practiceStorageError(PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED, "Session committed, but the Practice manifest requires reconciliation", { operation: "commit-session-manifest", recoverable: true, cause }) };
      }
    },

    async resetPracticeData() {
      for (const storeName of PRACTICE_STORE_NAMES) await dataStore.clearStore(storeName);
      manifestStore.clear();
      manifest = null;
      return true;
    },
  };
  return Object.freeze(repository);
}
