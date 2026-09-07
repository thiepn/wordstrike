import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeLimiterModel } from "./practiceLimiterService.js";
import { createPracticeMasteryService } from "./practiceMasteryService.js";
import { buildProblemWordCandidates, getProblemWordManualWarnings } from "./practiceProblemWordsSelection.js";
import { normalizePracticeProblemWordTarget } from "./practiceProblemWordsTargets.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const baseLanguage = (value) => typeof value === "string" && value.trim() ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0] : "und";
function resources({ dataStore = null, manifestStore = null, repository = null } = {}) {
  const ownsStore = !dataStore && !repository; const store = dataStore ?? (repository ? null : createPracticeIndexedDbStore()); const manifest = manifestStore ?? (repository ? null : createPracticeManifestStore());
  return { ownsStore, store, repository: repository ?? createPracticeRepository({ dataStore: store, manifestStore: manifest }) };
}

export async function loadPracticeProblemWordRecommendations({ dataStore = null, manifestStore = null, repository = null, maxResults = 8, now = () => new Date() } = {}) {
  const r = resources({ dataStore, manifestStore, repository }); let limiterService = null; let masteryService = null;
  try {
    const initialized = await r.repository.initializePracticeStorage(); const profileId = initialized.profile.profileId; const contextId = initialized.context.contextId; const language = baseLanguage(initialized.context.dataLocale);
    if (language !== "en") return freezeDeep({ status: "unsupported", profileId, contextId, language, recommendations: [] });
    const skillStats = await r.repository.listSkillStats(profileId, contextId); const wordStats = skillStats.filter((stat) => stat?.entityType === "word");
    if (!wordStats.length) return freezeDeep({ status: "no-evidence", profileId, contextId, language, recommendations: [] });
    limiterService = createPracticeLimiterModel({ repository: r.repository, now }); masteryService = createPracticeMasteryService({ repository: r.repository, now });
    const [limiterSnapshot, masterySnapshot, learningStates] = await Promise.all([
      limiterService.buildContextLimiterSnapshot({ profileId, contextId }),
      masteryService.buildContextMasterySnapshot({ profileId, contextId, maxEntities: 128, entityTypes: ["word"] }),
      r.store?.query ? r.store.query("learningStates", "contextId", contextId) : Promise.resolve([]),
    ]);
    const recommendations = buildProblemWordCandidates({ profileId, contextId, language, skillStats: wordStats, limiterSnapshot, masterySnapshot, learningStates: (learningStates ?? []).filter((state) => state?.profileId === profileId && state?.contextId === contextId && state?.entityType === "word"), maxResults });
    return freezeDeep({ status: recommendations.length ? "ready" : "no-evidence", profileId, contextId, language, recommendations });
  } catch (error) { return freezeDeep({ status: "unavailable", profileId: null, contextId: null, language: "en", recommendations: [], errorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE" }); }
  finally { try { limiterService?.clear?.(); } catch {} try { masteryService?.clear?.(); } catch {} if (r.ownsStore) { try { r.store?.close?.(); } catch {} } }
}

export async function loadPracticeProblemWordManualWarnings({ entityKey, dataStore = null, manifestStore = null, repository = null, now = () => new Date() } = {}) {
  const target = normalizePracticeProblemWordTarget({ entityKey, language: "en" }); if (!target) return freezeDeep({ status: "unsupported", warnings: [] });
  const r = resources({ dataStore, manifestStore, repository }); let limiterService = null; let masteryService = null;
  try {
    const initialized = await r.repository.initializePracticeStorage(); const profileId = initialized.profile.profileId; const contextId = initialized.context.contextId;
    if (baseLanguage(initialized.context.dataLocale) !== "en") return freezeDeep({ status: "unsupported", warnings: [] });
    const skillStats = await r.repository.listSkillStats(profileId, contextId);
    limiterService = createPracticeLimiterModel({ repository: r.repository, now }); masteryService = createPracticeMasteryService({ repository: r.repository, now });
    const [limiterSnapshot, masterySnapshot, learningStates] = await Promise.all([
      limiterService.buildContextLimiterSnapshot({ profileId, contextId }),
      masteryService.buildContextMasterySnapshot({ profileId, contextId, maxEntities: 128, entityTypes: ["word"] }),
      r.store?.query ? r.store.query("learningStates", "contextId", contextId) : Promise.resolve([]),
    ]);
    return freezeDeep({ status: "ready", warnings: getProblemWordManualWarnings({ entityKey: target.entityKey, skillStats, limiterSnapshot, masterySnapshot, learningStates: (learningStates ?? []).filter((state) => state?.profileId === profileId && state?.contextId === contextId && state?.entityType === "word") }) });
  } catch (error) { return freezeDeep({ status: "unavailable", warnings: [], errorCode: error?.code ?? "WARNINGS_UNAVAILABLE" }); }
  finally { try { limiterService?.clear?.(); } catch {} try { masteryService?.clear?.(); } catch {} if (r.ownsStore) { try { r.store?.close?.(); } catch {} } }
}
