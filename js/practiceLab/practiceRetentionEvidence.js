import { PRACTICE_RETENTION_STATUSES } from "./practiceMasteryConstants.js";

export const PRACTICE_RETENTION_PROVIDER_VERSION = 1;

const DEFAULT_UNVERIFIED_RETENTION = Object.freeze({
  status: "unverified",
  score: null,
  confidenceScore: 0,
  confidenceLevel: "none",
  verificationCount: 0,
  lastVerifiedAt: null,
  eligibleForRetained: false,
});

export function normalizePracticeRetentionEvidence(value) {
  const source = value ?? DEFAULT_UNVERIFIED_RETENTION;
  const status = PRACTICE_RETENTION_STATUSES.includes(source.status) ? source.status : "unavailable";
  const score = Number.isFinite(source.score) ? Math.max(0, Math.min(100, source.score)) : null;
  const confidenceScore = Number.isFinite(source.confidenceScore)
    ? Math.max(0, Math.min(100, source.confidenceScore))
    : 0;
  const confidenceLevel = ["none", "low", "medium", "high"].includes(source.confidenceLevel)
    ? source.confidenceLevel
    : "none";
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

export function createDefaultPracticeRetentionEvidenceProvider() {
  return Object.freeze({
    version: PRACTICE_RETENTION_PROVIDER_VERSION,
    getFingerprint() {
      return `default-unverified-v${PRACTICE_RETENTION_PROVIDER_VERSION}`;
    },
    async getPracticeRetentionEvidence() {
      return DEFAULT_UNVERIFIED_RETENTION;
    },
  });
}

export async function getPracticeRetentionEvidence(provider, identity) {
  const resolved = provider?.getPracticeRetentionEvidence
    ? await provider.getPracticeRetentionEvidence(identity)
    : DEFAULT_UNVERIFIED_RETENTION;
  return normalizePracticeRetentionEvidence(resolved);
}
