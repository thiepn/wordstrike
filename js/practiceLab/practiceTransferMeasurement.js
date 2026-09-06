import { PRACTICE_ABILITY_POLICY_V1 } from "./practiceAbilityPolicy.js";
import { buildPracticeAdjustedPerformanceObservation } from "./practiceAdjustedPerformance.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

export function buildPracticeTransferMeasurement({
  plan,
  integrity,
  session,
  foundationAnalysis,
  pool,
  policy = PRACTICE_ABILITY_POLICY_V1,
} = {}) {
  if (plan?.binding?.kind !== "cold-transfer") throw new TypeError("Transfer measurement requires cold-transfer binding");
  const unit = pool?.units?.find((entry) => entry.unitId === plan.binding.unitId);
  if (!unit) throw new TypeError("Transfer measurement unit is unavailable");
  const channelPolicy = policy.channels?.["cold-natural-text"];
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
  return freezeDeep({
    poolId: pool.poolId,
    poolVersion: pool.poolVersion,
    unitId: unit.unitId,
    unitVersion: unit.unitVersion,
    contextId: session.contextId,
    protocolId: plan.measurementProtocol.protocolId,
    protocolVersion: plan.measurementProtocol.protocolVersion,
    freshnessStatus: plan.binding.freshnessStatus,
    integrityStatus: integrity.status,
    rawWpm: core.rawWpm,
    wpm: core.wpm,
    accuracy: core.accuracy,
    adjustedWpm: core.adjustedWpm,
    adjustedLogPerformance: core.adjustedLogPerformance,
    measurementSigmaLog: core.measurementSigmaLog,
    difficultyIndex: core.difficultyIndex,
    difficultyCoverage: core.difficultyCoverage,
    skillEvidenceEligible: integrity.skillEvidenceEligible,
    transferEvidenceEligible: integrity.transferEvidenceEligible,
    abilityEligible: integrity.abilityEligible,
    measuredAtUtc: session.completedAtUtc,
  });
}
