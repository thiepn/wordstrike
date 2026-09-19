import {
  PRACTICE_LIMITS,
  PRACTICE_MANIFEST_BACKUP_KEY,
  PRACTICE_MANIFEST_KEY,
  PRACTICE_MANIFEST_TEMP_KEY,
} from "./practiceConstants.js";
import { createDefaultPracticeManifest } from "./practiceDefaults.js";
import { migratePracticeManifest } from "./practiceMigrations.js";
import {
  PRACTICE_STORAGE_ERROR_CODES,
  isQuotaExceededError,
  practiceStorageError,
} from "./practiceStorageContract.js";
import { validatePracticeManifest } from "./practiceValidation.js";

const bytes = (value) => new TextEncoder().encode(value).byteLength;

function parseValid(raw) {
  if (!raw) return null;
  try {
    const migrated = migratePracticeManifest(JSON.parse(raw));
    return migrated.ok ? migrated.value : null;
  } catch {
    return null;
  }
}

export function createPracticeManifestStore({
  storage = globalThis.localStorage,
  createDefault = createDefaultPracticeManifest,
  defaultOptions = {},
} = {}) {
  const requireStorage = () => {
    if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) {
      throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.UNAVAILABLE,
        "localStorage is unavailable for the Practice manifest",
        { operation: "manifest", recoverable: true },
      );
    }
  };

  const save = (manifest) => {
    requireStorage();
    const validation = validatePracticeManifest(manifest);
    if (!validation.valid) throw practiceStorageError(
      PRACTICE_STORAGE_ERROR_CODES.VALIDATION_FAILED,
      "Practice manifest validation failed",
      { operation: "manifest-write", recoverable: true, cause: validation.errors },
    );
    const serialized = JSON.stringify(manifest);
    if (bytes(serialized) > PRACTICE_LIMITS.manifestBytes) throw practiceStorageError(
      PRACTICE_STORAGE_ERROR_CODES.LIMIT_REACHED,
      "Practice manifest exceeds its 64 KiB budget",
      { operation: "manifest-write", recoverable: true },
    );
    const previous = storage.getItem(PRACTICE_MANIFEST_KEY);
    const previousValid = parseValid(previous);
    try {
      storage.setItem(PRACTICE_MANIFEST_TEMP_KEY, serialized);
      if (previousValid) storage.setItem(PRACTICE_MANIFEST_BACKUP_KEY, previous);
      storage.setItem(PRACTICE_MANIFEST_KEY, serialized);
      storage.removeItem(PRACTICE_MANIFEST_TEMP_KEY);
      return { ok: true, manifest, recovery: "none" };
    } catch (cause) {
      try { storage.removeItem(PRACTICE_MANIFEST_TEMP_KEY); } catch {}
      if (isQuotaExceededError(cause)) {
        // The normal crash-safe write briefly needs a second full manifest
        // copy. Near localStorage quota, overwriting the primary in place can
        // still succeed because it does not require that temporary headroom.
        try {
          storage.setItem(PRACTICE_MANIFEST_KEY, serialized);
          return { ok: true, manifest, recovery: "quota-direct" };
        } catch (directCause) {
          if (isQuotaExceededError(directCause)) {
            throw practiceStorageError(
              PRACTICE_STORAGE_ERROR_CODES.QUOTA_EXCEEDED,
              "Practice manifest could not be updated because localStorage quota is exhausted",
              { operation: "manifest-write", recoverable: true, cause: directCause },
            );
          }
          throw practiceStorageError(
            PRACTICE_STORAGE_ERROR_CODES.TRANSACTION_FAILED,
            "Practice manifest direct recovery write failed",
            { operation: "manifest-write", recoverable: true, cause: directCause },
          );
        }
      }
      throw practiceStorageError(
        PRACTICE_STORAGE_ERROR_CODES.TRANSACTION_FAILED,
        "Practice manifest write failed",
        { operation: "manifest-write", recoverable: true, cause },
      );
    }
  };

  return Object.freeze({
    load() {
      requireStorage();
      const primaryRaw = storage.getItem(PRACTICE_MANIFEST_KEY);
      const primary = parseValid(primaryRaw);
      if (primary) {
        let recovery = "none";
        if (primaryRaw !== JSON.stringify(primary)) {
          try {
            recovery = save(primary).recovery;
          } catch (error) {
            if (error?.code !== PRACTICE_STORAGE_ERROR_CODES.QUOTA_EXCEEDED) throw error;
            // Reads must remain usable when the browser is out of localStorage.
            // The migrated manifest is valid in memory; IndexedDB Practice data
            // and Daily Coach can continue without rewriting this metadata now.
            recovery = "quota-readonly";
          }
        }
        return { ok: true, manifest: primary, recovery };
      }
      const backupRaw = storage.getItem(PRACTICE_MANIFEST_BACKUP_KEY);
      const backup = parseValid(backupRaw);
      if (backup) {
        try {
          const saved = save(backup);
          return { ok: true, manifest: backup, recovery: saved.recovery === "quota-direct" ? "backup-quota-direct" : "backup" };
        } catch (error) {
          if (error?.code !== PRACTICE_STORAGE_ERROR_CODES.QUOTA_EXCEEDED) throw error;
          try { storage.removeItem(PRACTICE_MANIFEST_TEMP_KEY); } catch {}
          // Keep the valid backup usable in memory rather than blocking the
          // whole Practice Lab because localStorage cannot restore the primary.
          return { ok: true, manifest: backup, recovery: "backup-quota-readonly" };
        }
      }
      const manifest = createDefault({
        ...defaultOptions,
        overrides: {
          ...(defaultOptions.overrides || {}),
          storageHealth: primaryRaw || backupRaw ? "recovery-required" : "healthy",
        },
      });
      save(manifest);
      return {
        ok: true,
        manifest,
        recovery: primaryRaw || backupRaw ? "defaults-after-corruption" : "created",
      };
    },
    save,
    clear() {
      requireStorage();
      storage.removeItem(PRACTICE_MANIFEST_KEY);
      storage.removeItem(PRACTICE_MANIFEST_BACKUP_KEY);
      storage.removeItem(PRACTICE_MANIFEST_TEMP_KEY);
      return true;
    },
  });
}
