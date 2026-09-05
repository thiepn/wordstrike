import {
  PRACTICE_ABILITY_ANALYSIS_VERSION,
  PRACTICE_ABILITY_ASSESSMENT_STATUSES,
  PRACTICE_ABILITY_CHANNELS,
  PRACTICE_ABILITY_OBSERVATION_VERSION,
  PRACTICE_ABILITY_REASON_CODES,
  PRACTICE_ABILITY_SOURCE_ROLES,
} from "./practiceAbilityConstants.js";
import {
  getPracticeAbilityChannelPolicy,
  PRACTICE_ABILITY_POLICY_V1,
  validatePracticeAbilityPolicy,
} from "./practiceAbilityPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function assessment(channel, status, reasons, observation = null) {
  if (!PRACTICE_ABILITY_ASSESSMENT_STATUSES.includes(status)) throw new TypeError("Invalid Practice ability assessment status");
  if (!Array.isArray(reasons) || reasons.some((reason) => !PRACTICE_ABILITY_REASON_CODES.includes(reason))) throw new TypeError("Invalid Practice ability assessment reason");
  return freezeDeep({
    version: PRACTICE_ABILITY_ANALYSIS_VERSION,
    channel,
    status,
    reasons: [...new Set(reasons)],
    observation,
    sessionSummary: status === "not-requested" ? null : {
      analysisVersion: PRACTICE_ABILITY_ANALYSIS_VERSION,
      observationVersion: PRACTICE_ABILITY_OBSERVATION_VERSION,
      channel,
      status,
      reasons: [...new Set(reasons)],
      sourceRole: observation?.sourceRole ?? null,
      adjustedWpm: observation?.adjustedWpm ?? null,
      measurementSigmaLog: observation?.measurementSigmaLog ?? null,
      reliabilityWeight: observation?.reliabilityWeight ?? null,
      difficultyAdjustmentLog: observation?.difficultyAdjustmentLog ?? null,
      difficultyModelStatus: observation?.difficultyModelStatus ?? null,
    },
  });
}

function getDifficulty(foundationAnalysis, policy) {
  const summary = foundationAnalysis?.normalization?.sessionSummary?.textDifficulty
    ?? foundationAnalysis?.normalization?.textDifficulty?.score
    ?? null;
  const status = typeof summary?.status === "string" ? summary.status : "insufficient";
  const difficultyIndex = Number.isFinite(summary?.difficultyIndex) ? summary.difficultyIndex : null;
  const coverage = Number.isFinite(summary?.availableModelWeight) ? clamp(summary.availableModelWeight, 0, 1) : 0;
  let adjustment = 0;
  if (["full", "partial"].includes(status) && difficultyIndex != null) {
    adjustment = clamp(
      policy.difficulty.logCoefficient * difficultyIndex * coverage,
      -policy.difficulty.maxAbsoluteLogAdjustment,
      policy.difficulty.maxAbsoluteLogAdjustment,
    );
  }
  return { status, difficultyIndex, coverage, adjustment };
}

function calculateMeasurementUncertainty({ activeDurationMs, accuracy, channelPolicy, difficulty, latencySummary, policy }) {
  const uncertainty = policy.uncertainty;
  const durationSeconds = activeDurationMs / 1000;
  const durationForSigma = clamp(
    durationSeconds,
    channelPolicy.durationReferenceFloorSeconds,
    uncertainty.durationReferenceCeilingSeconds,
  );
  const durationSigma = uncertainty.baseSigmaLogAt60Seconds
    * Math.sqrt(uncertainty.durationReferenceSeconds / durationForSigma);
  const accuracyRatio = clamp(accuracy / 100, 0, 1);
  const accuracyPenalty = 1 + uncertainty.accuracyPenaltySlope * Math.max(0, uncertainty.accuracyReference - accuracyRatio);

  const fluentMedian = latencySummary?.fluentMedianMs;
  const fluentMad = latencySummary?.fluentMadMs;
  const rhythmPenalty = Number.isFinite(fluentMedian) && fluentMedian > 0 && Number.isFinite(fluentMad) && fluentMad >= 0
    ? 1 + Math.min(uncertainty.maximumRhythmPenaltyExtra, fluentMad / fluentMedian)
    : uncertainty.missingRhythmPenalty;

  const difficultyPenalty = uncertainty.difficultyPenalties[difficulty.status] ?? uncertainty.difficultyPenalties.insufficient;
  const interruptionRate = latencySummary?.interruptionRate;
  const interruptionPenalty = Number.isFinite(interruptionRate) && interruptionRate >= 0
    ? 1 + Math.min(uncertainty.maximumInterruptionPenaltyExtra, uncertainty.interruptionPenaltySlope * interruptionRate)
    : 1;
  const tracePenalty = latencySummary?.coverage?.scope === "retained-window"
    ? uncertainty.tracePartialPenalty
    : 1;

  const sigma = clamp(
    durationSigma * accuracyPenalty * rhythmPenalty * difficultyPenalty * interruptionPenalty * tracePenalty,
    uncertainty.sigmaFloor,
    uncertainty.sigmaCeiling,
  );
  const reliabilityWeight = clamp(
    (uncertainty.reliabilityReferenceSigma / sigma) ** 2,
    uncertainty.reliabilityMinimum,
    uncertainty.reliabilityMaximum,
  );
  return {
    measurementSigmaLog: sigma,
    measurementVarianceLog: sigma ** 2,
    reliabilityWeight,
    components: {
      durationSigmaLog: durationSigma,
      accuracyPenalty,
      rhythmPenalty,
      difficultyPenalty,
      interruptionPenalty,
      tracePenalty,
    },
  };
}

