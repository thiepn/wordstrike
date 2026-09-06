import { extractPracticeLearningPhaseOpportunities } from "./practiceLearningObservation.js";
import { buildPracticePhaseQuality } from "./practiceLearningQuality.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";
import {
  PRACTICE_RETENTION_PROBE_VERSION,
  PRACTICE_RETENTION_REVIEW_DELTA_VERSION,
} from "./practiceReviewConstants.js";
import { PRACTICE_REVIEW_POLICY_V1 } from "./practiceReviewPolicy.js";
import { classifyPracticeRetentionOutcome, computePracticeRetentionScore } from "./practiceRetentionQuality.js";
import { getPracticeTimeContext } from "./practiceTime.js";

const DAY_MS = 86_400_000;
const finite = Number.isFinite;
const identity = (type, key) => `${type}\u0000${key}`;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function collectFamilyIds(contentPlan, maxFamilyIds) {
  const values = [];
  const metadata = contentPlan?.metadata ?? {};
  if (typeof metadata.familyId === "string" && metadata.familyId) values.push(metadata.familyId);
  if (Array.isArray(metadata.familyIds)) values.push(...metadata.familyIds.filter((value) => typeof value === "string" && value));
  for (const unit of contentPlan?.units ?? []) {
    if (typeof unit?.metadata?.familyId === "string" && unit.metadata.familyId) values.push(unit.metadata.familyId);
  }
  return [...new Set(values.map((value) => value.slice(0, 120)))].slice(0, maxFamilyIds);
}

function noveltyStatus(familyIds, excluded) {
  if (!familyIds.length) return "unknown";
  const recent = new Set(Array.isArray(excluded) ? excluded : []);
  return familyIds.some((familyId) => !recent.has(familyId)) ? "fresh" : "repeated";
}

function delayMature(binding, reviewedAtUtc, localDayKey) {
  const reviewedMs = Date.parse(reviewedAtUtc);
  const matureMs = Date.parse(binding.minimumMatureAtUtc);
  const referenceMs = Date.parse(binding.referenceAtUtc);
  if (![reviewedMs, matureMs, referenceMs].every(finite)) return { mature: false, elapsedDays: null };
  const referenceLocalDay = binding.referenceLocalDayKey
    ?? getPracticeTimeContext(new Date(binding.referenceAtUtc)).localDayKey;
  return {
    mature: reviewedMs + 1e-9 >= matureMs && localDayKey !== referenceLocalDay,
    elapsedDays: Math.max(0, (reviewedMs - referenceMs) / DAY_MS),
  };
}

