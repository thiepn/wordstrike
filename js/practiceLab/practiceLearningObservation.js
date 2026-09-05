import { createPracticeEntityResolver } from "./practiceEntityResolver.js";
import { PRACTICE_LEARNING_ANALYSIS_VERSION, PRACTICE_LEARNING_OBSERVATION_VERSION } from "./practiceLearningConstants.js";
import { PRACTICE_LEARNING_POLICY_V1 } from "./practiceLearningPolicy.js";
import { buildPracticeDeltaQuality, buildPracticePhaseQuality } from "./practiceLearningQuality.js";

const finite = Number.isFinite;
const identity = (type, key) => `${type}\u0000${key}`;
const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};

function timingRecord(transition) {
  if (transition?.correctness !== "correct" && transition?.correctness !== true) return null;
  if (!["fluent", "disfluent"].includes(transition?.latencyClass)) return null;
  return {
    latencyClass: transition.latencyClass,
    observedLatencyMs: finite(transition.observedLatencyMs) ? transition.observedLatencyMs : null,
    residualLatencyMs: finite(transition.residualLatencyMs) ? transition.residualLatencyMs : null,
  };
}

function targetOrder(contentPlan, resolver, cap) {
  const seen = new Set();
  const values = [];
  for (const target of contentPlan?.targetEntities ?? []) {
    if (!["key", "bigram", "trigram", "word"].includes(target?.entityType)) continue;
    for (const entity of resolver.resolveAtPosition(0)) void entity; // Keep resolver construction/normalization authoritative.
    const key = identity(target.entityType, String(target.entityKey));
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(key);
  }
  return new Set(values.slice(0, cap));
}

function appendNonWordOpportunity(byEntity, entity, transition) {
  const key = identity(entity.entityType, entity.entityKey);
  if (!byEntity.has(key)) byEntity.set(key, []);
  const timing = timingRecord(transition);
  byEntity.get(key).push({
    order: Number(transition.eventIndex ?? transition.textPosition ?? byEntity.get(key).length),
    textPosition: transition.textPosition,
    correct: transition.correctness === "correct" || transition.correctness === true,
    timing: timing ? [timing] : [],
  });
}

export function extractPracticeLearningPhaseOpportunities({
  profileId,
  contextId,
  contentPlan,
  normalizedTransitions,
  segmenter = null,
  maxDirectTargets = PRACTICE_LEARNING_POLICY_V1.phase.maxDirectTargets,
} = {}) {
  if (!contentPlan || !Array.isArray(normalizedTransitions)) return new Map();
  const resolver = createPracticeEntityResolver({
    contentPlan,
    profileId,
    contextId,
    language: contentPlan?.metadata?.language ?? "en",
    segmenter,
    allowWordEntities: true,
  });
  const orderedTargetKeys = [];
  const seenTargets = new Set();
  for (const target of contentPlan.targetEntities ?? []) {
    if (!["key", "bigram", "trigram", "word"].includes(target?.entityType)) continue;
    const candidates = [];
    for (let position = 0; position < resolver.analysis.graphemeCount; position += 1) {
      const match = resolver.resolveAtPosition(position).find((entity) => entity.entityType === target.entityType && entity.directTarget);
      if (match && match.entityKey === target.entityKey) { candidates.push(match); break; }
    }
    const key = candidates.length ? identity(candidates[0].entityType, candidates[0].entityKey) : identity(target.entityType, String(target.entityKey));
    if (!seenTargets.has(key)) {
      seenTargets.add(key);
      orderedTargetKeys.push(key);
    }
  }
  const eligibleTargets = new Set(orderedTargetKeys.slice(0, maxDirectTargets));
  const byEntity = new Map();
  const wordStates = new Map();
  const transitions = [...normalizedTransitions]
    .filter((transition) => transition?.isFirstAttempt === true && Number.isInteger(transition.textPosition))
    .sort((a, b) => Number(a.eventIndex ?? a.textPosition) - Number(b.eventIndex ?? b.textPosition));

  for (const transition of transitions) {
    const position = transition.textPosition;
    const resolved = resolver.resolveAtPosition(position);
    for (const entity of resolved) {
      if (!entity.directTarget || entity.entityType === "word") continue;
      const key = identity(entity.entityType, entity.entityKey);
      if (eligibleTargets.has(key)) appendNonWordOpportunity(byEntity, entity, transition);
    }
    const wordEntity = resolved.find((entity) => entity.entityType === "word" && entity.directTarget);
    const word = resolver.resolveWordAtPosition(position);
    if (!wordEntity || !word || !eligibleTargets.has(identity("word", wordEntity.entityKey))) continue;
    const wordId = `${word.startIndex}:${word.endIndex}:${wordEntity.entityKey}`;
    let state = wordStates.get(wordId);
    if (!state) {
      state = {
        entity: wordEntity,
        startIndex: word.startIndex,
        endIndex: word.endIndex,
        started: position === word.startIndex,
        positions: new Set(),
        hadError: false,
        timing: [],
        order: Number(transition.eventIndex ?? position),
      };
      wordStates.set(wordId, state);
    }
    state.positions.add(position);
    if (transition.correctness !== "correct" && transition.correctness !== true) state.hadError = true;
    if (position !== word.startIndex) {
      const timing = timingRecord(transition);
      if (timing) state.timing.push(timing);
    }
    if (position === word.endIndex - 1) {
      const complete = state.started && state.positions.size === word.endIndex - word.startIndex;
      if (complete) {
        const key = identity("word", wordEntity.entityKey);
        if (!byEntity.has(key)) byEntity.set(key, []);
        byEntity.get(key).push({
          order: state.order,
          textPosition: word.endIndex - 1,
          correct: !state.hadError,
          timing: [...state.timing],
        });
      }
      wordStates.delete(wordId);
    }
  }
  for (const records of byEntity.values()) records.sort((a, b) => a.order - b.order || a.textPosition - b.textPosition);
  return byEntity;
}

