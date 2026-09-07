import { createPracticeIndexedDbStore } from "./practiceIndexedDbStore.js";
import { createPracticeManifestStore } from "./practiceManifestStore.js";
import { createPracticeRepository } from "./practiceRepository.js";
import { createPracticeLimiterModel } from "./practiceLimiterService.js";
import { createPracticeMasteryService } from "./practiceMasteryService.js";
import { buildPracticeCombinationRepairRecommendations } from "./practiceCombinationRepairRecommendation.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function baseLanguage(value) {
  return typeof value === "string" && value.trim()
    ? value.trim().replace(/_/g, "-").toLowerCase().split("-")[0]
    : "en";
}

export async function loadPracticeCombinationRepairRecommendations({
  dataStore = null,
  manifestStore = null,
  repository = null,
  maxResults = 8,
  now = () => new Date(),
} = {}) {
  const ownsStore = !dataStore && !repository;
  const resolvedStore = dataStore ?? (repository ? null : createPracticeIndexedDbStore());
  const resolvedManifestStore = manifestStore ?? (repository ? null : createPracticeManifestStore());
  const resolvedRepository = repository ?? createPracticeRepository({
    dataStore: resolvedStore,
    manifestStore: resolvedManifestStore,
  });

  try {
    const initialized = await resolvedRepository.initializePracticeStorage();
    const profileId = initialized.profile.profileId;
    const contextId = initialized.context.contextId;
    const language = baseLanguage(initialized.context.dataLocale);
    const skillStats = await resolvedRepository.listSkillStats(profileId, contextId);
    if (!skillStats.some((stat) => ["bigram", "trigram"].includes(stat?.entityType))) {
      return freezeDeep({
        status: "no-evidence",
        profileId,
        contextId,
        language,
        recommendations: [],
      });
    }

    const limiterService = createPracticeLimiterModel({ repository: resolvedRepository, now });
    const masteryService = createPracticeMasteryService({ repository: resolvedRepository, now });
    const [limiterSnapshot, masterySnapshot] = await Promise.all([
      limiterService.buildContextLimiterSnapshot({ profileId, contextId }),
      masteryService.buildContextMasterySnapshot({
        profileId,
        contextId,
        maxEntities: 128,
        entityTypes: ["bigram", "trigram"],
      }),
    ]);
    const recommendations = buildPracticeCombinationRepairRecommendations({
      profileId,
      contextId,
      language,
      skillStats,
      limiterSnapshot,
      masterySnapshot,
      maxResults,
    });
    limiterService.clear();
    masteryService.clear();
    return freezeDeep({
      status: recommendations.length ? "ready" : "no-evidence",
      profileId,
      contextId,
      language,
      recommendations,
    });
  } catch (error) {
    return freezeDeep({
      status: "unavailable",
      profileId: null,
      contextId: null,
      language: "en",
      recommendations: [],
      errorCode: error?.code ?? "RECOMMENDATIONS_UNAVAILABLE",
    });
  } finally {
    if (ownsStore) {
      try { resolvedStore?.close?.(); } catch {}
    }
  }
}
