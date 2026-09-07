import { PRACTICE_COMBINATION_REPAIR_PHASES } from "./practiceCombinationRepairConstants.js";
import { PRACTICE_COMBINATION_REPAIR_POLICY_V1 } from "./practiceCombinationRepairPolicy.js";
import { buildPracticeCombinationRepairResult } from "./practiceCombinationRepairResult.js";
import { normalizePracticeCombinationRepairTarget } from "./practiceCombinationRepairValidation.js";
import { classifyPracticeLatencyEvents } from "./practiceLatencyClassifier.js";
import { buildPracticePhaseQuality } from "./practiceLearningQuality.js";

export const PRACTICE_COMBINATION_REPAIR_ANALYSIS_VERSION = 1;

const INSERTION_TYPES = new Set(["character", "space"]);

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function correctness(event) {
  return event?.correctness === "correct" || event?.correctness === true;
}

function compactTiming(record) {
  if (!record || !["fluent", "disfluent"].includes(record.classification)) return null;
  return Object.freeze({
    latencyClass: record.classification,
    observedLatencyMs: Number.isFinite(record.latencyMs) ? record.latencyMs : null,
    residualLatencyMs: null,
  });
}

function phaseForPosition(phaseRanges, position) {
  return phaseRanges.find((phase) => position >= phase.startIndex && position < phase.endIndex) || null;
}

function traceCoverageFromFoundation(foundationAnalysis, retainedEventCount) {
  const coverage = foundationAnalysis?.latency?.coverage ?? foundationAnalysis?.latencyAnalysis?.coverage ?? null;
  if (!coverage) return {
    retainedEventCount,
    totalEventCount: retainedEventCount,
    truncated: false,
  };
  return {
    capacity: Number.isInteger(coverage.capacity) ? coverage.capacity : retainedEventCount,
    retainedEventCount: Number.isInteger(coverage.retainedEventCount) ? coverage.retainedEventCount : retainedEventCount,
    totalEventCount: Number.isInteger(coverage.totalEventCount) ? coverage.totalEventCount : retainedEventCount,
    truncated: coverage.scope === "retained-window" || coverage.truncated === true,
  };
}

