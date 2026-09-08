import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { getRealTextPracticeAvailability } from "./practiceRealTextAvailability.js";
import { buildPracticeRealTextPlan } from "./practiceRealTextPlan.js";
import { buildPracticeRealTextContentPlan } from "./practiceRealTextGenerator.js";
import { registerPracticeTrustedRealTextBinding } from "./practiceRealTextTrust.js";
import { PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS, PRACTICE_REAL_TEXT_POOL_ID } from "./practiceRealTextConstants.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
async function loadJson(fetchImpl, path) { const response = await fetchImpl(path); if (!response?.ok) throw Object.assign(new Error(`Real Text asset unavailable: ${path}`), { code: "REAL_TEXT_ASSET_UNAVAILABLE" }); return response.json(); }

export function createPracticeRealTextRuntime({ fetchImpl = globalThis.fetch, language = "en", corpusVersion = 1, baseUrl = "data/practice", contextProvider = null } = {}) {
  if (typeof fetchImpl !== "function") throw new TypeError("Real Text runtime requires fetchImpl");
  let assetsPromise = null;
  const loadAssets = async () => {
    if (assetsPromise) return assetsPromise;
    assetsPromise = Promise.all([
      loadJson(fetchImpl, `${baseUrl}/real-text/${language}-v${corpusVersion}/${PRACTICE_REAL_TEXT_POOL_ID}.manifest.json`),
      loadJson(fetchImpl, `${baseUrl}/training/${language}-v${corpusVersion}.json`),
    ]).then(([pool, trainingCorpus]) => freezeDeep({ pool, trainingCorpus })).catch((error) => { assetsPromise = null; throw error; });
    return assetsPromise;
  };
  const withContext = async (task) => {
    if (typeof contextProvider === "function") { const value = await contextProvider(); return task(value.context ?? value, value.profile ?? null); }
    const dataStore = createPracticeIndexedDbStore(); const manifestStore = createPracticeManifestStore(); const repository = createPracticeRepository({ dataStore, manifestStore });
    try { const initialized = await repository.initializePracticeStorage(); return await task(initialized.context, initialized.profile); } finally { try { dataStore.close?.(); } catch {} }
  };
  return Object.freeze({
    async getAvailability() {
      try { const assets = await loadAssets(); return withContext((context) => getRealTextPracticeAvailability({ pool: assets.pool, language: context?.dataLocale ?? language })); }
      catch (error) { return freezeDeep({ status: "unavailable", poolStatus: null, languageSupported: true, supportedDurationsMs: [], reasons: [error?.code ?? "REAL_TEXT_ASSET_UNAVAILABLE"] }); }
    },
    async prepare({ durationMs = PRACTICE_REAL_TEXT_DEFAULT_DURATION_MS } = {}) {
      const assets = await loadAssets();
      return withContext((context, profile) => {
        const sessionId = createPracticeSessionId();
        const plan = buildPracticeRealTextPlan({ sessionId, profileId: profile?.profileId, contextId: context?.contextId, language: context?.dataLocale ?? language, durationMs, pool: assets.pool });
        const contentPlan = buildPracticeRealTextContentPlan({ plan, pool: assets.pool, contentItems: assets.trainingCorpus.items });
        registerPracticeTrustedRealTextBinding(contentPlan, { experimentId: "real-text", partition: "training", evidenceRole: "training", targetEntities: [], planHash: plan.planHash });
        return freezeDeep({ plan, contentPlan, context: { contextId: context.contextId, fingerprint: context.fingerprint, dataLocale: context.dataLocale, keyboardLayout: context.keyboardLayout, inputMethod: context.inputMethod, hardwareProfileId: context.hardwareProfileId ?? null } });
      });
    },
    async getDiagnostics() { try { const assets = await loadAssets(); const availability = getRealTextPracticeAvailability({ pool: assets.pool, language }); return freezeDeep({ poolId: assets.pool.poolId, poolVersion: assets.pool.poolVersion, poolStatus: assets.pool.status, unitCount: assets.pool.units?.length ?? 0, availability }); } catch (error) { return freezeDeep({ poolId: PRACTICE_REAL_TEXT_POOL_ID, poolStatus: null, unitCount: 0, errorCode: error?.code ?? "REAL_TEXT_ASSET_UNAVAILABLE" }); } },
    clear() { assetsPromise = null; },
  });
}
