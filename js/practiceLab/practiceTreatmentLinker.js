import { createSkillStatId } from "./practiceIds.js";
import { classifyPracticeTreatmentContamination } from "./practiceTreatmentContamination.js";
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
  buildPracticeTreatmentResponseSample,
  createPracticeTreatmentResponseState,
  createPracticeTreatmentResponseStateId,
  mergePracticeTreatmentResponseSample,
} from "./practiceTreatmentResponseState.js";

const finite = Number.isFinite;
const time = (value) => { const parsed = Date.parse(value ?? ""); return Number.isFinite(parsed) ? parsed : null; };
const unique = (values) => [...new Set((values ?? []).filter(Boolean))];

function targetStatIds(session) {
  if (!session?.profileId || !session?.contextId) return [];
  return unique((session.targetEntities ?? [])
    .filter((target) => target?.entityType && typeof target.entityKey === "string")
    .map((target) => createSkillStatId(session.profileId, session.contextId, target.entityType, target.entityKey)));
}

function responseFor(episode, candidate) {
  if (["target-baseline-retest", "retention-review", "cold-transfer"].includes(candidate.sourceKind)) return estimatePracticeTargetResponse(episode.baseline?.metrics, candidate.metrics);
  if (candidate.sourceKind === "ability-observation") return estimatePracticeAbilityResponse(episode.baseline?.abilityState, candidate.metrics);
  if (candidate.sourceKind === "consistency-result") return estimatePracticeConsistencyResponse(episode.baseline?.consistencyState, candidate.metrics);
  if (candidate.sourceKind === "control-frontier") return estimatePracticeFrontierResponse(episode.baseline?.frontierState, candidate.metrics);
  return null;
}

function hasRepeatedProbeFamily(episode, candidate) {
  if (candidate.sourceKind !== "target-baseline-retest") return false;
  const previousIdentity = episode.baseline?.probeIdentity ?? null;
  const candidateIdentity = candidate.validity?.probeIdentity ?? null;
  if (previousIdentity?.probeHash && candidateIdentity?.probeHash && previousIdentity.probeHash === candidateIdentity.probeHash) return true;
  const previousFamilies = new Set(previousIdentity?.familyIds ?? []);
  return (candidateIdentity?.familyIds ?? []).some((id) => previousFamilies.has(id));
}

async function contaminationFor(repository, targetEpisode, candidate, allEpisodes) {
  const sessions = await repository.listTreatmentIntervalSessions?.(
    targetEpisode.profileId,
    targetEpisode.contextId,
    targetEpisode.treatment.completedAt,
    candidate.observedAt,
  ) ?? [];
  const interveningSessions = sessions
    .filter((session) => session.sessionId !== targetEpisode.treatment.treatmentSessionId && session.sessionId !== candidate.sessionId)
    .map((session) => ({ ...session, targetStatIds: targetStatIds(session) }));
  const treatmentEnd = time(targetEpisode.treatment?.completedAt);
  const outcomeTime = time(candidate.observedAt);
  const interveningTreatmentEpisodes = (allEpisodes ?? []).filter((later) => {
    if (!later || later.treatmentEpisodeId === targetEpisode.treatmentEpisodeId || later.treatment?.treatmentSessionId === candidate.sessionId) return false;
    const exposure = time(later.treatment?.exposureStartedAt);
    return exposure != null && treatmentEnd != null && outcomeTime != null && exposure > treatmentEnd && exposure < outcomeTime;
  });
  return classifyPracticeTreatmentContamination({
    episode: targetEpisode,
    interveningTreatmentEpisodes,
    interveningSessions,
    outcomeKey: targetEpisode.outcomes?.find((slot) => slot.sourceKind === candidate.sourceKind)?.outcomeKey ?? null,
    auditedAt: candidate.observedAt,
  });
}

async function mergeResponseState(repository, episode, outcome, candidate) {
  if (!finite(outcome?.response?.responseValue) || !outcome?.delayBucket) return null;
  const identity = {
    profileId: episode.profileId,
    contextId: episode.contextId,
    treatmentFamilyKey: episode.treatment.treatmentFamilyKey,
    targetEntityType: episode.treatment.targetEntityType ?? null,
    outcomeKey: outcome.outcomeKey,
    delayBucket: outcome.delayBucket,
  };
  const id = createPracticeTreatmentResponseStateId(identity);
  let state = await repository.getTreatmentResponseState(id);
  if (!state) state = createPracticeTreatmentResponseState({ ...identity, responseUnit: outcome.response.responseUnit, now: candidate.observedAt });
  const sample = buildPracticeTreatmentResponseSample({ episode, outcome, localDayKey: candidate.localDayKey });
  return sample ? mergePracticeTreatmentResponseSample(state, sample, candidate.observedAt) : state;
}

