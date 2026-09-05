import { computePracticeEvidenceConfidence } from "./practiceEvidenceConfidence.js";
import { practiceMad, practiceMedian } from "./practiceRobustStats.js";
import { PRACTICE_LIMITER_POLICY_V1 } from "./practiceLimiterPolicy.js";

const TYPES = Object.freeze(["key", "bigram", "trigram", "word"]);
const finite = Number.isFinite;

function timing(stat) { return stat?.evidence?.timing ?? {}; }
function opportunities(stat) { return stat?.evidence?.opportunities ?? {}; }
function errors(stat) { return stat?.evidence?.errors ?? {}; }

export function shrinkPracticeResidualMean(aggregate, k = PRACTICE_LIMITER_POLICY_V1.slow.shrinkageK) {
  const n = Number(aggregate?.count || 0);
  const mean = Number(aggregate?.meanMs);
  if (!n || !finite(mean)) return null;
  return (n / (n + k)) * mean;
}

function recentResidualMad(stat) {
  const samples = timing(stat)?.fluentResidual?.recentSamples;
  return Array.isArray(samples) && samples.length ? practiceMad(samples) : null;
}

function eligibleStat(stat, policy) {
  return stat?.recordVersion === 3
    && stat?.evidence
    && computePracticeEvidenceConfidence(stat, "general").score >= policy.minimumPeerGeneralConfidence;
}

function makeGroup(type, stats, policy) {
  const eligible = stats.filter((stat) => stat.entityType === type && eligibleStat(stat, policy));
  const totals = {
    entityCount: eligible.length,
    opportunities: 0,
    errors: 0,
    timingEligible: 0,
    disfluent: 0,
    recoveryEpisodes: 0,
    recoveryMsSum: 0,
  };
  const residualValues = [];
  const variabilityValues = [];
  for (const stat of eligible) {
    const opp = opportunities(stat);
    const time = timing(stat);
    const err = errors(stat);
    totals.opportunities += Number(opp.count || 0);
    totals.errors += Number(opp.errorCount || 0);
    totals.timingEligible += Number(time.eligibleCount || 0);
    totals.disfluent += Number(time.disfluentCount || 0);
    const recoveryCount = Number(err.errorToRepair?.count || 0);
    const recoveryMean = Number(err.errorToRepair?.meanMs);
    if (recoveryCount > 0 && finite(recoveryMean)) {
      totals.recoveryEpisodes += recoveryCount;
      totals.recoveryMsSum += recoveryCount * recoveryMean;
    }
    const residual = shrinkPracticeResidualMean(time.fluentResidual, policy.slow.shrinkageK);
    if (finite(residual)) residualValues.push(Object.freeze({ statId: stat.statId, value: residual }));
    const variability = recentResidualMad(stat);
    if (finite(variability)
      && (time.fluentResidual?.recentSamples?.length ?? 0) >= policy.minimumRecentResidualSamples
      && Number(stat.evidence?.observation?.sessionCount || 0) >= policy.minimumObservationSessions) {
      variabilityValues.push(Object.freeze({ statId: stat.statId, value: variability }));
    }
  }
  residualValues.sort((a, b) => a.value - b.value || a.statId.localeCompare(b.statId));
  variabilityValues.sort((a, b) => a.value - b.value || a.statId.localeCompare(b.statId));
  const residualNumbers = residualValues.map((entry) => entry.value);
  const variabilityNumbers = variabilityValues.map((entry) => entry.value);
  const residualCenter = practiceMedian(residualNumbers);
  const residualMad = practiceMad(residualNumbers);
  const variabilityCenter = practiceMedian(variabilityNumbers);
  const variabilityMad = practiceMad(variabilityNumbers);
  return Object.freeze({
    type, eligible, totals: Object.freeze(totals),
    residualValues: Object.freeze(residualValues),
    variabilityValues: Object.freeze(variabilityValues),
    residualReference: Object.freeze({ count: residualNumbers.length, center: residualCenter, mad: residualMad, scale: residualMad == null ? null : Math.max(policy.slow.fallbackScaleFloorMs, 1.4826 * residualMad) }),
    variabilityReference: Object.freeze({ count: variabilityNumbers.length, center: variabilityCenter, mad: variabilityMad, scale: variabilityMad == null ? null : Math.max(policy.unstable.scaleFloorMs, 1.4826 * variabilityMad) }),
  });
}

