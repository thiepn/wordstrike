const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export const PRACTICE_EVALUATION_STATE_VERSION = 1;
export const PRACTICE_EVALUATION_FRAMEWORK_VERSION = 1;
export const PRACTICE_EVALUATION_SELECTION_POLICY_VERSION = 1;
export const PRACTICE_EVALUATION_RESERVATION_VERSION = 1;
export const PRACTICE_EVALUATION_INTEGRITY_VERSION = 1;
export const PRACTICE_EVALUATION_ANALYSIS_VERSION = 1;

export const PRACTICE_BENCHMARK_SUITE_SCHEMA_VERSION = 1;
export const PRACTICE_BENCHMARK_FORM_VERSION = 1;
export const PRACTICE_BENCHMARK_MATCH_POLICY_VERSION = 1;

export const PRACTICE_TRANSFER_POOL_SCHEMA_VERSION = 1;
export const PRACTICE_TRANSFER_UNIT_VERSION = 1;
export const PRACTICE_TRANSFER_SELECTION_POLICY_VERSION = 1;

export const PRACTICE_EVALUATION_KINDS = freezeDeep(["benchmark", "cold-transfer"]);
export const PRACTICE_EVALUATION_HISTORY_STATUSES = freezeDeep(["complete", "partial", "reset"]);
export const PRACTICE_EVALUATION_FRESHNESS_STATUSES = freezeDeep(["fresh", "repeat", "unknown"]);
export const PRACTICE_EVALUATION_INTEGRITY_STATUSES = freezeDeep(["valid", "nonstandard", "invalid"]);
export const PRACTICE_EVALUATION_ANALYSIS_STATUSES = freezeDeep([
  "not-requested", "not-eligible", "measured", "nonstandard", "invalid", "measurement-failed",
]);
export const PRACTICE_BENCHMARK_SUITE_STATUSES = freezeDeep(["draft", "review", "ready", "retired"]);
export const PRACTICE_BENCHMARK_COMPARABILITY_CLASSES = freezeDeep(["engineering-matched", "empirically-calibrated"]);

export const PRACTICE_EVALUATION_INTEGRITY_REASON_CODES = freezeDeep([
  "missing-evaluation-plan",
  "binding-mismatch",
  "content-hash-mismatch",
  "wrong-partition",
  "targeted-content",
  "unexpected-content-append",
  "wrong-duration",
  "wrong-completion-reason",
  "manual-stop",
  "pause-or-visibility",
  "restored-session",
  "wrong-correction-policy",
  "feedback-policy",
  "content-exhausted",
  "history-partial",
  "benchmark-repeat",
  "transfer-repeat",
  "unsupported-protocol",
]);

export const PRACTICE_EVALUATION_LIMITS = freezeDeep({
  reservationTtlMs: 2 * 60 * 60 * 1000,
  activeReservations: 8,
  benchmarkSuites: 16,
  transferPools: 16,
  benchmarkFormsPerSuite: 32,
  transferUnitsPerPool: 128,
  stateBytes: 64 * 1024,
});

export const PRACTICE_BENCHMARK_MATCH_POLICY_V1 = freezeDeep({
  version: PRACTICE_BENCHMARK_MATCH_POLICY_VERSION,
  targetFormCount: 8,
  minimumReadyFormCount: 6,
  minimumGraphemes: 2000,
  maximumGraphemes: 4000,
  minimumWords: 250,
  maximumWeightedRmsDistance: 0.75,
  maximumDifficultySpread: 0.50,
  maximumPercentileSpread: 15,
  maximumLengthDeviationFraction: 0.15,
  maximumCoreFeatureCentroidDistance: 1.25,
  minimumAvailableModelWeight: 0.90,
  separator: "\n\n",
  coreFeatureNames: [
    "meanWordLength",
    "p90WordLength",
    "uppercaseRatio",
    "punctuationRatio",
    "digitRatio",
    "symbolRatio",
    "lexicalRarityScore",
    "bigramRarityScore",
    "difficultyIndex",
    "relativeDifficultyPercentile",
  ],
});

export const PRACTICE_TRANSFER_POOL_POLICY_V1 = freezeDeep({
  version: PRACTICE_TRANSFER_SELECTION_POLICY_VERSION,
  targetUnitCount: 32,
  minimumReadyUnitCount: 16,
  minimumGraphemes: 2000,
  maximumGraphemes: 4000,
  preferredPercentileMinimum: 30,
  preferredPercentileMaximum: 70,
  allowedPercentileMinimum: 20,
  allowedPercentileMaximum: 80,
  separator: "\n\n",
});

export const PRACTICE_EVALUATION_PROTOCOL_V1 = freezeDeep({
  benchmark: {
    protocolId: "ws-benchmark-60s-v1",
    protocolVersion: 1,
    kind: "benchmark",
    abilityChannel: "cold-natural-text",
    durationMs: 60_000,
    completionMode: "duration",
    completionReason: "time-complete",
    correctionBehavior: "allow",
    timingMode: "on-first-input",
    targeted: false,
    resumable: false,
    appendAllowed: false,
    pauseAllowed: false,
    feedback: {
      showLiveWpm: false,
      showLiveAccuracy: false,
      showRhythmFeedback: false,
      metronomeSoundEnabled: false,
      adaptiveHints: false,
      targetHints: false,
      mode: "measurement-minimal",
    },
  },
  "cold-transfer": {
    protocolId: "ws-cold-transfer-60s-v1",
    protocolVersion: 1,
    kind: "cold-transfer",
    abilityChannel: "cold-natural-text",
    durationMs: 60_000,
    completionMode: "duration",
    completionReason: "time-complete",
    correctionBehavior: "allow",
    timingMode: "on-first-input",
    targeted: false,
    resumable: false,
    appendAllowed: false,
    pauseAllowed: false,
    feedback: {
      showLiveWpm: false,
      showLiveAccuracy: false,
      showRhythmFeedback: false,
      metronomeSoundEnabled: false,
      adaptiveHints: false,
      targetHints: false,
      mode: "measurement-minimal",
    },
  },
});
