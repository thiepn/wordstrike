import { computePracticeEvidenceConfidence } from "./practiceEvidenceConfidence.js";
import { practiceMad } from "./practiceRobustStats.js";
import {
  PRACTICE_LIMITER_DIMENSIONS,
  PRACTICE_LIMITER_POLICY_V1,
  scalePracticeLimiterSeverity,
} from "./practiceLimiterPolicy.js";
import { shrinkPracticeResidualMean } from "./practicePeerReference.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, Number(value) || 0));
const finite = Number.isFinite;

const CONFIDENCE_DIMENSION = Object.freeze({
  slow: "normalized-residual",
  hesitant: "disfluency",
  inaccurate: "accuracy",
  "recovery-heavy": "errors",
  "launch-limited": "word-launch",
  unstable: "normalized-residual",
});

function statusFor(severity, confidence, required = true, policy = PRACTICE_LIMITER_POLICY_V1) {
  if (!required || confidence < policy.status.minimumConfidence) return "insufficient-evidence";
  if (severity < policy.status.possibleSeverity) return "not-elevated";
  if (severity >= policy.status.confirmedSeverity && confidence >= policy.status.confirmedConfidence) return "confirmed";
  if (severity >= policy.status.likelySeverity && confidence >= policy.status.likelyConfidence) return "likely";
  return "possible";
}

function baseResult(stat, type, severity, required, effect, baseline, evidence, reasons, policy) {
  const confidence = computePracticeEvidenceConfidence(stat, CONFIDENCE_DIMENSION[type]);
  return freezeDeep({
    type,
    status: statusFor(severity, confidence.score, required, policy),
    severityScore: clamp(severity),
    evidenceConfidenceScore: confidence.score,
    evidenceConfidenceLevel: confidence.level,
    weightedSeverity: clamp(severity) * confidence.score / 100,
    effect,
    baseline,
    evidence,
    reasons: [...new Set(reasons)].slice(0, 4),
  });
}

function relativeResidualEffect(timing, k) {
  const residualCount = Number(timing?.fluentResidual?.count || 0);
  const rawCount = Number(timing?.fluentLatency?.count || 0);
  const residualMean = Number(timing?.fluentResidual?.meanMs);
  const observedMean = Number(timing?.fluentLatency?.meanMs);
  const shrunkResidualMs = shrinkPracticeResidualMean(timing?.fluentResidual, k);
  const overlap = residualCount > 0 && residualCount === rawCount && finite(residualMean) && finite(observedMean);
  const expectedApproxMs = overlap ? observedMean - residualMean : null;
  const relativeSlowdown = overlap && expectedApproxMs > 0 && finite(shrunkResidualMs) ? shrunkResidualMs / expectedApproxMs : null;
  return { residualCount, rawCount, shrunkResidualMs, expectedApproxMs, relativeSlowdown };
}

export function evaluatePracticeSlowDimension(stat, peers, policy = PRACTICE_LIMITER_POLICY_V1, { timing = stat?.evidence?.timing, type = "slow" } = {}) {
  const relative = relativeResidualEffect(timing, policy.slow.shrinkageK);
  let effectMode = "relative-expected";
  let severity = null;
  let peerZ = null;
  let baseline = { status: "expected-context", expectedApproxMs: relative.expectedApproxMs };
  if (finite(relative.relativeSlowdown)) {
    severity = scalePracticeLimiterSeverity(Math.max(0, relative.relativeSlowdown), policy.slow.deadband, policy.slow.fullSeverity);
  } else if (peers?.slowFallback?.status === "ready" && finite(relative.shrunkResidualMs) && finite(peers.slowFallback.center) && finite(peers.slowFallback.scale) && peers.slowFallback.scale > 0) {
    effectMode = "peer-robust-fallback";
    peerZ = (relative.shrunkResidualMs - peers.slowFallback.center) / peers.slowFallback.scale;
    severity = scalePracticeLimiterSeverity(peerZ, policy.slow.fallbackDeadbandZ, policy.slow.fallbackFullSeverityZ);
    baseline = { status: "ready", peerCenterMs: peers.slowFallback.center, peerMadMs: peers.slowFallback.mad, peerScaleMs: peers.slowFallback.scale, peerEntityCount: peers.slowFallback.count };
  }
  const required = severity != null && relative.residualCount > 0;
  const reasons = !required ? ["low-evidence"] : severity > 0 ? ["positive-residual"] : [];
  return baseResult(stat, type, severity ?? 0, required,
    { effectMode, positiveResidualMs: finite(relative.shrunkResidualMs) ? Math.max(0, relative.shrunkResidualMs) : null, shrunkResidualMs: relative.shrunkResidualMs, expectedApproxMs: relative.expectedApproxMs, relativeSlowdown: relative.relativeSlowdown, peerZ },
    baseline,
    { fluentResidualCount: relative.residualCount, fluentLatencyCount: relative.rawCount }, reasons, policy);
}

