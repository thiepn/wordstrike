import { PRACTICE_ABILITY_CHANNELS } from "./practiceAbilityConstants.js";
import { getPracticeAbilityChannelPolicy } from "./practiceAbilityPolicy.js";
import { buildPracticeAdjustedPerformanceObservation } from "./practiceAdjustedPerformance.js";
import {
  PRACTICE_CONTROL_QUALITY_STATES,
  PRACTICE_PACE_STATES,
  PRACTICE_PERFORMANCE_ANALYSIS_VERSION,
  PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS,
  PRACTICE_PERFORMANCE_REASON_CODES,
  PRACTICE_READINESS_BANDS,
  PRACTICE_STATE_OBSERVATION_VERSION,
} from "./practicePerformanceConstants.js";
import { PRACTICE_STATE_PROBE_POLICY_V1 } from "./practicePerformancePolicy.js";
import { practiceMedian } from "./practiceRobustStats.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function uniqueReasons(reasons) {
  const result = [...new Set(reasons)];
  if (result.some((reason) => !PRACTICE_PERFORMANCE_REASON_CODES.includes(reason))) throw new TypeError("Invalid Practice state-probe reason");
  return result;
}

export function derivePracticeControlQuality({ accuracy, baselineAccuracy, policy = PRACTICE_STATE_PROBE_POLICY_V1 } = {}) {
  if (!Number.isFinite(accuracy)) return "unknown";
  if (accuracy < policy.minimumPreservedAccuracy) return "degraded";
  if (!Number.isFinite(baselineAccuracy)) return "unknown";
  return baselineAccuracy - accuracy > policy.maximumPreservedAccuracyDropPp ? "degraded" : "preserved";
}

export function derivePracticeReadinessBand({ paceState, controlQuality, sufficientEvidence = true } = {}) {
  if (!PRACTICE_PACE_STATES.includes(paceState) || !PRACTICE_CONTROL_QUALITY_STATES.includes(controlQuality)) return "unknown";
  if (!sufficientEvidence) return controlQuality === "degraded" ? "reduced" : "unknown";
  if (controlQuality === "degraded" || paceState === "below-typical") return "reduced";
  if (paceState === "above-typical" && controlQuality === "preserved") return "elevated";
  if (paceState === "typical") return "normal";
  return "unknown";
}

