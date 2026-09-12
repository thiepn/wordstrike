import { createSkillStatId, hashPracticeContent } from "./practiceIds.js";
import { buildPracticeTargetBaseline } from "./practiceTreatmentBaseline.js";
import {
  createPracticeTreatmentEpisode,
  finalizePracticeTreatmentEpisode,
  invalidatePracticeTreatmentEpisode,
  markPracticeTreatmentExposureStarted,
  setPracticeTreatmentBaseline,
  updatePracticeTreatmentEpisode,
} from "./practiceTreatmentEpisode.js";
import {
  buildPracticeRetentionOutcomeCandidates,
  buildPracticeTargetRetestCandidate,
  buildPracticeTransferOutcomeCandidatesFromLearning,
} from "./practiceTreatmentOutcomeRegistry.js";
import { resolvePracticeTreatmentIdentity } from "./practiceTreatmentRegistry.js";
import { linkPracticeTreatmentOutcomeCandidate, markPracticeTreatmentInterference } from "./practiceTreatmentLinker.js";
import { PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID } from "./practiceWeaknessBossConstants.js";

const unique = (values) => [...new Set((values ?? []).filter(Boolean))];
const finite = Number.isFinite;
const nowIso = (wallClock) => {
  const raw = typeof wallClock === "function" ? wallClock() : wallClock;
  const date = raw instanceof Date ? new Date(raw.getTime()) : new Date(raw ?? Date.now());
  return date.toISOString();
};

function openingRange(contentPlan) {
  return (contentPlan?.metadata?.weaknessBoss?.phaseRanges ?? []).find((range) => range?.id === "opening-probe") ?? null;
}

function probeIdentity(identity, contentPlan) {
  const range = openingRange(contentPlan);
  if (!range) return null;
  const familyIds = unique(range.familyIds).slice(0, 8);
  return Object.freeze({
    protocolFingerprint: identity.protocolFingerprint,
    familyIds,
    probeHash: hashPracticeContent(JSON.stringify({
      protocolFingerprint: identity.protocolFingerprint,
      familyIds,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      targetPositions: (range.targetPositions ?? []).slice(0, 256),
    })),
  });
}

function acquisitionMetrics(commitPayload, episode) {
  const matching = (commitPayload?.learningObservationDeltas ?? []).find((delta) => delta?.kind === "acquisition" && delta?.statId === episode?.treatment?.targetStatId);
  const observation = matching?.observation;
  if (!observation) return null;
  const metrics = observation.metrics?.entry ?? {};
  return {
    quality: finite(observation.entryQuality) ? observation.entryQuality : null,
    qualityCoverage: finite(observation.phaseCoverage?.entryQualityCoverage) ? observation.phaseCoverage.entryQualityCoverage : null,
    opportunityCount: Number.isInteger(observation.phaseCoverage?.entryOpportunityCount) ? observation.phaseCoverage.entryOpportunityCount : 0,
    firstPassAccuracy: metrics.accuracy ?? metrics.firstPassAccuracy ?? null,
    normalizedResidualMedianMs: metrics.normalizedResidualMedianMs ?? null,
    disfluencyRate: metrics.disfluencyRate ?? null,
    launchResidualMedianMs: metrics.launchResidualMedianMs ?? null,
    launchDisfluencyRate: metrics.launchDisfluencyRate ?? null,
    internalResidualMedianMs: metrics.internalResidualMedianMs ?? null,
    internalDisfluencyRate: metrics.internalDisfluencyRate ?? null,
  };
}

function relatedTargetIds(profileId, contextId, contentPlan, directId) {
  return unique((contentPlan?.targetEntities ?? [])
    .filter((target) => target?.entityType && typeof target.entityKey === "string")
    .map((target) => createSkillStatId(profileId, contextId, target.entityType, target.entityKey))
    .filter((id) => id !== directId)).slice(0, 8);
}

