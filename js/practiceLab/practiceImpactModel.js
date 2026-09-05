import { shrinkPracticeResidualMean } from "./practicePeerReference.js";
import { PRACTICE_LIMITER_POLICY_V1 } from "./practiceLimiterPolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));

function component(value, status = "available", kind = "modeled-residual") {
  return Object.freeze({ status, kind, msPerOpportunity: value == null ? null : Math.max(0, value) });
}

export function computePracticePerformanceBurden(stat, prevalence, policy = PRACTICE_LIMITER_POLICY_V1) {
  const evidence = stat?.evidence ?? {};
  const opp = evidence.opportunities ?? {};
  const timing = evidence.timing ?? {};
  const launch = evidence.launchTiming;
  const errors = evidence.errors ?? {};
  const O = Number(opp.count || 0);
  if (!(O > 0) || !prevalence || prevalence.status === "unavailable" || !finite(prevalence.opportunitiesPer1000Graphemes)) {
    return freezeDeep({
      status: "unavailable",
      prevalence,
      componentCoverage: 0,
      fluentSpeedBurdenMsPer1000: null,
      hesitationBurdenMsPer1000: null,
      launchBurdenMsPer1000: null,
      recoveryBurdenMsPer1000: null,
      estimatedPerformanceBurdenMsPer1000: null,
      impactPercentile: null,
      impactScore: null,
      components: {},
    });
  }

  const fluentCount = Number(timing.fluentCount || 0);
  const disfluentCount = Number(timing.disfluentCount || 0);
  const shrunkFluentResidual = shrinkPracticeResidualMean(timing.fluentResidual, policy.slow.shrinkageK);
  const shrunkDisfluentResidual = shrinkPracticeResidualMean(timing.disfluentResidual, policy.hesitant.residualShrinkageK);

  const speedAvailable = fluentCount === 0 || finite(shrunkFluentResidual);
  const hesitationAvailable = disfluentCount === 0 || finite(shrunkDisfluentResidual);
  const speedPerOpp = speedAvailable ? (fluentCount / O) * Math.max(0, shrunkFluentResidual ?? 0) : null;
  const hesitationPerOpp = hesitationAvailable ? (disfluentCount / O) * Math.max(0, shrunkDisfluentResidual ?? 0) : null;

  let launchAvailable = stat.entityType !== "word";
  let launchPerOpp = stat.entityType !== "word" ? 0 : null;
  if (stat.entityType === "word") {
    const launchFluentCount = Number(launch?.fluentCount || 0);
    const launchDisfluentCount = Number(launch?.disfluentCount || 0);
    const launchFluentResidual = shrinkPracticeResidualMean(launch?.fluentResidual, policy.launch.shrinkageK);
    const launchDisfluentResidual = shrinkPracticeResidualMean(launch?.disfluentResidual, policy.launch.shrinkageK);
    const fluentKnown = launchFluentCount === 0 || finite(launchFluentResidual);
    const disfluentKnown = launchDisfluentCount === 0 || finite(launchDisfluentResidual);
    launchAvailable = Number(launch?.eligibleCount || 0) > 0 && fluentKnown && disfluentKnown;
    if (launchAvailable) {
      launchPerOpp = (launchFluentCount / O) * Math.max(0, launchFluentResidual ?? 0)
        + (launchDisfluentCount / O) * Math.max(0, launchDisfluentResidual ?? 0);
    }
  }

  const primaryErrorEpisodes = Number(errors.primaryEpisodeCount || 0);
  const recoveryCount = Number(errors.errorToRepair?.count || 0);
  const recoveryMean = Number(errors.errorToRepair?.meanMs);
  const recoveryAvailable = primaryErrorEpisodes === 0 || (recoveryCount > 0 && finite(recoveryMean));
  const recoveryPerOpp = recoveryAvailable ? (primaryErrorEpisodes / O) * (primaryErrorEpisodes ? recoveryMean : 0) : null;

  const intended = stat.entityType === "word"
    ? { slow: policy.impactCoverageWeights.slow, hesitant: policy.impactCoverageWeights.hesitant, recovery: policy.impactCoverageWeights.recovery, launch: policy.impactCoverageWeights.launch }
    : { slow: policy.impactCoverageWeights.slow, hesitant: policy.impactCoverageWeights.hesitant, recovery: policy.impactCoverageWeights.recovery };
  const intendedTotal = Object.values(intended).reduce((sum, value) => sum + value, 0);
  let availableWeight = 0;
  if (speedAvailable) availableWeight += intended.slow ?? 0;
  if (hesitationAvailable) availableWeight += intended.hesitant ?? 0;
  if (recoveryAvailable) availableWeight += intended.recovery ?? 0;
  if (stat.entityType === "word" && launchAvailable) availableWeight += intended.launch ?? 0;
  const componentCoverage = intendedTotal > 0 ? availableWeight / intendedTotal : 0;

  const prevalence1000 = prevalence.opportunitiesPer1000Graphemes;
  const speed1000 = speedPerOpp == null ? null : speedPerOpp * prevalence1000;
  const hesitation1000 = hesitationPerOpp == null ? null : hesitationPerOpp * prevalence1000;
  const launch1000 = stat.entityType !== "word" ? null : launchPerOpp == null ? null : launchPerOpp * prevalence1000;
  const recovery1000 = recoveryPerOpp == null ? null : recoveryPerOpp * prevalence1000;
  const known = [speedPerOpp, hesitationPerOpp, stat.entityType === "word" ? launchPerOpp : null, recoveryPerOpp].filter(finite);
  const totalPerOpp = known.reduce((sum, value) => sum + Math.max(0, value), 0);
  const total1000 = totalPerOpp * prevalence1000;
  const status = prevalence.status === "practice-proxy"
    ? "prevalence-proxy"
    : componentCoverage >= 0.999999 ? "full" : "partial";

  return freezeDeep({
    status,
    prevalence,
    componentCoverage,
    fluentSpeedBurdenMsPer1000: speed1000,
    hesitationBurdenMsPer1000: hesitation1000,
    launchBurdenMsPer1000: launch1000,
    recoveryBurdenMsPer1000: recovery1000,
    estimatedPerformanceBurdenMsPer1000: total1000,
    impactPercentile: null,
    impactScore: null,
    components: {
      fluentSpeed: component(speedPerOpp, speedAvailable ? "available" : "partial", "modeled-residual"),
      hesitation: component(hesitationPerOpp, hesitationAvailable ? "available" : "partial", "modeled-disfluent-residual"),
      ...(stat.entityType === "word" ? { launch: component(launchPerOpp, launchAvailable ? "available" : "partial", "modeled-launch-residual") } : {}),
      recovery: component(recoveryPerOpp, recoveryAvailable ? "available" : "partial", "observed-recovery-window"),
    },
  });
}

