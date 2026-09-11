import { createPracticeRepository as createPracticeRepositoryV30 } from "./practiceRepositoryV30.js";
import { createPracticeCustomTextRepositoryFacade } from "./practiceCustomTextRepository.js";

export function createPracticeRepository(options = {}) {
  if (!options.dataStore) return createPracticeRepositoryV30(options);

  const dataStore = options.dataStore;
  let preserveCustomTextDuringReset = false;

  const coreDataStore = Object.freeze({
    get kind() { return dataStore.kind; },
    get isOpen() { return dataStore.isOpen; },
    async open() { await dataStore.open(); return this; },
    close() { return dataStore.close(); },
    get(storeName, key) { return dataStore.get(storeName, key); },
    put(storeName, record) { return dataStore.put(storeName, record); },
    delete(storeName, key) { return dataStore.delete(storeName, key); },
    list(storeName) { return dataStore.list(storeName); },
    query(storeName, indexName, query) { return dataStore.query(storeName, indexName, query); },
    clearStore(storeName) {
      if (preserveCustomTextDuringReset && storeName === "customTexts") return Promise.resolve(true);
      return dataStore.clearStore(storeName);
    },
    runTransaction(storeNames, mode, callback) { return dataStore.runTransaction(storeNames, mode, callback); },
    deleteDatabase() { return dataStore.deleteDatabase(); },
  });

  const core = createPracticeRepositoryV30({ ...options, dataStore: coreDataStore });
  const custom = createPracticeCustomTextRepositoryFacade({ dataStore, now: options.now ?? Date.now });

  async function resetPracticeData(resetOptions = {}) {
    const deleteUserContent = resetOptions === true || resetOptions?.deleteUserContent === true;
    if (deleteUserContent) return core.resetPracticeData();

    const activeProfile = await core.getPracticeProfile?.().catch?.(() => null) ?? null;
    const rawCustomTexts = await dataStore.list("customTexts").catch(() => []);
    const ownedCustomTexts = activeProfile
      ? rawCustomTexts.filter((raw) => raw?.profileId === activeProfile.profileId)
      : [];

    preserveCustomTextDuringReset = true;
    try {
      await core.resetPracticeData();
    } finally {
      preserveCustomTextDuringReset = false;
    }

    if (!ownedCustomTexts.length) return true;

    const initialized = await core.initializePracticeStorage();
    for (const raw of ownedCustomTexts) {
      await dataStore.put("customTexts", { ...raw, profileId: initialized.profile.profileId });
    }
    return true;
  }

  return Object.freeze({
    ...core,
    ...custom,
    resetPracticeData,
  });
}
