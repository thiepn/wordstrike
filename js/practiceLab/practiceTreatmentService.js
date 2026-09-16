import { PRACTICE_ABILITY_ESTIMATOR_VERSION, PRACTICE_ABILITY_POLICY_VERSION } from "./practiceAbilityConstants.js";
import { createSkillStatId, hashPracticeContent } from "./practiceIds.js";
import {
  buildPracticeAbilityBaseline,
  buildPracticeConsistencyBaseline,
  buildPracticeFrontierBaseline,
  buildPracticeTargetBaseline,
  createPendingPracticeTreatmentBaseline,
} from "./practiceTreatmentBaseline.js";
import { PRACTICE_TREATMENT_POLICY } from "./practiceTreatmentConstants.js";
import {
  createPracticeTreatmentEpisode,
  finalizePracticeTreatmentEpisode,
  invalidatePracticeTreatmentEpisode,
  markPracticeTreatmentExposureStarted,
  setPracticeTreatmentBaseline,
  updatePracticeTreatmentEpisode,
} from "./practiceTreatmentEpisode.js";
import {
  buildPracticeAbilityOutcomeCandidate,
  buildPracticeConsistencyOutcomeCandidate,
  buildPracticeFrontierOutcomeCandidate,
  buildPracticeRetentionOutcomeCandidates,
  buildPracticeTargetRetestCandidate,
  buildPracticeTransferOutcomeCandidatesFromLearning,
} from "./practiceTreatmentOutcomeRegistry.js";
import { resolvePracticeTreatmentIdentity } from "./practiceTreatmentRegistry.js";
import {
  linkPracticeTreatmentOutcomeCandidate,
  markPracticeTreatmentInterference,
} from "./practiceTreatmentLinker.js";
import { buildPracticeMetronomeTreatmentBaseline, createPracticeMetronomeSilentOutcomeCandidate } from "./practiceMetronomeTreatment.js";
import { getPracticeMetronomeProtocol } from "./practiceMetronomePolicy.js";

const TERMINAL = new Set(["observed", "contaminated", "expired", "incompatible", "not-applicable"]);
const finite = Number.isFinite;
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];
const time = (value) => { const parsed = Date.parse(value ?? ""); return Number.isFinite(parsed) ? parsed : null; };
function dateValue(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}
function nowIso(now) { return dateValue(typeof now === "function" ? now() : now).toISOString(); }
function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}

function metadataFor(contentPlan, experimentId) {
  const key = {
    "weak-keys": "weakKeys",
    "combination-repair": "combinationRepair",
    "problem-words": "problemWords",
    "accuracy-control": "accuracyRecovery",
  }[experimentId];
  return key ? contentPlan?.metadata?.[key] ?? null : null;
}

function baselineRange(contentPlan, experimentId) {
  const ranges = metadataFor(contentPlan, experimentId)?.phaseRanges ?? [];
  const phaseId = experimentId === "accuracy-control" ? "baseline" : "entry-probe";
  return Array.isArray(ranges) ? ranges.find((range) => range?.id === phaseId) ?? null : null;
}

function probeIdentity(identity, contentPlan) {
  if (identity?.treatmentClass !== "targeted") return null;
  const range = baselineRange(contentPlan, identity.experimentId);
  const familyIds = unique(range?.familyIds ?? metadataFor(contentPlan, identity.experimentId)?.probeFamilyIds ?? []).slice(0, 8);
  return freezeDeep({
    protocolFingerprint: identity.protocolFingerprint,
    familyIds,
    probeHash: hashPracticeContent(JSON.stringify({
      protocolFingerprint: identity.protocolFingerprint,
      familyIds,
      startIndex: Number.isInteger(range?.startIndex) ? range.startIndex : null,
      endIndex: Number.isInteger(range?.endIndex) ? range.endIndex : null,
      targetPositions: Array.isArray(range?.targetPositions) ? range.targetPositions.slice(0, 256) : [],
    })),
  });
}

function directStatId(profileId, contextId, identity) {
  return identity?.targetEntityType && typeof identity.targetEntityKey === "string"
    ? createSkillStatId(profileId, contextId, identity.targetEntityType, identity.targetEntityKey)
    : null;
}

function relatedTargetIds(profileId, contextId, contentPlan, directId) {
  return unique((contentPlan?.targetEntities ?? [])
    .filter((target) => target?.entityType && typeof target.entityKey === "string")
    .map((target) => createSkillStatId(profileId, contextId, target.entityType, target.entityKey))
    .filter((id) => id !== directId)).slice(0, PRACTICE_TREATMENT_POLICY.relatedTargetIdMaximum);
}

