import { createPracticeContentPlan, createPracticeSegmenter } from "./practiceSessionContract.js";
import { createPracticeSessionId } from "./practiceIds.js";
import { classifyPracticeLatencyEvents } from "./practiceLatencyClassifier.js";
import { buildPracticeSessionExecutionQuality } from "./practiceExecutionQuality.js";
import { practiceMedian } from "./practiceRobustStats.js";
import {
  createPracticeResearchProbePlan,
  normalizePracticeResearchProbeResult,
} from "./practiceResearchProbe.js";
import {
  PRACTICE_RESEARCH_PROBE_CONTRACT,
  PRACTICE_RESEARCH_PROBE_VERSION,
} from "./practiceResearchConstants.js";
import { trustPracticeResearchContentPlan } from "./practiceResearchBinding.js";

const INSERTION_TYPES = new Set(["character", "space"]);
const BASELINE_WORDS = Object.freeze(["calm", "river", "stone", "light", "field", "green", "music", "north", "clear", "soft", "plain", "fresh", "small", "bright", "steady", "open"]);
const FOLLOWUP_WORDS = Object.freeze(["warm", "ocean", "trail", "glow", "meadow", "amber", "sound", "south", "clean", "gentle", "simple", "crisp", "quiet", "silver", "smooth", "broad"]);
const finite = Number.isFinite;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const correct = (event) => event?.correctness === "correct" || event?.correctness === true;

function safeNeutralWords(targetKey, phase) {
  const needle = String(targetKey ?? "").toLowerCase();
  const source = phase === "baseline" ? BASELINE_WORDS : FOLLOWUP_WORDS;
  const clean = source.filter((word) => !word.includes(needle));
  if (clean.length >= 6) return clean;
  const letters = "abcdefghijklmnopqrstuvwxyz".split("").filter((letter) => !needle.includes(letter));
  const fallback = [];
  for (let index = 0; index < Math.max(6, clean.length); index += 1) {
    const a = letters[index % letters.length] ?? "x";
    const b = letters[(index + 3) % letters.length] ?? "v";
    const c = letters[(index + 7) % letters.length] ?? "j";
    const d = letters[(index + 11) % letters.length] ?? "z";
    fallback.push(`${a}${b}${c}${d}`);
  }
  return [...clean, ...fallback].filter((word) => !word.includes(needle)).slice(0, 16);
}

export function buildPracticeResearchProbeContentPlan({ target, phase, sessionId = createPracticeSessionId() } = {}) {
  const probePlan = createPracticeResearchProbePlan({ target, phase });
  const segment = createPracticeSegmenter();
  const neutral = safeNeutralWords(target.entityKey, phase);
  const pieces = [];
  const targetSpans = [];
  const familyIds = [];
  let cursor = 0;
  for (let index = 0; index < probePlan.targetOpportunityQuota; index += 1) {
    const left = `${neutral[(index * 3) % neutral.length]} ${neutral[(index * 3 + 1) % neutral.length]} ${neutral[(index * 3 + 2) % neutral.length]}`;
    const right = `${neutral[(index * 5 + 3) % neutral.length]} ${neutral[(index * 5 + 4) % neutral.length]} ${neutral[(index * 5 + 5) % neutral.length]}`;
    const prefix = `${pieces.length ? " " : ""}${left} `;
    pieces.push(prefix);
    cursor += segment(prefix).length;
    const startIndex = cursor;
    pieces.push(target.entityKey);
    cursor += segment(target.entityKey).length;
    const endIndex = cursor;
    pieces.push(` ${right}`);
    cursor += segment(` ${right}`).length;
    const familyId = `research-probe:${phase}:${target.entityType}:${index + 1}`;
    familyIds.push(familyId);
    targetSpans.push(Object.freeze({ startIndex, endIndex, familyId }));
  }
  const text = pieces.join("");
  const contentPlan = createPracticeContentPlan({
    contentId: `practice-content_research-probe-${phase}-${String(sessionId).replace(/[^a-z0-9._-]/gi, "-")}`,
    contentGeneratorVersion: PRACTICE_RESEARCH_PROBE_VERSION,
    text,
    targetEntities: [{ entityType: target.entityType, entityKey: target.entityKey, statId: target.statId, directTarget: true }],
    completion: { mode: "content", value: null },
    metadata: {
      sourceType: "research-target-probe",
      partition: "diagnostic",
      language: "en",
      researchProbe: {
        phase,
        target: { entityType: target.entityType, entityKey: target.entityKey, statId: target.statId },
        targetOpportunityQuota: probePlan.targetOpportunityQuota,
        targetSpans,
        familyIds,
        difficultyIndex: 0.5,
        weightedFeatureRms: 0,
        positionProfileTvd: 0,
        geometryTvd: 0,
        launchContextTvd: 0,
      },
    },
  });
  const boundPlan = createPracticeResearchProbePlan({
    target,
    phase,
    familyIds,
    probeId: contentPlan.contentId,
    probeHash: contentPlan.contentHash,
  });
  return freezeDeep({ probePlan: boundPlan, contentPlan });
}

