import {
  PRACTICE_MASTERY_MODEL_VERSION,
  PRACTICE_MASTERY_POLICY_VERSION,
  PRACTICE_AUTOMATICITY_MODEL_VERSION,
  PRACTICE_CONTEXT_ROBUSTNESS_VERSION,
  PRACTICE_TRANSFER_MODEL_VERSION,
} from "./practiceMasteryConstants.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";
import {
  PRACTICE_LIMITER_MODEL_VERSION,
  PRACTICE_LIMITER_POLICY_VERSION,
  PRACTICE_LIMITER_POLICY_V1,
} from "./practiceLimiterPolicy.js";
import { buildPracticeMasteryEvaluationSet, buildPracticeMasterySnapshot } from "./practiceMasterySnapshot.js";
import {
  createDefaultPracticeRetentionEvidenceProvider,
  getPracticeRetentionEvidence,
} from "./practiceRetentionEvidence.js";

function fnv32(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function createPracticeMasteryEvidenceFingerprint(skillStats) {
  const stats = Array.isArray(skillStats) ? skillStats : [];
  const rows = stats.map((stat) => [
    stat.statId,
    stat.recordVersion,
    stat.evidenceVersion,
    stat.updatedAt,
    stat.lastObservedAt,
  ].join("|")).sort();
  const maxUpdatedAt = stats.reduce((max, stat) => {
    const value = typeof stat?.updatedAt === "string" ? stat.updatedAt : "";
    return value > max ? value : max;
  }, "");
  return `${rows.length}:${maxUpdatedAt}:${fnv32(rows.join("\n"))}`;
}

async function readContext(repository, profileId, contextId) {
  const [context, skillStats] = await Promise.all([
    repository.getPracticeContext(contextId),
    repository.listSkillStats(profileId, contextId),
  ]);
  if (!context || context.profileId !== profileId) {
    throw new TypeError("Practice mastery context is missing or belongs to another profile");
  }
  return { context, skillStats: Array.isArray(skillStats) ? skillStats : [] };
}

async function retentionMapFor(provider, stats) {
  const entries = await Promise.all(stats.map(async (stat) => [
    stat.statId,
    await getPracticeRetentionEvidence(provider, {
      profileId: stat.profileId,
      contextId: stat.contextId,
      entityType: stat.entityType,
      entityKey: stat.entityKey,
    }),
  ]));
  return new Map(entries);
}

export function createPracticeMasteryService({
  repository,
  limiterService = null,
  retentionProvider = createDefaultPracticeRetentionEvidenceProvider(),
  now = () => new Date(),
  policy = PRACTICE_MASTERY_POLICY_V1,
  limiterPolicy = PRACTICE_LIMITER_POLICY_V1,
} = {}) {
  if (!repository || typeof repository.getPracticeContext !== "function" || typeof repository.listSkillStats !== "function") {
    throw new TypeError("Practice mastery service requires repository context/skillStat reads");
  }
  if (limiterService != null && typeof limiterService !== "object") {
    throw new TypeError("Practice mastery limiterService is invalid");
  }
  if (!retentionProvider || typeof retentionProvider.getPracticeRetentionEvidence !== "function") {
    throw new TypeError("Practice mastery service requires retention provider contract");
  }
  if (typeof now !== "function") throw new TypeError("Practice mastery service requires injected now()");
  const cache = new Map();

  const buildContextMasterySnapshot = async ({
    profileId,
    contextId,
    maxEntities = policy.snapshot.maxEntities,
    entityTypes = null,
  } = {}) => {
    if (typeof profileId !== "string" || typeof contextId !== "string") {
      throw new TypeError("Practice mastery snapshot service requires profileId and contextId");
    }
    const { context, skillStats } = await readContext(repository, profileId, contextId);
    const evidenceFingerprint = createPracticeMasteryEvidenceFingerprint(skillStats);
    const retentionFingerprint = typeof retentionProvider.getFingerprint === "function"
      ? await retentionProvider.getFingerprint({ profileId, contextId })
      : null;
    const limiterFingerprint = typeof limiterService?.getFingerprint === "function"
      ? await limiterService.getFingerprint({ profileId, contextId })
      : `pl12-v${PRACTICE_LIMITER_MODEL_VERSION}.${PRACTICE_LIMITER_POLICY_VERSION}`;
    const cacheable = retentionFingerprint != null;
    const cacheKey = [
      profileId,
      contextId,
      PRACTICE_MASTERY_MODEL_VERSION,
      PRACTICE_MASTERY_POLICY_VERSION,
      PRACTICE_AUTOMATICITY_MODEL_VERSION,
      PRACTICE_CONTEXT_ROBUSTNESS_VERSION,
      PRACTICE_TRANSFER_MODEL_VERSION,
      PRACTICE_LIMITER_MODEL_VERSION,
      PRACTICE_LIMITER_POLICY_VERSION,
      evidenceFingerprint,
      retentionProvider.version ?? "unknown",
      retentionFingerprint ?? "uncacheable",
      limiterFingerprint,
      maxEntities,
      entityTypes ? [...entityTypes].sort().join(",") : "*",
    ].join("|");
    if (cacheable && cache.has(cacheKey)) return cache.get(cacheKey);

    const retentionEvidenceMap = await retentionMapFor(retentionProvider, skillStats);
    const snapshot = buildPracticeMasterySnapshot({
      skillStats,
      context,
      retentionEvidenceMap,
      generatedAt: now(),
      maxEntities,
      entityTypes,
      policy,
      limiterPolicy,
    });
    if (cacheable) {
      cache.clear();
      cache.set(cacheKey, snapshot);
    }
    return snapshot;
  };

  const getEntityMastery = async (profileId, contextId, entityType, entityKey) => {
    if (![profileId, contextId, entityType, entityKey].every((value) => typeof value === "string")) {
      throw new TypeError("Practice entity mastery query requires string identity fields");
    }
    const { context, skillStats } = await readContext(repository, profileId, contextId);
    const target = skillStats.find((stat) => stat.entityType === entityType && stat.entityKey === entityKey);
    if (!target) return null;
    const retentionEvidenceMap = new Map([[
      target.statId,
      await getPracticeRetentionEvidence(retentionProvider, { profileId, contextId, entityType, entityKey }),
    ]]);
    const results = buildPracticeMasteryEvaluationSet({
      skillStats,
      context,
      retentionEvidenceMap,
      policy,
      limiterPolicy,
    });
    return results.find((entry) => entry.statId === target.statId) ?? null;
  };

  return Object.freeze({
    buildContextMasterySnapshot,
    getEntityMastery,
    invalidateContext(contextId) {
      for (const key of [...cache.keys()]) {
        const parts = key.split("|");
        if (parts[1] === contextId) cache.delete(key);
      }
    },
    clear() { cache.clear(); },
    getCacheSize() { return cache.size; },
  });
}
