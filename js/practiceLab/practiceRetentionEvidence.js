import { PRACTICE_RETENTION_STATUSES } from "./practiceMasteryConstants.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";

export const PRACTICE_RETENTION_PROVIDER_VERSION = 2;

const DEFAULT_UNVERIFIED_RETENTION = Object.freeze({
  status: "unverified",
  score: null,
  confidenceScore: 0,
  confidenceLevel: "none",
  verificationCount: 0,
  lastVerifiedAt: null,
  eligibleForRetained: false,
});

const UNAVAILABLE_RETENTION = Object.freeze({
  status: "unavailable",
  score: null,
  confidenceScore: 0,
  confidenceLevel: "none",
  verificationCount: 0,
  lastVerifiedAt: null,
  eligibleForRetained: false,
});

function identity(entityType, entityKey) {
  return `${entityType}\u0000${entityKey}`;
}

function fnv32(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function normalizePracticeRetentionEvidence(value) {
  const source = value ?? DEFAULT_UNVERIFIED_RETENTION;
  const status = PRACTICE_RETENTION_STATUSES.includes(source.status) ? source.status : "unavailable";
  const score = Number.isFinite(source.score) ? Math.max(0, Math.min(100, source.score)) : null;
  const confidenceScore = Number.isFinite(source.confidenceScore) ? Math.max(0, Math.min(100, source.confidenceScore)) : 0;
  const confidenceLevel = ["none", "low", "medium", "high"].includes(source.confidenceLevel) ? source.confidenceLevel : "none";
  return Object.freeze({
    status,
    score,
    confidenceScore,
    confidenceLevel,
    verificationCount: Math.max(0, Number(source.verificationCount) || 0),
    lastVerifiedAt: source.lastVerifiedAt ?? null,
    eligibleForRetained: source.eligibleForRetained === true,
  });
}

export function buildPracticeRetentionEvidence(reviewItem, policy = PRACTICE_REVIEW_POLICY_V1) {
  if (!reviewItem || reviewItem.recordVersion !== 3 || !reviewItem.retention || !reviewItem.cycle) return UNAVAILABLE_RETENTION;
  const retention = reviewItem.retention;
  const verificationCount = Math.max(0, Number(retention.currentCycleVerificationCount) || 0);
  const latest = retention.lastOutcome ?? null;
  let status = retention.status;
  if (reviewItem.state === "suspended" && reviewItem.suspensionReason === "retention-failed") status = "failed";
  else if (latest === "fail") status = "failed";
  else if (verificationCount === 0) status = "unverified";
  else if (status !== "verified") status = "verified";
  const requirements = policy.retentionAggregate.retainedEligibility;
  const confidenceRank = { none: 0, low: 1, medium: 2, high: 3 };
  const eligibleForRetained = reviewItem.state === "active"
    && status === "verified"
    && Number(retention.score) >= requirements.minimumScore
    && (confidenceRank[retention.confidenceLevel] ?? 0) >= (confidenceRank[requirements.minimumConfidenceLevel] ?? 2)
    && Number(retention.currentCycleSuccessfulCount || 0) >= requirements.minimumSuccessfulCount
    && Number(retention.currentCycleDistinctSuccessfulDays || 0) >= requirements.minimumDistinctSuccessfulDays
    && Number(retention.currentCycleMaxSuccessfulDelayDays || 0) >= requirements.minimumSuccessfulDelayDays
    && Number(retention.currentCycleDistinctSuccessfulFamilies || 0) >= requirements.minimumDistinctSuccessfulFamilies
    && (latest === "strong" || latest === "pass");
  return normalizePracticeRetentionEvidence({
    status,
    score: retention.score,
    confidenceScore: retention.confidenceScore,
    confidenceLevel: retention.confidenceLevel,
    verificationCount,
    lastVerifiedAt: retention.lastVerifiedAt,
    eligibleForRetained,
  });
}

export function createPracticeRetentionEvidenceMap(reviewItems, policy = PRACTICE_REVIEW_POLICY_V1) {
  const result = new Map();
  for (const item of Array.isArray(reviewItems) ? reviewItems : []) {
    result.set(identity(item.entityType, item.entityKey), buildPracticeRetentionEvidence(item, policy));
  }
  return result;
}

export function createDefaultPracticeRetentionEvidenceProvider() {
  return Object.freeze({
    version: 1,
    getFingerprint() { return "default-unverified-v1"; },
    async getPracticeRetentionEvidence() { return DEFAULT_UNVERIFIED_RETENTION; },
  });
}

async function listContextReviewItems(repository, profileId, contextId) {
  if (typeof repository?.listReviewItems === "function") return repository.listReviewItems(profileId, contextId);
  if (typeof repository?.listReviewItemsAcrossContexts === "function") {
    const all = await repository.listReviewItemsAcrossContexts(profileId);
    return all.filter((item) => item.contextId === contextId);
  }
  return [];
}

export function createPracticeReviewRetentionEvidenceProvider({ repository, policy = PRACTICE_REVIEW_POLICY_V1 } = {}) {
  if (!repository) throw new TypeError("Practice review retention provider requires repository");
  const cache = new Map();
  const load = async (profileId, contextId) => {
    const key = `${profileId}\u0000${contextId}`;
    const items = await listContextReviewItems(repository, profileId, contextId);
    const fingerprintRows = items.map((item) => [
      item.reviewItemId,
      item.recordVersion,
      item.updatedAt,
      item.state,
      item.cycle?.cycleId ?? 0,
      item.cycle?.referenceAtUtc ?? "",
      item.retention?.lastVerifiedAt ?? "",
      item.retention?.lastOutcome ?? "",
      item.retention?.score ?? "",
      item.retention?.confidenceScore ?? 0,
    ].join("|")).sort();
    const fingerprint = `${fingerprintRows.length}:${fnv32(fingerprintRows.join("\n"))}`;
    const cached = cache.get(key);
    if (cached?.fingerprint === fingerprint) return cached;
    const entry = { fingerprint, items, byEntity: createPracticeRetentionEvidenceMap(items, policy) };
    cache.set(key, entry);
    return entry;
  };
  return Object.freeze({
    version: PRACTICE_RETENTION_PROVIDER_VERSION,
    async getFingerprint({ profileId, contextId }) {
      return (await load(profileId, contextId)).fingerprint;
    },
    async getPracticeRetentionEvidence({ profileId, contextId, entityType, entityKey }) {
      return (await load(profileId, contextId)).byEntity.get(identity(entityType, entityKey)) ?? UNAVAILABLE_RETENTION;
    },
    async getPracticeRetentionEvidenceMap({ profileId, contextId, skillStats = [] }) {
      const byEntity = (await load(profileId, contextId)).byEntity;
      return new Map(skillStats.map((stat) => [stat.statId, byEntity.get(identity(stat.entityType, stat.entityKey)) ?? UNAVAILABLE_RETENTION]));
    },
    invalidateContext(profileId, contextId) { cache.delete(`${profileId}\u0000${contextId}`); },
    clear() { cache.clear(); },
  });
}

export async function getPracticeRetentionEvidence(provider, identityFields) {
  const resolved = provider?.getPracticeRetentionEvidence ? await provider.getPracticeRetentionEvidence(identityFields) : DEFAULT_UNVERIFIED_RETENTION;
  return normalizePracticeRetentionEvidence(resolved);
}