function phaseAnalysis(delta, records, phaseContinuityComplete, policy) {
  const opportunityCount = Number(delta?.opportunities?.count || 0);
  const minimum = policy.phase.minimumSessionOpportunities?.[delta.entityType] ?? Infinity;
  const minimumPhase = policy.phase.minimumPhaseSize?.[delta.entityType] ?? Infinity;
  if (!phaseContinuityComplete) return {
    entryQuality: null,
    exitQuality: null,
    practiceGain: null,
    phaseCoverage: {
      status: "partial",
      entryOpportunityCount: 0,
      exitOpportunityCount: 0,
      entryQualityCoverage: 0,
      exitQualityCoverage: 0,
      reason: "chronology-unavailable",
    },
  };
  if (!Array.isArray(records) || opportunityCount < minimum || records.length < minimum) return {
    entryQuality: null,
    exitQuality: null,
    practiceGain: null,
    phaseCoverage: {
      status: "unavailable",
      entryOpportunityCount: 0,
      exitOpportunityCount: 0,
      entryQualityCoverage: 0,
      exitQualityCoverage: 0,
      reason: "insufficient-opportunities",
    },
  };
  const phaseSize = Math.max(minimumPhase, Math.floor(records.length / 3));
  if (phaseSize * 2 > records.length) return {
    entryQuality: null,
    exitQuality: null,
    practiceGain: null,
    phaseCoverage: {
      status: "unavailable",
      entryOpportunityCount: 0,
      exitOpportunityCount: 0,
      entryQualityCoverage: 0,
      exitQualityCoverage: 0,
      reason: "phase-overlap",
    },
  };
  const entry = buildPracticePhaseQuality(delta.entityType, records.slice(0, phaseSize), policy);
  const exit = buildPracticePhaseQuality(delta.entityType, records.slice(-phaseSize), policy);
  const entryQuality = entry.quality;
  const exitQuality = exit.quality;
  const complete = finite(entryQuality) && finite(exitQuality);
  return {
    entryQuality,
    exitQuality,
    practiceGain: complete ? exitQuality - entryQuality : null,
    phaseCoverage: {
      status: complete ? "complete" : "partial",
      entryOpportunityCount: phaseSize,
      exitOpportunityCount: phaseSize,
      entryQualityCoverage: entry.availableQualityWeight,
      exitQualityCoverage: exit.availableQualityWeight,
      reason: complete ? null : "quality-coverage",
    },
    entryMetrics: entry.metrics,
    exitMetrics: exit.metrics,
  };
}

function baseDelta(delta, kind, experimentId, observation) {
  return freezeDeep({
    observationVersion: PRACTICE_LEARNING_OBSERVATION_VERSION,
    kind,
    sessionId: delta.sessionId,
    profileId: delta.profileId,
    contextId: delta.contextId,
    statId: delta.statId,
    entityType: delta.entityType,
    entityKey: delta.entityKey,
    evidenceRole: delta.evidenceRole,
    experimentId: typeof experimentId === "string" ? experimentId.slice(0, 100) : "unknown",
    observation,
  });
}

export function buildPracticeAcquisitionObservationDelta({
  delta,
  experimentId,
  phaseRecords = null,
  phaseContinuityComplete = true,
  policy = PRACTICE_LEARNING_POLICY_V1,
} = {}) {
  if (delta?.evidenceRole !== "training" || delta?.directTarget !== true || Number(delta?.opportunities?.count || 0) <= 0) return null;
  const scale = policy.doseScales?.[delta.entityType];
  if (!finite(scale) || scale <= 0) return null;
  const whole = buildPracticeDeltaQuality(delta, policy);
  const phases = phaseAnalysis(delta, phaseRecords, phaseContinuityComplete, policy);
  const opportunityCount = Number(delta.opportunities.count);
  const observation = freezeDeep({
    kind: "acquisition",
    sessionId: delta.sessionId,
    experimentId: typeof experimentId === "string" ? experimentId.slice(0, 100) : "unknown",
    completedAtUtc: delta.observedAt,
    localDayKey: delta.localDayKey,
    opportunityCount,
    doseUnits: opportunityCount / scale,
    cumulativeDoseBefore: null,
    cumulativeDoseAfter: null,
    wholeQuality: whole.quality,
    entryQuality: phases.entryQuality,
    exitQuality: phases.exitQuality,
    practiceGain: phases.practiceGain,
    qualityCoverage: whole.availableQualityWeight,
    phaseCoverage: phases.phaseCoverage,
    metrics: {
      whole: whole.metrics,
      entry: phases.entryMetrics ?? null,
      exit: phases.exitMetrics ?? null,
    },
  });
  return baseDelta(delta, "acquisition", experimentId, observation);
}

