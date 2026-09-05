import { computePracticeEvidenceConfidence } from "./practiceEvidenceConfidence.js";
import { PRACTICE_LIMITS } from "./practiceConstants.js";
import { createPracticePeerReferenceIndex } from "./practicePeerReference.js";
import { evaluatePracticeLimiterDimensions } from "./practiceLimiterDimensions.js";
import { computePracticePerformanceBurden, assignPracticeImpactPercentiles } from "./practiceImpactModel.js";
import { evaluatePracticeCandidateHierarchy } from "./practiceEntityHierarchy.js";
import {
  PRACTICE_LIMITER_SNAPSHOT_VERSION,
  PRACTICE_LIMITER_MODEL_VERSION,
  PRACTICE_LIMITER_POLICY_VERSION,
  PRACTICE_IMPACT_MODEL_VERSION,
  PRACTICE_HIERARCHY_MODEL_VERSION,
  PRACTICE_PREVALENCE_MODEL_VERSION,
  PRACTICE_LIMITER_POLICY_V1,
  validatePracticeLimiterPolicy,
} from "./practiceLimiterPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;
const STATUS_STRENGTH = Object.freeze({ "insufficient-data": 0, "not-elevated": 1, possible: 2, likely: 3, confirmed: 4 });
const entityKey = (candidate) => `${candidate.entityType}|${candidate.entityKey}`;

function assertInputs(stats, context) {
  if (!context?.contextId || !context?.profileId) throw new TypeError("Practice limiter snapshot requires a canonical context");
  for (const stat of stats) {
    if (stat?.profileId !== context.profileId || stat?.contextId !== context.contextId) throw new TypeError("Practice limiter snapshot cannot mix profiles or contexts");
    if (stat?.recordVersion !== 3 || !stat?.evidence) throw new TypeError("Practice limiter snapshot requires canonical PL11 skillStat v3 evidence");
  }
}

function evidenceMetadata(stat, generalConfidence, dimensions) {
  return Object.freeze({
    evidenceVersion: stat.evidenceVersion ?? null,
    generalConfidenceScore: generalConfidence.score,
    generalConfidenceLevel: generalConfidence.level,
    opportunityCount: Number(stat.evidence?.opportunities?.count || 0),
    observationSessionCount: Number(stat.evidence?.observation?.sessionCount || 0),
    observationDayCount: Number(stat.evidence?.observation?.dayCount || 0),
    primaryDimensionConfidenceScore: dimensions.primaryDimensionConfidenceScore,
    primaryDimensionConfidenceLevel: dimensions.primaryDimensionConfidenceLevel,
  });
}

function compactDimensions(dimensions) {
  return Object.freeze({
    slow: dimensions.slow,
    hesitant: dimensions.hesitant,
    inaccurate: dimensions.inaccurate,
    recoveryHeavy: dimensions["recovery-heavy"],
    launchLimited: dimensions["launch-limited"],
    unstable: dimensions.unstable,
  });
}

