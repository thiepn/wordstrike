import { createPracticeIndexLoader } from "./practiceIndexLoader.js";
import { createPracticeTargetIndex } from "./practiceTargetIndex.js";
import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeLimiterModel } from "./practiceLimiterService.js";
import { createPracticeMasteryService } from "./practiceMasteryService.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { buildPracticeWeaknessBossCandidates, getPracticeWeaknessBossAvailabilityFromCandidates } from "./practiceWeaknessBossSelection.js";
import { buildPracticeWeaknessBossEncounter, inspectPracticeWeaknessBossContentReadiness } from "./practiceWeaknessBossGenerator.js";
import { PRACTICE_WEAKNESS_BOSS_MAX_PREFLIGHT_CANDIDATES } from "./practiceWeaknessBossConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const baseLanguage = (value) => typeof value === "string" && value.trim()
  ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0]
  : "und";

async function loadJson(fetchImpl, path) {
  const response = await fetchImpl(path);
  if (!response?.ok) {
    const error = new Error(`Weakness Boss asset was not found: ${path}`);
    error.code = "TRAINING_CORPUS_NOT_READY";
    throw error;
  }
  return response.json();
}

export function createPracticeWeaknessBossRuntime({
  fetchImpl = globalThis.fetch,
  language = "en",
  corpusVersion = 1,
  indexBaseUrl = "data/practice/indexes",
  corpusBaseUrl = "data/practice",
  dataStore = null,
  manifestStore = null,
  repository = null,
  now = () => new Date(),
} = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Weakness Boss runtime requires fetchImpl");
  const ownsStore = !dataStore && !repository;
  const resolvedStore = dataStore ?? (repository ? null : createPracticeIndexedDbStore());
  const resolvedManifestStore = manifestStore ?? (repository ? null : createPracticeManifestStore());
  const resolvedRepository = repository ?? createPracticeRepository({ dataStore: resolvedStore, manifestStore: resolvedManifestStore });
  let assetsPromise = null;

  async function loadAssets() {
    if (assetsPromise) return assetsPromise;
    assetsPromise = (async () => {
      const indexLoader = createPracticeIndexLoader({ fetchImpl, baseUrl: indexBaseUrl });
      const [corpusManifest, trainingCorpus, indexManifest] = await Promise.all([
        loadJson(fetchImpl, `${corpusBaseUrl}/manifests/${language}-v${corpusVersion}.manifest.json`),
        loadJson(fetchImpl, `${corpusBaseUrl}/training/${language}-v${corpusVersion}.json`),
        indexLoader.loadManifest({ language, corpusVersion }),
      ]);
      if (trainingCorpus.partition !== "training" || trainingCorpus.corpusId !== corpusManifest.corpusId || trainingCorpus.corpusVersion !== corpusManifest.corpusVersion) throw new Error("Weakness Boss training corpus is incompatible");
      if (indexManifest.corpusId !== corpusManifest.corpusId || indexManifest.corpusVersion !== corpusManifest.corpusVersion) throw new Error("Weakness Boss target index is incompatible");
      return freezeDeep({
        corpusManifest,
        trainingCorpus,
        indexManifest,
        targetIndex: createPracticeTargetIndex({ loader: indexLoader, corpusManifest, indexManifest }),
        corpusBinding: {
          corpusId: corpusManifest.corpusId,
          corpusVersion: corpusManifest.corpusVersion,
          indexVersion: indexManifest.indexSchemaVersion,
          manifestHash: corpusManifest.buildChecksum,
          language,
        },
      });
    })().catch((error) => { assetsPromise = null; throw error; });
    return assetsPromise;
  }

  async function currentModelInputs() {
    const initialized = await resolvedRepository.initializePracticeStorage();
    const profileId = initialized.profile.profileId;
    const contextId = initialized.context.contextId;
    if (baseLanguage(initialized.context.dataLocale) !== "en") return { initialized, limiterSnapshot: null, masteryByStat: new Map(), learningByStat: new Map(), unsupported: true };
    const limiter = createPracticeLimiterModel({ repository: resolvedRepository, now });
    const mastery = createPracticeMasteryService({ repository: resolvedRepository, limiterService: limiter, now });
    try {
      const [limiterSnapshot, masterySnapshot, learningStates] = await Promise.all([
        limiter.buildContextLimiterSnapshot({ profileId, contextId, maxCandidates: 32 }),
        mastery.buildContextMasterySnapshot({ profileId, contextId, maxEntities: 256, entityTypes: ["key", "bigram", "trigram", "word"] }),
        resolvedStore?.query ? resolvedStore.query("learningStates", "contextId", contextId) : Promise.resolve([]),
      ]);
      return {
        initialized,
        limiterSnapshot,
        masteryByStat: new Map((masterySnapshot.entities ?? []).map((entry) => [entry.statId, entry])),
        learningByStat: new Map((learningStates ?? []).filter((state) => state?.profileId === profileId && state?.contextId === contextId).map((state) => [state.statId, state])),
        unsupported: false,
      };
    } finally {
      limiter.clear?.();
      mastery.clear?.();
    }
  }

  async function loadCandidatesInternal() {
    const assets = await loadAssets();
    const model = await currentModelInputs();
    if (model.unsupported) return freezeDeep({ status: "unsupported", available: false, candidates: [], recommendedCandidate: null, profileId: model.initialized.profile.profileId, contextId: model.initialized.context.contextId });
    const optimistic = new Map((model.limiterSnapshot?.candidates ?? []).map((candidate) => [candidate.statId, true]));
    const preflight = buildPracticeWeaknessBossCandidates({
      limiterSnapshot: model.limiterSnapshot,
      masteryByStat: model.masteryByStat,
      learningByStat: model.learningByStat,
      contentReadyByStat: optimistic,
      maxInternal: PRACTICE_WEAKNESS_BOSS_MAX_PREFLIGHT_CANDIDATES,
    });
    const contentReadyByStat = new Map();
    for (const candidate of preflight.slice(0, PRACTICE_WEAKNESS_BOSS_MAX_PREFLIGHT_CANDIDATES)) {
      const readiness = await inspectPracticeWeaknessBossContentReadiness({
        sessionId: `weakness-boss-preflight:${candidate.statId}`,
        context: model.initialized.context,
        targetIndex: assets.targetIndex,
        contentItems: assets.trainingCorpus.items,
        corpusBinding: assets.corpusBinding,
        target: candidate,
        targetSource: "recommended",
        language: model.initialized.context.dataLocale,
      });
      contentReadyByStat.set(candidate.statId, readiness.ready === true);
    }
    const candidates = buildPracticeWeaknessBossCandidates({
      limiterSnapshot: model.limiterSnapshot,
      masteryByStat: model.masteryByStat,
      learningByStat: model.learningByStat,
      contentReadyByStat,
    });
    const availability = getPracticeWeaknessBossAvailabilityFromCandidates(candidates);
    return freezeDeep({
      status: availability.available ? "ready" : "no-boss-ready",
      ...availability,
      profileId: model.initialized.profile.profileId,
      contextId: model.initialized.context.contextId,
      context: { ...model.initialized.context },
    });
  }

  return Object.freeze({
    async loadCandidates() {
      try { return await loadCandidatesInternal(); }
      catch (error) { return freezeDeep({ status: "unavailable", available: false, candidates: [], recommendedCandidate: null, errorCode: error?.code ?? "BOSS_RUNTIME_UNAVAILABLE" }); }
    },
    async prepare({ statId = null, targetSource = null, sessionId = createPracticeSessionId() } = {}) {
      const assets = await loadAssets();
      const current = await loadCandidatesInternal();
      if (!current.available) {
        const error = new Error("No current eligible Weakness Boss target is ready");
        error.code = "PRACTICE_WEAKNESS_BOSS_NO_TARGET";
        throw error;
      }
      const selected = statId ? current.candidates.find((candidate) => candidate.statId === statId) : current.recommendedCandidate;
      if (!selected) {
        const error = new Error("Selected Weakness Boss target is no longer eligible");
        error.code = "PRACTICE_WEAKNESS_BOSS_TARGET_STALE";
        throw error;
      }
      const source = targetSource ?? (statId ? "candidate-choice" : "recommended");
      const initialized = await resolvedRepository.initializePracticeStorage();
      if (initialized.context.contextId !== current.contextId) {
        const error = new Error("Practice context changed before Weakness Boss start");
        error.code = "PRACTICE_WEAKNESS_BOSS_CONTEXT_MISMATCH";
        throw error;
      }
      const encounter = await buildPracticeWeaknessBossEncounter({
        sessionId,
        context: initialized.context,
        targetIndex: assets.targetIndex,
        contentItems: assets.trainingCorpus.items,
        corpusBinding: assets.corpusBinding,
        target: selected,
        targetSource: source,
        language: initialized.context.dataLocale,
      });
      return freezeDeep({
        experimentTarget: selected,
        targetSource: source,
        sessionId,
        plan: encounter.plan,
        contentPlan: encounter.contentPlan,
        context: { contextId: initialized.context.contextId, dataLocale: initialized.context.dataLocale, keyboardLayout: initialized.context.keyboardLayout, inputMethod: initialized.context.inputMethod },
      });
    },
    async getDiagnostics() {
      try {
        const assets = await loadAssets();
        return freezeDeep({ ready: true, corpusId: assets.corpusManifest.corpusId, corpusVersion: assets.corpusManifest.corpusVersion, indexVersion: assets.indexManifest.indexSchemaVersion, preflightCap: PRACTICE_WEAKNESS_BOSS_MAX_PREFLIGHT_CANDIDATES });
      } catch (error) {
        return freezeDeep({ ready: false, errorCode: error?.code ?? "BOSS_RUNTIME_UNAVAILABLE" });
      }
    },
    clear() { assetsPromise = null; },
    close() { if (ownsStore) { try { resolvedStore?.close?.(); } catch {} } },
  });
}