export function buildPracticeRetentionProbeResults({
  foundationAnalysis,
  contentPlan,
  reviewPlan,
  session,
  traceMetadata = {},
  restoredFromCheckpoint = false,
  planCurrent = true,
  segmenter = null,
  reviewPolicy = PRACTICE_REVIEW_POLICY_V1,
  learningPolicy = PRACTICE_LEARNING_POLICY_V1,
} = {}) {
  const bindings = Array.isArray(reviewPlan?.bindings) ? reviewPlan.bindings : [];
  const phaseMap = extractPracticeLearningPhaseOpportunities({
    profileId: reviewPlan?.profileId,
    contextId: reviewPlan?.contextId,
    contentPlan,
    normalizedTransitions: foundationAnalysis?.normalization?.normalizedTransitions ?? [],
    segmenter,
    maxDirectTargets: Math.max(reviewPolicy.plan.maxBindings, bindings.length),
  });
  const familyIds = collectFamilyIds(contentPlan, reviewPolicy.probe.maxFamilyIds);
  const results = [];
  const deltas = [];
  for (const binding of bindings.slice(0, reviewPolicy.plan.maxBindings)) {
    const records = phaseMap.get(identity(binding.entityType, binding.entityKey)) ?? [];
    const maximum = reviewPolicy.probe.maximumOpportunities?.[binding.entityType] ?? 0;
    const minimum = reviewPolicy.probe.minimumOpportunities?.[binding.entityType] ?? Infinity;
    const probeRecords = records.slice(0, maximum);
    const quality = probeRecords.length >= minimum
      ? buildPracticePhaseQuality(binding.entityType, probeRecords, learningPolicy)
      : null;
    const probeQuality = quality?.qualityCoverage === undefined
      ? quality?.quality ?? null
      : quality.qualityCoverage >= reviewPolicy.probe.minimumQualityCoverage ? quality.quality : null;
    const qualityCoverage = quality?.availableQualityWeight ?? 0;
    const validQuality = probeRecords.length >= minimum
      && finite(quality?.quality)
      && qualityCoverage + 1e-12 >= reviewPolicy.probe.minimumQualityCoverage;
    const delay = delayMature(binding, session.reviewedAtUtc, session.localDayKey);
    const novelty = noveltyStatus(familyIds, binding.excludeFamilyIds);
    const scoring = validQuality ? computePracticeRetentionScore(binding.referenceQuality, quality.quality) : { retentionScore: null, preservationQuality: null };
    const outcome = validQuality ? classifyPracticeRetentionOutcome(quality.quality, scoring.retentionScore, reviewPolicy) : null;
    const sessionComplete = session.status === "completed" && session.completionReason !== "manual-stop";
    const traceComplete = traceMetadata?.truncated !== true && traceMetadata?.scope !== "retained-window";
    const verificationEligible = Boolean(
      delay.mature
      && novelty === "fresh"
      && validQuality
      && sessionComplete
      && traceComplete
      && !restoredFromCheckpoint
      && planCurrent,
    );
    let measurementStatus = "measured";
    if (!validQuality) measurementStatus = "insufficient";
    else if (!delay.mature) measurementStatus = "premature";
    else if (!verificationEligible) measurementStatus = "non-verifying";
    const result = freezeDeep({
      probeVersion: PRACTICE_RETENTION_PROBE_VERSION,
      reviewItemId: binding.reviewItemId,
      cycleId: binding.cycleId,
      entityType: binding.entityType,
      entityKey: binding.entityKey,
      sessionId: session.sessionId,
      reviewedAtUtc: session.reviewedAtUtc,
      localDayKey: session.localDayKey,
      referenceAtUtc: binding.referenceAtUtc,
      referenceQuality: binding.referenceQuality,
      plannedIntervalDays: (Date.parse(binding.dueAtUtc) - Date.parse(binding.referenceAtUtc)) / DAY_MS,
      elapsedDays: delay.elapsedDays,
      mature: delay.mature,
      noveltyStatus: novelty,
      opportunityCount: probeRecords.length,
      qualityCoverage,
      probeQuality: validQuality ? quality.quality : null,
      preservationQuality: scoring.preservationQuality,
      retentionScore: scoring.retentionScore,
      outcome,
      verificationEligible,
      familyIds,
      measurementStatus,
    });
    results.push(result);
    deltas.push(freezeDeep({
      deltaVersion: PRACTICE_RETENTION_REVIEW_DELTA_VERSION,
      sessionId: session.sessionId,
      profileId: reviewPlan.profileId,
      contextId: reviewPlan.contextId,
      reviewItemId: binding.reviewItemId,
      cycleId: binding.cycleId,
      expectedReferenceAtUtc: binding.referenceAtUtc,
      entityType: binding.entityType,
      entityKey: binding.entityKey,
      reviewedAtUtc: session.reviewedAtUtc,
      localDayKey: session.localDayKey,
      measurementStatus,
      probeQuality: result.probeQuality,
      referenceQuality: binding.referenceQuality,
      retentionScore: result.retentionScore,
      outcome,
      opportunityCount: result.opportunityCount,
      qualityCoverage,
      plannedIntervalDays: result.plannedIntervalDays,
      elapsedDays: result.elapsedDays,
      mature: result.mature,
      noveltyStatus: novelty,
      familyIds,
      verificationEligible,
    }));
  }
  return freezeDeep({ probeResults: results, reviewDeltas: deltas });
}
