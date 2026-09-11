import { PRACTICE_ABILITY_ESTIMATOR_VERSION, PRACTICE_ABILITY_POLICY_VERSION } from "./practiceAbilityConstants.js";
import { createSkillStatId, hashPracticeContent } from "./practiceIds.js";
import {
  buildPracticeAbilityBaseline,
  buildPracticeConsistencyBaseline,
  buildPracticeFrontierBaseline,
  buildPracticeTargetBaseline,
} from "./practiceTreatmentBaseline.js";
import { classifyPracticeTreatmentContamination } from "./practiceTreatmentContamination.js";
import {
  PRACTICE_TREATMENT_POLICY,
  PRACTICE_TREATMENT_OUTCOME_KEYS,
} from "./practiceTreatmentConstants.js";
import {
  createPracticeTreatmentEpisode,
  finalizePracticeTreatmentEpisode,
  invalidatePracticeTreatmentEpisode,
  markPracticeTreatmentExposureStarted,
  setPracticeTreatmentBaseline,
  updatePracticeTreatmentEpisode,
} from "./practiceTreatmentEpisode.js";
import {
  estimatePracticeAbilityResponse,
  estimatePracticeConsistencyResponse,
  estimatePracticeFrontierResponse,
  estimatePracticeTargetResponse,
} from "./practiceTreatmentEstimator.js";
import {
  attachPracticeTreatmentOutcome,
  contaminatePracticeTreatmentOutcomeSlot,
  selectPracticeTreatmentOutcomeEpisode,
} from "./practiceTreatmentOutcome.js";
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
  buildPracticeTreatmentResponseSample,
  createPracticeTreatmentResponseState,
  createPracticeTreatmentResponseStateId,
  mergePracticeTreatmentResponseSample,
} from "./practiceTreatmentResponseState.js";

const TERMINAL_OUTCOME_STATUSES = new Set(["observed", "contaminated", "expired", "incompatible", "not-applicable"]);
const TARGETED_EXPERIMENTS = new Set(["weak-keys", "combination-repair", "problem-words", "accuracy-control"]);
const finite = Number.isFinite;

function freezeDeep(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freezeDeep);
  return Object.freeze(value);
}
function asDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}
function iso(now) { return asDate(typeof now === "function" ? now() : now).toISOString(); }
function time(value) { const parsed = Date.parse(value ?? ""); return Number.isFinite(parsed) ? parsed : null; }
function unique(values) { return [...new Set((values ?? []).filter(Boolean))]; }

function phaseMetadata(contentPlan, experimentId) {
  const key = {
    "weak-keys": "weakKeys",
    "combination-repair": "combinationRepair",
    "problem-words": "problemWords",
    "accuracy-control": "accuracyRecovery",
  }[experimentId];
  return key ? contentPlan?.metadata?.[key] ?? null : null;
}

function baselineRange(contentPlan, experimentId) {
  const metadata = phaseMetadata(contentPlan, experimentId);
  const ranges = Array.isArray(metadata?.phaseRanges) ? metadata.phaseRanges : [];
  const id = experimentId === "accuracy-control" ? "baseline" : "entry-probe";
  return ranges.find((range) => range?.id === id) ?? null;
}

function makeProbeIdentity(identity, contentPlan) {
  if (!identity || identity.treatmentClass !== "targeted") return null;
  const range = baselineRange(contentPlan, identity.experimentId);
  const familyIds = unique(range?.familyIds ?? phaseMetadata(contentPlan, identity.experimentId)?.probeFamilyIds ?? []).slice(0, 8);
  const probeHash = hashPracticeContent(JSON.stringify({
    protocolFingerprint: identity.protocolFingerprint,
    familyIds,
    startIndex: Number.isInteger(range?.startIndex) ? range.startIndex : null,
    endIndex: Number.isInteger(range?.endIndex) ? range.endIndex : null,
    targetPositions: Array.isArray(range?.targetPositions) ? range.targetPositions.slice(0, 256) : [],
  }));
  return freezeDeep({ protocolFingerprint: identity.protocolFingerprint, familyIds, probeHash });
}