export async function linkPracticeTreatmentOutcomeCandidate({ repository, profileId, contextId, candidate } = {}) {
  if (!repository || !candidate) return null;
  const episodes = await repository.listTreatmentEpisodes(profileId, { contextId, limit: 500 });
  const selection = selectPracticeTreatmentOutcomeEpisode(episodes, candidate);
  if (!selection.winner) return null;
  const { episode, contract, evaluation } = selection.winner;
  const contamination = await contaminationFor(repository, episode, candidate, episodes);
  const response = responseFor(episode, candidate);
  const repeatedFamily = hasRepeatedProbeFamily(episode, candidate);
  const lowAbilityBaseline = candidate.sourceKind === "ability-observation" && episode.baseline?.abilityState?.confidence === "low";
  const attached = attachPracticeTreatmentOutcome(episode, {
    contract,
    candidate,
    evaluation,
    contamination,
    response,
    repeatedFamily,
    primaryEligible: !lowAbilityBaseline,
  });
  const outcome = attached.outcomes.find((slot) => slot.outcomeKey === contract.outcomeKey);
  const state = await mergeResponseState(repository, attached, outcome, candidate);
  await repository.saveTreatmentOutcomeAndResponseState(attached, state);

  for (const loser of selection.superseded) {
    const contaminated = contaminatePracticeTreatmentOutcomeSlot(loser.episode, loser.contract.outcomeKey, "superseded-by-later-treatment", candidate.observedAt);
    await repository.saveTreatmentEpisode(contaminated);
  }
  return { episode: attached, outcome, state };
}

function preservesPriorRetestSlot(prior, newEpisode, slot, exposedAt) {
  if (slot?.outcomeKey !== "same-protocol-retest") return false;
  if (prior.treatment?.treatmentClass !== "targeted" || newEpisode.treatment?.treatmentClass !== "targeted") return false;
  if (!prior.treatment?.targetStatId || prior.treatment.targetStatId !== newEpisode.treatment?.targetStatId) return false;
  if (prior.treatment?.protocolFingerprint !== newEpisode.treatment?.protocolFingerprint) return false;
  const baselineObservedAt = time(newEpisode.baseline?.observedAt);
  const exposure = time(exposedAt);
  return baselineObservedAt != null && exposure != null && baselineObservedAt < exposure;
}

function preservesHybridMeasurementSlot(prior, newEpisode, slot) {
  return slot?.measurementGrade === "hybrid"
    && prior.treatment?.treatmentClass === "hybrid"
    && newEpisode.treatment?.treatmentClass === "hybrid"
    && prior.treatment?.treatmentFamilyKey === newEpisode.treatment?.treatmentFamilyKey
    && prior.treatment?.outcomeDomain === newEpisode.treatment?.outcomeDomain;
}

export async function markPracticeTreatmentInterference({ repository, newEpisode, exposedAt, preserveCompatibleMeasurement = true } = {}) {
  if (!repository || !newEpisode || !exposedAt) return { contaminated: 0 };
  const episodes = await repository.listTreatmentEpisodes(newEpisode.profileId, { contextId: newEpisode.contextId, limit: 500 });
  let contaminated = 0;
  for (const prior of episodes) {
    if (prior.status !== "tracking" || prior.treatmentEpisodeId === newEpisode.treatmentEpisodeId) continue;
    const completed = time(prior.treatment?.completedAt);
    const exposure = time(exposedAt);
    if (completed == null || exposure == null || exposure <= completed) continue;
    const targeted = prior.treatment?.treatmentClass === "targeted";
    const material = targeted
      ? Boolean(newEpisode.treatment?.targetStatId && (newEpisode.treatment.targetStatId === prior.treatment?.targetStatId || (prior.treatmentContext?.relatedTargetIds ?? []).includes(newEpisode.treatment.targetStatId)))
      : newEpisode.treatment?.outcomeDomain === prior.treatment?.outcomeDomain;
    if (!material) continue;
    let next = prior;
    for (const slot of prior.outcomes ?? []) {
      if (slot.status !== "pending") continue;
      if (preservesPriorRetestSlot(prior, newEpisode, slot, exposedAt)) continue;
      if (preserveCompatibleMeasurement && preservesHybridMeasurementSlot(prior, newEpisode, slot)) continue;
      next = contaminatePracticeTreatmentOutcomeSlot(next, slot.outcomeKey, "superseded-by-later-treatment", exposedAt);
    }
    if (next !== prior) { await repository.saveTreatmentEpisode(next); contaminated += 1; }
  }
  return { contaminated };
}
