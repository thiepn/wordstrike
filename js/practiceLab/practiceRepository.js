import {
  PRACTICE_LIMITS,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_NAMES,
} from "./practiceConstants.js";
import {
  createDefaultPracticeProfile,
} from "./practiceDefaults.js";
import {
  createPracticeQuarantineId,
  createSkillStatId,
} from "./practiceIds.js";
import { buildPracticeRetentionPlan } from "./practiceRetention.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  clonePracticeValue,
  isQuotaExceededError,
  practiceStorageError,
} from "./practiceStorageContract.js";
import {
  validateCheckpoint,
  validateCustomText,
  validatePracticeProfile,
  validatePracticeSettings,
  validatePreset,
  validateReviewItem,
  validateSessionSummary,
  validateSkillStat,
} from "./practiceValidation.js";
import { toPracticeUtcIso } from "./practiceTime.js";

const validators = Object.freeze({
  profiles: validatePracticeProfile,
  skillStats: validateSkillStat,
  sessionSummaries: validateSessionSummary,
  reviewItems: validateReviewItem,
  customTexts: validateCustomText,
  presets: validatePreset,
  activeSessionCheckpoints: validateCheckpoint,
});

const activeReviewStates = new Set(["new", "due", "learning", "improving", "stable"]);

function validationError(storeName, record, validation, operation = "save") {
  const id = record?.sessionId
    || record?.profileId
    || record?.statId
    || record?.reviewItemId
    || record?.customTextId
    || record?.presetId
    || null;
  return practiceStorageError(
    PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED,
    `Practice ${storeName} record failed validation`,
    { operation, storeName, recordId: id, recoverable: true, cause: validation.errors },
  );
}

