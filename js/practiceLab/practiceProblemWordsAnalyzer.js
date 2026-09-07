import { PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS, PRACTICE_PROBLEM_WORDS_RESULT_VERSION } from "./practiceProblemWordsConstants.js";
import { buildPracticeProblemWordsProbeMetrics } from "./practiceProblemWordsMetrics.js";

export const PRACTICE_PROBLEM_WORDS_ANALYSIS_VERSION = 1;
const finite = Number.isFinite;
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const delta = (after, before) => finite(after) && finite(before) ? after - before : null;
function traceComplete(foundationAnalysis) { const coverage = foundationAnalysis?.latency?.coverage ?? null; return coverage?.scope !== "retained-window" && coverage?.truncated !== true; }
function phaseRange(contentPlan, id) { return (contentPlan?.metadata?.problemWords?.phaseRanges ?? []).find((phase) => phase.id === id) ?? null; }

export function analyzePracticeProblemWordsResult(input = {}) {
  const metadata = input.contentPlan?.metadata?.problemWords;
  const target = metadata?.target ?? input.contentPlan?.targetEntities?.[0] ?? null;
  if (target?.entityType !== "word" || typeof target.entityKey !== "string") throw new TypeError("Problem Words analysis requires one canonical word target");
  const entry = phaseRange(input.contentPlan, "entry-probe"); const exit = phaseRange(input.contentPlan, "exit-probe");
  if (!entry || !exit) throw new TypeError("Problem Words analysis requires Baseline and Check ranges");
  const beforeMetrics = buildPracticeProblemWordsProbeMetrics({ eventTrace: input.eventTrace, foundationAnalysis: input.foundationAnalysis, targetWordRanges: entry.targetWordRanges, expectedEntityKey: target.entityKey });
  const afterMetrics = buildPracticeProblemWordsProbeMetrics({ eventTrace: input.eventTrace, foundationAnalysis: input.foundationAnalysis, targetWordRanges: exit.targetWordRanges, expectedEntityKey: target.entityKey });
  const reasons = [];
  if (!traceComplete(input.foundationAnalysis)) reasons.push("event-trace-truncated");
  if (beforeMetrics.opportunityCount !== PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS["entry-probe"]) reasons.push("entry-probe-quota-incomplete");
  if (afterMetrics.opportunityCount !== PRACTICE_PROBLEM_WORDS_PHASE_QUOTAS["exit-probe"]) reasons.push("exit-probe-quota-incomplete");
  if (!finite(beforeMetrics.executionQuality) || beforeMetrics.executionQualityCoverage < 0.60) reasons.push("entry-probe-quality-insufficient");
  if (!finite(afterMetrics.executionQuality) || afterMetrics.executionQualityCoverage < 0.60) reasons.push("exit-probe-quality-insufficient");
  const comparable = reasons.length === 0;
  const immediateProbeDelta = comparable ? afterMetrics.executionQuality - beforeMetrics.executionQuality : null;
  const firstPassAccuracyDeltaPp = delta(afterMetrics.wholeWordFirstPassAccuracy, beforeMetrics.wholeWordFirstPassAccuracy);
  const launchResidualDeltaMs = delta(afterMetrics.launch?.fluentResidualMedianMs, beforeMetrics.launch?.fluentResidualMedianMs);
  const internalResidualDeltaMs = delta(afterMetrics.internal?.fluentResidualMedianMs, beforeMetrics.internal?.fluentResidualMedianMs);
  const launchDisfluencyDelta = delta(afterMetrics.launch?.disfluencyRate, beforeMetrics.launch?.disfluencyRate);
  const internalDisfluencyDelta = delta(afterMetrics.internal?.disfluencyRate, beforeMetrics.internal?.disfluencyRate);
  const trainingQuality = freezeDeep({
    kind: "problem-words",
    resultVersion: PRACTICE_PROBLEM_WORDS_RESULT_VERSION,
    targetOpportunityCount: 15,
    doseUnits: 1,
    baselineExecutionQuality: beforeMetrics.executionQuality,
    checkExecutionQuality: afterMetrics.executionQuality,
    immediateProbeDelta,
    wholeWordAccuracyDeltaPp: finite(firstPassAccuracyDeltaPp) ? firstPassAccuracyDeltaPp * 100 : null,
    launchResidualDeltaMs,
    internalResidualDeltaMs,
    integrity: { status: comparable ? "complete" : "insufficient", reasons },
  });
  return freezeDeep({
    analysisVersion: PRACTICE_PROBLEM_WORDS_ANALYSIS_VERSION,
    resultVersion: PRACTICE_PROBLEM_WORDS_RESULT_VERSION,
    target: { entityType: "word", entityKey: target.entityKey },
    integrity: trainingQuality.integrity,
    beforeMetrics,
    afterMetrics,
    transferMetrics: null,
    immediateProbeDelta,
    firstPassAccuracyDeltaPp: finite(firstPassAccuracyDeltaPp) ? firstPassAccuracyDeltaPp * 100 : null,
    launchResidualDeltaMs,
    internalResidualDeltaMs,
    launchDisfluencyDelta,
    internalDisfluencyDelta,
    recommendationIds: [],
    trainingQuality,
    reviewItemChanges: [],
    interpretation: {
      scope: "same-session-training",
      wording: comparable ? "Baseline and Check are comparable within this completed word-practice session." : "The session did not retain enough complete probe evidence for a responsible Baseline/Check comparison.",
      disclaimer: "This compares your Baseline and Check inside this practice session. Long-term learning, transfer, and retention require later evidence.",
      doesNotEstablish: ["mastery", "retention", "transfer", "causal-improvement", "long-term-learning"],
    },
  });
}