function treatmentComplete(identity, summary) {
  if (!summary || summary.status !== "completed") return false;
  if (identity.treatmentClass === "targeted") return summary.completionReason === "content-complete";
  if (["real-text", "consistency-trainer", "metronome-typing", "read-ahead", "endurance", "punctuation-capitals", "numbers-symbols"].includes(identity.experimentId)) return summary.completionReason === "time-complete";
  if (identity.experimentId === "common-words") return summary.completionReason === "word-target-complete";
  if (["pace-ladder", "burst-sprints"].includes(identity.experimentId)) return !["manual-stop", "navigation-away", "refresh-interruption", "error"].includes(summary.completionReason);
  return false;
}

function acquisitionTargetMetrics(summary, learningDeltas, episode) {
  if (summary?.beforeMetrics && finite(summary.beforeMetrics.quality)) return summary.beforeMetrics;
  const matching = (learningDeltas ?? []).find((delta) => delta?.kind === "acquisition" && delta?.statId === episode?.treatment?.targetStatId);
  const observation = matching?.observation;
  if (!observation) return summary?.beforeMetrics ?? null;
  const metrics = observation.metrics?.entry ?? {};
  return {
    quality: observation.entryQuality ?? null,
    qualityCoverage: observation.phaseCoverage?.entryQualityCoverage ?? null,
    opportunityCount: observation.phaseCoverage?.entryOpportunityCount ?? 0,
    firstPassAccuracy: metrics.accuracy ?? metrics.firstPassAccuracy ?? null,
    normalizedResidualMedianMs: metrics.normalizedResidualMedianMs ?? null,
    disfluencyRate: metrics.disfluencyRate ?? null,
    launchResidualMedianMs: metrics.launchResidualMedianMs ?? null,
    launchDisfluencyRate: metrics.launchDisfluencyRate ?? null,
    internalResidualMedianMs: metrics.internalResidualMedianMs ?? null,
    internalDisfluencyRate: metrics.internalDisfluencyRate ?? null,
  };
}

async function priorConsistencyBaseline(repository, profileId, contextId, configuration, now) {
  if (typeof repository.listSessionSummaries !== "function") return null;
  const sessions = await repository.listSessionSummaries(profileId);
  const current = dateValue(typeof now === "function" ? now() : now).getTime();
  return sessions
    .filter((summary) => summary.contextId === contextId
      && summary.experimentId === "consistency-trainer"
      && summary.status === "completed"
      && summary.trainingQuality?.status === "complete"
      && summary.trainingQuality?.durationMs === configuration?.durationMs
      && current - Date.parse(summary.completedAtUtc) <= PRACTICE_TREATMENT_POLICY.consistencyBaselineMaximumAgeMs)
    .sort((a, b) => String(b.completedAtUtc).localeCompare(String(a.completedAtUtc)))[0] ?? null;
}

async function preTreatmentBaseline(repository, profileId, contextId, identity, configuration, now) {
  if (identity.treatmentClass === "targeted") return null;
  if (identity.outcomeDomain === "metronome-cadence") return createPendingPracticeTreatmentBaseline({ kind: "metronome-silent" });
  if (identity.outcomeDomain === "consistency") {
    const prior = await priorConsistencyBaseline(repository, profileId, contextId, configuration, now);
    return buildPracticeConsistencyBaseline({ result: prior?.trainingQuality ?? null, observedAt: prior?.completedAtUtc ?? null });
  }
  if (identity.outcomeDomain === "control-frontier") {
    const state = await repository.getTreatmentPerformanceState?.(profileId, contextId);
    return buildPracticeFrontierBaseline({ frontier: state?.controlFrontier ?? null, observedAt: state?.controlFrontier?.updatedAt ?? null });
  }
  const ability = await repository.getTreatmentAbilityState?.(profileId, contextId, identity.outcomeDomain);
  return buildPracticeAbilityBaseline({ state: ability, observedAt: ability?.updatedAt ?? null });
}

function contextSnapshot(baseline, performanceState) {
  const readinessBand = Object.values(performanceState?.currentStates ?? {}).find((entry) => typeof entry?.readinessBand === "string")?.readinessBand ?? null;
  return freezeDeep({
    baselineAbilityConfidence: baseline?.abilityState?.confidence ?? null,
    baselineAbilityObservationCount: baseline?.abilityState?.observationCount ?? null,
    readinessBand,
  });
}

