import assert from "node:assert/strict";
import test from "node:test";

import { getPracticeExperiment } from "../js/practiceLab/practiceExperimentCatalog.js";
import { buildPracticeMetronomeTreatmentBaseline } from "../js/practiceLab/practiceMetronomeTreatment.js";
import {
  createPracticeTreatmentEpisode,
  finalizePracticeTreatmentEpisode,
  markPracticeTreatmentExposureStarted,
  updatePracticeTreatmentEpisode,
} from "../js/practiceLab/practiceTreatmentEpisode.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";
import { createPracticeTreatmentService } from "../js/practiceLab/practiceTreatmentService.js";

const PROFILE = "practice-profile-pl35-service";
const CONTEXT = "practice-context-pl35-service";
const CONFIGURATION = Object.freeze({ durationMs: 300_000, cueMode: "audio", policyVersion: 1 });

function analysis({ paceVariationPercent = 4, effectiveWpm = 60 } = {}) {
  return Object.freeze({
    analysisVersion: 1,
    resultVersion: 1,
    durationMs: 300_000,
    baseline: Object.freeze({
      blockId: "baseline",
      kind: "baseline",
      condition: "silent",
      observedDurationMs: 30_000,
      effectiveWpm,
      paceVariationPercent,
      firstPassAccuracy: 0.98,
      disfluencyRate: 0.04,
      correctionCostRate: 0.02,
      valid: true,
    }),
  });
}

function trackingPriorEpisode(identity) {
  let episode = createPracticeTreatmentEpisode({
    profileId: PROFILE,
    contextId: CONTEXT,
    treatmentSessionId: "practice-session_pl35-prior-service",
    identity,
    plannedAt: "2026-09-01T09:54:00.000Z",
    baseline: buildPracticeMetronomeTreatmentBaseline({
      analysis: analysis({ paceVariationPercent: 5, effectiveWpm: 58 }),
      observedAt: "2026-09-01T09:55:30.000Z",
    }),
  });
  episode = markPracticeTreatmentExposureStarted(episode, "2026-09-01T09:56:00.000Z");
  episode = updatePracticeTreatmentEpisode(episode, {
    treatment: { ...episode.treatment, completedLocalDayKey: "2026-09-01" },
  }, "2026-09-01T10:00:00.000Z");
  return finalizePracticeTreatmentEpisode(episode, {
    completedAt: "2026-09-01T10:00:00.000Z",
    actualDurationMs: 300_000,
    treatmentExposureEligible: true,
  });
}

function createRepository(prior) {
  const episodes = new Map([[prior.treatmentEpisodeId, prior]]);
  const responseStates = new Map();
  return {
    episodes,
    responseStates,
    async getTreatmentEpisodeBySession(sessionId) {
      return [...episodes.values()].find((episode) => episode.treatment?.treatmentSessionId === sessionId) ?? null;
    },
    async getTreatmentPerformanceState() { return null; },
    async createTreatmentEpisode(episode) {
      episodes.set(episode.treatmentEpisodeId, episode);
      return { episode, created: true };
    },
    async saveTreatmentEpisode(episode) {
      episodes.set(episode.treatmentEpisodeId, episode);
      return episode;
    },
    async listTreatmentEpisodes(profileId, { contextId = null } = {}) {
      return [...episodes.values()].filter((episode) => episode.profileId === profileId && (!contextId || episode.contextId === contextId));
    },
    async listTreatmentIntervalSessions() { return []; },
    async getTreatmentResponseState(id) { return responseStates.get(id) ?? null; },
    async saveTreatmentOutcomeAndResponseState(episode, state) {
      episodes.set(episode.treatmentEpisodeId, episode);
      if (state) responseStates.set(state.treatmentResponseStateId, state);
      return { episode, state };
    },
    async pruneTreatmentTracking() { return { pruned: 0 }; },
  };
}

test("PL35 treatment sidecar links the next eligible silent baseline before new exposure contaminates the prior episode", async () => {
  const experiment = getPracticeExperiment("metronome-typing");
  const identity = resolvePracticeTreatmentIdentity({ experiment, configuration: CONFIGURATION });
  const prior = trackingPriorEpisode(identity);
  const repository = createRepository(prior);
  let wallClock = new Date("2026-09-02T10:05:00.000Z");
  const service = createPracticeTreatmentService({
    repository,
    profileId: PROFILE,
    contextId: CONTEXT,
    sessionId: "practice-session_pl35-current-service",
    wallClock: () => wallClock,
    logger: { warn() {} },
  });

  const prepared = await service.prepare({
    experiment,
    configuration: CONFIGURATION,
    preparedContentPlan: { targetEntities: [] },
  });
  assert.equal(prepared.status, "prepared");
  assert.equal(prepared.baseline.status, "pending");
  assert.equal(prepared.treatment.exposureStartedAt, null);

  wallClock = new Date("2026-09-02T10:05:20.000Z");
  service.observeProgress({ activeSessionMs: 20_000, metrics: { acceptedInsertions: 40 } }, "input");
  await service.flush();
  assert.equal(service.getEpisode().treatment.exposureStartedAt, null, "silent calibration must not count as treatment exposure");

  wallClock = new Date("2026-09-02T10:06:00.000Z");
  service.observeProgress({ activeSessionMs: 30_000, metrics: { acceptedInsertions: 60 } }, "input");
  await service.flush();
  assert.equal(service.getEpisode().treatment.exposureStartedAt, "2026-09-02T10:06:00.000Z");

  const result = await service.afterCanonicalCommit({
    commitPayload: {
      sessionSummary: {
        profileId: PROFILE,
        contextId: CONTEXT,
        sessionId: "practice-session_pl35-current-service",
        experimentId: "metronome-typing",
        status: "completed",
        completionReason: "time-complete",
        localDayKey: "2026-09-02",
        completedAtUtc: "2026-09-02T10:10:00.000Z",
        activeDurationMs: 300_000,
        trainingQuality: analysis({ paceVariationPercent: 3, effectiveWpm: 61 }),
      },
      learningObservationDeltas: [],
      abilityObservation: null,
    },
  });

  assert.equal(result.candidateCount, 1);
  const linkedPrior = repository.episodes.get(prior.treatmentEpisodeId);
  const delayed = linkedPrior.outcomes[0];
  assert.equal(linkedPrior.status, "closed");
  assert.equal(delayed.status, "observed");
  assert.equal(delayed.outcomeKey, "metronome-silent");
  assert.equal(delayed.observedAt, "2026-09-02T10:05:30.000Z");
  assert.ok(delayed.delayMs >= 24 * 60 * 60 * 1000);
  assert.equal(delayed.response.responseUnit, "percentage-points");
  assert.equal(delayed.response.responseValue, 2);

  const current = [...repository.episodes.values()].find((episode) => episode.treatment?.treatmentSessionId === "practice-session_pl35-current-service");
  assert.equal(current.status, "tracking");
  assert.equal(current.baseline.status, "available");
  assert.deepEqual(current.treatment.responseDimensions, { durationMs: 300_000, cueMode: "audio" });
  assert.equal(repository.responseStates.size, 1);
});
