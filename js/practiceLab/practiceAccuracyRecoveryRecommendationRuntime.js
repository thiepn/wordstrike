import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeLimiterModel } from "./practiceLimiterService.js";
import { createPracticeMasteryService } from "./practiceMasteryService.js";
import { createSkillStatId } from "./practiceIds.js";
import { buildAccuracyRecoveryCandidates, buildAccuracyRecoveryManualWarnings } from "./practiceAccuracyRecoverySelection.js";
import { normalizePracticeAccuracyRecoveryTarget } from "./practiceAccuracyRecoveryTargets.js";

const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
function resources({ dataStore, manifestStore, repository }) { const ownsStore = !dataStore && !repository; const store = dataStore ?? (repository ? null : createPracticeIndexedDbStore()); const repo = repository ?? createPracticeRepository({ dataStore: store, manifestStore: manifestStore ?? createPracticeManifestStore() }); return { ownsStore, store, repo }; }

export async function loadPracticeAccuracyRecoveryRecommendations({ dataStore = null, manifestStore = null, repository = null, maxResults = 8, now = () => new Date() } = {}) {
  const { ownsStore, store, repo } = resources({ dataStore, manifestStore, repository }); let limiter = null; let mastery = null;
  try {
    const initialized = await repo.initializePracticeStorage(); const profileId = initialized.profile.profileId; const contextId = initialized.context.contextId; const language = String(initialized.context.dataLocale ?? "").toLowerCase().split("-")[0];
    if (language !== "en") return freezeDeep({ status: "unsupported", recommendations: [] });
    const skillStats = await repo.listSkillStats(profileId, contextId); if (!skillStats.length) return freezeDeep({ status: "no-evidence", recommendations: [] });
    limiter = createPracticeLimiterModel({ repository: repo, now }); mastery = createPracticeMasteryService({ repository: repo, now });
    const [limiterSnapshot, masterySnapshot, learningStates] = await Promise.all([limiter.buildContextLimiterSnapshot({ profileId, contextId }), mastery.buildContextMasterySnapshot({ profileId, contextId, maxEntities: 256, entityTypes: ["key", "bigram", "trigram", "word"] }), store?.query ? store.query("learningStates", "contextId", contextId) : Promise.resolve([])]);
    const recommendations = buildAccuracyRecoveryCandidates({ profileId, contextId, language, skillStats, limiterSnapshot, masterySnapshot, learningStates: (learningStates ?? []).filter((state) => state?.profileId === profileId && state?.contextId === contextId), maxResults });
    return freezeDeep({ status: recommendations.length ? "ready" : "no-evidence", profileId, contextId, language, recommendations });
  } catch (error) { return freezeDeep({ status: "unavailable", recommendations: [], errorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE" }); }
  finally { try { limiter?.clear?.(); } catch {} try { mastery?.clear?.(); } catch {} if (ownsStore) try { store?.close?.(); } catch {} }
}

export async function loadPracticeAccuracyRecoveryManualWarnings({ entityType, entityKey, manualType = null, dataStore = null, manifestStore = null, repository = null, now = () => new Date() } = {}) {
  const target = normalizePracticeAccuracyRecoveryTarget({ entityType, entityKey, manualType, language: "en" }); if (!target) return freezeDeep({ status: "unsupported", warnings: [] });
  const { ownsStore, store, repo } = resources({ dataStore, manifestStore, repository }); let limiter = null; let mastery = null;
  try {
    const initialized = await repo.initializePracticeStorage(); const profileId = initialized.profile.profileId; const contextId = initialized.context.contextId;
    const statId = createSkillStatId(profileId, contextId, target.entityType, target.entityKey); limiter = createPracticeLimiterModel({ repository: repo, now }); mastery = createPracticeMasteryService({ repository: repo, now });
    const [limiterSnapshot, masterySnapshot, learningStates] = await Promise.all([limiter.buildContextLimiterSnapshot({ profileId, contextId }), mastery.buildContextMasterySnapshot({ profileId, contextId, maxEntities: 256, entityTypes: [target.entityType] }), store?.query ? store.query("learningStates", "contextId", contextId) : Promise.resolve([])]);
    return freezeDeep({ status: "ready", warnings: buildAccuracyRecoveryManualWarnings({ statId, limiterSnapshot, masterySnapshot, learningStates: (learningStates ?? []).filter((state) => state?.profileId === profileId && state?.contextId === contextId) }) });
  } catch (error) { return freezeDeep({ status: "unavailable", warnings: [], errorCode: error?.code ?? "WARNINGS_UNAVAILABLE" }); }
  finally { try { limiter?.clear?.(); } catch {} try { mastery?.clear?.(); } catch {} if (ownsStore) try { store?.close?.(); } catch {} }
}