function metronomeBaselineObservedAt(summary, configuration) {
  const completed = time(summary?.completedAtUtc);
  const activeDurationMs = Number(summary?.activeDurationMs);
  if (completed == null || !finite(activeDurationMs)) return summary?.completedAtUtc ?? null;
  try {
    const baselineMs = getPracticeMetronomeProtocol(configuration?.durationMs).baselineMs;
    return new Date(completed - Math.max(0, activeDurationMs - baselineMs)).toISOString();
  } catch {
    return summary?.completedAtUtc ?? null;
  }
}

export function createPracticeTreatmentService({ repository, profileId, contextId, sessionId, wallClock = () => new Date(), logger = console } = {}) {
  if (!repository || !profileId || !contextId || !sessionId) throw new TypeError("Treatment service requires repository and session identity");
  let identity = null;
  let episode = null;
  let contentPlan = null;
  let preparedConfiguration = {};
  let baselineCompletedAt = null;
  let queue = Promise.resolve();

  const serial = (operation) => {
    const next = queue.then(operation, operation);
    queue = next.catch((cause) => { logger?.warn?.("Treatment tracking sidecar failed", { cause }); return null; });
    return next;
  };

  async function persist(next) {
    if (!next) return null;
    episode = next;
    await repository.saveTreatmentEpisode(next);
    return next;
  }

  async function prepare({ experiment, configuration = {}, preparedContentPlan, coachBinding = null } = {}) {
    contentPlan = preparedContentPlan;
    preparedConfiguration = configuration;
    identity = resolvePracticeTreatmentIdentity({ experiment, configuration, contentPlan, coachBinding });
    if (!identity) return null;
    const existing = await repository.getTreatmentEpisodeBySession?.(sessionId);
    if (existing) { episode = existing; return existing; }
    const baseline = await preTreatmentBaseline(repository, profileId, contextId, identity, configuration, wallClock);
    const performanceState = await repository.getTreatmentPerformanceState?.(profileId, contextId);
    const directId = directStatId(profileId, contextId, identity);
    const created = createPracticeTreatmentEpisode({
      profileId,
      contextId,
      treatmentSessionId: sessionId,
      identity,
      plannedAt: nowIso(wallClock),
      treatmentContext: contextSnapshot(baseline, performanceState),
      baseline,
      relatedTargetIds: relatedTargetIds(profileId, contextId, contentPlan, directId),
      probeIdentity: probeIdentity(identity, contentPlan),
      coachBinding,
    });
    const saved = await repository.createTreatmentEpisode(created);
    episode = saved?.episode ?? created;
    return episode;
  }

  function observeProgress(snapshot, event) {
    if (!episode || episode.status !== "prepared" || !identity) return;
    const stamp = nowIso(wallClock);
    void serial(async () => {
      let next = episode;
      let startedExposure = false;
      if (identity.treatmentClass === "targeted") {
        const range = baselineRange(contentPlan, identity.experimentId);
        if (range && !baselineCompletedAt && Number.isInteger(snapshot?.cursorIndex) && snapshot.cursorIndex >= range.endIndex) {
          baselineCompletedAt = stamp;
          next = updatePracticeTreatmentEpisode(next, { baseline: { ...next.baseline, observedAt: stamp } }, stamp);
        }
        if (range && !next.treatment?.exposureStartedAt && Number.isInteger(snapshot?.cursorIndex) && snapshot.cursorIndex > range.endIndex) {
          next = markPracticeTreatmentExposureStarted(next, stamp);
          startedExposure = true;
        }
      } else if (identity.experimentId === "metronome-typing" && !next.treatment?.exposureStartedAt && event === "input" && (snapshot?.metrics?.acceptedInsertions ?? 0) > 0) {
        let baselineMs = Infinity;
        try { baselineMs = getPracticeMetronomeProtocol(preparedConfiguration?.durationMs).baselineMs; } catch { baselineMs = Infinity; }
        const activeSessionMs = Number(snapshot?.activeSessionMs ?? snapshot?.metrics?.activeDurationMs ?? 0);
        if (activeSessionMs >= baselineMs) {
          next = markPracticeTreatmentExposureStarted(next, stamp);
          startedExposure = true;
        }
      } else if (!next.treatment?.exposureStartedAt && event === "input" && (snapshot?.metrics?.acceptedInsertions ?? 0) > 0) {
        next = markPracticeTreatmentExposureStarted(next, stamp);
        startedExposure = true;
      }
      if (next !== episode) await persist(next);
      if (startedExposure && identity.experimentId !== "metronome-typing") await markPracticeTreatmentInterference({ repository, newEpisode: next, exposedAt: stamp });
    });
  }

  async function candidateSet(commitPayload, retentionAnalysis) {
    const summary = commitPayload?.sessionSummary;
    if (!summary) return [];
    const output = [];
    if (episode?.treatment?.treatmentClass === "targeted") {
      const observedAt = episode.baseline?.observedAt ?? baselineCompletedAt;
      const candidate = buildPracticeTargetRetestCandidate({
        profileId,
        contextId,
        sessionId,
        observedAt,
        localDayKey: summary.localDayKey,
        entityType: episode.treatment.targetEntityType,
        entityKey: episode.treatment.targetEntityKey,
        protocolFingerprint: episode.treatment.protocolFingerprint,
        metrics: acquisitionTargetMetrics(summary, commitPayload.learningObservationDeltas, episode),
        probeIdentity: episode.baseline?.probeIdentity,
      });
      if (candidate) output.push(candidate);
    }
    if (summary.experimentId === "metronome-typing") {
      const candidate = createPracticeMetronomeSilentOutcomeCandidate({
        profileId,
        contextId,
        sessionId,
        observedAt: metronomeBaselineObservedAt(summary, preparedConfiguration),
        localDayKey: summary.localDayKey,
        analysis: summary.trainingQuality,
        role: "baseline",
      });
      if (candidate) output.push(candidate);
    }
    const ability = buildPracticeAbilityOutcomeCandidate(commitPayload.abilityObservation, {
      abilityModelVersion: PRACTICE_ABILITY_ESTIMATOR_VERSION,
      abilityPolicyVersion: PRACTICE_ABILITY_POLICY_VERSION,
    });
    if (ability) output.push(ability);
    output.push(...buildPracticeRetentionOutcomeCandidates(retentionAnalysis?.reviewDeltas ?? []));
    output.push(...buildPracticeTransferOutcomeCandidatesFromLearning(commitPayload.learningObservationDeltas ?? [], summary.evaluationSummary));
    if (summary.experimentId === "consistency-trainer") {
      const candidate = buildPracticeConsistencyOutcomeCandidate({ profileId, contextId, sessionId, observedAt: summary.completedAtUtc, localDayKey: summary.localDayKey, result: summary.trainingQuality });
      if (candidate) output.push(candidate);
    }
    if (summary.experimentId === "pace-ladder") {
      const state = await repository.getTreatmentPerformanceState?.(profileId, contextId);
      const candidate = buildPracticeFrontierOutcomeCandidate({ profileId, contextId, sessionId, observedAt: summary.completedAtUtc, localDayKey: summary.localDayKey, frontier: state?.controlFrontier ?? null });
      if (candidate) output.push(candidate);
    }
    return output.sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)) || a.candidateId.localeCompare(b.candidateId));
  }

  async function finalize(commitPayload) {
    if (!identity || !episode || !commitPayload?.sessionSummary) return episode;
    const summary = commitPayload.sessionSummary;
    let next = episode;
    if (identity.treatmentClass === "targeted") {
      const metrics = acquisitionTargetMetrics(summary, commitPayload.learningObservationDeltas, next);
      next = setPracticeTreatmentBaseline(next, buildPracticeTargetBaseline({
        metrics,
        observedAt: next.baseline?.observedAt ?? baselineCompletedAt,
        probeIdentity: next.baseline?.probeIdentity,
      }));
    } else if (identity.experimentId === "metronome-typing") {
      next = setPracticeTreatmentBaseline(next, buildPracticeMetronomeTreatmentBaseline({
        analysis: summary.trainingQuality,
        observedAt: metronomeBaselineObservedAt(summary, preparedConfiguration),
      }));
    }
    next = updatePracticeTreatmentEpisode(next, { treatment: { ...next.treatment, completedLocalDayKey: summary.localDayKey ?? null } }, summary.completedAtUtc);
    next = treatmentComplete(identity, summary)
      ? finalizePracticeTreatmentEpisode(next, { completedAt: summary.completedAtUtc, actualDurationMs: summary.activeDurationMs, treatmentExposureEligible: Boolean(next.treatment?.exposureStartedAt) })
      : invalidatePracticeTreatmentEpisode(next, "incomplete-treatment", summary.completedAtUtc);
    const persisted = await persist(next);
    if (persisted?.treatment?.exposureStartedAt) {
      await markPracticeTreatmentInterference({
        repository,
        newEpisode: persisted,
        exposedAt: persisted.treatment.exposureStartedAt,
        preserveCompatibleMeasurement: false,
      });
    }
    return persisted;
  }

  async function afterCanonicalCommit({ commitPayload, retentionAnalysis = null } = {}) {
    return serial(async () => {
      const candidates = await candidateSet(commitPayload, retentionAnalysis);
      for (const candidate of candidates) await linkPracticeTreatmentOutcomeCandidate({ repository, profileId, contextId, candidate });
      await finalize(commitPayload);
      await reconcilePracticeTreatmentTracking({ repository, profileId, contextId, now: wallClock });
      await repository.pruneTreatmentTracking?.(profileId);
      return { candidateCount: candidates.length };
    });
  }

  async function abandon(reason = "abandoned-before-treatment") {
    return serial(async () => {
      if (!episode || episode.status !== "prepared") return episode;
      const invalid = await persist(invalidatePracticeTreatmentEpisode(episode, episode.treatment?.exposureStartedAt ? "incomplete-treatment" : reason, nowIso(wallClock)));
      if (invalid?.treatment?.exposureStartedAt) {
        await markPracticeTreatmentInterference({
          repository,
          newEpisode: invalid,
          exposedAt: invalid.treatment.exposureStartedAt,
          preserveCompatibleMeasurement: false,
        });
      }
      return invalid;
    });
  }

  return Object.freeze({
    prepare,
    observeProgress,
    afterCanonicalCommit,
    abandon,
    flush() { return queue; },
    getEpisode() { return episode; },
    getIdentity() { return identity; },
  });
}