function relatedTargetIds(profileId, contextId, contentPlan, directStatId) {
  return unique((contentPlan?.targetEntities ?? [])
    .filter((target) => target?.entityType && typeof target.entityKey === "string")
    .map((target) => createSkillStatId(profileId, contextId, target.entityType, target.entityKey))
    .filter((statId) => statId !== directStatId)).slice(0, PRACTICE_TREATMENT_POLICY.relatedTargetIdMaximum);
}

function treatmentContextFrom({ baseline, performanceState = null } = {}) {
  const currentStates = performanceState?.currentStates ?? {};
  const readiness = Object.values(currentStates).find((entry) => typeof entry?.readinessBand === "string")?.readinessBand ?? null;
  return freezeDeep({
    baselineAbilityConfidence: baseline?.abilityState?.confidence ?? null,
    baselineAbilityObservationCount: baseline?.abilityState?.observationCount ?? null,
    readinessBand: readiness,
  });
}

function treatmentComplete(identity, summary) {
  if (!summary || summary.status !== "completed") return false;
  if (identity.treatmentClass === "targeted") return summary.completionReason === "content-complete";
  if (["real-text", "consistency-trainer", "endurance", "punctuation-capitals", "numbers-symbols"].includes(identity.experimentId)) return summary.completionReason === "time-complete";
  if (identity.experimentId === "common-words") return summary.completionReason === "word-target-complete";
  if (["pace-ladder", "burst-sprints"].includes(identity.experimentId)) return !["manual-stop", "navigation-away", "refresh-interruption", "error"].includes(summary.completionReason);
  return false;
}

function targetMetricsFromLearningObservation(delta) {
  const observation = delta?.observation;
  if (!observation) return null;
  const metrics = observation.metrics?.entry ?? observation.metrics?.whole ?? observation.metrics ?? {};
  return {
    quality: observation.entryQuality ?? observation.quality ?? null,
    qualityCoverage: observation.phaseCoverage?.entryQualityCoverage ?? observation.qualityCoverage ?? null,
    opportunityCount: observation.phaseCoverage?.entryOpportunityCount ?? observation.opportunityCount ?? 0,
    firstPassAccuracy: metrics.accuracy ?? metrics.firstPassAccuracy ?? null,
    normalizedResidualMedianMs: metrics.normalizedResidualMedianMs ?? null,
    disfluencyRate: metrics.disfluencyRate ?? null,
    launchResidualMedianMs: metrics.launchResidualMedianMs ?? null,
    launchDisfluencyRate: metrics.launchDisfluencyRate ?? null,
    internalResidualMedianMs: metrics.internalResidualMedianMs ?? null,
    internalDisfluencyRate: metrics.internalDisfluencyRate ?? null,
  };
}

function normalizeBeforeMetrics(summary, learningObservationDeltas, episode) {
  if (summary?.beforeMetrics && finite(summary.beforeMetrics.quality)) return summary.beforeMetrics;
  const target = episode?.treatment?.targetStatId;
  const matching = (learningObservationDeltas ?? []).find((delta) => delta?.kind === "acquisition" && delta?.statId === target);
  return targetMetricsFromLearningObservation(matching);
}

function responseFor(episode, candidate) {
  if (["target-baseline-retest", "retention-review", "cold-transfer"].includes(candidate.sourceKind)) {
    return estimatePracticeTargetResponse(episode.baseline?.metrics, candidate.metrics);
  }
  if (candidate.sourceKind === "ability-observation") return estimatePracticeAbilityResponse(episode.baseline?.abilityState, candidate.metrics);
  if (candidate.sourceKind === "consistency-result") return estimatePracticeConsistencyResponse(episode.baseline?.consistencyState, candidate.metrics);
  if (candidate.sourceKind === "control-frontier") return estimatePracticeFrontierResponse(episode.baseline?.frontierState, candidate.metrics);
  return null;
}

function repeatedFamily(episode, candidate) {
  if (candidate.sourceKind !== "target-baseline-retest") return false;
  const previous = new Set(episode.baseline?.probeIdentity?.familyIds ?? []);
  const next = candidate.validity?.probeIdentity?.familyIds ?? [];
  return next.some((id) => previous.has(id));
}

