import { createPracticeTransitionContextResolver } from "./practiceContextFeatures.js";
import { createPracticeEntityResolver } from "./practiceEntityResolver.js";
import { createPracticeOpportunityTracker } from "./practiceOpportunityTracker.js";
import { createUnavailablePracticeReferenceFrequencyProvider } from "./practiceReferenceFrequency.js";
import {
  createEmptyPracticeWelfordAggregate,
  createPracticeWelfordAggregate,
  selectPracticeSessionSamples,
  validatePracticeSkillEvidenceBatch,
} from "./practiceSkillEvidenceDelta.js";
import {
  PRACTICE_SKILL_EVIDENCE_DELTA_VERSION,
  PRACTICE_SKILL_EVIDENCE_POLICY_V1,
  PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
  PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
  PRACTICE_SKILL_EVIDENCE_VERSION,
  validatePracticeSkillEvidencePolicy,
} from "./practiceSkillEvidencePolicy.js";

const freezeDeep = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
};
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
const idKey = (type, key) => `${type}\u0000${key}`;

function fnv32(value) {
  let hash = 0x811c9dc5;
  for (const ch of String(value)) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function emptyErrorStream() {
  return {
    primaryEpisodeCount: 0,
    correctedEpisodeCount: 0,
    uncorrectedEpisodeCount: 0,
    structuralCounts: { substitution: 0, insertion: 0, omission: 0, transposition: 0, compound: 0, unknown: 0 },
    correctionInitiation: createEmptyPracticeWelfordAggregate(),
    errorToRepair: createEmptyPracticeWelfordAggregate(),
    correctCharactersRemovedCount: 0,
  };
}

function emptyEntry(entity) {
  return {
    entityType: entity.entityType,
    entityKey: entity.entityKey,
    statId: entity.statId,
    directTarget: entity.directTarget,
    opportunities: { count: 0, correctCount: 0, errorCount: 0, directTargetedCount: 0, incidentalCount: 0 },
    errors: emptyErrorStream(),
    breadthHashes: [],
    timingSamples: { fluentLatency: [], fluentResidual: [], disfluentResidual: [] },
    launchSamples: { fluentLatency: [], fluentResidual: [], disfluentResidual: [] },
  };
}

function addWelfordSample(aggregate, value) {
  if (!Number.isFinite(value)) return;
  const nextCount = aggregate.count + 1;
  const delta = value - aggregate.meanMs;
  aggregate.meanMs += delta / nextCount;
  aggregate.m2 += delta * (value - aggregate.meanMs);
  aggregate.count = nextCount;
  aggregate.minMs = aggregate.minMs == null ? value : Math.min(aggregate.minMs, value);
  aggregate.maxMs = aggregate.maxMs == null ? value : Math.max(aggregate.maxMs, value);
  aggregate.recentSamples.push(value);
  if (aggregate.recentSamples.length > PRACTICE_SKILL_EVIDENCE_POLICY_V1.maxRecentSamplesPerEntityPerSession) aggregate.recentSamples.shift();
}

function addBreadth(entry, features, policy) {
  if (!features || entry.breadthHashes.length >= policy.maxBreadthPointsPerEntityPerSession) return;
  const raw = [features.structuralClass, features.wordPositionClass, features.geometryClass, features.wordFrequencyBand, features.bigramFrequencyBand].join("|");
  const hash = fnv32(raw);
  if (!entry.breadthHashes.includes(hash)) entry.breadthHashes.push(hash);
}

function timingLane(samples, traceScope, policy) {
  const fluentLatency = createPracticeWelfordAggregate(samples.fluentLatency, { sampleLimit: policy.maxRecentSamplesPerEntityPerSession });
  const fluentResidual = createPracticeWelfordAggregate(samples.fluentResidual, { sampleLimit: policy.maxRecentSamplesPerEntityPerSession });
  const disfluentResidual = createPracticeWelfordAggregate(samples.disfluentResidual, { sampleLimit: policy.maxRecentSamplesPerEntityPerSession });
  const fluentCount = fluentLatency.count;
  const disfluentCount = samples.disfluentCount ?? samples.disfluentResidual.length;
  return freezeDeep({
    eligibleCount: fluentCount + disfluentCount,
    fluentCount,
    disfluentCount,
    fluentLatency,
    fluentResidual,
    disfluentResidual,
    traceScope: fluentCount + disfluentCount ? traceScope : "none",
  });
}

function serializedEntry(entry) {
  return {
    entityType: entry.entityType,
    entityKey: entry.entityKey,
    statId: entry.statId,
    directTarget: entry.directTarget,
    opportunities: clone(entry.opportunities),
    errors: clone(entry.errors),
    breadthHashes: [...entry.breadthHashes],
  };
}

export function createPracticeSkillEvidenceTracker({
  sessionId,
  profileId,
  contextId,
  contentPlan,
  context,
  evidenceRole,
  segmenter = null,
  policy = PRACTICE_SKILL_EVIDENCE_POLICY_V1,
  seed = null,
  initialCursor = 0,
  historicalRestore = false,
} = {}) {
  validatePracticeSkillEvidencePolicy(policy);
  const allowWordEntities = evidenceRole !== "custom" || policy.allowCustomWordEvidence;
  const entityResolver = createPracticeEntityResolver({
    contentPlan,
    profileId,
    contextId,
    language: contentPlan?.metadata?.language ?? context?.dataLocale ?? "en",
    segmenter,
    allowWordEntities,
  });
  for (const [type, count] of Object.entries(entityResolver.directTargetsByType)) {
    if (count > policy.admissionLimits[type]) throw new TypeError(`Practice direct ${type} targets exceed PL11 admission limit`);
  }
  const frequencyProvider = createUnavailablePracticeReferenceFrequencyProvider({ language: entityResolver.analysis.language });
  const contextResolver = createPracticeTransitionContextResolver({ contentAnalysis: entityResolver.analysis, context, frequencyProvider });
  const opportunityTracker = createPracticeOpportunityTracker({
    seed: seed?.opportunityTracker ?? null,
    initialCursor,
    accuracyScope: historicalRestore ? "partial-session" : "complete-session",
  });
  const entries = new Map();
  const incidentalAdmitted = { key: 0, bigram: 0, trigram: 0, word: 0 };
  let omittedObservationCount = Number(seed?.omittedObservationCount || 0);
  let evidenceTruncated = Boolean(seed?.evidenceTruncated || historicalRestore);
  let checkpointEvidenceTruncated = Boolean(seed?.checkpointEvidenceTruncated);
  let currentWordFirstPassState = seed?.currentWordFirstPassState ? clone(seed.currentWordFirstPassState) : null;
  let lastProcessedEpisodeId = Number(seed?.lastProcessedEpisodeId || 0);

  for (const raw of seed?.entries ?? []) {
    const entry = { ...emptyEntry(raw), ...clone(raw), timingSamples: { fluentLatency: [], fluentResidual: [], disfluentResidual: [] }, launchSamples: { fluentLatency: [], fluentResidual: [], disfluentResidual: [] } };
    entries.set(idKey(entry.entityType, entry.entityKey), entry);
    if (!entry.directTarget) incidentalAdmitted[entry.entityType] += 1;
  }
  if (checkpointEvidenceTruncated) opportunityTracker.markPartial();

  const admit = (entity) => {
    const key = idKey(entity.entityType, entity.entityKey);
    if (entries.has(key)) return entries.get(key);
    const limit = policy.admissionLimits[entity.entityType];
    if (!limit) return null;
    if (!entity.directTarget) {
      const reserved = entityResolver.directTargetsByType[entity.entityType] ?? 0;
      const incidentalLimit = Math.max(0, limit - reserved);
      if (incidentalAdmitted[entity.entityType] >= incidentalLimit) {
        omittedObservationCount += 1;
        evidenceTruncated = true;
        return null;
      }
      incidentalAdmitted[entity.entityType] += 1;
    }
    const entry = emptyEntry(entity);
    entries.set(key, entry);
    return entry;
  };

  const addOpportunity = (entity, correct, features) => {
    const entry = admit(entity);
    if (!entry) return;
    entry.opportunities.count += 1;
    if (correct) entry.opportunities.correctCount += 1;
    else entry.opportunities.errorCount += 1;
    if (entry.directTarget) entry.opportunities.directTargetedCount += 1;
    else entry.opportunities.incidentalCount += 1;
    addBreadth(entry, features, policy);
  };

  const updateWordState = (position, correct, features) => {
    if (!allowWordEntities) return;
    const word = entityResolver.resolveWordAtPosition(position);
    if (!word) { currentWordFirstPassState = null; return; }
    if (!currentWordFirstPassState || currentWordFirstPassState.wordOrdinal !== word.wordOrdinal) {
      currentWordFirstPassState = {
        wordOrdinal: word.wordOrdinal,
        lexicalKey: word.lexicalKey,
        startIndex: word.startIndex,
        endIndex: word.endIndex,
        eligible: position === word.startIndex,
        hadError: false,
        breadthHashes: [],
      };
    }
    if (!correct) currentWordFirstPassState.hadError = true;
    if (features && currentWordFirstPassState.breadthHashes.length < policy.maxBreadthPointsPerEntityPerSession) {
      const hash = fnv32([features.structuralClass, features.wordPositionClass, features.geometryClass, features.wordFrequencyBand, features.bigramFrequencyBand].join("|"));
      if (!currentWordFirstPassState.breadthHashes.includes(hash)) currentWordFirstPassState.breadthHashes.push(hash);
    }
    if (position === word.endIndex - 1) {
      if (currentWordFirstPassState.eligible) {
        const wordEntity = entityResolver.resolveAtPosition(position).find((entity) => entity.entityType === "word");
        if (wordEntity) {
          const entry = admit(wordEntity);
          if (entry) {
            entry.opportunities.count += 1;
            if (currentWordFirstPassState.hadError) entry.opportunities.errorCount += 1;
            else entry.opportunities.correctCount += 1;
            if (entry.directTarget) entry.opportunities.directTargetedCount += 1;
            else entry.opportunities.incidentalCount += 1;
            for (const hash of currentWordFirstPassState.breadthHashes) if (entry.breadthHashes.length < policy.maxBreadthPointsPerEntityPerSession && !entry.breadthHashes.includes(hash)) entry.breadthHashes.push(hash);
          }
        }
      }
      currentWordFirstPassState = null;
    }
  };

  const recordInsertion = ({ position, correctness }) => {
    const isFirstAttempt = opportunityTracker.consumePosition(position);
    if (!isFirstAttempt) return false;
    const correct = correctness === "correct" || correctness === true;
    const features = contextResolver.resolve({ textPosition: position });
    for (const entity of entityResolver.resolveAtPosition(position)) if (entity.entityType !== "word") addOpportunity(entity, correct, features);
    updateWordState(position, correct, features);
    return true;
  };

  const recordClosedEpisode = (episode) => {
    if (!episode || !Number.isInteger(episode.episodeId) || episode.episodeId <= lastProcessedEpisodeId) return false;
    lastProcessedEpisodeId = episode.episodeId;
    let position = Number.isInteger(episode.primaryPosition) ? episode.primaryPosition : episode.startPosition;
    if (episode.editClass === "transposition" && ["high", "medium"].includes(episode.confidence) && Number.isInteger(episode.affectedStart) && Number.isInteger(episode.affectedEnd) && episode.affectedEnd > episode.affectedStart) position = episode.affectedStart + 1;
    if (!Number.isInteger(position) || position < 0) return false;
    for (const entity of entityResolver.resolveAtPosition(position)) {
      const entry = admit(entity);
      if (!entry) continue;
      entry.errors.primaryEpisodeCount += 1;
      if (episode.corrected) entry.errors.correctedEpisodeCount += 1;
      else entry.errors.uncorrectedEpisodeCount += 1;
      const editClass = Object.hasOwn(entry.errors.structuralCounts, episode.editClass) ? episode.editClass : "unknown";
      entry.errors.structuralCounts[editClass] += 1;
      entry.errors.correctCharactersRemovedCount += Number(episode.correctCharactersRemoved || 0);
      addWelfordSample(entry.errors.correctionInitiation, episode.correctionInitiationMs);
      addWelfordSample(entry.errors.errorToRepair, episode.errorToRepairMs);
    }
    return true;
  };

  const addTimingObservation = (entry, normalized, wordLane = "timing") => {
    const samples = wordLane === "launch" ? entry.launchSamples : entry.timingSamples;
    if (normalized.latencyClass === "fluent") {
      if (Number.isFinite(normalized.observedLatencyMs)) samples.fluentLatency.push(normalized.observedLatencyMs);
      if (Number.isFinite(normalized.residualLatencyMs)) samples.fluentResidual.push(normalized.residualLatencyMs);
    } else if (normalized.latencyClass === "disfluent") {
      samples.disfluentCount = Number(samples.disfluentCount || 0) + 1;
      if (Number.isFinite(normalized.residualLatencyMs)) samples.disfluentResidual.push(normalized.residualLatencyMs);
    }
  };

  const finalize = ({ foundationAnalysis, status, observedAt, localDayKey }) => {
    const normalizedTransitions = foundationAnalysis?.normalization?.normalizedTransitions ?? [];
    const traceScope = foundationAnalysis?.latency?.coverage?.scope ?? "complete-session";
    for (const normalized of normalizedTransitions) {
      if (normalized?.isFirstAttempt !== true) continue;
      if (!["fluent", "disfluent"].includes(normalized.latencyClass)) continue;
      if (!(normalized.correctness === "correct" || normalized.correctness === true)) continue;
      if (!Number.isInteger(normalized.textPosition)) continue;
      const word = entityResolver.resolveWordAtPosition(normalized.textPosition);
      for (const entity of entityResolver.resolveAtPosition(normalized.textPosition)) {
        const entry = entries.get(idKey(entity.entityType, entity.entityKey));
        if (!entry) continue;
        if (entity.entityType === "word") {
          if (!word) continue;
          addTimingObservation(entry, normalized, normalized.textPosition === word.startIndex ? "launch" : "timing");
        } else addTimingObservation(entry, normalized, "timing");
      }
    }

    const deltas = [];
    const entityCounts = { key: 0, bigram: 0, trigram: 0, word: 0 };
    let opportunityCount = 0;
    let fluentTimingCount = 0;
    let disfluentTimingCount = 0;
    let normalizedResidualCount = 0;
    let primaryErrorEpisodeCount = 0;
    let directTargetEntityCount = 0;

    for (const entry of entries.values()) {
      const timing = timingLane(entry.timingSamples, traceScope, policy);
      const launchTiming = entry.entityType === "word" ? timingLane(entry.launchSamples, traceScope, policy) : null;
      const hasEvidence = entry.opportunities.count + timing.eligibleCount + (launchTiming?.eligibleCount ?? 0) + entry.errors.primaryEpisodeCount > 0;
      if (!hasEvidence) continue;
      const directObserved = entry.directTarget && entry.opportunities.count > 0;
      const delta = freezeDeep({
        deltaVersion: PRACTICE_SKILL_EVIDENCE_DELTA_VERSION,
        evidenceVersion: PRACTICE_SKILL_EVIDENCE_VERSION,
        policyVersion: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
        sessionId,
        profileId,
        contextId,
        entityType: entry.entityType,
        entityKey: entry.entityKey,
        statId: entry.statId,
        evidenceRole,
        observedAt,
        localDayKey,
        directTarget: entry.directTarget,
        opportunities: clone(entry.opportunities),
        observation: {
          breadthEvidencePoints: entry.breadthHashes.length,
          completedSessionCount: status === "completed" ? 1 : 0,
          abandonedSessionCount: status === "abandoned" ? 1 : 0,
          targetedSessionCount: directObserved ? 1 : 0,
        },
        timing,
        launchTiming,
        errors: clone(entry.errors),
        coverage: {
          accuracyScope: opportunityTracker.accuracyScope,
          timingScope: timing.eligibleCount + (launchTiming?.eligibleCount ?? 0) > 0 ? traceScope : "none",
          evidenceTruncated: evidenceTruncated || checkpointEvidenceTruncated,
          omittedObservationCount: 0,
        },
      });
      deltas.push(delta);
      entityCounts[entry.entityType] += 1;
      opportunityCount += entry.opportunities.count;
      fluentTimingCount += timing.fluentCount + (launchTiming?.fluentCount ?? 0);
      disfluentTimingCount += timing.disfluentCount + (launchTiming?.disfluentCount ?? 0);
      normalizedResidualCount += timing.fluentResidual.count + timing.disfluentResidual.count + (launchTiming?.fluentResidual.count ?? 0) + (launchTiming?.disfluentResidual.count ?? 0);
      primaryErrorEpisodeCount += entry.errors.primaryEpisodeCount;
      if (directObserved) directTargetEntityCount += 1;
    }
    deltas.sort((a, b) => a.entityType.localeCompare(b.entityType) || a.entityKey.localeCompare(b.entityKey));
    const validation = validatePracticeSkillEvidenceBatch(deltas, { sessionId, profileId, contextId });
    if (!validation.valid) throw new TypeError(`Practice skill evidence batch failed validation: ${JSON.stringify(validation.errors)}`);
    const timingScope = fluentTimingCount + disfluentTimingCount > 0 ? traceScope : "none";
    const summary = freezeDeep({
      analysisVersion: 1,
      evidenceVersion: PRACTICE_SKILL_EVIDENCE_VERSION,
      policyVersion: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
      evidenceRole,
      entityCounts,
      opportunityCount,
      fluentTimingCount,
      disfluentTimingCount,
      normalizedResidualCount,
      primaryErrorEpisodeCount,
      directTargetEntityCount,
      accuracyScope: opportunityTracker.accuracyScope,
      timingScope,
      entityCoverageTruncated: evidenceTruncated || checkpointEvidenceTruncated,
      omittedObservationCount,
    });
    return freezeDeep({ version: 1, policyVersion: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION, summary, deltas });
  };

  const checkpointSnapshot = () => {
    const ordered = [...entries.values()].sort((a, b) =>
      Number(b.directTarget) - Number(a.directTarget)
      || b.errors.primaryEpisodeCount - a.errors.primaryEpisodeCount
      || b.opportunities.count - a.opportunities.count
      || a.entityType.localeCompare(b.entityType)
      || a.entityKey.localeCompare(b.entityKey));
    const selected = ordered.slice(0, policy.checkpointEntityCap).map(serializedEntry);
    const truncated = ordered.length > selected.length;
    return freezeDeep({
      trackerVersion: PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
      policyVersion: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
      opportunityTracker: opportunityTracker.getSnapshot(),
      currentWordFirstPassState: clone(currentWordFirstPassState),
      entries: selected,
      omittedObservationCount,
      evidenceTruncated,
      checkpointEvidenceTruncated: checkpointEvidenceTruncated || truncated,
      lastProcessedEpisodeId,
    });
  };

  return Object.freeze({
    recordInsertion,
    recordClosedEpisode,
    finalize,
    checkpointSnapshot,
    getSnapshot() {
      return freezeDeep({
        trackerVersion: PRACTICE_SKILL_EVIDENCE_TRACKER_VERSION,
        policyVersion: PRACTICE_SKILL_EVIDENCE_POLICY_VERSION,
        maxFirstAttemptCursor: opportunityTracker.maxFirstAttemptCursor,
        accuracyScope: opportunityTracker.accuracyScope,
        admittedEntityCount: entries.size,
        omittedObservationCount,
        evidenceTruncated: evidenceTruncated || checkpointEvidenceTruncated,
        currentWordFirstPassState: clone(currentWordFirstPassState),
      });
    },
  });
}
