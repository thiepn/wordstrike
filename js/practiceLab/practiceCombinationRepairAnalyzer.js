import { PRACTICE_COMBINATION_REPAIR_PHASES } from "./practiceCombinationRepairConstants.js";
import { PRACTICE_COMBINATION_REPAIR_POLICY_V1 } from "./practiceCombinationRepairPolicy.js";
import { buildPracticeCombinationRepairResult } from "./practiceCombinationRepairResult.js";
import { normalizePracticeCombinationRepairTarget } from "./practiceCombinationRepairValidation.js";
import { classifyPracticeLatencyEvents } from "./practiceLatencyClassifier.js";
import { buildPracticePhaseQuality } from "./practiceLearningQuality.js";

export const PRACTICE_COMBINATION_REPAIR_ANALYSIS_VERSION = 1;
const INSERTION_TYPES = new Set(["character", "space"]);
const freezeDeep = (value) => { if (!value || typeof value !== "object" || Object.isFrozen(value)) return value; Object.values(value).forEach(freezeDeep); return Object.freeze(value); };
const correctness = (event) => event?.correctness === "correct" || event?.correctness === true;
const normalizeText = (value, language) => { try { return String(value).normalize("NFC").toLocaleLowerCase(language || undefined); } catch { return String(value).normalize("NFC").toLowerCase(); } };

function compactTiming(record) {
  if (!record || !["fluent", "disfluent"].includes(record.classification)) return null;
  return Object.freeze({ latencyClass: record.classification, observedLatencyMs: Number.isFinite(record.latencyMs) ? record.latencyMs : null, residualLatencyMs: null });
}
const phaseForPosition = (phaseRanges, position) => phaseRanges.find((phase) => position >= phase.startIndex && position < phase.endIndex) || null;

function traceCoverageFromFoundation(foundationAnalysis, retainedEventCount) {
  const coverage = foundationAnalysis?.latency?.coverage ?? foundationAnalysis?.latencyAnalysis?.coverage ?? null;
  if (!coverage) return { retainedEventCount, totalEventCount: retainedEventCount, truncated: false };
  return {
    capacity: Number.isInteger(coverage.capacity) ? coverage.capacity : retainedEventCount,
    retainedEventCount: Number.isInteger(coverage.retainedEventCount) ? coverage.retainedEventCount : retainedEventCount,
    totalEventCount: Number.isInteger(coverage.totalEventCount) ? coverage.totalEventCount : retainedEventCount,
    truncated: coverage.scope === "retained-window" || coverage.truncated === true,
  };
}

export function collectPracticeCombinationRepairPhaseOpportunities({ eventTrace = [], contentPlan, foundationAnalysis = null, policy = PRACTICE_COMBINATION_REPAIR_POLICY_V1 } = {}) {
  const metadata = contentPlan?.metadata?.combinationRepair;
  const language = contentPlan?.metadata?.language ?? "en";
  const target = normalizePracticeCombinationRepairTarget({ entityType: metadata?.target?.entityType, entityKey: metadata?.target?.entityKey, language })
    ?? normalizePracticeCombinationRepairTarget({ entityType: contentPlan?.targetEntities?.[0]?.entityType, entityKey: contentPlan?.targetEntities?.[0]?.entityKey, language });
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
    const window = Array.from({ length: targetLength }, (_, offset) => firstAttempts.get(start + offset) || null);
    if (window.some((event) => !event)) continue;
    if (normalizeText(window.map((event) => event.expected).join(""), language) !== target.entityKey) continue;
    const phase = phaseForPosition(phaseRanges, start);
    if (!phase || window.some((event) => phaseForPosition(phaseRanges, event.textPosition)?.id !== phase.id)) continue;
    const timing = [];
    for (let offset = 1; offset < targetLength; offset += 1) { const record = timingByPosition.get(start + offset); if (record) timing.push(record); }
    opportunitiesByPhase.get(phase.id).push(Object.freeze({ correct: window.every(correctness), timing: Object.freeze(timing) }));
  }

  const phases = PRACTICE_COMBINATION_REPAIR_PHASES.map((phase) => {
    const opportunities = opportunitiesByPhase.get(phase.id);
    const expectedQuota = Number(metadata.phaseSequence?.find((item) => item.id === phase.id)?.opportunityQuota ?? phaseRanges.find((item) => item.id === phase.id)?.opportunityQuota ?? 0);
    const quality = buildPracticePhaseQuality(target.entityType, opportunities, policy);
    return freezeDeep({ id: phase.id, label: phase.label, cue: phase.cue, expectedOpportunityCount: expectedQuota, opportunityCount: opportunities.length, quotaSatisfied: opportunities.length === expectedQuota, quality: quality.quality, availableQualityWeight: quality.availableQualityWeight, components: quality.components, opportunities });
  });
  return freezeDeep({ target, traceComplete: traceMetadata.truncated !== true, latencyCoverage: latency.coverage, latencyCalibration: latency.calibration, phases });
}