function treatmentEpisodeStartedBefore(episode, observedAt) {
  const start = time(episode?.treatment?.exposureStartedAt);
  const outcome = time(observedAt);
  return start != null && outcome != null && start < outcome;
}

function sessionTargetStatIds(session) {
  const profileId = session?.profileId; const contextId = session?.contextId;
  if (!profileId || !contextId) return [];
  return unique((session.targetEntities ?? [])
    .filter((target) => target?.entityType && typeof target.entityKey === "string")
    .map((target) => createSkillStatId(profileId, contextId, target.entityType, target.entityKey)));
}

export function createPracticeTreatmentService({ repository, profileId, contextId, sessionId, wallClock = () => new Date(), logger = console } = {}) {
  if (!repository || !profileId || !contextId || !sessionId) throw new TypeError("Treatment service requires repository and session identity");
  let identity = null;
  let episode = null;
  let contentPlan = null;
  let baselineCompletedAt = null;
  let queued = Promise.resolve();

  const serial = (operation) => {
    queued = queued.then(operation, operation).catch((cause) => { logger?.warn?.("Treatment tracking sidecar failed", { cause }); return null; });
    return queued;
  };

  async function findConsistencyBaseline(configuration) {
    if (typeof repository.listSessionSummaries !== "function") return null;
    const sessions = await repository.listSessionSummaries(profileId);
    const nowMs = asDate(typeof wallClock === "function" ? wallClock() : wallClock).getTime();
    const durationMs = configuration?.durationMs;
    return sessions
      .filter((summary) => summary.contextId === contextId && summary.experimentId === "consistency-trainer" && summary.status === "completed"
        && summary.trainingQuality?.status === "complete" && summary.trainingQuality?.durationMs === durationMs
        && nowMs - Date.parse(summary.completedAtUtc) <= PRACTICE_TREATMENT_POLICY.consistencyBaselineMaximumAgeMs)
      .sort((a, b) => String(b.completedAtUtc).localeCompare(String(a.completedAtUtc)))[0] ?? null;
  }

  async function buildBaseline(configuration) {
    if (!identity) return null;
    if (identity.treatmentClass === "targeted") return null;
    if (identity.outcomeDomain === "consistency") {
      const prior = await findConsistencyBaseline(configuration);
      return buildPracticeConsistencyBaseline({ result: prior?.trainingQuality ?? null, observedAt: prior?.completedAtUtc ?? null });
    }
    if (identity.outcomeDomain === "control-frontier") {
      const state = await repository.getTreatmentPerformanceState?.(profileId, contextId);
      return buildPracticeFrontierBaseline({ frontier: state?.controlFrontier ?? null, observedAt: state?.controlFrontier?.updatedAt ?? null });
    }
    const ability = await repository.getTreatmentAbilityState?.(profileId, contextId, identity.outcomeDomain);
    return buildPracticeAbilityBaseline({ state: ability, observedAt: ability?.updatedAt ?? null });
  }

  async function prepare({ experiment, configuration = {}, preparedContentPlan, coachBinding = null } = {}) {
    contentPlan = preparedContentPlan;
    identity = resolvePracticeTreatmentIdentity({ experiment, configuration, contentPlan, coachBinding });
    if (!identity) return null;
    const existing = await repository.getTreatmentEpisodeBySession?.(sessionId);
    if (existing) { episode = existing; return existing; }
    const baseline = await buildBaseline(configuration);
    const performanceState = await repository.getTreatmentPerformanceState?.(profileId, contextId).catch?.(() => null) ?? null;
    const directStatId = identity.targetEntityType && identity.targetEntityKey
      ? createSkillStatId(profileId, contextId, identity.targetEntityType, identity.targetEntityKey)
      : null;
    const created = createPracticeTreatmentEpisode({
      profileId,
      contextId,
      treatmentSessionId: sessionId,
      identity,
      plannedAt: iso(wallClock),
      treatmentContext: treatmentContextFrom({ baseline, performanceState }),
      baseline,
      relatedTargetIds: relatedTargetIds(profileId, contextId, contentPlan, directStatId),
      probeIdentity: makeProbeIdentity(identity, contentPlan),
      coachBinding,
    });
    const saved = await repository.createTreatmentEpisode(created);
    episode = saved?.episode ?? created;
    return episode;
  }

  async function persist(next) {
    if (!next) return null;
    episode = next;
    await repository.saveTreatmentEpisode(next);
    return next;
  }

  function observeProgress(snapshot, event) {
    if (!episode || episode.status !== "prepared" || !identity) return;
    const stamp = iso(wallClock);
    void serial(async () => {
      let next = episode;
      if (identity.treatmentClass === "targeted") {
        const range = baselineRange(contentPlan, identity.experimentId);
        if (range && !baselineCompletedAt && Number.isInteger(snapshot?.cursorIndex) && snapshot.cursorIndex >= range.endIndex) {
          baselineCompletedAt = stamp;
          next = updatePracticeTreatmentEpisode(next, {
            baseline: { ...next.baseline, observedAt: stamp },
          }, stamp);
        }
        if (!next.treatment?.exposureStartedAt && range && Number.isInteger(snapshot?.cursorIndex) && snapshot.cursorIndex > range.endIndex) {
          next = markPracticeTreatmentExposureStarted(next, stamp);
        }
      } else if (!next.treatment?.exposureStartedAt && event === "input" && (snapshot?.metrics?.acceptedInsertions ?? 0) > 0) {
        next = markPracticeTreatmentExposureStarted(next, stamp);
      }
      if (next !== episode) await persist(next);
    });
  }

  async function auditContamination(targetEpisode, candidate, allEpisodes) {
    const sessions = await repository.listTreatmentIntervalSessions?.(profileId, contextId, targetEpisode.treatment.completedAt, candidate.observedAt) ?? [];
    const enrichedSessions = sessions
      .filter((summary) => summary.sessionId !== targetEpisode.treatment.treatmentSessionId && summary.sessionId !== candidate.sessionId)
      .map((summary) => ({ ...summary, targetStatIds: sessionTargetStatIds(summary) }));
    const treatments = (allEpisodes ?? []).filter((later) => later.treatmentEpisodeId !== targetEpisode.treatmentEpisodeId
      && later.treatment?.treatmentSessionId !== candidate.sessionId
      && treatmentEpisodeStartedBefore(later, candidate.observedAt)
      && time(later.treatment?.exposureStartedAt) > time(targetEpisode.treatment?.completedAt));
    return classifyPracticeTreatmentContamination({
      episode: targetEpisode,
      interveningTreatmentEpisodes: treatments,
      interveningSessions: enrichedSessions,
      outcomeKey: targetEpisode.outcomes?.find((slot) => slot.sourceKind === candidate.sourceKind)?.outcomeKey ?? null,
      auditedAt: candidate.observedAt,
    });
  }

  async function updateResponseState(attachedEpisode, outcome, candidate) {
    const response = outcome?.response;
    if (!finite(response?.responseValue) || !outcome?.delayBucket) return null;
    const stateId = createPracticeTreatmentResponseStateId({
      profileId,
      contextId,
      treatmentFamilyKey: attachedEpisode.treatment.treatmentFamilyKey,
      targetEntityType: attachedEpisode.treatment.targetEntityType ?? null,
      outcomeKey: outcome.outcomeKey,
      delayBucket: outcome.delayBucket,
    });
    let state = await repository.getTreatmentResponseState(stateId);
    if (!state) state = createPracticeTreatmentResponseState({
      profileId,
      contextId,
      treatmentFamilyKey: attachedEpisode.treatment.treatmentFamilyKey,
      targetEntityType: attachedEpisode.treatment.targetEntityType ?? null,
      outcomeKey: outcome.outcomeKey,
      delayBucket: outcome.delayBucket,
      responseUnit: response.responseUnit,
      now: candidate.observedAt,
    });
    const sample = buildPracticeTreatmentResponseSample({ episode: attachedEpisode, outcome, localDayKey: candidate.localDayKey });
    return sample ? mergePracticeTreatmentResponseSample(state, sample, candidate.observedAt) : state;
  }

  async function linkCandidate(candidate, allEpisodes) {
    if (!candidate) return null;
    const selection = selectPracticeTreatmentOutcomeEpisode(allEpisodes, candidate);
    if (!selection.winner) return null;
    const { episode: targetEpisode, contract, evaluation } = selection.winner;
    const contamination = await auditContamination(targetEpisode, candidate, allEpisodes);
    const response = responseFor(targetEpisode, candidate);
    const lowAbilityBaseline = candidate.sourceKind === "ability-observation" && targetEpisode.baseline?.abilityState?.confidence === "low";
    const repeated = repeatedFamily(targetEpisode, candidate);
    const attached = attachPracticeTreatmentOutcome(targetEpisode, {
      contract,
      candidate,
      evaluation,
      contamination,
      response,
      repeatedFamily: repeated,
      primaryEligible: !lowAbilityBaseline,
    });
    const outcome = attached.outcomes.find((slot) => slot.outcomeKey === contract.outcomeKey);
    const state = await updateResponseState(attached, outcome, candidate);
    await repository.saveTreatmentOutcomeAndResponseState(attached, state);

    for (const superseded of selection.superseded) {
      const contaminated = contaminatePracticeTreatmentOutcomeSlot(superseded.episode, superseded.contract.outcomeKey, "superseded-by-later-treatment", candidate.observedAt);
      await repository.saveTreatmentEpisode(contaminated);
    }
    return attached;
  }

  async function buildCurrentCandidates({ commitPayload, retentionAnalysis }) {
    const summary = commitPayload?.sessionSummary;
    if (!summary) return [];
    const candidates = [];
    const current = episode ?? await repository.getTreatmentEpisodeBySession?.(sessionId);
    if (current?.treatment?.treatmentClass === "targeted" && summary.beforeMetrics) {
      const baselineObservedAt = current.baseline?.observedAt ?? baselineCompletedAt;
      const candidate = buildPracticeTargetRetestCandidate({
        profileId,
        contextId,
        sessionId,
        observedAt: baselineObservedAt,
        localDayKey: summary.localDayKey,
        entityType: current.treatment.targetEntityType,
        entityKey: current.treatment.targetEntityKey,
        protocolFingerprint: current.treatment.protocolFingerprint,
        metrics: summary.beforeMetrics,
        probeIdentity: current.baseline?.probeIdentity,
      });
      if (candidate) candidates.push(candidate);
    }
    const ability = buildPracticeAbilityOutcomeCandidate(commitPayload.abilityObservation, {
      abilityModelVersion: PRACTICE_ABILITY_ESTIMATOR_VERSION,
      abilityPolicyVersion: PRACTICE_ABILITY_POLICY_VERSION,
    });
    if (ability) candidates.push(ability);
    candidates.push(...buildPracticeRetentionOutcomeCandidates(retentionAnalysis?.reviewDeltas ?? []));
    candidates.push(...buildPracticeTransferOutcomeCandidatesFromLearning(commitPayload.learningObservationDeltas ?? [], summary.evaluationSummary));
    if (summary.experimentId === "consistency-trainer") {
      const consistency = buildPracticeConsistencyOutcomeCandidate({ profileId, contextId, sessionId, observedAt: summary.completedAtUtc, localDayKey: summary.localDayKey, result: summary.trainingQuality });
      if (consistency) candidates.push(consistency);
    }
    if (summary.experimentId === "pace-ladder") {
      const state = await repository.getTreatmentPerformanceState?.(profileId, contextId);
      const frontier = buildPracticeFrontierOutcomeCandidate({ profileId, contextId, sessionId, observedAt: summary.completedAtUtc, localDayKey: summary.localDayKey, frontier: state?.controlFrontier ?? null });
      if (frontier) candidates.push(frontier);
    }
    return candidates.sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)) || a.candidateId.localeCompare(b.candidateId));
  }

  async function finalizeCurrentEpisode(commitPayload) {
    if (!identity || !episode) return null;
    const summary = commitPayload?.sessionSummary;
    if (!summary) return episode;
    let next = episode;
    if (identity.treatmentClass === "targeted") {
      const metrics = normalizeBeforeMetrics(summary, commitPayload.learningObservationDeltas, next);
      const observedAt = next.baseline?.observedAt ?? baselineCompletedAt;
      next = setPracticeTreatmentBaseline(next, buildPracticeTargetBaseline({ metrics, observedAt, probeIdentity: next.baseline?.probeIdentity }));
    }
    next = updatePracticeTreatmentEpisode(next, {
      treatment: { ...next.treatment, completedLocalDayKey: summary.localDayKey ?? null },
    }, summary.completedAtUtc);
    if (!treatmentComplete(identity, summary)) next = invalidatePracticeTreatmentEpisode(next, "incomplete-treatment", summary.completedAtUtc);
    else next = finalizePracticeTreatmentEpisode(next, {
      completedAt: summary.completedAtUtc,
      actualDurationMs: summary.activeDurationMs,
      treatmentExposureEligible: true,
    });
    await persist(next);
    return next;
  }

  async function afterCanonicalCommit({ commitPayload, retentionAnalysis = null } = {}) {
    return serial(async () => {
      await queued;
      const allBefore = await repository.listTreatmentEpisodes(profileId, { contextId, limit: 500 });
      const candidates = await buildCurrentCandidates({ commitPayload, retentionAnalysis });
      for (const candidate of candidates) {
        const latest = await repository.listTreatmentEpisodes(profileId, { contextId, limit: 500 });
        await linkCandidate(candidate, latest);
      }
      await finalizeCurrentEpisode(commitPayload);
      await reconcilePracticeTreatmentTracking({ repository, profileId, contextId, now: wallClock });
      await repository.pruneTreatmentTracking?.(profileId);
      return { candidateCount: candidates.length, episodeCountBefore: allBefore.length };
    });
  }

  async function abandon(reason = "incomplete-treatment") {
    return serial(async () => {
      if (!episode || episode.status !== "prepared") return episode;
      const next = invalidatePracticeTreatmentEpisode(episode, episode.treatment?.exposureStartedAt ? "incomplete-treatment" : reason, iso(wallClock));
      return persist(next);
    });
  }

  return Object.freeze({
    prepare,
    observeProgress,
    afterCanonicalCommit,
    abandon,
    flush() { return queued; },
    getEpisode() { return episode; },
    getIdentity() { return identity; },
  });
}

