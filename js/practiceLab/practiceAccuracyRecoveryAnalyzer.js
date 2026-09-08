import { PRACTICE_ACCURACY_RECOVERY_RESULT_VERSION } from "./practiceAccuracyRecoveryConstants.js";
import { buildPracticeAccuracyRecoveryProbeProfile, buildPracticeAccuracyRecoveryRecoveryProfile } from "./practiceAccuracyRecoveryMetrics.js";

const finite = Number.isFinite;
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const delta = (after, before) => finite(after) && finite(before) ? after - before : null;

export function analyzePracticeAccuracyRecoveryResult({ sessionSnapshot, eventTrace = [], foundationAnalysis = null, contentPlan } = {}) {
  const target = contentPlan?.metadata?.accuracyRecovery?.target ?? contentPlan?.targetEntities?.[0] ?? null;
  if (!target?.entityType || !target?.entityKey) throw new TypeError("Accuracy & Recovery analysis requires one target");
  const profileId = sessionSnapshot?.profileId; const contextId = sessionSnapshot?.contextId;
  const beforeMetrics = buildPracticeAccuracyRecoveryProbeProfile({ phaseId: "baseline", profileId, contextId, contentPlan, eventTrace, foundationAnalysis, target });
  const afterMetrics = buildPracticeAccuracyRecoveryProbeProfile({ phaseId: "check", profileId, contextId, contentPlan, eventTrace, foundationAnalysis, target });
  const recoveryProfile = buildPracticeAccuracyRecoveryRecoveryProfile({ profileId, contextId, contentPlan, foundationAnalysis, target });
  const accuracyDelta = delta(afterMetrics?.firstPassAccuracy, beforeMetrics?.firstPassAccuracy);
  const residualDeltaMs = delta(afterMetrics?.timing?.fluentResidualMedianMs, beforeMetrics?.timing?.fluentResidualMedianMs);
  const disfluencyDelta = delta(afterMetrics?.timing?.disfluencyRate, beforeMetrics?.timing?.disfluencyRate);
  const immediateExecutionDelta = delta(afterMetrics?.quality, beforeMetrics?.quality);
  const result = {
    resultVersion: PRACTICE_ACCURACY_RECOVERY_RESULT_VERSION,
    target: freezeDeep({ entityType: target.entityType, entityKey: target.entityKey }),
    targetOpportunityCount: contentPlan?.metadata?.accuracyRecovery?.targetOpportunityBudget ?? null,
    doseUnits: 1,
    beforeMetrics,
    afterMetrics,
    transferMetrics: null,
    accuracyDeltaPp: finite(accuracyDelta) ? accuracyDelta * 100 : null,
    residualDeltaMs,
    disfluencyDelta,
    immediateExecutionDelta,
    recoveryProfile,
    wordDiagnostics: target.entityType === "word" ? freezeDeep({ baseline: beforeMetrics?.word ?? null, check: afterMetrics?.word ?? null }) : null,
    reviewItemChanges: Object.freeze([]),
    interpretation: freezeDeep({
      scope: "same-session-training",
      wording: "This compares the beginning and end of this practice session. Recovery metrics are observational and only exist when relevant errors occurred. Durable learning, transfer, and retention require later evidence.",
      doesNotEstablish: Object.freeze(["mastery", "retention", "transfer", "causal-improvement"]),
    }),
  };
  return freezeDeep({ ...result, trainingQuality: freezeDeep({ resultVersion: result.resultVersion, targetOpportunityCount: result.targetOpportunityCount, doseUnits: result.doseUnits, baselineQuality: beforeMetrics?.quality ?? null, checkQuality: afterMetrics?.quality ?? null, immediateExecutionDelta, accuracyDeltaPp: result.accuracyDeltaPp, residualDeltaMs, disfluencyDelta, recoveryProfile }) });
}
