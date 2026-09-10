import { createPracticeRepository as createPracticeRepositoryV30 } from "./practiceRepositoryV30.js";
import { createPracticeCustomTextRepositoryFacade } from "./practiceCustomTextRepository.js";

export function createPracticeRepository(options = {}) {
  if (!options.dataStore) return createPracticeRepositoryV30(options);

  const dataStore = options.dataStore;
  let preserveCustomTextDuringReset = false;
  const coreDataStore = new Proxy(dataStore, {
    get(target, property, receiver) {
      if (property === "clearStore") {
        return async (storeName) => {
          if (preserveCustomTextDuringReset && storeName === "customTexts") return true;
          return target.clearStore(storeName);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
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

    // Preserve the historical empty-reset contract: do not recreate a profile/context
    // merely because Custom Text support exists. Recreate identity only when user-authored
    // documents actually need an owner after the Practice reset.
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