function sortCandidates(a, b) {
  const aKnown = finite(a.priorityScore);
  const bKnown = finite(b.priorityScore);
  if (aKnown !== bKnown) return aKnown ? -1 : 1;
  if (aKnown && bKnown && b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
  const statusDelta = (STATUS_STRENGTH[b.status] ?? 0) - (STATUS_STRENGTH[a.status] ?? 0);
  if (statusDelta) return statusDelta;
  if (b.evidenceMetadata.primaryDimensionConfidenceScore !== a.evidenceMetadata.primaryDimensionConfidenceScore) return b.evidenceMetadata.primaryDimensionConfidenceScore - a.evidenceMetadata.primaryDimensionConfidenceScore;
  if (b.weaknessScore !== a.weaknessScore) return b.weaknessScore - a.weaknessScore;
  return a.entityType.localeCompare(b.entityType) || a.entityKey.localeCompare(b.entityKey) || a.statId.localeCompare(b.statId);
}

function boundedCandidates(candidates, primaryLimiterIds, maxCandidates, policy) {
  const primarySet = new Set(primaryLimiterIds);
  const eligible = candidates.filter((candidate) => candidate.weaknessScore > 0 || ["possible", "likely", "confirmed"].includes(candidate.status));
  eligible.sort(sortCandidates);
  const typeCounts = { key: 0, bigram: 0, trigram: 0, word: 0 };
  const result = [];
  const add = (candidate) => {
    if (result.some((entry) => entry.statId === candidate.statId)) return;
    const cap = policy.perTypeCandidateCaps[candidate.entityType] ?? maxCandidates;
    if ((typeCounts[candidate.entityType] ?? 0) >= cap) return;
    if (result.length >= maxCandidates) return;
    typeCounts[candidate.entityType] = (typeCounts[candidate.entityType] ?? 0) + 1;
    result.push(candidate);
  };
  for (const candidate of eligible.filter((candidate) => primarySet.has(candidate.statId))) add(candidate);
  for (const candidate of eligible) add(candidate);
  return result.sort(sortCandidates);
}

function buildPrimaryList(candidates) {
  const ranked = candidates
    .filter((candidate) => ["likely", "confirmed"].includes(candidate.status) && finite(candidate.priorityScore))
    .sort(sortCandidates);
  const byId = new Map(candidates.map((candidate) => [candidate.statId, candidate]));
  const selected = [];
  for (const candidate of ranked) {
    if (selected.length >= PRACTICE_LIMITS.primaryLimiterIds) break;
    if (candidate.hierarchy.status === "explained") {
      const rankedExplainer = candidate.hierarchy.explainedBy.some((entry) => {
        const child = byId.get(entry.statId);
        return child && ["likely", "confirmed"].includes(child.status) && finite(child.priorityScore) && child.priorityScore >= candidate.priorityScore;
      });
      if (rankedExplainer) continue;
    }
    selected.push(candidate.statId);
  }
  return selected;
}

export function buildPracticeLimiterSnapshot({
  skillStats,
  context,
  prevalenceByStat = new Map(),
  generatedAt,
  maxCandidates = PRACTICE_LIMITER_POLICY_V1.maxCandidates,
  policy = PRACTICE_LIMITER_POLICY_V1,
} = {}) {
  validatePracticeLimiterPolicy(policy);
  const stats = Array.isArray(skillStats) ? [...skillStats] : [];
  assertInputs(stats, context);
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 4096) throw new TypeError("Practice limiter snapshot maxCandidates is invalid");
  const generatedIso = typeof generatedAt === "string" ? generatedAt : generatedAt instanceof Date ? generatedAt.toISOString() : null;
  if (!generatedIso || !Number.isFinite(Date.parse(generatedIso))) throw new TypeError("Practice limiter snapshot requires injected generatedAt");

  const peerIndex = createPracticePeerReferenceIndex(stats, policy);
  let candidates = stats.map((stat) => {
    const peer = peerIndex.forStat(stat);
    const dimensions = evaluatePracticeLimiterDimensions(stat, peer, policy);
    const generalConfidence = computePracticeEvidenceConfidence(stat, "general");
    const prevalence = prevalenceByStat instanceof Map ? prevalenceByStat.get(stat.statId) : prevalenceByStat?.[stat.statId];
    return {
      statId: stat.statId,
      entityType: stat.entityType,
      entityKey: stat.entityKey,
      evidenceConfidenceScore: generalConfidence.score,
      evidenceConfidenceLevel: generalConfidence.level,
      status: dimensions.status,
      primaryPhenotype: dimensions.primaryPhenotype,
      mixedTypes: dimensions.mixedTypes,
      weaknessScore: dimensions.weaknessScore,
      dimensions: dimensions.dimensions,
      impact: computePracticePerformanceBurden(stat, prevalence, policy),
      hierarchy: null,
      priorityScore: null,
      evidenceMetadata: evidenceMetadata(stat, generalConfidence, dimensions),
    };
  });

  candidates = assignPracticeImpactPercentiles(candidates, policy);
  const byEntity = new Map(candidates.map((candidate) => [entityKey(candidate), candidate]));
  candidates = candidates.map((candidate) => {
    const hierarchy = evaluatePracticeCandidateHierarchy(candidate, byEntity, policy);
    const impactScore = candidate.impact?.impactScore;
    const primaryConfidence = candidate.evidenceMetadata.primaryDimensionConfidenceScore;
    const priorityScore = finite(impactScore) ? Math.max(0, Math.min(100, impactScore * primaryConfidence / 100 * hierarchy.penalty)) : null;
    return freezeDeep({ ...candidate, dimensions: compactDimensions(candidate.dimensions), hierarchy, priorityScore });
  });

  const primaryLimiterIds = buildPrimaryList(candidates);
  const returned = boundedCandidates(candidates, primaryLimiterIds, Math.min(maxCandidates, policy.maxCandidates), policy);
  const prevalenceCounts = { reference: 0, "practice-proxy": 0, unavailable: 0 };
  for (const candidate of candidates) prevalenceCounts[candidate.impact?.prevalence?.status ?? "unavailable"] += 1;
  const phenotypeCounts = {};
  const statusCounts = { "insufficient-data": 0, "not-elevated": 0, possible: 0, likely: 0, confirmed: 0 };
  const hierarchyCounts = { independent: 0, "partially-explained": 0, explained: 0 };
  for (const candidate of candidates) {
    phenotypeCounts[candidate.primaryPhenotype] = (phenotypeCounts[candidate.primaryPhenotype] ?? 0) + 1;
    statusCounts[candidate.status] = (statusCounts[candidate.status] ?? 0) + 1;
    hierarchyCounts[candidate.hierarchy.status] += 1;
  }
  const evidenced = candidates.filter((candidate) => candidate.status !== "insufficient-data").length;
  const impactKnown = candidates.filter((candidate) => candidate.impact?.status !== "unavailable").length;
  let status = "insufficient-data";
  if (evidenced > 0 && impactKnown === 0) status = "unsupported-context";
  else if (evidenced > 0 && prevalenceCounts.reference > 0 && prevalenceCounts["practice-proxy"] === 0 && prevalenceCounts.unavailable === 0) status = "ready";
  else if (evidenced > 0 && impactKnown > 0) status = "partial";

  return freezeDeep({
    snapshotVersion: PRACTICE_LIMITER_SNAPSHOT_VERSION,
    modelVersion: PRACTICE_LIMITER_MODEL_VERSION,
    policyVersion: PRACTICE_LIMITER_POLICY_VERSION,
    impactModelVersion: PRACTICE_IMPACT_MODEL_VERSION,
    hierarchyModelVersion: PRACTICE_HIERARCHY_MODEL_VERSION,
    prevalenceModelVersion: PRACTICE_PREVALENCE_MODEL_VERSION,
    profileId: context.profileId,
    contextId: context.contextId,
    generatedAt: generatedIso,
    status,
    evidenceSummary: { evaluatedEntityCount: candidates.length, evidencedEntityCount: evidenced, returnedCandidateCount: returned.length, statusCounts, phenotypeCounts },
    referenceSummary: { language: context.dataLocale ?? null, prevalenceCounts },
    primaryLimiterIds: primaryLimiterIds.slice(0, PRACTICE_LIMITS.primaryLimiterIds),
    candidates: returned,
    diagnostics: { hierarchyCounts, maxCandidates: Math.min(maxCandidates, policy.maxCandidates), perTypeCandidateCaps: policy.perTypeCandidateCaps },
  });
}