export function buildPracticeTransferObservationDelta({ delta, experimentId, policy = PRACTICE_LEARNING_POLICY_V1 } = {}) {
  if (delta?.evidenceRole !== "transfer") return null;
  const minimum = policy.transfer.minimumOpportunities?.[delta.entityType] ?? Infinity;
  if (Number(delta?.opportunities?.count || 0) < minimum) return null;
  const whole = buildPracticeDeltaQuality(delta, policy);
  if (!finite(whole.quality) || whole.availableQualityWeight + 1e-12 < policy.quality.minimumAvailableWeight) return null;
  return baseDelta(delta, "transfer", experimentId, freezeDeep({
    kind: "transfer",
    sessionId: delta.sessionId,
    experimentId: typeof experimentId === "string" ? experimentId.slice(0, 100) : "unknown",
    completedAtUtc: delta.observedAt,
    localDayKey: delta.localDayKey,
    opportunityCount: Number(delta.opportunities.count),
    cumulativeDoseAtObservation: null,
    quality: whole.quality,
    qualityCoverage: whole.availableQualityWeight,
    timeSincePreviousAcquisitionMs: null,
    differentLocalDayFromPreviousAcquisition: null,
    metrics: whole.metrics,
  }));
}

export function buildPracticeLearningAnalysis({
  foundationAnalysis,
  contentPlan,
  profileId,
  contextId,
  experimentId,
  evidenceRole,
  trackedLearningStatIds = null,
  phaseContinuityComplete = true,
  segmenter = null,
  policy = PRACTICE_LEARNING_POLICY_V1,
} = {}) {
  const skillDeltas = Array.isArray(foundationAnalysis?.skills?.deltas) ? foundationAnalysis.skills.deltas : [];
  const phaseMap = evidenceRole === "training"
    ? extractPracticeLearningPhaseOpportunities({
        profileId,
        contextId,
        contentPlan,
        normalizedTransitions: foundationAnalysis?.normalization?.normalizedTransitions ?? [],
        segmenter,
        maxDirectTargets: policy.phase.maxDirectTargets,
      })
    : new Map();
  const observationDeltas = [];
  let completePhaseObservationCount = 0;
  let partialPhaseObservationCount = 0;
  let skippedCount = 0;

  if (evidenceRole === "training") {
    for (const delta of skillDeltas) {
      if (delta.evidenceRole !== "training" || delta.directTarget !== true) continue;
      const learning = buildPracticeAcquisitionObservationDelta({
        delta,
        experimentId,
        phaseRecords: phaseMap.get(identity(delta.entityType, delta.entityKey)) ?? null,
        phaseContinuityComplete,
        policy,
      });
      if (!learning) { skippedCount += 1; continue; }
      observationDeltas.push(learning);
      if (learning.observation.phaseCoverage.status === "complete") completePhaseObservationCount += 1;
      else partialPhaseObservationCount += 1;
    }
  } else if (evidenceRole === "transfer") {
    const tracked = trackedLearningStatIds instanceof Set ? trackedLearningStatIds : new Set(trackedLearningStatIds ?? []);
    const eligible = skillDeltas
      .filter((delta) => delta.evidenceRole === "transfer" && tracked.has(delta.statId))
      .sort((a, b) => a.statId.localeCompare(b.statId))
      .slice(0, policy.transfer.maxObservationsPerSession);
    for (const delta of eligible) {
      const learning = buildPracticeTransferObservationDelta({ delta, experimentId, policy });
      if (learning) observationDeltas.push(learning);
      else skippedCount += 1;
    }
    skippedCount += Math.max(0, skillDeltas.filter((delta) => delta.evidenceRole === "transfer" && tracked.has(delta.statId)).length - eligible.length);
  }

  const acquisitionObservationCount = observationDeltas.filter((delta) => delta.kind === "acquisition").length;
  const transferObservationCount = observationDeltas.filter((delta) => delta.kind === "transfer").length;
  return freezeDeep({
    version: PRACTICE_LEARNING_ANALYSIS_VERSION,
    summary: {
      analysisVersion: PRACTICE_LEARNING_ANALYSIS_VERSION,
      observationVersion: PRACTICE_LEARNING_OBSERVATION_VERSION,
      acquisitionObservationCount,
      transferObservationCount,
      completePhaseObservationCount,
      partialPhaseObservationCount,
      skippedCount,
      learningStateUpdateCount: acquisitionObservationCount + transferObservationCount,
    },
    observationDeltas,
  });
}
