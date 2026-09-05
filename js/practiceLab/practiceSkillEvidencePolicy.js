export const PRACTICE_SKILL_EVIDENCE_VERSION = 1;
export const PRACTICE_SKILL_EVIDENCE_POLICY_VERSION = 1;
export const PRACTICE_SKILL_EVIDENCE_DELTA_VERSION = 1;
export const PRACTICE_EVIDENCE_CONFIDENCE_VERSION = 1;
export const PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION = 1;

export const PRACTICE_EVIDENCE_ROLES = Object.freeze([
  "training",
  "transfer",
  "benchmark",
  "diagnostic",
  "custom",
  "unclassified",
]);

export const PRACTICE_EVIDENCE_ACCURACY_SCOPES = Object.freeze([
  "complete-session",
  "partial-session",
]);

export const PRACTICE_EVIDENCE_TIMING_SCOPES = Object.freeze([
  "complete-session",
  "retained-window",
  "none",
]);

export const PRACTICE_SKILL_EVIDENCE_POLICY_V1 = Object.freeze({
  version: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
  confidenceVersion: PRACTICE_EVIDENCE_CONFIDENCE_VERSION,
  maxBreadthPointsPerEntityPerSession: 8,
  maxRecentSamples: 64,
  maxRecentSamplesPerEntityPerSession: 8,
  maxRoleRecentSamples: 16,
  maxRoleRecentSamplesPerEntityPerSession: 4,
  checkpointEntityCap: 1024,
  admissionLimits: Object.freeze({
    key: 512,
    bigram: 1500,
    trigram: 2000,
    word: 2000,
  }),
  confidenceQuantityScales: Object.freeze({
    key: 80,
    bigram: 50,
    trigram: 35,
    word: 15,
    default: 30,
  }),
  confidenceSessionScale: 3,
  confidenceDayScale: 3,
  confidenceBreadthScale: 12,
  confidenceWeights: Object.freeze({
    quantity: 0.45,
    sessions: 0.25,
    days: 0.15,
    breadth: 0.15,
  }),
  confidenceThresholds: Object.freeze({
    low: 0,
    medium: 50,
    high: 80,
  }),
  allowCustomWordEvidence: false,
});

export function validatePracticeSkillEvidencePolicy(policy = PRACTICE_SKILL_EVIDENCE_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_SKILL_EVIDENCE_POLICY_VERSION) {
    throw new TypeError("Unsupported Practice skill evidence policy version");
  }
  const limits = policy.admissionLimits;
  for (const type of ["key", "bigram", "trigram", "word"]) {
    if (!Number.isInteger(limits?.[type]) || limits[type] < 1) throw new TypeError(`Practice ${type} admission limit must be positive`);
  }
  for (const key of [
    "maxBreadthPointsPerEntityPerSession",
    "maxRecentSamples",
    "maxRecentSamplesPerEntityPerSession",
    "maxRoleRecentSamples",
    "maxRoleRecentSamplesPerEntityPerSession",
    "checkpointEntityCap",
  ]) {
    if (!Number.isInteger(policy[key]) || policy[key] < 1) throw new TypeError(`Practice skill evidence policy ${key} must be positive`);
  }
  const weightTotal = Object.values(policy.confidenceWeights || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  if (Math.abs(weightTotal - 1) > 1e-12) throw new TypeError("Practice evidence confidence weights must sum to one");
  return policy;
}