export async function reconcilePracticeTreatmentTracking({ repository, profileId, contextId = null, now = Date.now } = {}) {
  if (!repository || !profileId) return { updated: 0 };
  const nowIso = iso(now); const nowMs = time(nowIso);
  const episodes = await repository.listTreatmentEpisodes(profileId, { contextId, limit: 500 });
  let updated = 0;
  for (const episode of episodes) {
    let next = episode;
    if (episode.status === "prepared") {
      const created = time(episode.createdAt);
      if (created != null && nowMs - created > 24 * 60 * 60 * 1000) next = invalidatePracticeTreatmentEpisode(episode, "prepared-expired", nowIso);
    } else if (episode.status === "tracking") {
      const completed = time(episode.treatment?.completedAt);
      if (completed != null) {
        const contracts = new Map((episode.outcomeContracts ?? []).map((contract) => [contract.outcomeKey, contract]));
        const outcomes = (episode.outcomes ?? []).map((slot) => {
          if (slot.status !== "pending") return slot;
          const contract = contracts.get(slot.outcomeKey);
          if (!contract || nowMs - completed <= contract.maximumDelayMs) return slot;
          return freezeDeep({ ...slot, status: "expired", reason: "tracking-window-expired", evidenceGrade: "insufficient", primaryEligible: false });
        });
        const terminal = outcomes.every((slot) => TERMINAL_OUTCOME_STATUSES.has(slot.status));
        if (outcomes.some((slot, index) => slot !== episode.outcomes[index]) || terminal) {
          next = updatePracticeTreatmentEpisode(episode, { outcomes, status: terminal ? "closed" : episode.status, closedAt: terminal ? nowIso : episode.closedAt }, nowIso);
        }
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
