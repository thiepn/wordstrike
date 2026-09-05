import { computePracticeAbsoluteAccuracyQuality } from "./practiceAutomaticity.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = Number.isFinite;

function linearQuality(value, perfectAtOrBelow, zeroAtOrAbove) {
  if (!finite(value)) return null;
  if (value <= perfectAtOrBelow) return 100;
  if (value >= zeroAtOrAbove) return 0;
  return 100 * (zeroAtOrAbove - value) / (zeroAtOrAbove - perfectAtOrBelow);
}

export function computePracticeRelativeResidualQuality(relativeResidual, policy = PRACTICE_MASTERY_POLICY_V1) {
  if (!finite(relativeResidual)) return null;
  if (relativeResidual < 0) return 100;
  return clamp(linearQuality(
    relativeResidual,
    policy.roleQuality.speed.perfectAtOrBelow,
    policy.roleQuality.speed.zeroAtOrAbove,
  ));
}

export function computePracticeDisfluencyRateQuality(disfluencyRate, policy = PRACTICE_MASTERY_POLICY_V1) {
  if (!finite(disfluencyRate)) return null;
  return clamp(linearQuality(
    disfluencyRate,
    policy.roleQuality.disfluency.perfectAtOrBelow,
    policy.roleQuality.disfluency.zeroAtOrAbove,
  ));
}

export function computePracticeRoleAccuracyQuality(entityType, opportunityCount, errorCount, policy = PRACTICE_MASTERY_POLICY_V1) {
  const synthetic = {
    entityType,
    evidence: {
      opportunities: {
        count: Number(opportunityCount || 0),
        errorCount: Number(errorCount || 0),
      },
    },
  };
  return computePracticeAbsoluteAccuracyQuality(synthetic, policy).score;
}

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
    return Object.freeze({
      role,
      score: null,
      status: "unmeasured",
      availableWeight: 0,
      evidence: Object.freeze({ opportunityCount: 0, sessionCount: 0 }),
      components: Object.freeze({ accuracy: null, speed: null, disfluency: null }),
      reasons: Object.freeze(["role-unmeasured"]),
    });
  }
  if (sessionCount < policy.roleQuality.minimumSessions || opportunityCount < minimum) {
    return Object.freeze({
      role,
      score: null,
      status: "insufficient",
      availableWeight: 0,
      evidence: Object.freeze({ opportunityCount, sessionCount }),
      components: Object.freeze({ accuracy: null, speed: null, disfluency: null }),
      reasons: Object.freeze(["role-evidence-minimum-not-met"]),
    });
  }

  const accuracy = computePracticeRoleAccuracyQuality(stat.entityType, opportunityCount, Number(lane?.errorCount || 0), policy);
  const expected = expectedTimingApprox(stat);
  const residualMean = Number(lane.fluentResidualMeanMs);
  const residualCount = Number(lane.fluentResidualCount || 0);
  const relativeResidual = expected > 0 && residualCount > 0 && finite(residualMean)
    ? residualMean / expected
    : null;
  const speed = computePracticeRelativeResidualQuality(relativeResidual, policy);

  const timingEligible = Number(lane.timingEligibleCount || 0);
  const disfluent = Number(lane.disfluentCount || 0);
  const disfluencyRate = timingEligible > 0 ? disfluent / timingEligible : null;
  const disfluency = computePracticeDisfluencyRateQuality(disfluencyRate, policy);

  const components = { accuracy, speed, disfluency };
  const weights = policy.roleQuality.weights;
  const availableWeight = Object.entries(weights)
    .filter(([key]) => finite(components[key]))
    .reduce((sum, [, weight]) => sum + weight, 0);
  if (availableWeight + 1e-12 < policy.roleQuality.minimumAvailableWeight) {
    return Object.freeze({
      role,
      score: null,
      status: "insufficient",
      availableWeight,
      evidence: Object.freeze({ opportunityCount, sessionCount, timingEligibleCount: timingEligible, fluentResidualCount: residualCount }),
      components: Object.freeze({ ...components }),
      reasons: Object.freeze(["role-quality-coverage-insufficient"]),
    });
  }
  const weighted = Object.entries(weights)
    .filter(([key]) => finite(components[key]))
    .reduce((sum, [key, weight]) => sum + weight * components[key], 0);
  const score = clamp(weighted / availableWeight);
  return Object.freeze({
    role,
    score,
    status: score >= policy.dimensionStrongThreshold ? "strong" : "developing",
    availableWeight,
    evidence: Object.freeze({
      opportunityCount,
      sessionCount,
      timingEligibleCount: timingEligible,
      fluentResidualCount: residualCount,
      relativeResidual,
      disfluencyRate,
      expectedApproxMs: expected,
    }),
    components: Object.freeze({ ...components }),
    reasons: Object.freeze([]),
  });
}