export function evaluatePracticeHesitantDimension(stat, peers, policy = PRACTICE_LIMITER_POLICY_V1) {
  const time = stat?.evidence?.timing ?? {};
  const n = Number(time.eligibleCount || 0);
  const d = Number(time.disfluentCount || 0);
  const ready = n > 0 && peers?.hesitation?.status === "ready" && finite(peers.hesitation.rate);
  const p0 = ready ? peers.hesitation.rate : null;
  const smoothed = ready ? (d + policy.hesitant.shrinkageK * p0) / (n + policy.hesitant.shrinkageK) : null;
  const excess = ready ? Math.max(0, smoothed - p0) : null;
  const severity = ready ? scalePracticeLimiterSeverity(excess, policy.hesitant.deadband, policy.hesitant.fullSeverity) : 0;
  const shrunkDisfluentResidualMs = shrinkPracticeResidualMean(time.disfluentResidual, policy.hesitant.residualShrinkageK);
  return baseResult(stat, "hesitant", severity, ready,
    { smoothedRate: smoothed, excessDisfluency: excess, positiveDisfluentResidualMs: finite(shrunkDisfluentResidualMs) ? Math.max(0, shrunkDisfluentResidualMs) : null },
    { status: peers?.hesitation?.status ?? "insufficient", peerRate: p0, peerEntityCount: peers?.hesitation?.entityCount ?? 0, peerOpportunityCount: peers?.hesitation?.opportunityCount ?? 0 },
    { eligibleCount: n, disfluentCount: d }, ready ? (severity > 0 ? ["elevated-disfluency"] : []) : ["low-evidence"], policy);
}

export function evaluatePracticeInaccurateDimension(stat, peers, policy = PRACTICE_LIMITER_POLICY_V1) {
  const opp = stat?.evidence?.opportunities ?? {};
  const n = Number(opp.count || 0);
  const e = Number(opp.errorCount || 0);
  const ready = n > 0 && peers?.accuracy?.status === "ready" && finite(peers.accuracy.rate);
  const p0 = ready ? peers.accuracy.rate : null;
  const smoothed = ready ? (e + policy.inaccurate.shrinkageK * p0) / (n + policy.inaccurate.shrinkageK) : null;
  const excess = ready ? Math.max(0, smoothed - p0) : null;
  const severity = ready ? scalePracticeLimiterSeverity(excess, policy.inaccurate.deadband, policy.inaccurate.fullSeverity) : 0;
  return baseResult(stat, "inaccurate", severity, ready,
    { smoothedErrorRate: smoothed, excessErrorRate: excess },
    { status: peers?.accuracy?.status ?? "insufficient", peerErrorRate: p0, peerEntityCount: peers?.accuracy?.entityCount ?? 0, peerOpportunityCount: peers?.accuracy?.opportunityCount ?? 0 },
    { opportunityCount: n, errorCount: e }, ready ? (severity > 0 ? ["elevated-error-rate"] : []) : ["low-evidence"], policy);
}

