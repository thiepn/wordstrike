import { evaluatePracticeCandidateHierarchy } from "./practiceEntityHierarchy.js";
import { evaluatePracticeLimiterDimensions } from "./practiceLimiterDimensions.js";
import { PRACTICE_LIMITER_POLICY_V1 } from "./practiceLimiterPolicy.js";
import { createPracticePeerReferenceIndex } from "./practicePeerReference.js";
import { evaluatePracticeEntityMastery } from "./practiceEntityMastery.js";
import {
  PRACTICE_AUTOMATICITY_MODEL_VERSION,
  PRACTICE_CONTEXT_ROBUSTNESS_VERSION,
  PRACTICE_DERIVED_MASTERY_STAGES,
  PRACTICE_MASTERY_MODEL_VERSION,
  PRACTICE_MASTERY_POLICY_VERSION,
  PRACTICE_MASTERY_SNAPSHOT_VERSION,
  PRACTICE_MASTERY_STAGE_RANK,
  PRACTICE_TRANSFER_MODEL_VERSION,
} from "./practiceMasteryConstants.js";
import { PRACTICE_MASTERY_POLICY_V1, validatePracticeMasteryPolicy } from "./practiceMasteryPolicy.js";
import { normalizePracticeRetentionEvidence } from "./practiceRetentionEvidence.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;
const entityId = (entry) => `${entry.entityType}|${entry.entityKey}`;

function assertInputs(stats, context) {
  if (!context?.contextId || !context?.profileId) throw new TypeError("Practice mastery snapshot requires canonical context");
  for (const stat of stats) {
    if (stat?.profileId !== context.profileId || stat?.contextId !== context.contextId) {
      throw new TypeError("Practice mastery snapshot cannot mix profiles or contexts");
    }
    if (stat?.recordVersion !== 3 || !stat?.evidence) {
      throw new TypeError("Practice mastery snapshot requires canonical PL11 skillStat v3 evidence");
    }
  }
}

function normalizeGeneratedAt(generatedAt) {
  const iso = typeof generatedAt === "string"
    ? generatedAt
    : generatedAt instanceof Date ? generatedAt.toISOString() : null;
  if (!iso || !Number.isFinite(Date.parse(iso))) throw new TypeError("Practice mastery snapshot requires generatedAt");
  return iso;
}

function retentionFor(stat, retentionEvidenceMap) {
  if (retentionEvidenceMap instanceof Map) return normalizePracticeRetentionEvidence(retentionEvidenceMap.get(stat.statId));
  return normalizePracticeRetentionEvidence(retentionEvidenceMap?.[stat.statId]);
}

export function buildPracticeMasteryEvaluationSet({
  skillStats,
  context,
  retentionEvidenceMap = new Map(),
  policy = PRACTICE_MASTERY_POLICY_V1,
  limiterPolicy = PRACTICE_LIMITER_POLICY_V1,
} = {}) {
  validatePracticeMasteryPolicy(policy);
  const stats = Array.isArray(skillStats) ? [...skillStats] : [];
  assertInputs(stats, context);
  const peerIndex = createPracticePeerReferenceIndex(stats, limiterPolicy);
  const bases = stats.map((stat) => {
    const limiterEvaluation = evaluatePracticeLimiterDimensions(stat, peerIndex.forStat(stat), limiterPolicy);
    return {
      stat,
      limiterEvaluation,
      statId: stat.statId,
      entityType: stat.entityType,
      entityKey: stat.entityKey,
      dimensions: limiterEvaluation.dimensions,
      hierarchy: null,
    };
  });
  const byEntity = new Map(bases.map((entry) => [entityId(entry), entry]));
  for (const entry of bases) {
    entry.hierarchy = evaluatePracticeCandidateHierarchy(entry, byEntity, limiterPolicy);
  }
  return freezeDeep(bases.map((entry) => evaluatePracticeEntityMastery({
    stat: entry.stat,
    limiterEvaluation: entry.limiterEvaluation,
    retentionEvidence: retentionFor(entry.stat, retentionEvidenceMap),
    hierarchy: entry.hierarchy,
    policy,
  })));
}