function persistentPhase(phase) {
  return Object.freeze({ id: phase.id, label: phase.label, cue: phase.cue, expectedOpportunityCount: phase.expectedOpportunityCount, opportunityCount: phase.opportunityCount, quotaSatisfied: phase.quotaSatisfied, quality: phase.quality, availableQualityWeight: phase.availableQualityWeight, components: phase.components });
}

export function analyzePracticeCombinationRepairResult(input = {}) {
  const collected = collectPracticeCombinationRepairPhaseOpportunities({ eventTrace: input.eventTrace, contentPlan: input.contentPlan, foundationAnalysis: input.foundationAnalysis });
  const entry = collected.phases.find((phase) => phase.id === "entry-probe");
  const exit = collected.phases.find((phase) => phase.id === "exit-probe");
  const reasons = [];
  if (!collected.traceComplete) reasons.push("event-trace-truncated");
  for (const phase of collected.phases) if (!phase.quotaSatisfied) reasons.push(`${phase.id}-quota-incomplete`);
  const comparable = reasons.length === 0;
  const result = comparable ? buildPracticeCombinationRepairResult({ entityType: collected.target.entityType, entityKey: collected.target.entityKey, entryOpportunities: entry.opportunities, exitOpportunities: exit.opportunities }) : null;
  const integrity = Object.freeze({ status: comparable ? "complete" : "insufficient", reasons: Object.freeze(reasons), traceComplete: collected.traceComplete });
  const phases = Object.freeze(collected.phases.map(persistentPhase));
  const interpretation = Object.freeze({ scope: "same-session-training", wording: comparable ? "Baseline and Check are comparable within this completed session." : "The session did not retain enough complete phase evidence for a Baseline/Check comparison.", doesNotEstablish: Object.freeze(["mastery", "retention", "transfer", "causal-improvement"]) });
  const trainingQuality = freezeDeep({ kind: "combination-repair", analysisVersion: PRACTICE_COMBINATION_REPAIR_ANALYSIS_VERSION, target: collected.target, integrity, phases, sameSessionCheck: result, interpretation });
  return freezeDeep({
    analysisVersion: PRACTICE_COMBINATION_REPAIR_ANALYSIS_VERSION,
    target: collected.target,
    integrity,
    phases,
    sameSessionCheck: result,
    beforeMetrics: Object.freeze({ phaseId: "entry-probe", opportunityCount: entry.opportunityCount, quality: entry.quality, availableQualityWeight: entry.availableQualityWeight, components: entry.components }),
    afterMetrics: Object.freeze({ phaseId: "exit-probe", opportunityCount: exit.opportunityCount, quality: exit.quality, availableQualityWeight: exit.availableQualityWeight, components: exit.components }),
    trainingQuality,
    reviewItemChanges: Object.freeze([]),
    interpretation,
  });
}