export function evaluatePracticeRecoveryDimension(stat, peers, policy = PRACTICE_LIMITER_POLICY_V1) {
  const err = stat?.evidence?.errors ?? {};
  const episodeCount = Number(err.primaryEpisodeCount || 0);
  const recoveryCount = Number(err.errorToRepair?.count || 0);
  const recoveryMeanMs = Number(err.errorToRepair?.meanMs);
  const peerMeanMs = peers?.recovery?.meanMs;
  const ready = episodeCount > 0 && recoveryCount > 0 && finite(recoveryMeanMs) && peers?.recovery?.status === "ready" && finite(peerMeanMs) && peerMeanMs > 0;
  const recoveryRatio = ready ? recoveryMeanMs / peerMeanMs - 1 : null;
  let severity = ready ? scalePracticeLimiterSeverity(Math.max(0, recoveryRatio), policy.recovery.deadbandRatio, policy.recovery.fullSeverityRatio) : 0;
  const overDeletionPerEpisode = episodeCount > 0 ? Number(err.correctCharactersRemovedCount || 0) / episodeCount : null;
  let overDeletionBoost = 0;
  if (ready && overDeletionPerEpisode >= policy.recovery.overDeletionThreshold) {
    overDeletionBoost = Math.min(policy.recovery.maximumOverDeletionBoost, policy.recovery.maximumOverDeletionBoost * Math.min(1, overDeletionPerEpisode / 2));
    severity = clamp(severity + overDeletionBoost);
  }
  return baseResult(stat, "recovery-heavy", severity, ready,
    { recoveryRatio, observedRecoveryWindowMeanMs: ready ? recoveryMeanMs : null, overDeletionPerEpisode, overDeletionBoost },
    { status: peers?.recovery?.status ?? "insufficient", peerRecoveryMeanMs: ready ? peerMeanMs : null, peerEpisodeCount: peers?.recovery?.episodeCount ?? 0 },
    { primaryEpisodeCount: episodeCount, recoveryTimingCount: recoveryCount }, ready ? (severity > 0 ? ["slow-recovery"] : []) : ["low-evidence"], policy);
}

export function evaluatePracticeUnstableDimension(stat, peers, policy = PRACTICE_LIMITER_POLICY_V1) {
  const time = stat?.evidence?.timing ?? {};
  const samples = Array.isArray(time.fluentResidual?.recentSamples) ? time.fluentResidual.recentSamples.filter(finite) : [];
  const sessions = Number(stat?.evidence?.observation?.sessionCount || 0);
  const entityMad = samples.length ? practiceMad(samples) : null;
  const peerCenter = peers?.instability?.center;
  const ready = samples.length >= policy.minimumRecentResidualSamples && sessions >= policy.minimumObservationSessions && peers?.instability?.status === "ready" && finite(entityMad) && finite(peerCenter);
  const ratio = ready ? entityMad / Math.max(peerCenter, policy.unstable.scaleFloorMs) : null;
  const severity = ready ? scalePracticeLimiterSeverity(ratio, policy.unstable.ratioDeadband, policy.unstable.ratioFullSeverity) : 0;
  return baseResult(stat, "unstable", severity, ready,
    { recentResidualMadMs: entityMad, instabilityRatio: ratio },
    { status: peers?.instability?.status ?? "insufficient", peerResidualMadCenterMs: ready ? peerCenter : null, peerEntityCount: peers?.instability?.count ?? 0 },
    { recentResidualSampleCount: samples.length, observationSessionCount: sessions }, ready ? (severity > 0 ? ["high-variability"] : []) : ["low-evidence"], policy);
}

export function evaluatePracticeLaunchLimitedDimension(stat, peers, internalSlow, policy = PRACTICE_LIMITER_POLICY_V1) {
  if (stat?.entityType !== "word") return baseResult(stat, "launch-limited", 0, false, { launchSeverity: null, internalSlowSeverity: internalSlow?.severityScore ?? null }, { status: "not-applicable" }, { wordOnly: true }, ["low-evidence"], policy);
  const launchTiming = stat?.evidence?.launchTiming;
  const launchRelative = relativeResidualEffect(launchTiming, policy.launch.shrinkageK);
  let launchSeverity = finite(launchRelative.relativeSlowdown)
    ? scalePracticeLimiterSeverity(Math.max(0, launchRelative.relativeSlowdown), policy.slow.deadband, policy.slow.fullSeverity)
    : null;
  const launchEligible = Number(launchTiming?.eligibleCount || 0);
  const launchDisfluent = Number(launchTiming?.disfluentCount || 0);
  const launchDisfluencyRate = launchEligible > 0 ? launchDisfluent / launchEligible : null;
  const disfluencyBoost = launchSeverity != null && finite(launchDisfluencyRate)
    ? policy.launch.maximumDisfluencyBoost * Math.min(1, launchDisfluencyRate / policy.launch.disfluencyModifierFullRate)
    : 0;
  const combinedSeverity = launchSeverity == null ? 0 : clamp(launchSeverity + disfluencyBoost);
  const internalSeverity = Number(internalSlow?.severityScore || 0);
  const ruleSatisfied = launchSeverity != null
    && combinedSeverity >= policy.launch.candidateSeverity
    && (internalSeverity < policy.launch.internalHealthySeverity || combinedSeverity >= internalSeverity + policy.launch.minimumSeverityLead);
  const severity = ruleSatisfied ? combinedSeverity : Math.min(combinedSeverity, policy.status.possibleSeverity - 1e-6);
  const required = launchRelative.residualCount > 0 && launchSeverity != null;
  return baseResult(stat, "launch-limited", severity, required,
    { launchSeverity: combinedSeverity, baseLaunchSeverity: launchSeverity, internalSlowSeverity: internalSeverity, positiveLaunchResidualMs: finite(launchRelative.shrunkResidualMs) ? Math.max(0, launchRelative.shrunkResidualMs) : null, relativeLaunchSlowdown: launchRelative.relativeSlowdown, launchDisfluencyRate, disfluencyBoost, ruleSatisfied },
    { status: "expected-context", expectedApproxMs: launchRelative.expectedApproxMs },
    { launchResidualCount: launchRelative.residualCount, launchEligibleCount: launchEligible, launchDisfluentCount: launchDisfluent }, required ? (ruleSatisfied ? ["word-launch"] : []) : ["low-evidence"], policy);
}

