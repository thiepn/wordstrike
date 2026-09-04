export const PRACTICE_ERROR_ANALYSIS_VERSION = 1;
export const PRACTICE_ERROR_ANALYZER_VERSION = 1;
export const PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION = 1;
export const PRACTICE_RECOVERY_POLICY_VERSION = 1;
export const PRACTICE_ERROR_TRACKER_VERSION = 1;

export const PRACTICE_ERROR_STRUCTURAL_CLASSES = Object.freeze([
  "substitution",
  "insertion",
  "omission",
  "transposition",
  "compound",
  "unknown",
]);

export const PRACTICE_ERROR_CONTENT_CLASSES = Object.freeze([
  "letter",
  "capitalization",
  "punctuation",
  "whitespace-boundary",
  "numeric",
  "symbol",
  "mixed",
  "unknown",
]);

export const PRACTICE_ERROR_CLASSIFICATION_CONFIDENCE = Object.freeze([
  "high",
  "medium",
  "low",
  "unresolved",
]);

export const PRACTICE_ERROR_SUMMARY_CONFIDENCE = Object.freeze([
  "none",
  "low",
  "medium",
  "high",
]);

export const PRACTICE_ERROR_AGGREGATE_SCOPES = Object.freeze([
  "complete-session",
  "retained-window",
  "post-restore",
]);

export const PRACTICE_ERROR_TRACE_SCOPES = Object.freeze([
  "complete-session",
  "retained-window",
]);

export const PRACTICE_ERROR_POLICY_V1 = Object.freeze({
  analysisVersion: PRACTICE_ERROR_ANALYSIS_VERSION,
  errorAnalyzerVersion: PRACTICE_ERROR_ANALYZER_VERSION,
  alignmentPolicyVersion: PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION,
  recoveryPolicyVersion: PRACTICE_RECOVERY_POLICY_VERSION,
  trackerVersion: PRACTICE_ERROR_TRACKER_VERSION,
  maximumEpisodeEvents: 64,
  maximumAlignmentGraphemes: 48,
  maximumEditDistanceForSimpleClass: 3,
  recentEpisodeSamples: 64,
  recoverySampleCap: 64,
  resumeFluentLookaheadTransitions: 8,
});

export function validatePracticeErrorPolicy(policy = PRACTICE_ERROR_POLICY_V1) {
  if (!policy || typeof policy !== "object") throw new TypeError("Practice error policy must be an object");
  for (const [key, expected] of [
    ["analysisVersion", PRACTICE_ERROR_ANALYSIS_VERSION],
    ["errorAnalyzerVersion", PRACTICE_ERROR_ANALYZER_VERSION],
    ["alignmentPolicyVersion", PRACTICE_ERROR_ALIGNMENT_POLICY_VERSION],
    ["recoveryPolicyVersion", PRACTICE_RECOVERY_POLICY_VERSION],
    ["trackerVersion", PRACTICE_ERROR_TRACKER_VERSION],
  ]) {
    if (policy[key] !== expected) throw new TypeError(`Unsupported Practice error policy ${key}`);
  }
  for (const key of [
    "maximumEpisodeEvents",
    "maximumAlignmentGraphemes",
    "maximumEditDistanceForSimpleClass",
    "recentEpisodeSamples",
    "recoverySampleCap",
    "resumeFluentLookaheadTransitions",
  ]) {
    if (!Number.isInteger(policy[key]) || policy[key] < 1) throw new TypeError(`Practice error policy ${key} must be a positive integer`);
  }
  return policy;
}