export function createPracticeWeaknessBossTreatmentService({ repository, profileId, contextId, sessionId, wallClock = () => new Date(), logger = console } = {}) {
  if (!repository || !profileId || !contextId || !sessionId) throw new TypeError("Weakness Boss treatment adapter requires repository and session identity");
  let identity = null;
  let episode = null;
  let contentPlan = null;
  let baselineObservedAt = null;
  let queue = Promise.resolve();

  const serial = (operation) => {
    const next = queue.then(operation, operation);
    queue = next.catch((cause) => { logger?.warn?.("Weakness Boss treatment sidecar failed", { cause }); return null; });
    return next;
  };

  async function persist(next) {
    if (!next) return null;
    episode = next;
    await repository.saveTreatmentEpisode(next);
    return next;
  }

  async function prepare({ experiment, configuration = {}, preparedContentPlan, coachBinding = null } = {}) {
    if (experiment?.id !== PRACTICE_WEAKNESS_BOSS_EXPERIMENT_ID) return null;
    contentPlan = preparedContentPlan;
    identity = resolvePracticeTreatmentIdentity({ experiment, configuration, contentPlan, coachBinding });
    if (!identity) throw new TypeError("Weakness Boss treatment identity is unavailable");
    const existing = await repository.getTreatmentEpisodeBySession?.(sessionId);
    if (existing) { episode = existing; return existing; }
    const directId = identity.targetEntityType && identity.targetEntityKey
      ? createSkillStatId(profileId, contextId, identity.targetEntityType, identity.targetEntityKey)
      : null;
    const created = createPracticeTreatmentEpisode({
      profileId,
      contextId,
      treatmentSessionId: sessionId,
      identity,
      plannedAt: nowIso(wallClock),
      treatmentContext: {},
      relatedTargetIds: relatedTargetIds(profileId, contextId, contentPlan, directId),
      probeIdentity: probeIdentity(identity, contentPlan),
      coachBinding,
    });
    const saved = await repository.createTreatmentEpisode(created);
    episode = saved?.episode ?? created;
    return episode;
  }

  function observeProgress(snapshot) {
    if (!episode || episode.status !== "prepared" || !identity) return;
    const range = openingRange(contentPlan);
    if (!range || !Number.isInteger(snapshot?.cursorIndex)) return;
    const stamp = nowIso(wallClock);
    void serial(async () => {
      let next = episode;
      let startedExposure = false;
      if (!baselineObservedAt && snapshot.cursorIndex >= range.endIndex) {
        baselineObservedAt = stamp;
        next = updatePracticeTreatmentEpisode(next, { baseline: { ...next.baseline, observedAt: stamp } }, stamp);
      }
      if (!next.treatment?.exposureStartedAt && baselineObservedAt && snapshot.cursorIndex > range.endIndex) {
        next = markPracticeTreatmentExposureStarted(next, stamp);
        startedExposure = true;
      }
      if (next !== episode) await persist(next);
      if (startedExposure) await markPracticeTreatmentInterference({ repository, newEpisode: next, exposedAt: stamp, preserveCompatibleMeasurement: true });
    });
  }

  async function linkCurrentOpeningToPrior(commitPayload) {
    const summary = commitPayload?.sessionSummary;
    const metrics = acquisitionMetrics(commitPayload, episode);
    if (!summary || !metrics) return null;
    const candidate = buildPracticeTargetRetestCandidate({
      profileId,
      contextId,
      sessionId,
      observedAt: episode?.baseline?.observedAt ?? baselineObservedAt,
      localDayKey: summary.localDayKey,
      entityType: episode.treatment.targetEntityType,
      entityKey: episode.treatment.targetEntityKey,
      protocolFingerprint: episode.treatment.protocolFingerprint,
      metrics,
      probeIdentity: episode.baseline?.probeIdentity,
    });
    return candidate ? linkPracticeTreatmentOutcomeCandidate({ repository, profileId, contextId, candidate }) : null;
  }

  async function afterCanonicalCommit({ commitPayload, retentionAnalysis = null } = {}) {
    return serial(async () => {
      if (!identity || !episode || !commitPayload?.sessionSummary) return null;
      await linkCurrentOpeningToPrior(commitPayload);
      const followUps = [
        ...buildPracticeRetentionOutcomeCandidates(retentionAnalysis?.reviewDeltas ?? []),
        ...buildPracticeTransferOutcomeCandidatesFromLearning(commitPayload.learningObservationDeltas ?? [], commitPayload.sessionSummary.evaluationSummary),
      ];
      for (const candidate of followUps) await linkPracticeTreatmentOutcomeCandidate({ repository, profileId, contextId, candidate });

      const summary = commitPayload.sessionSummary;
      const metrics = acquisitionMetrics(commitPayload, episode);
      let next = episode;
      if (metrics) next = setPracticeTreatmentBaseline(next, buildPracticeTargetBaseline({
        metrics,
        observedAt: next.baseline?.observedAt ?? baselineObservedAt,
        probeIdentity: next.baseline?.probeIdentity,
      }));
      next = updatePracticeTreatmentEpisode(next, { treatment: { ...next.treatment, completedLocalDayKey: summary.localDayKey ?? null } }, summary.completedAtUtc);
      const fullProtocol = summary.status === "completed"
        && summary.completionReason === "content-complete"
        && (commitPayload.learningObservationDeltas ?? []).some((delta) => delta?.kind === "acquisition" && delta?.statId === next.treatment.targetStatId && delta?.observation?.doseUnits === 1);
      next = fullProtocol
        ? finalizePracticeTreatmentEpisode(next, { completedAt: summary.completedAtUtc, actualDurationMs: summary.activeDurationMs, treatmentExposureEligible: Boolean(next.treatment?.exposureStartedAt) })
        : invalidatePracticeTreatmentEpisode(next, "incomplete-treatment", summary.completedAtUtc);
      const persisted = await persist(next);
      if (persisted?.treatment?.exposureStartedAt) {
        await markPracticeTreatmentInterference({ repository, newEpisode: persisted, exposedAt: persisted.treatment.exposureStartedAt, preserveCompatibleMeasurement: false });
      }
      await repository.pruneTreatmentTracking?.(profileId);
      return persisted;
    });
  }

  async function abandon(reason = "abandoned-before-treatment") {
    return serial(async () => {
      if (!episode || episode.status !== "prepared") return episode;
      const next = await persist(invalidatePracticeTreatmentEpisode(episode, episode.treatment?.exposureStartedAt ? "incomplete-treatment" : reason, nowIso(wallClock)));
      if (next?.treatment?.exposureStartedAt) await markPracticeTreatmentInterference({ repository, newEpisode: next, exposedAt: next.treatment.exposureStartedAt, preserveCompatibleMeasurement: false });
      return next;
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