export function getPracticePersonalAccuracyBaseline(abilityState, policy = PRACTICE_STATE_PROBE_POLICY_V1) {
  const observations = Array.isArray(abilityState?.recentObservations)
    ? abilityState.recentObservations.slice(-policy.personalAccuracyObservationLimit)
    : [];
  const values = observations.map((item) => item?.accuracy).filter((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  if (values.length < policy.minimumPersonalAccuracyObservations) return null;
  return practiceMedian(values);
}

function measurementConfidence(referenceConfidence, combinedSigma, policy) {
  if (!Number.isFinite(combinedSigma) || combinedSigma <= 0) return "none";
  if (combinedSigma > policy.maximumCombinedSigmaLogForClassification) return "low";
  if (referenceConfidence === "high" && combinedSigma <= 0.12) return "high";
  return "medium";
}

function stateDiagnostic({ referenceChannel, paceState = "uncertain", controlQuality = "unknown", readinessBand = "unknown", core = null, referenceAbility = null, innovationLog = null, relativeStateDelta = null, combinedSigmaLog = null, stateZ = null, baselineAccuracy = null, measurementConfidence: confidence = "none" } = {}) {
  return freezeDeep({
    version: PRACTICE_PERFORMANCE_ANALYSIS_VERSION,
    referenceChannel,
    paceState,
    controlQuality,
    readinessBand,
    adjustedWpm: core?.adjustedWpm ?? null,
    adjustedLogPerformance: core?.adjustedLogPerformance ?? null,
    referenceAbilityWpm: referenceAbility?.estimateWpm ?? null,
    referenceAbilityVariance: referenceAbility?.varianceLogWpm ?? null,
    innovationLog,
    relativeStateDelta,
    combinedSigmaLog,
    stateZ,
    accuracy: core?.accuracy ?? null,
    baselineAccuracy,
    measurementConfidence: confidence,
  });
}

export function buildPracticeStateProbe({
  session,
  experiment,
  foundationAnalysis,
  contentPlan,
  evidenceRole,
  referenceAbilityState,
  policy = PRACTICE_STATE_PROBE_POLICY_V1,
} = {}) {
  const referenceChannel = experiment?.performanceReferenceChannel ?? null;
  if (!PRACTICE_ABILITY_CHANNELS.includes(referenceChannel)) throw new TypeError("State probe requires a canonical Practice ability reference channel");
  const reasons = [];
  if (session?.status !== "completed") reasons.push("wrong-session-status");
  if (session?.completionReason === "manual-stop") reasons.push("manual-stop");
  else if (!policy.allowedCompletionReasons.includes(session?.completionReason)) reasons.push("completion-reason");
  if (!policy.allowedEvidenceRoles.includes(evidenceRole)) reasons.push("role-not-allowed");
  if (policy.requiresUntargetedContent && (contentPlan?.targetEntities?.length ?? 0) !== 0) reasons.push("targeted-content");
  if (policy.requiresCorrectionAllowed && session?.configuration?.correctionBehavior !== "allow") reasons.push("correction-policy");
  if (!Number.isFinite(session?.activeDurationMs) || session.activeDurationMs < policy.minimumDurationMs || session.activeDurationMs > policy.maximumDurationMs) reasons.push("duration");
  if (!Number.isInteger(session?.typedCharacterCount) || session.typedCharacterCount < policy.minimumTypedCharacters) reasons.push("characters");
  if (!Number.isFinite(session?.accuracy) || session.accuracy < policy.minimumAccuracy) reasons.push("accuracy");
  if (!Number.isFinite(session?.wpm) || session.wpm <= 0) reasons.push("invalid-measurement");
  if (reasons.length) return freezeDeep({ status: "not-eligible", reasons: uniqueReasons(reasons), observation: null, diagnostic: stateDiagnostic({ referenceChannel }) });

  const estimate = referenceAbilityState?.estimate ?? null;
  if (!estimate || estimate.status === "unmeasured" || !Number.isFinite(estimate.meanLogWpm) || !Number.isFinite(estimate.varianceLogWpm) || !Number.isFinite(estimate.estimateWpm)) {
    return freezeDeep({ status: "not-eligible", reasons: ["reference-ability-unavailable"], observation: null, diagnostic: stateDiagnostic({ referenceChannel }) });
  }
  const channelPolicy = getPracticeAbilityChannelPolicy(referenceChannel);
  if (!channelPolicy) throw new TypeError("State probe reference channel has no PL13 measurement policy");
  const core = buildPracticeAdjustedPerformanceObservation({
    wpm: session.wpm,
    rawWpm: session.rawWpm,
    accuracy: session.accuracy,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    foundationAnalysis,
    channelPolicy,
  });
  const innovationLog = core.adjustedLogPerformance - estimate.meanLogWpm;
  const combinedVariance = estimate.varianceLogWpm + core.measurementVarianceLog;
  const combinedSigmaLog = combinedVariance > 0 ? Math.sqrt(combinedVariance) : null;
  const stateZ = Number.isFinite(combinedSigmaLog) && combinedSigmaLog > 0 ? innovationLog / combinedSigmaLog : null;
  const relativeStateDelta = Math.exp(innovationLog) - 1;
  const baselineAccuracy = getPracticePersonalAccuracyBaseline(referenceAbilityState, policy);
  const controlQuality = derivePracticeControlQuality({ accuracy: session.accuracy, baselineAccuracy, policy });

  if (estimate.confidenceLevel === "low" || estimate.confidenceLevel === "none") {
    return freezeDeep({
      status: "not-eligible",
      reasons: ["reference-confidence-low"],
      observation: null,
      diagnostic: stateDiagnostic({
        referenceChannel, core, referenceAbility: estimate, innovationLog, relativeStateDelta, combinedSigmaLog, stateZ,
        baselineAccuracy, controlQuality, readinessBand: controlQuality === "degraded" ? "reduced" : "unknown", measurementConfidence: "low",
      }),
    });
  }

  let paceState = "typical";
  const sufficientForClassification = Number.isFinite(combinedSigmaLog)
    && combinedSigmaLog > 0
    && combinedSigmaLog <= policy.maximumCombinedSigmaLogForClassification
    && Number.isFinite(stateZ);
  if (!sufficientForClassification) paceState = "uncertain";
  else if (relativeStateDelta >= policy.minimumStateRelativeDelta && stateZ >= policy.stateZThreshold) paceState = "above-typical";
  else if (relativeStateDelta <= -policy.minimumStateRelativeDelta && stateZ <= -policy.stateZThreshold) paceState = "below-typical";
  const readinessBand = derivePracticeReadinessBand({ paceState, controlQuality, sufficientEvidence: sufficientForClassification });
  if (!PRACTICE_READINESS_BANDS.includes(readinessBand)) throw new TypeError("State probe produced invalid readiness");
  const confidence = measurementConfidence(estimate.confidenceLevel, combinedSigmaLog, policy);
  if (!PRACTICE_PERFORMANCE_CONFIDENCE_LEVELS.includes(confidence)) throw new TypeError("State probe produced invalid measurement confidence");
  const measuredAt = session.completedAtUtc;
  const validUntil = new Date(Date.parse(measuredAt) + policy.stateTtlMs).toISOString();
  const observation = freezeDeep({
    observationVersion: PRACTICE_STATE_OBSERVATION_VERSION,
    sessionId: session.sessionId,
    profileId: session.profileId,
    contextId: session.contextId,
    referenceChannel,
    measuredAt,
    validUntil,
    adjustedWpm: core.adjustedWpm,
    adjustedLogPerformance: core.adjustedLogPerformance,
    referenceAbilityWpm: estimate.estimateWpm,
    referenceAbilityVariance: estimate.varianceLogWpm,
    innovationLog,
    relativeStateDelta,
    combinedSigmaLog,
    stateZ,
    accuracy: session.accuracy,
    baselineAccuracy,
    paceState,
    controlQuality,
    readinessBand,
    measurementConfidence: confidence,
    sourceRole: evidenceRole,
  });
  return freezeDeep({
    status: "measured",
    reasons: [],
    observation,
    diagnostic: stateDiagnostic({
      referenceChannel, paceState, controlQuality, readinessBand, core, referenceAbility: estimate, innovationLog, relativeStateDelta,
      combinedSigmaLog, stateZ, baselineAccuracy, measurementConfidence: confidence,
    }),
  });
}