export function buildPracticeAbilityObservation({
  session,
  experiment,
  foundationAnalysis,
  contentPlan,
  evidenceRole,
  policy = PRACTICE_ABILITY_POLICY_V1,
} = {}) {
  validatePracticeAbilityPolicy(policy);
  const channelName = experiment?.abilityChannel ?? null;
  if (channelName == null) return assessment(null, "not-requested", []);
  if (!PRACTICE_ABILITY_CHANNELS.includes(channelName)) throw new TypeError(`Unsupported Practice ability channel: ${channelName}`);
  const channelPolicy = getPracticeAbilityChannelPolicy(channelName, policy);
  if (!channelPolicy) throw new TypeError(`Missing Practice ability channel policy: ${channelName}`);
  if (!PRACTICE_ABILITY_SOURCE_ROLES.includes(evidenceRole)) throw new TypeError(`Unsupported Practice ability evidence role: ${evidenceRole}`);

  const normalizationContextId = foundationAnalysis?.normalization?.context?.contextId ?? null;
  if (normalizationContextId && normalizationContextId !== session?.contextId) throw new TypeError("Practice ability normalization context does not match session context");

  const reasons = [];
  if (session?.status !== "completed") reasons.push("wrong-session-status");
  if (session?.completionReason === "manual-stop") reasons.push("manual-stop");
  else if (!channelPolicy.allowedCompletionReasons.includes(session?.completionReason)) reasons.push("wrong-session-status");
  if (!channelPolicy.allowedEvidenceRoles.includes(evidenceRole) || ["custom", "unclassified"].includes(evidenceRole)) reasons.push("role-not-allowed");
  if (channelPolicy.requiresUntargetedContent && (contentPlan?.targetEntities?.length ?? 0) > 0) reasons.push("targeted-content");
  if (channelPolicy.requiresCorrectionAllowed && session?.configuration?.correctionBehavior !== "allow") reasons.push("correction-policy");
  if (!Number.isFinite(session?.activeDurationMs) || session.activeDurationMs < channelPolicy.minimumDurationMs) reasons.push("duration-too-short");
  else if (session.activeDurationMs > channelPolicy.maximumDurationMs) reasons.push("duration-too-long");
  if (!Number.isInteger(session?.typedCharacterCount) || session.typedCharacterCount < channelPolicy.minimumTypedCharacters) reasons.push("insufficient-characters");
  if (!Number.isFinite(session?.accuracy) || session.accuracy < channelPolicy.minimumAccuracy) reasons.push("accuracy-too-low");
  if (!Number.isFinite(session?.wpm) || session.wpm <= 0) reasons.push("invalid-wpm");

  const difficulty = getDifficulty(foundationAnalysis, policy);
  if (!["full", "partial", "insufficient", "unsupported-language"].includes(difficulty.status)) reasons.push("invalid-normalization");
  if (reasons.length) return assessment(channelName, "not-eligible", reasons);

  const observedLogWpm = Math.log(session.wpm);
  const adjustedLogPerformance = observedLogWpm + difficulty.adjustment;
  const uncertainty = calculateMeasurementUncertainty({
    activeDurationMs: session.activeDurationMs,
    accuracy: session.accuracy,
    channelPolicy,
    difficulty,
    latencySummary: foundationAnalysis?.latency?.sessionSummary ?? null,
    policy,
  });
  const observation = freezeDeep({
    observationVersion: PRACTICE_ABILITY_OBSERVATION_VERSION,
    sessionId: session.sessionId,
    profileId: session.profileId,
    contextId: session.contextId,
    channel: channelName,
    sourceRole: evidenceRole,
    completedAtUtc: session.completedAtUtc,
    localDayKey: session.localDayKey,
    rawWpm: Number.isFinite(session.rawWpm) ? session.rawWpm : null,
    wpm: session.wpm,
    adjustedWpm: Math.exp(adjustedLogPerformance),
    adjustedLogPerformance,
    accuracy: session.accuracy,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    difficultyIndex: difficulty.difficultyIndex,
    difficultyAdjustmentLog: difficulty.adjustment,
    difficultyModelStatus: difficulty.status,
    difficultyCoverage: difficulty.coverage,
    measurementSigmaLog: uncertainty.measurementSigmaLog,
    measurementVarianceLog: uncertainty.measurementVarianceLog,
    reliabilityWeight: uncertainty.reliabilityWeight,
  });
  return assessment(channelName, "eligible", [], observation);
}
