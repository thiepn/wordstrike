import {
  PRACTICE_ABILITY_CHANNELS,
  PRACTICE_ABILITY_ESTIMATOR_VERSION,
  PRACTICE_ABILITY_MEASUREMENT_COMPLETION_REASONS,
  PRACTICE_ABILITY_POLICY_VERSION,
  PRACTICE_ABILITY_UNCERTAINTY_VERSION,
} from "./practiceAbilityConstants.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

const measurementReasons = [...PRACTICE_ABILITY_MEASUREMENT_COMPLETION_REASONS];

const channel = ({
  channel,
  allowedEvidenceRoles,
  minimumDurationMs,
  maximumDurationMs,
  minimumTypedCharacters,
  minimumAccuracy = 70,
  durationReferenceFloorSeconds = 15,
}) => freezeDeep({
  channel,
  allowedEvidenceRoles: [...allowedEvidenceRoles],
  minimumDurationMs,
  maximumDurationMs,
  minimumTypedCharacters,
  minimumAccuracy,
  requiresUntargetedContent: true,
  requiresCorrectionAllowed: true,
  allowedCompletionReasons: [...measurementReasons],
  durationReferenceFloorSeconds,
});

export const PRACTICE_ABILITY_CHANNEL_POLICY_V1 = freezeDeep({
  "cold-natural-text": channel({
    channel: "cold-natural-text",
    allowedEvidenceRoles: ["transfer", "benchmark"],
    minimumDurationMs: 30_000,
    maximumDurationMs: 600_000,
    minimumTypedCharacters: 100,
  }),
  "controlled-speed": channel({
    channel: "controlled-speed",
    allowedEvidenceRoles: ["benchmark", "diagnostic"],
    minimumDurationMs: 20_000,
    maximumDurationMs: 300_000,
    minimumTypedCharacters: 75,
  }),
  "common-words": channel({
    channel: "common-words",
    allowedEvidenceRoles: ["training", "diagnostic"],
    minimumDurationMs: 15_000,
    maximumDurationMs: 180_000,
    minimumTypedCharacters: 50,
  }),
  burst: channel({
    channel: "burst",
    allowedEvidenceRoles: ["training", "diagnostic"],
    minimumDurationMs: 5_000,
    maximumDurationMs: 15_000,
    minimumTypedCharacters: 25,
    durationReferenceFloorSeconds: 5,
  }),
  endurance: channel({
    channel: "endurance",
    allowedEvidenceRoles: ["transfer", "benchmark"],
    minimumDurationMs: 180_000,
    maximumDurationMs: 1_800_000,
    minimumTypedCharacters: 500,
  }),
  punctuation: channel({
    channel: "punctuation",
    allowedEvidenceRoles: ["diagnostic", "benchmark"],
    minimumDurationMs: 30_000,
    maximumDurationMs: 300_000,
    minimumTypedCharacters: 100,
  }),
  "numbers-symbols": channel({
    channel: "numbers-symbols",
    allowedEvidenceRoles: ["diagnostic", "benchmark"],
    minimumDurationMs: 30_000,
    maximumDurationMs: 300_000,
    minimumTypedCharacters: 100,
  }),
});

export const PRACTICE_ABILITY_POLICY_V1 = freezeDeep({
  version: PRACTICE_ABILITY_POLICY_VERSION,
  estimatorVersion: PRACTICE_ABILITY_ESTIMATOR_VERSION,
  uncertaintyVersion: PRACTICE_ABILITY_UNCERTAINTY_VERSION,
  channels: PRACTICE_ABILITY_CHANNEL_POLICY_V1,
  difficulty: {
    logCoefficient: 0.03,
    maxAbsoluteLogAdjustment: 0.12,
  },
  uncertainty: {
    baseSigmaLogAt60Seconds: 0.08,
    durationReferenceSeconds: 60,
    durationReferenceCeilingSeconds: 300,
    accuracyReference: 0.97,
    accuracyPenaltySlope: 2.5,
    missingRhythmPenalty: 1.15,
    maximumRhythmPenaltyExtra: 0.5,
    difficultyPenalties: {
      full: 1,
      partial: 1.15,
      insufficient: 1.35,
      "unsupported-language": 1.35,
    },
    maximumInterruptionPenaltyExtra: 0.5,
    interruptionPenaltySlope: 2,
    tracePartialPenalty: 1.10,
    sigmaFloor: 0.04,
    sigmaCeiling: 0.30,
    downweightedSigmaThreshold: 0.12,
    reliabilityReferenceSigma: 0.08,
    reliabilityMinimum: 0.05,
    reliabilityMaximum: 4,
  },
  estimator: {
    initialSigmaLog: 0.20,
    processVariancePerDay: 0.0001,
    maximumProcessDays: 30,
    maximumInnovationZ: 3,
    minimumVarianceLog: 1e-6,
  },
  confidence: {
    mediumObservationCount: 3,
    mediumSessionCount: 2,
    mediumUpperRelativeHalfWidth: 0.15,
    highObservationCount: 6,
    highSessionCount: 4,
    highDayCount: 3,
    highUpperRelativeHalfWidth: 0.08,
    establishedMinimumDayCount: 2,
  },
  comparison: {
    reliableZ: 1.96,
    minimumMeaningfulRelativeChange: 0.02,
  },
  recentObservationLimit: 32,
});

