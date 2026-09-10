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

function resolveMeasurementSession({ session, experiment, foundationAnalysis, contentPlan, evidenceRole, channelName }) {
  if (typeof experiment?.buildAbilityMeasurement !== "function") return { session, invalid: false };
  let measurement;
  try {
    measurement = experiment.buildAbilityMeasurement(freezeDeep({
      session: freezeDeep({ ...session }),
      foundationAnalysis,
      contentPlan,
      evidenceRole,
      channel: channelName,
    }));
  } catch {
    return { session, invalid: true };
  }
  if (!measurement || typeof measurement !== "object") return { session, invalid: true };
  const requiredFinite = ["wpm", "accuracy", "activeDurationMs", "typedCharacterCount"];
  if (requiredFinite.some((key) => !Number.isFinite(measurement[key]))) return { session, invalid: true };
  if (!Number.isInteger(measurement.typedCharacterCount)) return { session, invalid: true };
  const suppliedAdjusted = ["adjustedLogPerformance", "measurementSigmaLog", "measurementVarianceLog", "reliabilityWeight", "difficultyAdjustmentLog", "difficultyCoverage"].every((key) => Number.isFinite(measurement[key]));
  if (suppliedAdjusted && (!Number.isFinite(measurement.adjustedWpm) || measurement.adjustedWpm <= 0 || Math.abs(Math.log(measurement.adjustedWpm) - measurement.adjustedLogPerformance) > 1e-8 || Math.abs(measurement.measurementVarianceLog - measurement.measurementSigmaLog ** 2) > 1e-8)) return { session, invalid: true };
  return {
    invalid: false,
    trustedAdjustedMeasurement: suppliedAdjusted ? freezeDeep({ ...measurement }) : null,
    session: freezeDeep({
      ...session,
      wpm: measurement.wpm,
      rawWpm: Number.isFinite(measurement.rawWpm) ? measurement.rawWpm : measurement.wpm,
      accuracy: measurement.accuracy,
      activeDurationMs: measurement.activeDurationMs,
      typedCharacterCount: measurement.typedCharacterCount,
    }),
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

  const resolved = resolveMeasurementSession({ session, experiment, foundationAnalysis, contentPlan, evidenceRole, channelName });
  if (resolved.invalid) return assessment(channelName, "not-eligible", ["protocol-invalid"], null, { sourceRole: evidenceRole });
  const measurementSession = resolved.session;

  const reasons = [];
  if (measurementSession?.status !== "completed") reasons.push("wrong-session-status");
  if (measurementSession?.completionReason === "manual-stop") reasons.push("manual-stop");
  else if (!channelPolicy.allowedCompletionReasons.includes(measurementSession?.completionReason)) reasons.push("wrong-session-status");
  if (!channelPolicy.allowedEvidenceRoles.includes(evidenceRole) || ["custom", "unclassified"].includes(evidenceRole)) reasons.push("role-not-allowed");
  if (channelPolicy.requiresUntargetedContent && (contentPlan?.targetEntities?.length ?? 0) > 0) reasons.push("targeted-content");
  if (channelPolicy.requiresCorrectionAllowed && measurementSession?.configuration?.correctionBehavior !== "allow") reasons.push("correction-policy");
  if (!Number.isFinite(measurementSession?.activeDurationMs) || measurementSession.activeDurationMs < channelPolicy.minimumDurationMs) reasons.push("duration-too-short");
  else if (measurementSession.activeDurationMs > channelPolicy.maximumDurationMs) reasons.push("duration-too-long");
  if (!Number.isInteger(measurementSession?.typedCharacterCount) || measurementSession.typedCharacterCount < channelPolicy.minimumTypedCharacters) reasons.push("insufficient-characters");
  if (!Number.isFinite(measurementSession?.accuracy) || measurementSession.accuracy < channelPolicy.minimumAccuracy) reasons.push("accuracy-too-low");
  if (!Number.isFinite(measurementSession?.wpm) || measurementSession.wpm <= 0) reasons.push("invalid-wpm");

  const difficulty = getPracticeDifficultyAdjustment(foundationAnalysis, policy);
  if (!["full", "partial", "insufficient", "unsupported-language"].includes(difficulty.status)) reasons.push("invalid-normalization");
  if (reasons.length) return assessment(channelName, "not-eligible", reasons, null, { sourceRole: evidenceRole, difficultyModelStatus: difficulty.status });

  const supplied = resolved.trustedAdjustedMeasurement;
  const core = supplied ? freezeDeep({
    rawWpm: Number.isFinite(supplied.rawWpm) ? supplied.rawWpm : null,
    wpm: measurementSession.wpm,
    adjustedWpm: supplied.adjustedWpm,
    adjustedLogPerformance: supplied.adjustedLogPerformance,
    accuracy: measurementSession.accuracy,
    activeDurationMs: measurementSession.activeDurationMs,
    typedCharacterCount: measurementSession.typedCharacterCount,
    difficultyIndex: Number.isFinite(supplied.difficultyIndex) ? supplied.difficultyIndex : null,
    difficultyAdjustmentLog: supplied.difficultyAdjustmentLog,
    difficultyModelStatus: supplied.difficultyModelStatus ?? "insufficient",
    difficultyCoverage: supplied.difficultyCoverage,
    measurementSigmaLog: supplied.measurementSigmaLog,
    measurementVarianceLog: supplied.measurementVarianceLog,
    reliabilityWeight: supplied.reliabilityWeight,
  }) : buildPracticeAdjustedPerformanceObservation({
    wpm: measurementSession.wpm,
    rawWpm: measurementSession.rawWpm,
    accuracy: measurementSession.accuracy,
    activeDurationMs: measurementSession.activeDurationMs,
    typedCharacterCount: measurementSession.typedCharacterCount,
    foundationAnalysis,
    channelPolicy,
    policy,
  });
  const observation = freezeDeep({
    observationVersion: PRACTICE_ABILITY_OBSERVATION_VERSION,
    sessionId: measurementSession.sessionId,
    profileId: measurementSession.profileId,
    contextId: measurementSession.contextId,
    channel: channelName,
    sourceRole: evidenceRole,
    completedAtUtc: measurementSession.completedAtUtc,
    localDayKey: measurementSession.localDayKey,
    rawWpm: core.rawWpm,
    wpm: measurementSession.wpm,
    adjustedWpm: core.adjustedWpm,
    adjustedLogPerformance: core.adjustedLogPerformance,
    accuracy: measurementSession.accuracy,
    activeDurationMs: measurementSession.activeDurationMs,
    typedCharacterCount: measurementSession.typedCharacterCount,
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
