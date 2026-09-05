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
  return Object.freeze({ type, eligible, totals: Object.freeze(totals), residualValues: Object.freeze(residualValues), variabilityValues: Object.freeze(variabilityValues) });
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

function robustReference(entries, statId, floor = 0) {
  const peers = entries.filter((entry) => entry.statId !== statId).map((entry) => entry.value);
  if (!peers.length) return Object.freeze({ count: 0, center: null, mad: null, scale: null });
  const center = practiceMedian(peers);
  const mad = practiceMad(peers);
  return Object.freeze({ count: peers.length, center, mad, scale: mad == null ? null : Math.max(floor, 1.4826 * mad) });
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
    const residual = robustReference(group.residualValues, stat.statId, policy.slow.fallbackScaleFloorMs);
    const slowFallback = residual.count >= policy.slow.fallbackMinimumEntities
      ? Object.freeze({ status: "ready", ...residual })
      : Object.freeze({ status: "insufficient", ...residual });
    const variability = robustReference(group.variabilityValues, stat.statId, policy.unstable.scaleFloorMs);
    const instability = variability.count >= policy.minimumPeerVariabilityEntities
      ? Object.freeze({ status: "ready", ...variability })
      : Object.freeze({ status: "insufficient", ...variability });
    return Object.freeze({ accuracy, hesitation, recovery, slowFallback, instability });
  };

  return Object.freeze({ groups, forStat });
}