export function collectPracticeCombinationRepairPhaseOpportunities({
  eventTrace = [],
  contentPlan,
  foundationAnalysis = null,
  policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1,
} = {}) {
  const metadata = contentPlan?.metadata?.combinationRepair;
  const target = normalizePracticeCombinationRepairTarget({
    entityType: metadata?.target?.entityType,
    entityKey: metadata?.target?.entityKey,
    language: contentPlan?.metadata?.corpusBinding?.language ?? "en",
  }) ?? normalizePracticeCombinationRepairTarget({
    entityType: contentPlan?.targetEntities?.[0]?.entityType,
    entityKey: contentPlan?.targetEntities?.[0]?.entityKey,
    language: "en",
  });
  if (!target) throw new TypeError("Combination Repair analysis requires target metadata");
  const phaseRanges = Array.isArray(metadata?.phaseRanges) ? metadata.phaseRanges : [];
  if (phaseRanges.length !== PRACTICE_COMBINATION_REPAIR_PHASES.length) throw new TypeError("Combination Repair analysis requires five phase ranges");

  const firstAttempts = new Map();
  for (const event of eventTrace) {
    if (!INSERTION_TYPES.has(event?.type) || event?.isFirstAttempt !== true || !Number.isInteger(event?.textPosition)) continue;
    if (!firstAttempts.has(event.textPosition)) firstAttempts.set(event.textPosition, event);
  }

  const traceMetadata = traceCoverageFromFoundation(foundationAnalysis, eventTrace.length);
  const latency = classifyPracticeLatencyEvents({ events: eventTrace, traceMetadata });
  const timingByPosition = new Map();
  for (const record of latency.classifiedTransitions) {
    if (!Number.isInteger(record.textPosition) || record.isFirstAttempt !== true) continue;
    const timing = compactTiming(record);
    if (timing) timingByPosition.set(record.textPosition, timing);
  }

  const positions = [...firstAttempts.keys()].sort((a, b) => a - b);
  const minPosition = positions[0] ?? 0;
  const maxPosition = positions.at(-1) ?? -1;
  const targetLength = target.entityType === "bigram" ? 2 : 3;
  const opportunitiesByPhase = new Map(PRACTICE_COMBINATION_REPAIR_PHASES.map((phase) => [phase.id, []]));

  for (let start = minPosition; start <= maxPosition - targetLength + 1; start += 1) {
    const window = [];
    for (let offset = 0; offset < targetLength; offset += 1) window.push(firstAttempts.get(start + offset) || null);
    if (window.some((event) => !event)) continue;
    const expected = window.map((event) => event.expected).join("").normalize("NFC").toLowerCase();
    if (expected !== target.entityKey) continue;
    const phase = phaseForPosition(phaseRanges, start);
    if (!phase || window.some((event) => phaseForPosition(phaseRanges, event.textPosition)?.id !== phase.id)) continue;
    const timing = [];
    for (let offset = 1; offset < targetLength; offset += 1) {
      const record = timingByPosition.get(start + offset);
      if (record) timing.push(record);
    }
    opportunitiesByPhase.get(phase.id).push(Object.freeze({
      correct: window.every(correctness),
      timing: Object.freeze(timing),
    }));
  }

  const phases = PRACTICE_COMBINATION_REPAIR_PHASES.map((phase) => {
    const opportunities = opportunitiesByPhase.get(phase.id);
    const expectedQuota = Number(metadata.phaseSequence?.find((item) => item.id === phase.id)?.opportunityQuota ?? phaseRanges.find((item) => item.id === phase.id)?.opportunityQuota ?? 0);
    const quality = buildPracticePhaseQuality(target.entityType, opportunities, policy);
    return freezeDeep({
      id: phase.id,
      label: phase.label,
      cue: phase.cue,
      expectedOpportunityCount: expectedQuota,
      opportunityCount: opportunities.length,
      quotaSatisfied: opportunities.length === expectedQuota,
      quality: quality.quality,
      availableQualityWeight: quality.availableQualityWeight,
      components: quality.components,
      opportunities,
    });
  });

  return freezeDeep({
    target,
    traceComplete: traceMetadata.truncated !== true,
    latencyCoverage: latency.coverage,
    latencyCalibration: latency.calibration,
    phases,
  });
}

export function analyzePracticeCombinationRepairResult(input = {}) {
  const collected = collectPracticeCombinationRepairPhaseOpportunities({
    eventTrace: input.eventTrace,
    contentPlan: input.contentPlan,
    foundationAnalysis: input.foundationAnalysis,
  });
  const entry = collected.phases.find((phase) => phase.id === "entry-probe");
  const exit = collected.phases.find((phase) => phase.id === "exit-probe");
  const reasons = [];
  if (!collected.traceComplete) reasons.push("event-trace-truncated");
  for (const phase of collected.phases) if (!phase.quotaSatisfied) reasons.push(`${phase.id}-quota-incomplete`);
  const comparable = reasons.length === 0;
  const result = comparable
    ? buildPracticeCombinationRepairResult({
        entityType: collected.target.entityType,
        entityKey: collected.target.entityKey,
        entryOpportunities: entry.opportunities,
        exitOpportunities: exit.opportunities,
      })
    : null;

  return freezeDeep({
    analysisVersion: PRACTICE_COMBINATION_REPAIR_ANALYSIS_VERSION,
    target: collected.target,
    integrity: {
      status: comparable ? "complete" : "insufficient",
      reasons: Object.freeze(reasons),
      traceComplete: collected.traceComplete,
    },
    phases: collected.phases.map((phase) => Object.freeze({
      id: phase.id,
      label: phase.label,
      cue: phase.cue,
      expectedOpportunityCount: phase.expectedOpportunityCount,
      opportunityCount: phase.opportunityCount,
      quotaSatisfied: phase.quotaSatisfied,
      quality: phase.quality,
      availableQualityWeight: phase.availableQualityWeight,
      components: phase.components,
    })),
    sameSessionCheck: result,
    reviewItemChanges: Object.freeze([]),
    interpretation: Object.freeze({
      scope: "same-session-training",
      wording: comparable
        ? "Baseline and Check are comparable within this completed session."
        : "The session did not retain enough complete phase evidence for a Baseline/Check comparison.",
      doesNotEstablish: Object.freeze(["mastery", "retention", "transfer", "causal-improvement"]),
    }),
  });
}
