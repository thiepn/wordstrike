import { createPracticeIndexLoader } from "./practiceIndexLoader.js";
import { createPracticeTargetIndex } from "./practiceTargetIndex.js";
import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { buildPracticeAccuracyRecoveryTrainingPlan, inspectPracticeAccuracyRecoveryAvailability } from "./practiceAccuracyRecoveryGenerator.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
async function loadJson(fetchImpl, path) { const response = await fetchImpl(path); if (!response?.ok) { const error = new Error(`Accuracy & Recovery asset was not found: ${path}`); error.code = "TRAINING_CORPUS_NOT_READY"; throw error; } return response.json(); }

export function createPracticeAccuracyRecoveryRuntime({ fetchImpl = globalThis.fetch, language = "en", corpusVersion = 1, indexBaseUrl = "data/practice/indexes", corpusBaseUrl = "data/practice", contextProvider = null } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Accuracy & Recovery runtime requires fetchImpl");
  let assetsPromise = null;
  const loadAssets = async () => {
    if (assetsPromise) return assetsPromise;
    assetsPromise = (async () => {
      const loader = createPracticeIndexLoader({ fetchImpl, baseUrl: indexBaseUrl });
      const [manifest, trainingCorpus, indexManifest] = await Promise.all([loadJson(fetchImpl, `${corpusBaseUrl}/manifests/${language}-v${corpusVersion}.manifest.json`), loadJson(fetchImpl, `${corpusBaseUrl}/training/${language}-v${corpusVersion}.json`), loader.loadManifest({ language, corpusVersion })]);
      if (trainingCorpus.partition !== "training" || trainingCorpus.corpusId !== manifest.corpusId || trainingCorpus.corpusVersion !== manifest.corpusVersion) { const error = new Error("Accuracy & Recovery training corpus is incompatible with its manifest"); error.code = "CORPUS_VERSION_MISMATCH"; throw error; }
      if (indexManifest.corpusId !== manifest.corpusId || indexManifest.corpusVersion !== manifest.corpusVersion) { const error = new Error("Accuracy & Recovery index is incompatible with the training corpus"); error.code = "INDEX_VERSION_MISMATCH"; throw error; }
      return freezeDeep({ manifest, trainingCorpus, indexManifest, targetIndex: createPracticeTargetIndex({ loader, corpusManifest: manifest, indexManifest }), corpusBinding: { corpusId: manifest.corpusId, corpusVersion: manifest.corpusVersion, indexVersion: indexManifest.indexSchemaVersion, manifestHash: manifest.buildChecksum, language } });
    })().catch((error) => { assetsPromise = null; throw error; });
    return assetsPromise;
  };
  const withContext = async (task) => {
    if (typeof contextProvider === "function") return task(await contextProvider());
    const dataStore = createPracticeIndexedDbStore(); const manifestStore = createPracticeManifestStore(); const repository = createPracticeRepository({ dataStore, manifestStore });
    try { const initialized = await repository.initializePracticeStorage(); return await task(initialized.context, initialized.profile); } finally { try { dataStore.close?.(); } catch {} }
  };
  return Object.freeze({
    async inspectTarget({ entityType, entityKey, manualType = null } = {}) {
      try { const assets = await loadAssets(); return await withContext((context) => inspectPracticeAccuracyRecoveryAvailability({ sessionId: `accuracy-recovery-availability:${entityType}:${entityKey}`, context, targetIndex: assets.targetIndex, contentItems: assets.trainingCorpus.items, corpusBinding: assets.corpusBinding, entityType, entityKey, manualType, language: context?.dataLocale ?? language })); }
      catch (error) { return freezeDeep({ eligible: false, status: "unavailable", target: null, reasons: [error?.code ?? "TRAINING_CORPUS_NOT_READY"] }); }
    },
    async prepare({ entityType, entityKey, manualType = null, targetSource = "manual", sessionId = createPracticeSessionId() } = {}) {
      const assets = await loadAssets();
      return withContext(async (context) => {
        const prepared = await buildPracticeAccuracyRecoveryTrainingPlan({ sessionId, context, targetIndex: assets.targetIndex, contentItems: assets.trainingCorpus.items, corpusBinding: assets.corpusBinding, entityType, entityKey, manualType, targetSource, language: context?.dataLocale ?? language });
        return freezeDeep({ ...prepared, context: { contextId: context.contextId, fingerprint: context.fingerprint, dataLocale: context.dataLocale, keyboardLayout: context.keyboardLayout, inputMethod: context.inputMethod, hardwareProfileId: context.hardwareProfileId ?? null } });
      });
    },
    async getDiagnostics() { try { const assets = await loadAssets(); return freezeDeep({ ready: true, language, corpusId: assets.manifest.corpusId, corpusVersion: assets.manifest.corpusVersion, indexVersion: assets.indexManifest.indexSchemaVersion, trainingContentCount: assets.trainingCorpus.items.length, trainingFamilyCount: new Set(assets.trainingCorpus.items.map((item) => item.familyId)).size }); } catch (error) { return freezeDeep({ ready: false, language, errorCode: error?.code ?? "TRAINING_CORPUS_NOT_READY" }); } },
    clear() { assetsPromise = null; },
  });
}
