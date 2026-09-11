import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { reconcilePracticeTreatmentTracking } from "./practiceTreatmentReconciliation.js";
import { buildPracticeTreatmentResponseViewModel } from "./practiceTreatmentResponseViewModel.js";

export function createPracticeTreatmentResponseRuntime({
  repository = null,
  dataStore = null,
  manifestStore = null,
  now = () => new Date(),
} = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const repo = repository ?? createPracticeRepository({
    dataStore: ownedDataStore,
    manifestStore: manifestStore ?? createPracticeManifestStore(),
    now,
  });
  let initializedPromise = null;
  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();

  async function getSnapshot() {
    try {
      const initialized = await initialize();
      const profileId = initialized.profile.profileId;
      const contextId = initialized.context.contextId;
      await reconcilePracticeTreatmentTracking({ repository: repo, profileId, contextId, now });
      const [states, episodes] = await Promise.all([
        repo.listTreatmentResponseStates(profileId, { contextId }),
        repo.listTreatmentEpisodes(profileId, { contextId, limit: 200 }),
      ]);
      return buildPracticeTreatmentResponseViewModel({ states, episodes, status: "ready" });
    } catch (error) {
      return buildPracticeTreatmentResponseViewModel({
        status: "unavailable",
        errorCode: error?.code ?? "TREATMENT_RESPONSE_UNAVAILABLE",
      });
    }
  }

  return Object.freeze({
    getSnapshot,
    async refresh() { return getSnapshot(); },
    close() {
      initializedPromise = null;
      ownedDataStore?.close?.();
    },
  });
}