function lowerBound(sorted, target) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function upperBound(sorted, target) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function midrankFromSorted(sorted, target) {
  if (!sorted.length || !finite(target)) return null;
  const below = lowerBound(sorted, target);
  const aboveEqual = upperBound(sorted, target);
  const equal = aboveEqual - below;
  return 100 * (below + 0.5 * equal) / sorted.length;
}

export function practiceEmpiricalMidrankPercentile(values, target) {
  const finiteValues = (Array.isArray(values) ? values : []).filter(finite).sort((a, b) => a - b);
  return midrankFromSorted(finiteValues, target);
}

export function assignPracticeImpactPercentiles(candidates, policy = PRACTICE_LIMITER_POLICY_V1) {
  const burdens = candidates
    .map((candidate) => candidate.impact?.estimatedPerformanceBurdenMsPer1000)
    .filter(finite)
    .map((value) => Math.log1p(Math.max(0, value)))
    .sort((a, b) => a - b);
  return candidates.map((candidate) => {
    const impact = candidate.impact;
    if (!impact || impact.status === "unavailable" || !finite(impact.estimatedPerformanceBurdenMsPer1000)) return candidate;
    const transformed = Math.log1p(Math.max(0, impact.estimatedPerformanceBurdenMsPer1000));
    const percentile = midrankFromSorted(burdens, transformed);
    const quality = policy.prevalenceQualityWeights[impact.prevalence?.status] ?? 0;
    return {
      ...candidate,
      impact: freezeDeep({ ...impact, impactPercentile: percentile, impactScore: percentile == null ? null : clamp(percentile * quality) }),
    };
  });
}