export async function reconcilePracticeTreatmentTracking({ repository, profileId, contextId = null, now = Date.now } = {}) {
  if (!repository || !profileId) return { updated: 0 };
  const stamp = nowIso(now);
  const current = time(stamp);
  const episodes = await repository.listTreatmentEpisodes(profileId, { contextId, limit: 500 });
  let updated = 0;
  for (const episode of episodes) {
    let next = episode;
    if (episode.status === "prepared") {
      const created = time(episode.createdAt);
      if (created != null && current - created > PRACTICE_TREATMENT_POLICY.preparedTtlMs) next = invalidatePracticeTreatmentEpisode(episode, "prepared-expired", stamp);
    } else if (episode.status === "tracking") {
      const completed = time(episode.treatment?.completedAt);
      if (completed != null) {
        const contracts = new Map((episode.outcomeContracts ?? []).map((contract) => [contract.outcomeKey, contract]));
        const outcomes = (episode.outcomes ?? []).map((slot) => {
          if (slot.status !== "pending") return slot;
          const contract = contracts.get(slot.outcomeKey);
          if (!contract || current - completed <= contract.maximumDelayMs) return slot;
          return freezeDeep({ ...slot, status: "expired", reason: "tracking-window-expired", evidenceGrade: "insufficient", primaryEligible: false, aggregateEligible: false });
        });
        const terminal = outcomes.every((slot) => TERMINAL.has(slot.status));
        const changed = outcomes.some((slot, index) => slot !== episode.outcomes[index]);
        if (changed || terminal) next = updatePracticeTreatmentEpisode(episode, { outcomes, status: terminal ? "closed" : episode.status, closedAt: terminal ? stamp : episode.closedAt }, stamp);
      }
    }
    if (next !== episode) { await repository.saveTreatmentEpisode(next); updated += 1; }
  }
  return { updated };
}