function candidateStatus(primaryPhenotype, dimensions, mixedTypes) {
  if (primaryPhenotype === "insufficient-data") return "insufficient-data";
  if (primaryPhenotype === "none") return "not-elevated";
  if (primaryPhenotype === "mixed") {
    const order = ["insufficient-evidence", "not-elevated", "possible", "likely", "confirmed"];
    const statuses = mixedTypes.map((type) => dimensions[type].status);
    const weaker = statuses.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
    return weaker === "insufficient-evidence" ? "insufficient-data" : weaker;
  }
  const status = dimensions[primaryPhenotype]?.status;
  return status === "insufficient-evidence" ? "insufficient-data" : status;
}

export function evaluatePracticeLimiterDimensions(stat, peers, policy = PRACTICE_LIMITER_POLICY_V1) {
  const slow = evaluatePracticeSlowDimension(stat, peers, policy);
  const dimensions = {
    slow,
    hesitant: evaluatePracticeHesitantDimension(stat, peers, policy),
    inaccurate: evaluatePracticeInaccurateDimension(stat, peers, policy),
    "recovery-heavy": evaluatePracticeRecoveryDimension(stat, peers, policy),
    "launch-limited": null,
    unstable: evaluatePracticeUnstableDimension(stat, peers, policy),
  };
  dimensions["launch-limited"] = evaluatePracticeLaunchLimitedDimension(stat, peers, slow, policy);
  const ranked = PRACTICE_LIMITER_DIMENSIONS.map((type) => dimensions[type])
    .filter((entry) => entry.status !== "insufficient-evidence")
    .sort((a, b) => b.weightedSeverity - a.weightedSeverity || b.severityScore - a.severityScore || a.type.localeCompare(b.type));
  const sufficient = ranked.length > 0;
  const elevated = ranked.filter((entry) => entry.severityScore >= policy.status.possibleSeverity);
  let primaryPhenotype = !sufficient ? "insufficient-data" : elevated.length ? elevated[0].type : "none";
  let mixedTypes = [];
  if (elevated.length >= 2) {
    const [first, second] = elevated;
    if (first.weightedSeverity >= policy.mixed.minimumWeightedSeverity
      && second.weightedSeverity >= policy.mixed.minimumWeightedSeverity
      && first.weightedSeverity > 0
      && second.weightedSeverity / first.weightedSeverity >= policy.mixed.secondToFirstRatio) {
      primaryPhenotype = "mixed";
      mixedTypes = [first.type, second.type].slice(0, policy.mixed.maximumTypes);
    }
  }
  const weaknessScore = clamp(Math.max(0, ...PRACTICE_LIMITER_DIMENSIONS.map((type) => dimensions[type].weightedSeverity)));
  const primaryDimension = primaryPhenotype === "mixed" ? dimensions[mixedTypes[0]] : dimensions[primaryPhenotype] ?? null;
  return freezeDeep({
    primaryPhenotype,
    mixedTypes,
    status: candidateStatus(primaryPhenotype, dimensions, mixedTypes),
    weaknessScore,
    primaryDimensionType: primaryDimension?.type ?? null,
    primaryDimensionConfidenceScore: primaryDimension?.evidenceConfidenceScore ?? 0,
    primaryDimensionConfidenceLevel: primaryDimension?.evidenceConfidenceLevel ?? "none",
    dimensions,
  });
}
