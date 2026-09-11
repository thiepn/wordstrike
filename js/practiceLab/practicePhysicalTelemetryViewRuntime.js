import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticePhysicalTelemetryRepositoryFacade } from "./practicePhysicalTelemetryService.js";
import { getPracticePhysicalTelemetryAvailability } from "./practicePhysicalTelemetryAvailability.js";
import { setPracticePhysicalTelemetryEnabled } from "./practicePhysicalTelemetrySettings.js";

export function createPracticePhysicalTelemetryViewRuntime({
  repository = null,
  dataStore = null,
  manifestStore = null,
  now = () => new Date(),
  codeApiSupported = typeof globalThis.KeyboardEvent !== "undefined",
} = {}) {
  const ownedDataStore = repository ? null : (dataStore ?? createPracticeIndexedDbStore());
  const store = dataStore ?? ownedDataStore;
  if (!repository && !store) throw new TypeError("Physical telemetry view runtime requires a data store");
  const localManifestStore = manifestStore ?? createPracticeManifestStore();
  const repo = repository ?? createPracticeRepository({ dataStore: store, manifestStore: localManifestStore, now });
  const telemetry = store ? createPracticePhysicalTelemetryRepositoryFacade({ dataStore: store, now }) : null;
  let initializedPromise = null;

  const initialize = () => initializedPromise ??= repo.initializePracticeStorage();

  async function getState() {
    const initialized = await initialize();
    const profileId = initialized.profile.profileId;
    const contextId = initialized.context.contextId;
    const manifest = localManifestStore.load().manifest;
    const availability = getPracticePhysicalTelemetryAvailability({
      settings: manifest.settings,
      context: initialized.context,
      codeApiSupported,
    });
    const [stats, sessions] = telemetry
      ? await Promise.all([
          telemetry.listPhysicalTelemetryStats(profileId, contextId),
          telemetry.listPhysicalTelemetrySessions(profileId, contextId),
        ])
      : [[], []];
    const snapshot = telemetry
      ? await telemetry.getPhysicalTelemetrySnapshot(profileId, contextId)
      : Object.freeze({ coverage: Object.freeze({}), keys: Object.freeze([]), transitions: Object.freeze([]), modifierRoutes: Object.freeze([]), updatedAt: null });
    return Object.freeze({
      status: "ready",
      profileId,
      contextId,
      availability,
      snapshot,
      hasStoredData: stats.length > 0 || sessions.length > 0,
    });
  }

  async function setEnabled(enabled) {
    setPracticePhysicalTelemetryEnabled(localManifestStore, enabled === true);
    return getState();
  }

  async function clear() {
    const initialized = await initialize();
    if (telemetry) await telemetry.clearPhysicalTelemetry(initialized.profile.profileId);
    return getState();
  }

  return Object.freeze({
    getState,
    refresh: getState,
    setEnabled,
    clear,
    close() {
      initializedPromise = null;
      ownedDataStore?.close?.();
    },
  });
}
