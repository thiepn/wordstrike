export const PRACTICE_ASSESSMENT_PROTOCOL_VERSION = 1;
export const PRACTICE_ASSESSMENT_POLICY_VERSION = 1;
export const PRACTICE_ASSESSMENT_PLAN_VERSION = 1;
export const PRACTICE_ASSESSMENT_BLUEPRINT_VERSION = 1;
export const PRACTICE_ASSESSMENT_DIAGNOSTIC_FORM_VERSION = 1;
export const PRACTICE_ASSESSMENT_DIAGNOSTIC_MATCH_POLICY_VERSION = 1;
export const PRACTICE_ASSESSMENT_ANALYSIS_VERSION = 1;
export const PRACTICE_ASSESSMENT_BLOCK_DELTA_VERSION = 1;
export const PRACTICE_ASSESSMENT_REPORT_VERSION = 1;

export const PRACTICE_ASSESSMENT_DEPTHS = Object.freeze(["quick", "standard", "deep"]);
export const PRACTICE_ASSESSMENT_RUN_STATUSES = Object.freeze(["created", "active", "completed", "abandoned", "expired", "invalid"]);
export const PRACTICE_ASSESSMENT_INTEGRITY_STATUSES = Object.freeze(["standard", "nonstandard", "partial", "invalid"]);
export const PRACTICE_ASSESSMENT_BLOCK_STATUSES = Object.freeze(["pending", "active", "completed", "invalid"]);
export const PRACTICE_ASSESSMENT_ANALYSIS_STATUSES = Object.freeze(["not-requested", "measured", "nonstandard", "invalid", "measurement-failed"]);
export const PRACTICE_ASSESSMENT_REPORT_STATUSES = Object.freeze(["complete", "partial", "invalid"]);
export const PRACTICE_ASSESSMENT_COMPARISON_STATUSES = Object.freeze(["comparable", "partially-comparable", "not-comparable"]);
export const PRACTICE_ASSESSMENT_CAPABILITY_STATUSES = Object.freeze(["measured", "partial", "not-measured", "unavailable"]);

export const PRACTICE_ASSESSMENT_EXPERIMENT_IDS = Object.freeze({
  benchmark: "full-assessment-benchmark",
  diagnostic: "full-assessment-diagnostic",
  coldTransfer: "full-assessment-transfer",
});

const BLOCKS = [
  ["benchmark-natural", "benchmark", 60_000, "Natural Text"],
  ["diagnostic-core-keys", "diagnostic", 90_000, "Core Key Coverage"],
  ["diagnostic-word-launch", "diagnostic", 90_000, "Word Launch / Lexical Control"],
  ["diagnostic-combinations", "diagnostic", 120_000, "Combination Coverage"],
  ["diagnostic-punctuation-capitals", "diagnostic", 60_000, "Punctuation + Capitals"],
  ["diagnostic-numbers-symbols", "diagnostic", 60_000, "Numbers + Symbols"],
  ["diagnostic-lexical-extended", "diagnostic", 60_000, "Extended Lexical Coverage"],
  ["diagnostic-combinations-extended", "diagnostic", 60_000, "Extended Combination Coverage"],
  ["diagnostic-mixed", "diagnostic", 60_000, "Mixed Diagnostic Text"],
  ["cold-transfer", "cold-transfer", 60_000, "Cold Natural Transfer"],
];

export const PRACTICE_ASSESSMENT_BLOCKS = Object.freeze(BLOCKS.map(([blockId, blockKind, durationMs, displayName], index) => Object.freeze({
  blockId,
  ordinal: index + 1,
  blockKind,
  durationMs,
  displayName,
})));

export const PRACTICE_ASSESSMENT_DEPTH_BLOCK_COUNTS = Object.freeze({ quick: 3, standard: 6, deep: 10 });
export const PRACTICE_ASSESSMENT_DEPTH_DURATION_MS = Object.freeze({ quick: 240_000, standard: 480_000, deep: 720_000 });

export const PRACTICE_ASSESSMENT_LIMITS = Object.freeze({
  maximumAssessmentWallSpanMs: 2 * 60 * 60 * 1000,
  freshnessWindowMs: 30 * 24 * 60 * 60 * 1000,
  maximumRunsPerProfile: 50,
  maximumStoredLimiterSummaries: 8,
  maximumVisibleLimiterSummaries: 5,
  targetDiagnosticVariantsPerBlock: 4,
  minimumReadyDiagnosticVariantsPerBlock: 2,
  engineeringCapacityWpm: 400,
  engineeringCapacityBuffer: 1.10,
});

export const PRACTICE_ASSESSMENT_DIAGNOSTIC_MATCH_POLICY = Object.freeze({
  version: PRACTICE_ASSESSMENT_DIAGNOSTIC_MATCH_POLICY_VERSION,
  maximumDifficultyIndexSpread: 0.50,
  maximumRelativePercentileSpread: 15,
  maximumLengthDeviationRatio: 0.10,
  maximumWeightedRmsFeatureDistance: 0.75,
});

export const PRACTICE_ASSESSMENT_MEASUREMENT_MINIMAL_OVERRIDES = Object.freeze({
  showLiveWpm: false,
  showAggregateLiveAccuracy: false,
  rhythmCoaching: false,
  metronome: false,
  targetHints: false,
  adaptivePrompts: false,
  correctionBehavior: "allow",
  timingStart: "on-first-input",
  resumable: false,
  appendContent: false,
});

export function getPracticeAssessmentBlocksForDepth(depth) {
  const count = PRACTICE_ASSESSMENT_DEPTH_BLOCK_COUNTS[depth];
  if (!Number.isInteger(count)) return [];
  return PRACTICE_ASSESSMENT_BLOCKS.slice(0, count);
}

export function getPracticeAssessmentDurationMs(depth) {
  return PRACTICE_ASSESSMENT_DEPTH_DURATION_MS[depth] ?? null;
}

export function getPracticeAssessmentMinimumFormGraphemes(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  // 400 WPM * 5 graphemes/word * 110%, expressed as an integer ratio so
  // canonical 60/90/120-second blocks cannot drift upward from IEEE-754 noise.
  return Math.ceil((durationMs * PRACTICE_ASSESSMENT_LIMITS.engineeringCapacityWpm * 5 * 11) / (60_000 * 10));
}
