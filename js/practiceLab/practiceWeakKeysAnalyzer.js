import {
  PRACTICE_WEAK_KEYS_PHASE_QUOTAS,
  PRACTICE_WEAK_KEYS_RESULT_VERSION,
} from "./practiceWeakKeysConstants.js";
import { buildPracticeWeakKeysProbeMetrics } from "./practiceWeakKeysMetrics.js";

export const PRACTICE_WEAK_KEYS_ANALYSIS_VERSION = 1;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const finite = Number.isFinite;

function traceComplete(foundationAnalysis) {
  const coverage = foundationAnalysis?.latency?.coverage ?? null;
  return coverage?.scope !== "retained-window" && coverage?.truncated !== true;
}

function contextVariety(contextCoverage) {
  const positions = Number(contextCoverage?.positionCoverage?.classCount || 0);
  const preceding = Number(contextCoverage?.precedingContextCount || 0);
  const following = Number(contextCoverage?.followingContextCount || 0);
  const geometryStatus = contextCoverage?.geometryCoverage?.status ?? "unavailable";
  const geometry = Number(contextCoverage?.geometryCoverage?.classCount || 0);
  const geometryBroad = geometryStatus === "unavailable" || geometry >= 3;
  if (positions >= 3 && preceding >= 6 && following >= 6 && geometryBroad) return "Broad";
  if (positions >= 2 && preceding >= 3 && following >= 3) return "Moderate";
  return "Low";
}

function probeRange(contentPlan, phaseId) {
  return (contentPlan?.metadata?.weakKeys?.phaseRanges ?? []).find((phase) => phase.id === phaseId) ?? null;
}

export function analyzePracticeWeakKeysResult(input = {}) {
  const metadata = input.contentPlan?.metadata?.weakKeys;
  const target = metadata?.target ?? input.contentPlan?.targetEntities?.[0] ?? null;
  if (target?.entityType !== "key" || typeof target.entityKey !== "string") throw new TypeError("Weak Keys analysis requires one key target");
  const entryRange = probeRange(input.contentPlan, "entry-probe");
  const exitRange = probeRange(input.contentPlan, "exit-probe");
  if (!entryRange || !exitRange) throw new TypeError("Weak Keys analysis requires Baseline and Check phase ranges");

  const beforeMetrics = buildPracticeWeakKeysProbeMetrics({
    eventTrace: input.eventTrace,
    foundationAnalysis: input.foundationAnalysis,
    targetPositions: entryRange.targetPositions,
    expectedEntityKey: target.entityKey,
  });
  const afterMetrics = buildPracticeWeakKeysProbeMetrics({
    eventTrace: input.eventTrace,
    foundationAnalysis: input.foundationAnalysis,
    targetPositions: exitRange.targetPositions,
    expectedEntityKey: target.entityKey,
  });
  const reasons = [];
  if (!traceComplete(input.foundationAnalysis)) reasons.push("event-trace-truncated");
  if (beforeMetrics.opportunityCount !== PRACTICE_WEAK_KEYS_PHASE_QUOTAS["entry-probe"]) reasons.push("entry-probe-quota-incomplete");
  if (afterMetrics.opportunityCount !== PRACTICE_WEAK_KEYS_PHASE_QUOTAS["exit-probe"]) reasons.push("exit-probe-quota-incomplete");
  if (!finite(beforeMetrics.quality) || beforeMetrics.qualityCoverage < 0.60) reasons.push("entry-probe-quality-insufficient");
  if (!finite(afterMetrics.quality) || afterMetrics.qualityCoverage < 0.60) reasons.push("exit-probe-quality-insufficient");
  const comparable = reasons.length === 0;
  const immediateProbeDelta = comparable ? afterMetrics.quality - beforeMetrics.quality : null;
  const coverage = metadata?.contextCoveragePlan ?? null;
  const variety = contextVariety(coverage);
  const interpretation = freezeDeep({
    scope: "same-session-training",
    wording: comparable
      ? "Baseline and Check are comparable within this completed practice session."
      : "The session did not retain enough complete probe evidence for a responsible Baseline/Check comparison.",
    disclaimer: "This compares the beginning and end of this practice session. Long-term improvement requires later sessions and transfer evidence.",
    doesNotEstablish: ["mastery", "retention", "transfer", "causal-improvement", "long-term-learning"],
  });
  const trainingQuality = freezeDeep({
    kind: "weak-keys",
    resultVersion: PRACTICE_WEAK_KEYS_RESULT_VERSION,
    targetOpportunityCount: PRACTICE_WEAK_KEYS_PHASE_QUOTAS.total,
    doseUnits: 1,
    entryQuality: beforeMetrics.quality,
    exitQuality: afterMetrics.quality,
    immediateProbeDelta,
    contextCoverage: coverage,
    contextVariety: variety,
    integrity: { status: comparable ? "complete" : "insufficient", reasons },
  });
  return freezeDeep({
    analysisVersion: PRACTICE_WEAK_KEYS_ANALYSIS_VERSION,
    resultVersion: PRACTICE_WEAK_KEYS_RESULT_VERSION,
    target: { entityType: "key", entityKey: target.entityKey },
    integrity: { status: comparable ? "complete" : "insufficient", reasons },
    beforeMetrics,
    afterMetrics,
    transferMetrics: null,
    immediateProbeDelta,
    recommendationIds: [],
    trainingQuality,
    reviewItemChanges: [],
    interpretation,
  });
}