function leaveOneOutCounts(group, stat) {
  const included = group.eligible.some((peer) => peer.statId === stat.statId);
  const opp = opportunities(stat);
  const time = timing(stat);
  const err = errors(stat);
  const recoveryCount = Number(err.errorToRepair?.count || 0);
  const recoveryMean = Number(err.errorToRepair?.meanMs);
  return Object.freeze({
    entityCount: group.totals.entityCount - Number(included),
    opportunities: group.totals.opportunities - (included ? Number(opp.count || 0) : 0),
    errors: group.totals.errors - (included ? Number(opp.errorCount || 0) : 0),
    timingEligible: group.totals.timingEligible - (included ? Number(time.eligibleCount || 0) : 0),
    disfluent: group.totals.disfluent - (included ? Number(time.disfluentCount || 0) : 0),
    recoveryEpisodes: group.totals.recoveryEpisodes - (included ? recoveryCount : 0),
    recoveryMsSum: group.totals.recoveryMsSum - (included && recoveryCount > 0 && finite(recoveryMean) ? recoveryCount * recoveryMean : 0),
  });
}

export function createPracticePeerReferenceIndex(skillStats, policy = PRACTICE_LIMITER_POLICY_V1) {
  const stats = Array.isArray(skillStats) ? skillStats : [];
  const groups = new Map(TYPES.map((type) => [type, makeGroup(type, stats, policy)]));

  const forStat = (stat) => {
    const group = groups.get(stat?.entityType);
    if (!group) return null;
    const counts = leaveOneOutCounts(group, stat);
    const peerEntityEnough = counts.entityCount >= policy.minimumPeerEntities;
    const accuracy = peerEntityEnough && counts.opportunities >= policy.minimumPeerOpportunities
      ? Object.freeze({ status: "ready", entityCount: counts.entityCount, opportunityCount: counts.opportunities, rate: counts.errors / counts.opportunities })
      : Object.freeze({ status: "insufficient", entityCount: counts.entityCount, opportunityCount: counts.opportunities, rate: null });
    const hesitation = peerEntityEnough && counts.timingEligible >= policy.minimumPeerOpportunities
      ? Object.freeze({ status: "ready", entityCount: counts.entityCount, opportunityCount: counts.timingEligible, rate: counts.disfluent / counts.timingEligible })
      : Object.freeze({ status: "insufficient", entityCount: counts.entityCount, opportunityCount: counts.timingEligible, rate: null });
    const recovery = peerEntityEnough && counts.recoveryEpisodes >= policy.minimumPeerRecoveryEpisodes
      ? Object.freeze({ status: "ready", entityCount: counts.entityCount, episodeCount: counts.recoveryEpisodes, meanMs: counts.recoveryMsSum / counts.recoveryEpisodes })
      : Object.freeze({ status: "insufficient", entityCount: counts.entityCount, episodeCount: counts.recoveryEpisodes, meanMs: null });
    // Robust distributions are precomputed once per entity type to keep snapshot construction O(n).
    // Pooled rate baselines above are exact leave-one-out; robust median/MAD references use the
    // full eligible group because exact leave-one-out MAD would reintroduce an entity×peers pass.
    const residual = group.residualReference;
    const residualPeerCount = residual.count - Number(group.residualValues.some((entry) => entry.statId === stat.statId));
    const slowFallback = residualPeerCount >= policy.slow.fallbackMinimumEntities
      ? Object.freeze({ status: "ready", ...residual, count: residualPeerCount })
      : Object.freeze({ status: "insufficient", ...residual, count: residualPeerCount });
    const variability = group.variabilityReference;
    const variabilityPeerCount = variability.count - Number(group.variabilityValues.some((entry) => entry.statId === stat.statId));
    const instability = variabilityPeerCount >= policy.minimumPeerVariabilityEntities
      ? Object.freeze({ status: "ready", ...variability, count: variabilityPeerCount })
      : Object.freeze({ status: "insufficient", ...variability, count: variabilityPeerCount });
    return Object.freeze({ accuracy, hesitation, recovery, slowFallback, instability });
  };

  return Object.freeze({ groups, forStat });
}
