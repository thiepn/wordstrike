import { buildPracticeLimiterSnapshot } from "./practiceLimiterSnapshot.js";
import { normalizePracticePrevalenceLanguage } from "./practiceEntityPrevalence.js";
import { PRACTICE_LIMITER_POLICY_V1, PRACTICE_LIMITER_POLICY_VERSION, PRACTICE_LIMITER_MODEL_VERSION, PRACTICE_IMPACT_MODEL_VERSION, PRACTICE_HIERARCHY_MODEL_VERSION, PRACTICE_PREVALENCE_MODEL_VERSION } from "./practiceLimiterPolicy.js";

function fnv32(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function createPracticeLimiterEvidenceFingerprint(skillStats) {
  const rows = (Array.isArray(skillStats) ? skillStats : []).map((stat) => [
    stat.statId,
    stat.updatedAt,
    stat.evidence?.opportunities?.count ?? 0,
    stat.evidence?.opportunities?.errorCount ?? 0,
    stat.evidence?.timing?.eligibleCount ?? 0,
    stat.evidence?.timing?.fluentResidual?.count ?? 0,
    stat.evidence?.timing?.fluentResidual?.meanMs ?? 0,
    stat.evidence?.errors?.primaryEpisodeCount ?? 0,
  ].join("|")).sort();
  return `${rows.length}:${fnv32(rows.join("\n"))}`;
}

export function createPracticeLimiterModel({ repository, prevalenceProvider = null, now = () => new Date(), policy = PRACTICE_LIMITER_POLICY_V1 } = {}) {
  if (!repository || typeof repository.getPracticeContext !== "function" || typeof repository.listSkillStats !== "function") throw new TypeError("Practice limiter model requires a repository read interface");
  if (prevalenceProvider != null && typeof prevalenceProvider.getEntityPrevalence !== "function") throw new TypeError("Practice limiter model prevalenceProvider is invalid");
  if (typeof now !== "function") throw new TypeError("Practice limiter model requires injected now()");
  const cache = new Map();

  const buildContextLimiterSnapshot = async ({ profileId, contextId, maxCandidates = policy.maxCandidates } = {}) => {
    if (typeof profileId !== "string" || typeof contextId !== "string") throw new TypeError("Practice limiter snapshot service requires profileId and contextId");
    const [context, skillStats] = await Promise.all([
      repository.getPracticeContext(contextId),
      repository.listSkillStats(profileId, contextId),
    ]);
    if (!context || context.profileId !== profileId) throw new TypeError("Practice limiter context is missing or belongs to another profile");
    const prevalenceFingerprint = prevalenceProvider?.getFingerprint?.() ?? `unavailable-v${PRACTICE_PREVALENCE_MODEL_VERSION}`;
    const evidenceFingerprint = createPracticeLimiterEvidenceFingerprint(skillStats);
    const cacheKey = [contextId, PRACTICE_LIMITER_MODEL_VERSION, PRACTICE_LIMITER_POLICY_VERSION, PRACTICE_IMPACT_MODEL_VERSION, PRACTICE_HIERARCHY_MODEL_VERSION, PRACTICE_PREVALENCE_MODEL_VERSION, evidenceFingerprint, prevalenceFingerprint, maxCandidates].join("|");
    if (cache.has(cacheKey)) return cache.get(cacheKey);

    const language = normalizePracticePrevalenceLanguage(context.dataLocale);
    const prevalenceByStat = new Map();
    if (prevalenceProvider) {
      const resolved = await Promise.all(skillStats.map(async (stat) => [stat.statId, await prevalenceProvider.getEntityPrevalence({ language, entityType: stat.entityType, entityKey: stat.entityKey })]));
      for (const [statId, prevalence] of resolved) prevalenceByStat.set(statId, prevalence);
    }
    const generatedAt = now();
    const snapshot = buildPracticeLimiterSnapshot({ skillStats, context, prevalenceByStat, generatedAt, maxCandidates, policy });
    cache.clear();
    cache.set(cacheKey, snapshot);
    return snapshot;
  };

  return Object.freeze({
    buildContextLimiterSnapshot,
    invalidateContext(contextId) {
      for (const key of [...cache.keys()]) if (key.startsWith(`${contextId}|`)) cache.delete(key);
    },
    clear() { cache.clear(); },
    getCacheSize() { return cache.size; },
  });
}
