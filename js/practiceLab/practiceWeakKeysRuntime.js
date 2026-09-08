import { createPracticeIndexLoader } from "./practiceIndexLoader.js";
import { createPracticeTargetIndex } from "./practiceTargetIndex.js";
import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import {
  buildPracticeWeakKeysContentPlan,
  buildPracticeWeakKeysTrainingPlan,
  inspectPracticeWeakKeysAvailability,
} from "./practiceWeakKeysGenerator.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

async function loadJson(fetchImpl, path) {
  const response = await fetchImpl(path);
  if (!response?.ok) {
    const error = new Error(`Weak Keys asset was not found: ${path}`);
    error.code = "TRAINING_CORPUS_NOT_READY";
    error.details = { path, status: response?.status ?? null };
    throw error;
  }
  return response.json();
}

export function createPracticeWeakKeysRuntime({
  fetchImpl = globalThis.fetch,
  language = "en",
  corpusVersion = 1,
  indexBaseUrl = "data/practice/indexes",
  corpusBaseUrl = "data/practice",
  contextProvider = null,
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Weak Keys runtime requires fetchImpl");
  let assetsPromise = null;

  const loadAssets = async () => {
    if (assetsPromise) return assetsPromise;
    assetsPromise = (async () => {
      const indexLoader = createPracticeIndexLoader({ fetchImpl, baseUrl: indexBaseUrl });
      const [corpusManifest, trainingCorpus, indexManifest] = await Promise.all([
        loadJson(fetchImpl, `${corpusBaseUrl}/manifests/${language}-v${corpusVersion}.manifest.json`),
        loadJson(fetchImpl, `${corpusBaseUrl}/training/${language}-v${corpusVersion}.json`),
        indexLoader.loadManifest({ language, corpusVersion }),
      ]);
      if (trainingCorpus.partition !== "training" || trainingCorpus.corpusId !== corpusManifest.corpusId || trainingCorpus.corpusVersion !== corpusManifest.corpusVersion) {
        const error = new Error("Weak Keys training corpus is incompatible with its manifest");
        error.code = "CORPUS_VERSION_MISMATCH";
        throw error;
      }
      if (indexManifest.corpusId !== corpusManifest.corpusId || indexManifest.corpusVersion !== corpusManifest.corpusVersion) {
        const error = new Error("Weak Keys target index is incompatible with the training corpus");
        error.code = "INDEX_VERSION_MISMATCH";
        throw error;
      }
      const targetIndex = createPracticeTargetIndex({ loader: indexLoader, corpusManifest, indexManifest });
      return freezeDeep({
        corpusManifest,
        trainingCorpus,
        indexManifest,
        targetIndex,
        corpusBinding: {
          corpusId: corpusManifest.corpusId,
          corpusVersion: corpusManifest.corpusVersion,
          indexVersion: indexManifest.indexSchemaVersion,
          manifestHash: corpusManifest.buildChecksum,
          language,
        },
      });
    })().catch((error) => {
      assetsPromise = null;
      throw error;
    });
    return assetsPromise;
  };

  const withContext = async (task) => {
    if (typeof contextProvider === "function") return task(await contextProvider());
    const dataStore = createPracticeIndexedDbStore();
    const manifestStore = createPracticeManifestStore();
    const repository = createPracticeRepository({ dataStore, manifestStore });
    try {
      const initialized = await repository.initializePracticeStorage();
      return await task(initialized.context, initialized.profile);
    } finally {
      try { dataStore.close?.(); } catch {}
    }
  };

  return Object.freeze({
    async inspectTarget({ entityKey } = {}) {
      try {
        const assets = await loadAssets();
        return await withContext((context) => inspectPracticeWeakKeysAvailability({
          sessionId: `weak-keys-availability:${entityKey ?? ""}`,
          context,
          targetIndex: assets.targetIndex,
          contentItems: assets.trainingCorpus.items,
          entityKey,
          language: context?.dataLocale ?? language,
        }));
      } catch (error) {
        return freezeDeep({
          eligible: false,
          status: "unavailable",
          entityType: "key",
          entityKey: null,
          trainingEvidence: { targetWordCount: 0, targetContentCount: 0, familyCount: 0 },
          contextCoverage: null,
          reasons: [error?.code || "TRAINING_CORPUS_NOT_READY"],
        });
      }
    },

    async prepare({ entityKey, targetSource = "manual", sessionId = createPracticeSessionId() } = {}) {
      const assets = await loadAssets();
      return withContext(async (context) => {
        const plan = await buildPracticeWeakKeysTrainingPlan({
          sessionId,
          context,
          targetIndex: assets.targetIndex,
          contentItems: assets.trainingCorpus.items,
          corpusBinding: assets.corpusBinding,
          entityKey,
          targetSource,
          language: context?.dataLocale ?? language,
        });
        const contentPlan = buildPracticeWeakKeysContentPlan({ plan, contentItems: assets.trainingCorpus.items });
        return freezeDeep({ plan, contentPlan, availability: "ready", context: { contextId: context.contextId, keyboardLayout: context.keyboardLayout, inputMethod: context.inputMethod, dataLocale: context.dataLocale } });
      });
    },

    async getDiagnostics() {
      try {
        const assets = await loadAssets();
        return freezeDeep({
          ready: true,
          language,
          corpusId: assets.corpusManifest.corpusId,
          corpusVersion: assets.corpusManifest.corpusVersion,
          indexVersion: assets.indexManifest.indexSchemaVersion,
          trainingContentCount: assets.trainingCorpus.items.length,
          trainingFamilyCount: new Set(assets.trainingCorpus.items.map((item) => item.familyId)).size,
        });
      } catch (error) {
        return freezeDeep({ ready: false, language, errorCode: error?.code || "TRAINING_CORPUS_NOT_READY" });
      }
    },

    clear() { assetsPromise = null; },
  });
}