export function getPracticeAbilityChannelPolicy(channelName, policy = PRACTICE_ABILITY_POLICY_V1) {
  if (!PRACTICE_ABILITY_CHANNELS.includes(channelName)) return null;
  return policy?.channels?.[channelName] ?? null;
}

export function validatePracticeAbilityPolicy(policy = PRACTICE_ABILITY_POLICY_V1) {
  if (!policy || policy.version !== PRACTICE_ABILITY_POLICY_VERSION) throw new TypeError("Unsupported Practice ability policy version");
  if (policy.estimatorVersion !== PRACTICE_ABILITY_ESTIMATOR_VERSION || policy.uncertaintyVersion !== PRACTICE_ABILITY_UNCERTAINTY_VERSION) throw new TypeError("Practice ability policy version bindings are invalid");
  for (const name of PRACTICE_ABILITY_CHANNELS) {
    const value = policy.channels?.[name];
    if (!value || value.channel !== name) throw new TypeError(`Missing Practice ability channel policy: ${name}`);
    for (const key of ["minimumDurationMs", "maximumDurationMs", "minimumTypedCharacters", "minimumAccuracy", "durationReferenceFloorSeconds"]) if (!Number.isFinite(value[key]) || value[key] < 0) throw new TypeError(`Invalid ${name} ${key}`);
    if (value.maximumDurationMs <= value.minimumDurationMs || value.minimumAccuracy > 100) throw new TypeError(`Invalid Practice ability channel bounds: ${name}`);
    if (!value.requiresUntargetedContent || !value.requiresCorrectionAllowed) throw new TypeError(`PL13 v1 ability channels must be untargeted and correction-allowed: ${name}`);
    if (!Array.isArray(value.allowedEvidenceRoles) || !value.allowedEvidenceRoles.length) throw new TypeError(`Practice ability channel roles are invalid: ${name}`);
    if (!Array.isArray(value.allowedCompletionReasons) || value.allowedCompletionReasons.some((reason) => !PRACTICE_ABILITY_MEASUREMENT_COMPLETION_REASONS.includes(reason))) throw new TypeError(`Practice ability completion policy is invalid: ${name}`);
  }
  const { difficulty, uncertainty, estimator, confidence, comparison } = policy;
  if (!Number.isFinite(difficulty?.logCoefficient) || difficulty.logCoefficient < 0 || !Number.isFinite(difficulty?.maxAbsoluteLogAdjustment) || difficulty.maxAbsoluteLogAdjustment <= 0) throw new TypeError("Practice ability difficulty policy is invalid");
  if (uncertainty?.sigmaFloor <= 0 || uncertainty?.sigmaCeiling <= uncertainty.sigmaFloor || uncertainty?.baseSigmaLogAt60Seconds <= 0) throw new TypeError("Practice ability uncertainty policy is invalid");
  if (estimator?.initialSigmaLog <= 0 || estimator?.processVariancePerDay < 0 || estimator?.maximumProcessDays < 0 || estimator?.maximumInnovationZ <= 0 || estimator?.minimumVarianceLog <= 0) throw new TypeError("Practice ability estimator policy is invalid");
  if (confidence?.mediumUpperRelativeHalfWidth <= 0 || confidence?.highUpperRelativeHalfWidth <= 0 || confidence.highUpperRelativeHalfWidth >= confidence.mediumUpperRelativeHalfWidth) throw new TypeError("Practice ability confidence policy is invalid");
  if (comparison?.reliableZ <= 0 || comparison?.minimumMeaningfulRelativeChange < 0) throw new TypeError("Practice ability comparison policy is invalid");
  if (!Number.isInteger(policy.recentObservationLimit) || policy.recentObservationLimit < 1) throw new TypeError("Practice ability recent observation limit is invalid");
  return policy;
}