export function createPracticeRepository({
  dataStore,
  manifestStore,
  now = Date.now,
} = {}) {
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
    const next = {
      ...current,
      ...patch,
      updatedAt: toPracticeUtcIso(now),
    };
    const result = manifestStore.save(next);
    manifest = result.manifest;
    return manifest;
  };

  const quarantine = async (storeName, record, reason) => {
    const detectedAt = toPracticeUtcIso(now);
    const entry = {
      quarantineId: createPracticeQuarantineId(),
      recordVersion: PRACTICE_RECORD_VERSIONS.quarantine,
      createdAt: detectedAt,
      updatedAt: detectedAt,
      sourceStore: storeName,
      sourceKey: String(record?.sessionId || record?.profileId || record?.statId || "unknown"),
      reason: String(reason).slice(0, 300),
      detectedAt,
      originalRecord: record,
    };
    await dataStore.put("quarantine", entry);
    return entry;
  };

  const readValidated = async (storeName, key) => {
    const record = await dataStore.get(storeName, key);
    if (!record) return null;
    const outcome = validators[storeName]?.(record);
    if (!outcome || outcome.valid) return record;
    await quarantine(storeName, record, "record-validation-failed");
    await dataStore.delete(storeName, key);
    throw validationError(storeName, record, outcome, "read");
  };

  const runRetention = async () => {
    const [
      checkpoints,
      sessionSummaries,
      skillStats,
      reviewItems,
      quarantineRecords,
    ] = await Promise.all([
      dataStore.list("activeSessionCheckpoints"),
      dataStore.list("sessionSummaries"),
      dataStore.list("skillStats"),
      dataStore.list("reviewItems"),
      dataStore.list("quarantine"),
    ]);
    const plan = buildPracticeRetentionPlan({
      now,
      checkpoints,
      sessionSummaries,
      skillStats,
      reviewItems,
      quarantine: quarantineRecords,
    });
    const deletions = [
      ["activeSessionCheckpoints", plan.activeSessionCheckpoints],
      ["sessionSummaries", plan.sessionSummaries],
      ["reviewItems", plan.reviewItems],
      ["skillStats", plan.skillStats],
      ["quarantine", plan.quarantine],
    ];
    await dataStore.runTransaction(deletions.map(([store]) => store), "readwrite", async (transaction) => {
      for (const [storeName, ids] of deletions) {
        for (const id of ids) await transaction.delete(storeName, id);
      }
    });
    return plan;
  };

  const writeWithQuotaRecovery = async (operation, write) => {
    try {
      return await write();
    } catch (firstError) {
      if (!isQuotaExceededError(firstError)) throw firstError;
      await runRetention();
      try {
        return await write();
      } catch (secondError) {
        if (!isQuotaExceededError(secondError)) throw secondError;
        try { saveManifestPatch({ storageHealth: "quota-exceeded" }); } catch {}
        throw practiceStorageError(
          PRACTICE_STORAGE_ERROR_CODES.QUOTA_EXCEEDED,
          "Practice storage quota remained exceeded after one recovery attempt",
          { operation, recoverable: true, cause: secondError },
        );
      }
    }
  };

  const putValidated = (storeName, record) => {
    validate(storeName, record);
    return writeWithQuotaRecovery(`put:${storeName}`, () => dataStore.put(storeName, record));
  };

  const repository = {
    async initializePracticeStorage() {
      const manifestResult = manifestStore.load();
      manifest = manifestResult.manifest;
      await dataStore.open();
      let profile = await readValidated("profiles", manifest.profileId);
      if (!profile) {
        profile = createDefaultPracticeProfile({
          profileId: manifest.profileId,
          now,
          keyboardLayout: manifest.settings.keyboardLayout,
        });
        await putValidated("profiles", profile);
      }
      await dataStore.put("meta", {
        key: "schemaVersion",
        value: 1,
        createdAt: manifest.createdAt,
        updatedAt: toPracticeUtcIso(now),
      });
      return { manifest, profile, recovery: manifestResult.recovery, backend: dataStore.kind };
    },

    async getPracticeProfile() {
      return readValidated("profiles", ensureManifest().profileId);
    },

    async savePracticeProfile(profile) {
      if (profile.profileId !== ensureManifest().profileId) throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED,
        "Practice profile does not match the active manifest profile",
        { operation: "save-profile", storeName: "profiles", recordId: profile.profileId },
      );
      return putValidated("profiles", profile);
    },

    getPracticeSettings() {
      return clonePracticeValue(ensureManifest().settings);
    },

    savePracticeSettings(settings) {
      const outcome = validatePracticeSettings(settings);
      if (!outcome.valid) throw validationError("manifest.settings", settings, outcome);
      return saveManifestPatch({ settings: clonePracticeValue(settings) }).settings;
    },

    getSkillStat(profileId, entityType, entityKey) {
      return readValidated("skillStats", createSkillStatId(profileId, entityType, entityKey));
    },

    saveSkillStat(stat) {
      return putValidated("skillStats", stat);
    },

    async listSkillStats(profileId = ensureManifest().profileId) {
      const records = await dataStore.query("skillStats", "profileId", profileId);
      return records.filter((record) => validateSkillStat(record).valid);
    },

    async saveSessionSummary(summary) {
      validate("sessionSummaries", summary);
      const previous = await dataStore.get("sessionSummaries", summary.sessionId);
      if (previous) {
        if (JSON.stringify(previous) === JSON.stringify(summary)) {
          return { saved: false, idempotent: true, summary: previous };
        }
        throw practiceStorageError(
          PRACTICE_STORAGE_ERROR_CODES.DUPLICATE,
          "A different Practice session summary already uses this sessionId",
          { operation: "save-session", storeName: "sessionSummaries", recordId: summary.sessionId },
        );
      }
      await putValidated("sessionSummaries", summary);
      return { saved: true, idempotent: false, summary };
    },

    getSessionSummary(sessionId) {
      return readValidated("sessionSummaries", sessionId);
    },

    async listSessionSummaries(profileId = ensureManifest().profileId) {
      return dataStore.query("sessionSummaries", "profileId", profileId);
    },

    async saveReviewItem(item) {
      validate("reviewItems", item);
      const existing = await dataStore.query("reviewItems", "profileEntity", [
        item.profileId, item.entityType, item.entityKey,
      ]);
      const conflict = existing.find((record) => (
        record.reviewItemId !== item.reviewItemId
        && activeReviewStates.has(record.state)
        && activeReviewStates.has(item.state)
      ));
      if (conflict) throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.DUPLICATE,
        "An active Practice review item already exists for this entity",
        { operation: "save-review-item", storeName: "reviewItems", recordId: item.reviewItemId },
      );
      return putValidated("reviewItems", item);
    },

    getReviewItem(reviewItemId) {
      return readValidated("reviewItems", reviewItemId);
    },

    async listDueReviewItems(profileId = ensureManifest().profileId, dueAtUtc = toPracticeUtcIso(now)) {
      const records = await dataStore.query("reviewItems", "profileId", profileId);
      return records
        .filter((record) => activeReviewStates.has(record.state) && record.dueAtUtc <= dueAtUtc)
        .sort((a, b) => a.dueAtUtc.localeCompare(b.dueAtUtc) || b.priority - a.priority);
    },

    async saveCustomText(record) {
      validate("customTexts", record);
      const records = await dataStore.query("customTexts", "profileId", record.profileId);
      const existing = records.find((candidate) => candidate.customTextId === record.customTextId);
      if (!existing && records.length >= PRACTICE_LIMITS.customTextCount) throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED,
        "Practice custom-text limit reached",
        { operation: "save-custom-text", storeName: "customTexts", recordId: record.customTextId },
      );
      const total = records.reduce((sum, candidate) => (
        sum + (candidate.customTextId === record.customTextId ? 0 : candidate.characterCount)
      ), record.characterCount);
      if (total > PRACTICE_LIMITS.customTextTotalCharacters) throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED,
        "Practice total custom-text character limit reached",
        { operation: "save-custom-text", storeName: "customTexts", recordId: record.customTextId },
      );
      return putValidated("customTexts", record);
    },

    getCustomText(customTextId) {
      return readValidated("customTexts", customTextId);
    },

    listCustomTexts(profileId = ensureManifest().profileId) {
      return dataStore.query("customTexts", "profileId", profileId);
    },

    deleteCustomText(customTextId) {
      return dataStore.delete("customTexts", customTextId);
    },

    async savePreset(record) {
      validate("presets", record);
      const records = await dataStore.query("presets", "profileId", record.profileId);
      if (!records.some((candidate) => candidate.presetId === record.presetId) && records.length >= PRACTICE_LIMITS.presetCount) throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED,
        "Practice preset limit reached",
        { operation: "save-preset", storeName: "presets", recordId: record.presetId },
      );
      return putValidated("presets", record);
    },

    listPresets(profileId = ensureManifest().profileId) {
      return dataStore.query("presets", "profileId", profileId);
    },

    deletePreset(presetId) {
      return dataStore.delete("presets", presetId);
    },

    saveActiveCheckpoint(record) {
      return putValidated("activeSessionCheckpoints", record);
    },

    getActiveCheckpoint(profileId = ensureManifest().profileId) {
      return readValidated("activeSessionCheckpoints", profileId);
    },

    clearActiveCheckpoint(profileId = ensureManifest().profileId) {
      return dataStore.delete("activeSessionCheckpoints", profileId);
    },

    getStorageHealth() {
      return {
        status: ensureManifest().storageHealth,
        backend: dataStore.kind,
        databaseOpen: dataStore.isOpen,
      };
    },

    runPracticeRetention: runRetention,

    async commitCompletedPracticeSession({
      sessionSummary,
      updatedSkillStats = [],
      reviewItemChanges = [],
      updatedProfileSummary = null,
      clearCheckpoint = true,
    }) {
      validate("sessionSummaries", sessionSummary);
      updatedSkillStats.forEach((record) => validate("skillStats", record));
      reviewItemChanges.filter((change) => change?.action !== "delete")
        .forEach((record) => validate("reviewItems", record));
      if (updatedProfileSummary) validate("profiles", updatedProfileSummary);

      const stores = ["sessionSummaries", "skillStats", "reviewItems", "profiles", "activeSessionCheckpoints", "meta"];
      const transactionResult = await writeWithQuotaRecovery("commit-session", () => (
        dataStore.runTransaction(stores, "readwrite", async (transaction) => {
          const existing = await transaction.get("sessionSummaries", sessionSummary.sessionId);
          if (existing) {
            if (JSON.stringify(existing) === JSON.stringify(sessionSummary)) {
              return { committed: false, idempotent: true };
            }
            throw practiceStorageError(
              PRACTICE_STORAGE_ERROR_CODES.DUPLICATE,
              "A different completed Practice session already uses this sessionId",
              { operation: "commit-session", storeName: "sessionSummaries", recordId: sessionSummary.sessionId },
            );
          }
          await transaction.put("sessionSummaries", sessionSummary);
          for (const stat of updatedSkillStats) await transaction.put("skillStats", stat);
          for (const change of reviewItemChanges) {
            if (change?.action === "delete") await transaction.delete("reviewItems", change.reviewItemId);
            else await transaction.put("reviewItems", change);
          }
          if (updatedProfileSummary) await transaction.put("profiles", updatedProfileSummary);
          if (clearCheckpoint) await transaction.delete("activeSessionCheckpoints", sessionSummary.profileId);
          await transaction.put("meta", {
            key: "manifestReconciliation",
            status: "pending",
            sessionId: sessionSummary.sessionId,
            createdAt: toPracticeUtcIso(now),
            updatedAt: toPracticeUtcIso(now),
          });
          return { committed: true, idempotent: false };
        })
      ));
      if (transactionResult.idempotent) return { ...transactionResult, manifestUpdated: true };

      try {
        saveManifestPatch({
          lastCompletedSessionAt: sessionSummary.completedAtUtc,
          dashboardSummary: updatedProfileSummary?.dashboardSummary
            ?? ensureManifest().dashboardSummary,
          storageHealth: "healthy",
        });
        await dataStore.put("meta", {
          key: "manifestReconciliation",
          status: "resolved",
          sessionId: sessionSummary.sessionId,
          createdAt: sessionSummary.completedAtUtc,
          updatedAt: toPracticeUtcIso(now),
        });
        return { ...transactionResult, manifestUpdated: true };
      } catch (cause) {
        return {
          ...transactionResult,
          manifestUpdated: false,
          recoveryRequired: true,
          error: practiceStorageError(
            PRACTICE_STORAGE_ERROR_CODES.RECOVERY_REQUIRED,
            "Session committed, but the Practice manifest requires reconciliation",
            { operation: "commit-session-manifest", recoverable: true, cause },
          ),
        };
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