function selectSnapshotEntities(results, maxEntities, entityTypes) {
  const allowed = entityTypes?.length ? new Set(entityTypes) : null;
  const filtered = results.filter((result) => !allowed || allowed.has(result.entityType));
  const learningRank = (result) => result.stage === "learning" ? 0 : 1;
  return filtered.sort((a, b) => {
    const learning = learningRank(a) - learningRank(b);
    if (learning) return learning;
    if (a.stage === "learning" && b.stage === "learning") {
      const confidence = b.evidenceSummary.generalConfidenceScore - a.evidenceSummary.generalConfidenceScore;
      if (confidence) return confidence;
    }
    const stage = (PRACTICE_MASTERY_STAGE_RANK[b.stage] ?? 0) - (PRACTICE_MASTERY_STAGE_RANK[a.stage] ?? 0);
    if (stage) return stage;
    const targeted = b.evidenceSummary.directTargetedCount - a.evidenceSummary.directTargetedCount;
    if (targeted) return targeted;
    return a.entityType.localeCompare(b.entityType)
      || a.entityKey.localeCompare(b.entityKey)
      || a.statId.localeCompare(b.statId);
  }).slice(0, maxEntities);
}

export function buildPracticeMasterySnapshot({
  skillStats,
  context,
  retentionEvidenceMap = new Map(),
  generatedAt,
  maxEntities = PRACTICE_MASTERY_POLICY_V1.snapshot.maxEntities,
  entityTypes = null,
  policy = PRACTICE_MASTERY_POLICY_V1,
  limiterPolicy = PRACTICE_LIMITER_POLICY_V1,
} = {}) {
  const generatedIso = normalizeGeneratedAt(generatedAt);
  if (!Number.isInteger(maxEntities) || maxEntities < 1 || maxEntities > 4096) {
    throw new TypeError("Practice mastery snapshot maxEntities is invalid");
  }
  if (entityTypes != null && (!Array.isArray(entityTypes) || entityTypes.some((type) => !["key", "bigram", "trigram", "word"].includes(type)))) {
    throw new TypeError("Practice mastery snapshot entityTypes is invalid");
  }

  const results = buildPracticeMasteryEvaluationSet({
    skillStats,
    context,
    retentionEvidenceMap,
    policy,
    limiterPolicy,
  });
  const stageCounts = Object.fromEntries(PRACTICE_DERIVED_MASTERY_STAGES.map((stage) => [stage, 0]));
  const automaticityCounts = { unmeasured: 0, developing: 0, emerging: 0, established: 0, strong: 0 };
  let anchorEligibleCount = 0;
  let promotionEligibleCount = 0;
  let transferUnverifiedCount = 0;
  let retentionUnverifiedCount = 0;
  let measuredCount = 0;
  let coreReadyCount = 0;

  for (const result of results) {
    stageCounts[result.stage] += 1;
    automaticityCounts[result.automaticity.status] += 1;
    anchorEligibleCount += Number(result.anchorEligibility.eligible);
    promotionEligibleCount += Number(result.hierarchyReadiness.promotionEligible);
    transferUnverifiedCount += Number(result.transfer.score == null);
    retentionUnverifiedCount += Number(result.retention.status !== "verified");
    if (result.stage !== "unmeasured") {
      measuredCount += 1;
      coreReadyCount += Number(["accuracy", "speed", "stability", "contextRobustness"]
        .every((key) => finite(result.dimensions[key].score)));
    }
  }

  const coreCoverage = measuredCount ? coreReadyCount / measuredCount : 0;
  const status = measuredCount === 0
    ? "insufficient-data"
    : coreCoverage >= policy.snapshot.readyCoreCoverage ? "ready" : "partial";
  const entities = selectSnapshotEntities(results, Math.min(maxEntities, policy.snapshot.maxEntities), entityTypes);

  return freezeDeep({
    snapshotVersion: PRACTICE_MASTERY_SNAPSHOT_VERSION,
    modelVersion: PRACTICE_MASTERY_MODEL_VERSION,
    policyVersion: PRACTICE_MASTERY_POLICY_VERSION,
    automaticityVersion: PRACTICE_AUTOMATICITY_MODEL_VERSION,
    robustnessVersion: PRACTICE_CONTEXT_ROBUSTNESS_VERSION,
    transferVersion: PRACTICE_TRANSFER_MODEL_VERSION,
    profileId: context.profileId,
    contextId: context.contextId,
    generatedAt: generatedIso,
    status,
    counts: {
      stageCounts,
      automaticityCounts,
      anchorEligibleCount,
      promotionEligibleCount,
      transferUnverifiedCount,
      retentionUnverifiedCount,
    },
    entities,
    diagnostics: {
      evaluatedEntityCount: results.length,
      returnedEntityCount: entities.length,
      measuredEntityCount: measuredCount,
      coreReadyEntityCount: coreReadyCount,
      coreCoverage,
      maxEntities: Math.min(maxEntities, policy.snapshot.maxEntities),
      entityTypes: entityTypes ? [...entityTypes] : null,
    },
  });
}