function firstAttempts(eventTrace = []) {
  const byPosition = new Map();
  for (const event of eventTrace) {
    if (!INSERTION_TYPES.has(event?.type) || event?.isFirstAttempt !== true || !Number.isInteger(event.textPosition)) continue;
    if (!byPosition.has(event.textPosition)) byPosition.set(event.textPosition, event);
  }
  return byPosition;
}

function median(values) {
  const clean = values.filter(finite);
  return clean.length ? practiceMedian(clean, { min: -10_000, max: 10_000 }) : null;
}

export function analyzePracticeResearchProbeSession({ eventTrace = [], contentPlan, foundationAnalysis = null } = {}) {
  const metadata = contentPlan?.metadata?.researchProbe;
  if (!metadata?.target || !Array.isArray(metadata.targetSpans)) throw new TypeError("Research probe analysis requires trusted probe metadata");
  const attempts = firstAttempts(eventTrace);
  const opportunityCorrectness = metadata.targetSpans.map((span) => {
    const events = [];
    for (let position = span.startIndex; position < span.endIndex; position += 1) events.push(attempts.get(position) ?? null);
    return events.length > 0 && events.every((event) => event && correct(event));
  });
  const opportunityCount = metadata.targetSpans.length;
  const errorCount = opportunityCorrectness.filter((value) => !value).length;
  const traceMetadata = foundationAnalysis?.latency?.coverage
    ? {
        capacity: foundationAnalysis.latency.coverage.capacity,
        retainedEventCount: foundationAnalysis.latency.coverage.retainedEventCount,
        totalEventCount: foundationAnalysis.latency.coverage.totalEventCount,
        truncated: foundationAnalysis.latency.coverage.scope === "retained-window" || foundationAnalysis.latency.coverage.truncated === true,
      }
    : { retainedEventCount: eventTrace.length, totalEventCount: eventTrace.length, truncated: false };
  const latency = classifyPracticeLatencyEvents({ events: eventTrace, traceMetadata });
  const targetRecords = latency.classifiedTransitions.filter((record) => metadata.targetSpans.some((span) => record.textPosition >= span.startIndex && record.textPosition < span.endIndex));
  const comparable = targetRecords.filter((record) => ["fluent", "disfluent"].includes(record.classification) && finite(record.latencyMs));
  const fluent = comparable.filter((record) => record.classification === "fluent");
  const disfluent = comparable.filter((record) => record.classification === "disfluent");
  const baselineMedianMs = latency.calibration?.baselineMedianMs;
  const fluentLatencyMeanMs = fluent.length ? fluent.reduce((sum, record) => sum + record.latencyMs, 0) / fluent.length : null;
  const fluentResiduals = finite(baselineMedianMs) ? fluent.map((record) => record.latencyMs - baselineMedianMs) : [];
  const fluentResidualMeanMs = fluentResiduals.length ? fluentResiduals.reduce((sum, value) => sum + value, 0) / fluentResiduals.length : null;
  const quality = buildPracticeSessionExecutionQuality({
    entityType: metadata.target.entityType,
    opportunityCount,
    errorCount,
    timingEligibleCount: comparable.length,
    disfluentCount: disfluent.length,
    fluentLatencyMeanMs,
    fluentResidualMeanMs,
    fluentResidualCount: fluentResiduals.length,
  });
  const targetResiduals = finite(baselineMedianMs) ? comparable.map((record) => record.latencyMs - baselineMedianMs) : [];
  const launchPositions = new Set(metadata.targetSpans.map((span) => span.startIndex));
  const launchResiduals = finite(baselineMedianMs) ? comparable.filter((record) => launchPositions.has(record.textPosition)).map((record) => record.latencyMs - baselineMedianMs) : [];
  const internalResiduals = finite(baselineMedianMs) ? comparable.filter((record) => !launchPositions.has(record.textPosition)).map((record) => record.latencyMs - baselineMedianMs) : [];
  const probe = normalizePracticeResearchProbeResult({
    probeId: contentPlan.contentId,
    probeHash: contentPlan.contentHash,
    familyIds: metadata.familyIds,
    quality: quality.quality,
    qualityCoverage: quality.availableQualityWeight,
    firstPassAccuracy: opportunityCount ? (opportunityCount - errorCount) / opportunityCount : null,
    normalizedResidualMedianMs: median(targetResiduals),
    disfluencyRate: comparable.length ? disfluent.length / comparable.length : null,
    launchResidualMedianMs: metadata.target.entityType === "word" ? median(launchResiduals) : null,
    internalResidualMedianMs: metadata.target.entityType === "word" ? median(internalResiduals) : null,
  });
  return freezeDeep({
    beforeMetrics: probe,
    afterMetrics: null,
    transferMetrics: null,
    trainingQuality: null,
    recommendationIds: [],
    researchProbe: probe,
  });
}

