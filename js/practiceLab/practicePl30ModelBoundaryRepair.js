import { PRACTICE_DATABASE_VERSION } from "./practiceConstants.js";
import { getPracticeStoreKey } from "./practiceStorageContract.js";

export const PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_VERSION = 1;
export const PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_META_KEY = "gc2Pl30ModelBoundaryRepair";

// These values were reserved by the historical V30 entity model but PL30 never
// owns them as persistent PL11 entities. They are retained here only as cleanup
// sentinels for legacy DB12 data.
export const PRACTICE_PL30_RETIRED_PERSISTENT_ENTITY_TYPES = Object.freeze([
  "punctuation-transition",
  "number-pattern",
  "symbol-pattern",
]);

const REPAIR_STORES = Object.freeze(["skillStats", "learningStates", "reviewItems"]);
const RETIRED = new Set(PRACTICE_PL30_RETIRED_PERSISTENT_ENTITY_TYPES);

function currentTimestamp(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return date.toISOString();
}

function completedMarker(marker) {
  return marker
    && marker.key === PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_META_KEY
    && marker.repairVersion === PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_VERSION
    && marker.status === "complete";
}

export function isRetiredPracticePl30PersistentEntityType(entityType) {
  return RETIRED.has(entityType);
}

export async function reconcilePracticePl30ModelBoundary(dataStore, { now = Date.now } = {}) {
  if (!dataStore?.runTransaction) throw new TypeError("Practice data store with transaction support is required");

  const existing = await dataStore.get("meta", PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_META_KEY);
  if (completedMarker(existing)) return Object.freeze({ ...existing, alreadyComplete: true });

  return dataStore.runTransaction([...REPAIR_STORES, "meta"], "readwrite", async (transaction) => {
    const marker = await transaction.get("meta", PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_META_KEY);
    if (completedMarker(marker)) return Object.freeze({ ...marker, alreadyComplete: true });

    const removedByStore = {};
    const removedEntityTypes = new Set();
    for (const storeName of REPAIR_STORES) {
      let removed = 0;
      const rows = await transaction.list(storeName);
      for (const row of rows) {
        if (!isRetiredPracticePl30PersistentEntityType(row?.entityType)) continue;
        const key = getPracticeStoreKey(storeName, row);
        if (key == null || (Array.isArray(key) && key.some((entry) => entry == null))) continue;
        await transaction.delete(storeName, key);
        removed += 1;
        removedEntityTypes.add(row.entityType);
      }
      removedByStore[storeName] = removed;
    }

    const result = Object.freeze({
      key: PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_META_KEY,
      repairVersion: PRACTICE_PL30_MODEL_BOUNDARY_REPAIR_VERSION,
      status: "complete",
      strategy: "explicit-cleanup-migration",
      databaseVersion: PRACTICE_DATABASE_VERSION,
      removedByStore: Object.freeze({ ...removedByStore }),
      removedEntityTypes: Object.freeze([...removedEntityTypes].sort()),
      completedAt: currentTimestamp(now),
    });
    await transaction.put("meta", result);
    return result;
  });
}
