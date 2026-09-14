import { createPracticeRepository as createPracticeRepositoryV30 } from "./practiceRepositoryV30.js";
import { PRACTICE_STORE_NAMES } from "./practiceConstants.js";
import { getPracticeStoreKey } from "./practiceStorageContract.js";
import { createPracticeCustomTextRepositoryFacade } from "./practiceCustomTextRepository.js";

const PROFILE_RESET_META_KEYS = Object.freeze(["pl5ContextIdentity", "manifestReconciliation"]);
const PROFILE_RESET_STORES = Object.freeze(PRACTICE_STORE_NAMES.filter((storeName) => !["meta", "customTexts"].includes(storeName)));

function belongsToProfile(storeName, record, profileId) {
  if (!record || typeof record !== "object") return false;
  if (record.profileId === profileId) return true;
  if (storeName === "quarantine" && record.originalRecord?.profileId === profileId) return true;
  return false;
}

export function createPracticeRepository(options = {}) {
  if (!options.dataStore) return createPracticeRepositoryV30(options);

  const dataStore = options.dataStore;
  const core = createPracticeRepositoryV30({ ...options, dataStore });
  const custom = createPracticeCustomTextRepositoryFacade({ dataStore, now: options.now ?? Date.now });

  async function resetActiveProfileData(profileId) {
    const stores = [...PROFILE_RESET_STORES, "meta"];
    await dataStore.runTransaction(stores, "readwrite", async (transaction) => {
      for (const storeName of PROFILE_RESET_STORES) {
        const rows = await transaction.list(storeName);
        for (const row of rows) {
          if (!belongsToProfile(storeName, row, profileId)) continue;
          const key = getPracticeStoreKey(storeName, row);
          if (key != null && (!Array.isArray(key) || key.every((entry) => entry != null))) await transaction.delete(storeName, key);
        }
      }
      for (const key of PROFILE_RESET_META_KEYS) await transaction.delete("meta", key);
    });
  }

  async function resetPracticeData(resetOptions = {}) {
    const deleteUserContent = resetOptions === true || resetOptions?.deleteUserContent === true;
    if (deleteUserContent) return core.resetPracticeData();

    const activeProfile = await core.getPracticeProfile?.();
    if (!activeProfile?.profileId) return core.resetPracticeData();

    await resetActiveProfileData(activeProfile.profileId);
    await core.initializePracticeStorage();
    return true;
  }

  return Object.freeze({
    ...core,
    ...custom,
    resetPracticeData,
  });
}