export const PRACTICE_RESEARCH_PROBE_EXPERIMENT = Object.freeze({
  id: PRACTICE_RESEARCH_PROBE_CONTRACT.experimentId,
  version: PRACTICE_RESEARCH_PROBE_VERSION,
  sessionSchemaVersion: 1,
  title: "Research Target Probe",
  category: "Research",
  defaultCorrectionBehavior: "allow",
  supportedCompletionModes: Object.freeze(["content"]),
  resumable: false,
  abilityChannel: null,
  performanceMeasurementKind: null,
  performanceReferenceChannel: null,
  retentionMeasurementKind: null,
  evaluationMeasurementKind: null,
  analyzeResult: analyzePracticeResearchProbeSession,
});

export function createPreparedPracticeResearchProbeSession({ assignment, phase, binding, sessionId = createPracticeSessionId() } = {}) {
  if (!assignment?.target) throw new TypeError("Research probe session requires an assignment target");
  if (binding?.phase !== phase) throw new TypeError("Research probe binding phase mismatch");
  const prepared = buildPracticeResearchProbeContentPlan({ target: assignment.target, phase, sessionId });
  trustPracticeResearchContentPlan(prepared.contentPlan, binding);
  return freezeDeep({
    experiment: PRACTICE_RESEARCH_PROBE_EXPERIMENT,
    configuration: {
      phase,
      targetSource: "research-plan",
      target: { entityType: assignment.target.entityType, entityKey: assignment.target.entityKey, statId: assignment.target.statId },
      liveWpm: false,
      aggregateAccuracy: false,
      targetCues: false,
      metronome: false,
    },
    contentPlan: prepared.contentPlan,
    researchProbePlan: prepared.probePlan,
    sessionId,
  });
}
