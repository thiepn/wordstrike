import { computePracticeRoleQuality } from "./practiceRoleQuality.js";
import { PRACTICE_MASTERY_POLICY_V1 } from "./practiceMasteryPolicy.js";

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

export function computePracticeBreadthScore(breadthPoints, policy = PRACTICE_MASTERY_POLICY_V1) {
  const points = Math.max(0, Number(breadthPoints) || 0);
  return clamp(100 * (1 - Math.exp(-points / policy.contextRobustness.breadthScale)));
}

export function computePracticeRoleCoverageScore(eligibleRoleCount, policy = PRACTICE_MASTERY_POLICY_V1) {
  const count = Math.max(0, Math.min(4, Number(eligibleRoleCount) || 0));
  return policy.contextRobustness.roleCoverage[count] ?? 0;
}

export function computePracticeRoleConsistency(roleQualities) {
  const values = (Array.isArray(roleQualities) ? roleQualities : [])
    .map((entry) => Number(entry?.score))
    .filter(Number.isFinite);
  if (values.length < 2) return null;
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  return clamp(minimum - 0.5 * (maximum - minimum));
}

export function computePracticeContextRobustness(stat, policy = PRACTICE_MASTERY_POLICY_V1) {
  const breadthScore = computePracticeBreadthScore(stat?.evidence?.observation?.breadthEvidencePoints, policy);
  const roleQualities = policy.contextRobustness.eligibleRoles
    .map((role) => computePracticeRoleQuality(stat, role, policy))
    .filter((entry) => Number.isFinite(entry.score));
  const eligibleRoleCount = roleQualities.length;
  const roleCoverageScore = computePracticeRoleCoverageScore(eligibleRoleCount, policy);
  const roleConsistencyScore = computePracticeRoleConsistency(roleQualities);
  let score = null;
  if (eligibleRoleCount === 1) {
    const w = policy.contextRobustness.singleRoleWeights;
    score = Math.min(
      policy.contextRobustness.singleRoleCap,
      w.breadth * breadthScore + w.coverage * roleCoverageScore,
    );
  } else if (eligibleRoleCount >= 2) {
    const w = policy.contextRobustness.multiRoleWeights;
    score = w.breadth * breadthScore
      + w.coverage * roleCoverageScore
      + w.consistency * roleConsistencyScore;
  }
  score = Number.isFinite(score) ? clamp(score) : null;
  return Object.freeze({
    score,
    status: score == null ? "unmeasured" : score >= policy.dimensionStrongThreshold ? "strong" : "developing",
    breadthScore,
    roleCoverageScore,
    roleConsistencyScore,
    eligibleRoleCount,
    eligibleRoles: Object.freeze(roleQualities.map((entry) => entry.role)),
    roleQualities: Object.freeze(roleQualities),
    reasons: Object.freeze(score == null ? ["no-eligible-role-quality"] : []),
  });
}
