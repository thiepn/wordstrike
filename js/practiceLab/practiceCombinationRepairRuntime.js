import { createPracticeIndexLoader } from "./practiceIndexLoader.js";
import { createPracticeTargetIndex } from "./practiceTargetIndex.js";
import {
  buildPracticeCombinationRepairContentPlan,
  buildPracticeCombinationRepairTrainingPlan,
  inspectPracticeCombinationRepairAvailability,
} from "./practiceCombinationRepairGenerator.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

async function loadJson(fetchImpl, path) {
  const response = await fetchImpl(path);
  if (!response?.ok) {
    const error = new Error(`Combination Repair asset was not found: ${path}`);
    error.code = "TRAINING_CORPUS_NOT_READY";
    error.details = { path, status: response?.status ?? null };
    throw error;
  }
  return response.json();
}

export function createPracticeCombinationRepairRuntime({
  fetchImpl = globalThis.fetch,
  language = "en",
  corpusVersion = 1,
  indexBaseUrl = "data/practice/indexes",
  corpusBaseUrl = "data/practice",
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Combination Repair runtime requires fetchImpl");
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
        const error = new Error("Combination Repair training corpus is incompatible with its manifest");
        error.code = "CORPUS_VERSION_MISMATCH";
        throw error;
      }
      if (indexManifest.corpusId !== corpusManifest.corpusId || indexManifest.corpusVersion !== corpusManifest.corpusVersion) {
        const error = new Error("Combination Repair target index is incompatible with the training corpus");
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

  return Object.freeze({
    async inspectTarget({ entityType, entityKey } = {}) {
      try {
        const assets = await loadAssets();
        return inspectPracticeCombinationRepairAvailability({
          targetIndex: assets.targetIndex,
          contentItems: assets.trainingCorpus.items,
          entityType,
          entityKey,
          language,
        });
      } catch (error) {
        return freezeDeep({
          status: "unavailable",
          target: null,
          reasons: [error?.code || "TRAINING_CORPUS_NOT_READY"],
        });
      }
    },

    async prepare({ entityType, entityKey, targetSource = "manual" } = {}) {
      const assets = await loadAssets();
      const plan = await buildPracticeCombinationRepairTrainingPlan({
        targetIndex: assets.targetIndex,
        contentItems: assets.trainingCorpus.items,
        corpusBinding: assets.corpusBinding,
        entityType,
        entityKey,
        targetSource,
        language,
      });
      const contentPlan = buildPracticeCombinationRepairContentPlan({
        plan,
        contentItems: assets.trainingCorpus.items,
      });
      return freezeDeep({ plan, contentPlan, availability: "ready" });
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

    clear() {
      assetsPromise = null;
    },
  });
}
