import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeLimiterModel } from "./practiceLimiterService.js";
import { createPracticeMasteryService } from "./practiceMasteryService.js";
import { createSkillStatId } from "./practiceIds.js";
import { buildWeakKeyCandidates, getWeakKeyManualSaturationWarning } from "./practiceWeakKeysSelection.js";
import { normalizePracticeWeakKeyTarget } from "./practiceWeakKeysTargets.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const baseLanguage = (value) => typeof value === "string" && value.trim()
  ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0]
  : "und";

function createResources({ dataStore = null, manifestStore = null, repository = null } = {}) {
  const ownsStore = !dataStore && !repository;
  const resolvedStore = dataStore ?? (repository ? null : createPracticeIndexedDbStore());
  const resolvedManifestStore = manifestStore ?? (repository ? null : createPracticeManifestStore());
  const resolvedRepository = repository ?? createPracticeRepository({ dataStore: resolvedStore, manifestStore: resolvedManifestStore });
  return { ownsStore, resolvedStore, resolvedRepository };
}

export async function loadPracticeWeakKeyRecommendations({
  dataStore = null,
  manifestStore = null,
  repository = null,
  maxResults = 8,
  now = () => new Date(),
} = {}) {
  const { ownsStore, resolvedStore, resolvedRepository } = createResources({ dataStore, manifestStore, repository });
  let limiterService = null;
  let masteryService = null;
  try {
    const initialized = await resolvedRepository.initializePracticeStorage();
    const profileId = initialized.profile.profileId;
    const contextId = initialized.context.contextId;
    const language = baseLanguage(initialized.context.dataLocale);
    if (language !== "en") return freezeDeep({ status: "unsupported", profileId, contextId, language, recommendations: [] });
    const skillStats = await resolvedRepository.listSkillStats(profileId, contextId);
    const keyStats = skillStats.filter((stat) => stat?.entityType === "key");
    if (!keyStats.length) return freezeDeep({ status: "no-evidence", profileId, contextId, language, recommendations: [] });

    limiterService = createPracticeLimiterModel({ repository: resolvedRepository, now });
    masteryService = createPracticeMasteryService({ repository: resolvedRepository, now });
    const [limiterSnapshot, masterySnapshot, learningStates] = await Promise.all([
      limiterService.buildContextLimiterSnapshot({ profileId, contextId }),
      masteryService.buildContextMasterySnapshot({ profileId, contextId, maxEntities: 128, entityTypes: ["key"] }),
      resolvedStore?.query ? resolvedStore.query("learningStates", "contextId", contextId) : Promise.resolve([]),
    ]);
    const recommendations = buildWeakKeyCandidates({
      profileId,
      contextId,
      language,
      skillStats: keyStats,
      limiterSnapshot,
      masterySnapshot,
      learningStates: (learningStates ?? []).filter((state) => state?.profileId === profileId && state?.contextId === contextId && state?.entityType === "key"),
      maxResults,
    });
    return freezeDeep({ status: recommendations.length ? "ready" : "no-evidence", profileId, contextId, language, recommendations });
  } catch (error) {
    return freezeDeep({ status: "unavailable", profileId: null, contextId: null, language: "en", recommendations: [], errorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE" });
  } finally {
    try { limiterService?.clear?.(); } catch {}
    try { masteryService?.clear?.(); } catch {}
    if (ownsStore) { try { resolvedStore?.close?.(); } catch {} }
  }
}

export async function loadPracticeWeakKeyManualSaturationWarning({
  entityKey,
  dataStore = null,
  manifestStore = null,
  repository = null,
  now = () => new Date(),
} = {}) {
  const target = normalizePracticeWeakKeyTarget({ entityType: "key", entityKey, language: "en" });
  if (!target) return freezeDeep({ status: "unsupported", warning: null });
  const { ownsStore, resolvedStore, resolvedRepository } = createResources({ dataStore, manifestStore, repository });
  let limiterService = null;
  let masteryService = null;
  try {
    const initialized = await resolvedRepository.initializePracticeStorage();
    const profileId = initialized.profile.profileId;
    const contextId = initialized.context.contextId;
    if (baseLanguage(initialized.context.dataLocale) !== "en") return freezeDeep({ status: "unsupported", warning: null });
    const statId = createSkillStatId(profileId, contextId, "key", target.entityKey);
    limiterService = createPracticeLimiterModel({ repository: resolvedRepository, now });
    masteryService = createPracticeMasteryService({ repository: resolvedRepository, now });
    const [limiterSnapshot, masterySnapshot, learningStates] = await Promise.all([
      limiterService.buildContextLimiterSnapshot({ profileId, contextId }),
      masteryService.buildContextMasterySnapshot({ profileId, contextId, maxEntities: 128, entityTypes: ["key"] }),
      resolvedStore?.query ? resolvedStore.query("learningStates", "contextId", contextId) : Promise.resolve([]),
    ]);
    const warning = getWeakKeyManualSaturationWarning({
      statId,
      limiterSnapshot,
      masterySnapshot,
      learningStates: (learningStates ?? []).filter((state) => state?.profileId === profileId && state?.contextId === contextId && state?.entityType === "key"),
    });
    return freezeDeep({ status: "ready", warning });
  } catch (error) {
    return freezeDeep({ status: "unavailable", warning: null, errorCode: error?.code ?? "SATURATION_UNAVAILABLE" });
  } finally {
    try { limiterService?.clear?.(); } catch {}
    try { masteryService?.clear?.(); } catch {}
    if (ownsStore) { try { resolvedStore?.close?.(); } catch {} }
  }
}
