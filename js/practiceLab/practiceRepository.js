import { createPracticeRepository as createPracticeRepositoryV30 } from "./practiceRepositoryV30.js";
import { createPracticeCustomTextRepositoryFacade } from "./practiceCustomTextRepository.js";

export function createPracticeRepository(options = {}) {
  const core = createPracticeRepositoryV30(options);
  if (!options.dataStore) return core;
  const custom = createPracticeCustomTextRepositoryFacade({ dataStore: options.dataStore, now: options.now ?? Date.now });

  async function resetPracticeData(resetOptions = {}) {
    const deleteUserContent = resetOptions === true || resetOptions?.deleteUserContent === true;
    if (deleteUserContent) return core.resetPracticeData();
    const activeProfile = await core.getPracticeProfile?.().catch?.(() => null) ?? null;
    const rawCustomTexts = await options.dataStore.list("customTexts").catch(() => []);
    await core.resetPracticeData();
    const initialized = await core.initializePracticeStorage();
    for (const raw of rawCustomTexts) {
      const rebound = activeProfile && raw?.profileId === activeProfile.profileId
        ? { ...raw, profileId: initialized.profile.profileId }
        : raw;
      await options.dataStore.put("customTexts", rebound);
    }
    return true;
  }

  return Object.freeze({
    ...core,
    ...custom,
    resetPracticeData,
  });
}
