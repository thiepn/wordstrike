import {
  buildPracticeAdjustedPerformanceObservation,
  getPracticeDifficultyAdjustment,
} from "./practiceAdjustedPerformance.js";
import {
  getPracticeAbilityChannelPolicy,
  PRACTICE_ABILITY_POLICY_V1,
} from "./practiceAbilityPolicy.js";
import {
  PRACTICE_SPECIAL_DOMAIN_DOMAIN_ACCURACY_FLOOR,
  PRACTICE_SPECIAL_DOMAIN_OVERALL_ACCURACY_FLOOR,
  PRACTICE_SPECIAL_DOMAIN_PROTOCOL_SIGMA_PENALTY_LOG,
  PRACTICE_SPECIAL_DOMAIN_REQUIRED_MODEL_WEIGHT,
  PRACTICE_SPECIAL_DOMAIN_SIGMA_CEILING_LOG,
  PRACTICE_SPECIAL_DOMAIN_SIGMA_FLOOR_LOG,
} from "./practiceSpecialDomainConstants.js";

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

export function buildPracticeSpecialDomainAbilityMeasurement({
  accumulatorSnapshot,
  session,
  foundationAnalysis,
  channel,
  protocol,
  requiredPrimaryOpportunities = 180,
} = {}) {
  if (!accumulatorSnapshot || !session || !channel || !protocol) return null;
  if (session.status !== "completed" || session.completionReason !== "content-complete") return null;
  if (accumulatorSnapshot.domainOpportunityCount !== requiredPrimaryOpportunities) return null;
  if (!Number.isFinite(accumulatorSnapshot.domainFirstPassAccuracy) || accumulatorSnapshot.domainFirstPassAccuracy < PRACTICE_SPECIAL_DOMAIN_DOMAIN_ACCURACY_FLOOR) return null;
  if (!Number.isFinite(accumulatorSnapshot.overallFirstPassAccuracy) || accumulatorSnapshot.overallFirstPassAccuracy < PRACTICE_SPECIAL_DOMAIN_OVERALL_ACCURACY_FLOOR) return null;
  if (!Number.isFinite(session.wpm) || session.wpm <= 0 || !Number.isFinite(session.activeDurationMs) || session.activeDurationMs <= 0 || !Number.isInteger(session.typedCharacterCount)) return null;

  const channelPolicy = getPracticeAbilityChannelPolicy(channel);
  if (!channelPolicy) return null;
  const domainAccuracyPercent = accumulatorSnapshot.domainFirstPassAccuracy * 100;
  const core = buildPracticeAdjustedPerformanceObservation({
    wpm: session.wpm,
    rawWpm: session.rawWpm,
    accuracy: domainAccuracyPercent,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    foundationAnalysis,
    channelPolicy,
  });
  const difficulty = getPracticeDifficultyAdjustment(foundationAnalysis);
  const modelSupported = difficulty.status === "full" && difficulty.coverage >= PRACTICE_SPECIAL_DOMAIN_REQUIRED_MODEL_WEIGHT;

  if (modelSupported) return Object.freeze({
    protocol,
    wpm: session.wpm,
    rawWpm: Number.isFinite(session.rawWpm) ? session.rawWpm : session.wpm,
    adjustedWpm: core.adjustedWpm,
    adjustedLogPerformance: core.adjustedLogPerformance,
    accuracy: domainAccuracyPercent,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    measurementSigmaLog: core.measurementSigmaLog,
    measurementVarianceLog: core.measurementVarianceLog,
    reliabilityWeight: core.reliabilityWeight,
    difficultyIndex: core.difficultyIndex,
    difficultyAdjustmentLog: core.difficultyAdjustmentLog,
    difficultyModelStatus: core.difficultyModelStatus,
    difficultyCoverage: core.difficultyCoverage,
  });

  const sigma = clamp(
    Math.sqrt(core.measurementSigmaLog ** 2 + PRACTICE_SPECIAL_DOMAIN_PROTOCOL_SIGMA_PENALTY_LOG ** 2),
    PRACTICE_SPECIAL_DOMAIN_SIGMA_FLOOR_LOG,
    PRACTICE_SPECIAL_DOMAIN_SIGMA_CEILING_LOG,
  );
  const reliabilityWeight = clamp(
    (PRACTICE_ABILITY_POLICY_V1.uncertainty.reliabilityReferenceSigma / sigma) ** 2,
    PRACTICE_ABILITY_POLICY_V1.uncertainty.reliabilityMinimum,
    PRACTICE_ABILITY_POLICY_V1.uncertainty.reliabilityMaximum,
  );
  return Object.freeze({
    protocol,
    wpm: session.wpm,
    rawWpm: Number.isFinite(session.rawWpm) ? session.rawWpm : session.wpm,
    adjustedWpm: session.wpm,
    adjustedLogPerformance: Math.log(session.wpm),
    accuracy: domainAccuracyPercent,
    activeDurationMs: session.activeDurationMs,
    typedCharacterCount: session.typedCharacterCount,
    measurementSigmaLog: sigma,
    measurementVarianceLog: sigma ** 2,
    reliabilityWeight,
    difficultyIndex: Number.isFinite(difficulty.difficultyIndex) ? difficulty.difficultyIndex : null,
    difficultyAdjustmentLog: 0,
    difficultyModelStatus: "protocol-matched-only",
    difficultyCoverage: difficulty.coverage,
  });
}
