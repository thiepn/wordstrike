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
import { buildPracticeAdjustedPerformanceObservation, getPracticeDifficultyAdjustment } from "./practiceAdjustedPerformance.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function assessment(channel, status, reasons, observation = null, metadata = {}) {
  if (!PRACTICE_ABILITY_ASSESSMENT_STATUSES.includes(status)) throw new TypeError("Invalid Practice ability assessment status");
  if (!Array.isArray(reasons) || reasons.some((reason) => !PRACTICE_ABILITY_REASON_CODES.includes(reason))) throw new TypeError("Invalid Practice ability assessment reason");
  const uniqueReasons = [...new Set(reasons)];
  return freezeDeep({
    version: PRACTICE_ABILITY_ANALYSIS_VERSION,
    channel,
    status,
    reasons: uniqueReasons,
    observation,
    sessionSummary: status === "not-requested" ? null : {
      analysisVersion: PRACTICE_ABILITY_ANALYSIS_VERSION,
      observationVersion: PRACTICE_ABILITY_OBSERVATION_VERSION,
      channel,
      status,
      reasons: uniqueReasons,
      sourceRole: observation?.sourceRole ?? metadata.sourceRole ?? null,
      adjustedWpm: observation?.adjustedWpm ?? null,
      measurementSigmaLog: observation?.measurementSigmaLog ?? null,
      reliabilityWeight: observation?.reliabilityWeight ?? null,
      difficultyAdjustmentLog: observation?.difficultyAdjustmentLog ?? null,
      difficultyModelStatus: observation?.difficultyModelStatus ?? metadata.difficultyModelStatus ?? null,
    },
  });
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

  const difficulty = getPracticeDifficultyAdjustment(foundationAnalysis, policy);
  if (!["full", "partial", "insufficient", "unsupported-language"].includes(difficulty.status)) reasons.push("invalid-normalization");
  if (reasons.length) return assessment(channelName, "not-eligible", reasons, null, { sourceRole: evidenceRole, difficultyModelStatus: difficulty.status });

  const core = buildPracticeAdjustedPerformanceObservation({
    wpm: session.wpm,
    rawWpm: session.rawWpm,
    accuracy: session.accuracy,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    foundationAnalysis,
    channelPolicy,
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
    rawWpm: core.rawWpm,
    wpm: session.wpm,
    adjustedWpm: core.adjustedWpm,
    adjustedLogPerformance: core.adjustedLogPerformance,
    accuracy: session.accuracy,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    difficultyIndex: core.difficultyIndex,
    difficultyAdjustmentLog: core.difficultyAdjustmentLog,
    difficultyModelStatus: core.difficultyModelStatus,
    difficultyCoverage: core.difficultyCoverage,
    measurementSigmaLog: core.measurementSigmaLog,
    measurementVarianceLog: core.measurementVarianceLog,
    reliabilityWeight: core.reliabilityWeight,
  });
  return assessment(channelName, "eligible", [], observation);
}