export async function getPracticeTreatmentResponseProfile(repository, query = {}) {
  const states = await repository.listTreatmentResponseStates(query.profileId, { contextId: query.contextId ?? null, treatmentFamilyKey: query.treatmentFamilyKey ?? null });
  return states.find((state) => (!query.targetEntityType || state.targetEntityType === query.targetEntityType)
    && (!query.outcomeKey || state.outcomeKey === query.outcomeKey)
    && (!query.delayBucket || state.delayBucket === query.delayBucket)) ?? null;
}

export async function listPracticeTreatmentResponseProfiles(repository, query = {}) {
  const states = await repository.listTreatmentResponseStates(query.profileId, { contextId: query.contextId ?? null, treatmentFamilyKey: query.treatmentFamilyKey ?? null });
  return states.filter((state) => (!query.targetEntityType || state.targetEntityType === query.targetEntityType)
    && (!query.outcomeKey || state.outcomeKey === query.outcomeKey)
    && (!query.delayBucket || state.delayBucket === query.delayBucket));
}

export async function listPracticeTreatmentEpisodes(repository, query = {}) {
  return repository.listTreatmentEpisodes(query.profileId, { contextId: query.contextId ?? null, status: query.status ?? null, limit: query.limit ?? 100, offset: query.offset ?? 0 });
}
