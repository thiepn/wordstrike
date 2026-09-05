import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";
import {
  combinePracticeExecutionQuality,
  computePracticeDisfluencyRateQuality,
  computePracticeRelativeResidualQuality,
  computePracticeRoleAccuracyQuality,
} from "./practiceExecutionQuality.js";

export { computePracticeDisfluencyRateQuality, computePracticeRelativeResidualQuality, computePracticeRoleAccuracyQuality } from "./practiceExecutionQuality.js";

const finite = Number.isFinite;

function expectedTimingApprox(stat) {
  const observed = Number(stat?.evidence?.timing?.fluentLatency?.meanMs);
  const residual = Number(stat?.evidence?.timing?.fluentResidual?.meanMs);
  if (!finite(observed) || !finite(residual)) return null;
  const expected = observed - residual;
  return expected > 0 ? expected : null;
}

export function computePracticeRoleQuality(stat, role, policy = PRACTICE_MASTERY_POLICY_V1) {
  const lane = stat?.evidence?.roles?.[role];
  const opportunityCount = Number(lane?.opportunityCount || 0);
  const sessionCount = Number(lane?.sessionCount || 0);
  const minimum = policy.roleQuality.minimumOpportunities?.[stat?.entityType] ?? Infinity;
  if (!lane) {
    return Object.freeze({ role, score: null, status: "unmeasured", availableWeight: 0, evidence: Object.freeze({ opportunityCount: 0, sessionCount: 0 }), components: Object.freeze({ accuracy: null, speed: null, disfluency: null }), reasons: Object.freeze(["role-unmeasured"]) });
  }
  if (sessionCount < policy.roleQuality.minimumSessions || opportunityCount < minimum) {
    return Object.freeze({ role, score: null, status: "insufficient", availableWeight: 0, evidence: Object.freeze({ opportunityCount, sessionCount }), components: Object.freeze({ accuracy: null, speed: null, disfluency: null }), reasons: Object.freeze(["role-evidence-minimum-not-met"]) });
  }

  const accuracy = computePracticeRoleAccuracyQuality(stat.entityType, opportunityCount, Number(lane?.errorCount || 0), policy);
  const expected = expectedTimingApprox(stat);
  const residualMean = Number(lane.fluentResidualMeanMs);
  const residualCount = Number(lane.fluentResidualCount || 0);
  const relativeResidual = expected > 0 && residualCount > 0 && finite(residualMean) ? residualMean / expected : null;
  const speed = computePracticeRelativeResidualQuality(relativeResidual, policy);
  const timingEligible = Number(lane.timingEligibleCount || 0);
  const disfluent = Number(lane.disfluentCount || 0);
  const disfluencyRate = timingEligible > 0 ? disfluent / timingEligible : null;
  const disfluency = computePracticeDisfluencyRateQuality(disfluencyRate, policy);
  const combined = combinePracticeExecutionQuality({ accuracy, speed, disfluency }, {
    weights: policy.roleQuality.weights,
    minimumAvailableWeight: policy.roleQuality.minimumAvailableWeight,
  });
  if (combined.score == null) {
    return Object.freeze({
      role,
      score: null,
      status: "insufficient",
      availableWeight: combined.availableWeight,
      evidence: Object.freeze({ opportunityCount, sessionCount, timingEligibleCount: timingEligible, fluentResidualCount: residualCount }),
      components: combined.components,
      reasons: Object.freeze(["role-quality-coverage-insufficient"]),
    });
  }
  return Object.freeze({
    role,
    score: combined.score,
    status: combined.score >= policy.dimensionStrongThreshold ? "strong" : "developing",
    availableWeight: combined.availableWeight,
    evidence: Object.freeze({ opportunityCount, sessionCount, timingEligibleCount: timingEligible, fluentResidualCount: residualCount, relativeResidual, disfluencyRate, expectedApproxMs: expected }),
    components: combined.components,
    reasons: Object.freeze([]),
  });
}
