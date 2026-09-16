import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPracticeConsistencyBaseline, buildPracticeTargetBaseline } from "../js/practiceLab/practiceTreatmentBaseline.js";
import { classifyPracticeTreatmentContamination } from "../js/practiceLab/practiceTreatmentContamination.js";
import {
  createPracticeTreatmentEpisode,
  finalizePracticeTreatmentEpisode,
  markPracticeTreatmentExposureStarted,
  updatePracticeTreatmentEpisode,
} from "../js/practiceLab/practiceTreatmentEpisode.js";
import { markPracticeTreatmentInterference } from "../js/practiceLab/practiceTreatmentLinker.js";
import { resolvePracticeTreatmentIdentity } from "../js/practiceLab/practiceTreatmentRegistry.js";
import {
  createPracticeTreatmentResponseState,
  mergePracticeTreatmentResponseSample,
} from "../js/practiceLab/practiceTreatmentResponseState.js";
import {
  validatePracticeTreatmentEpisode,
  validatePracticeTreatmentResponseState,
} from "../js/practiceLab/practiceTreatmentValidation.js";

const PROFILE = "practice-profile-storage-pl32";
const CONTEXT = "practice-context-storage-pl32";

function targetedEpisode() {
  const identity = resolvePracticeTreatmentIdentity({
    experiment: { id: "weak-keys", version: 1 },
    configuration: { policyVersion: 1, generatorVersion: 1 },
    contentPlan: { targetEntities: [{ entityType: "key", entityKey: "e", directTarget: true }] },
  });
  let episode = createPracticeTreatmentEpisode({
    profileId: PROFILE,
    contextId: CONTEXT,
    treatmentSessionId: "targeted-session",
    identity,
    plannedAt: "2026-09-08T10:00:00.000Z",
    baseline: buildPracticeTargetBaseline({
      observedAt: "2026-09-08T10:03:00.000Z",
      metrics: { quality: 72, qualityCoverage: 0.8, opportunityCount: 8, firstPassAccuracy: 0.94 },
      probeIdentity: { protocolFingerprint: identity.protocolFingerprint, familyIds: ["probe-a"], probeHash: "hash-a" },
    }),
  });
  episode = markPracticeTreatmentExposureStarted(episode, "2026-09-08T10:04:00.000Z");
  episode = updatePracticeTreatmentEpisode(episode, { treatment: { ...episode.treatment, completedLocalDayKey: "2026-09-08" } }, "2026-09-08T10:12:00.000Z");
  return finalizePracticeTreatmentEpisode(episode, { completedAt: "2026-09-08T10:12:00.000Z", actualDurationMs: 720000, treatmentExposureEligible: true });
}

function hybridEpisode(sessionId, plannedAt, completedAt) {
  const identity = resolvePracticeTreatmentIdentity({
    experiment: { id: "consistency-trainer", version: 1 },
    configuration: { durationMs: 180000, policyVersion: 1 },
    contentPlan: { targetEntities: [] },
  });
  let episode = createPracticeTreatmentEpisode({
    profileId: PROFILE,
    contextId: CONTEXT,
    treatmentSessionId: sessionId,
    identity,
    plannedAt,
    baseline: buildPracticeConsistencyBaseline({
      observedAt: "2026-09-07T10:00:00.000Z",
      result: {
        status: "complete",
        analysisVersion: 1,
        resultVersion: 1,
        durationMs: 180000,
        pace: { variationPercent: 8, driftPercent: 2, medianAdjustedGrossWpm: 70 },
        control: { firstPassAccuracyMedian: 0.98, disfluencyMedian: 0.04, correctionCostMedian: 0.02 },
      },
    }),
  });
  episode = markPracticeTreatmentExposureStarted(episode, plannedAt);
  episode = updatePracticeTreatmentEpisode(episode, { treatment: { ...episode.treatment, completedLocalDayKey: completedAt.slice(0, 10) } }, completedAt);
  return finalizePracticeTreatmentEpisode(episode, { completedAt, actualDurationMs: 180000, treatmentExposureEligible: true });
}

test("PL32 derived record validators accept canonical bounded records and reject raw/private payloads", () => {
  const episode = targetedEpisode();
  assert.equal(validatePracticeTreatmentEpisode(episode).valid, true);
  const leaked = { ...episode, treatmentContext: { ...episode.treatmentContext, sourceText: "private passage" } };
  const leakValidation = validatePracticeTreatmentEpisode(leaked);
  assert.equal(leakValidation.valid, false);
  assert.ok(leakValidation.errors.some((entry) => entry.code === "FORBIDDEN_DERIVED_FIELD"));

  let state = createPracticeTreatmentResponseState({
    profileId: PROFILE,
    contextId: CONTEXT,
    treatmentFamilyKey: episode.treatment.treatmentFamilyKey,
    targetEntityType: "key",
    outcomeKey: "same-protocol-retest",
    delayBucket: "next-day",
    responseUnit: "quality-points",
    now: "2026-09-09T10:00:00.000Z",
  });
  state = mergePracticeTreatmentResponseSample(state, {
    treatmentEpisodeId: episode.treatmentEpisodeId,
    candidateId: "candidate-1",
    observedAt: "2026-09-09T10:00:00.000Z",
    localDayKey: "2026-09-09",
    assignmentKind: "manual",
    targetStatId: episode.treatment.targetStatId,
    measurementGrade: "independent",
    primaryEligible: true,
    aggregateEligible: true,
    contaminated: false,
    evidenceGrade: "prospective-recorded-clean",
    responseValue: 6,
    responseUnit: "quality-points",
    tradeoff: false,
  });
  assert.equal(validatePracticeTreatmentResponseState(state).valid, true);
  const oversized = { ...state, samples: Array.from({ length: 65 }, (_, index) => ({ ...state.samples[0], candidateId: `candidate-${index}` })) };
  assert.equal(validatePracticeTreatmentResponseState(oversized).valid, false);
});

test("DB10 contamination interval lookup uses the compound profile/context/time index in IndexedDB", async () => {
  const source = await readFile(new URL("../js/practiceLab/practiceRepository.js", import.meta.url), "utf8");
  assert.match(source, /profileContextCompletedAt/);
  assert.match(source, /IDBKeyRange\.bound/);
  assert.match(source, /dataStore\.kind === "indexeddb"/);
});

test("same-family hybrid exposure preserves its measurement slot until the later measurement is known", async () => {
  const prior = hybridEpisode("hybrid-prior", "2026-09-08T10:00:00.000Z", "2026-09-08T10:03:00.000Z");
  const later = hybridEpisode("hybrid-later", "2026-09-09T11:00:00.000Z", "2026-09-09T11:03:00.000Z");
  const saved = new Map([[prior.treatmentEpisodeId, prior], [later.treatmentEpisodeId, later]]);
  const repository = {
    async listTreatmentEpisodes() { return [...saved.values()]; },
    async saveTreatmentEpisode(value) { saved.set(value.treatmentEpisodeId, value); return value; },
  };
  await markPracticeTreatmentInterference({ repository, newEpisode: later, exposedAt: later.treatment.exposureStartedAt });
  assert.equal(saved.get(prior.treatmentEpisodeId).outcomes[0].status, "pending");
});

test("incomplete recorded exposure remains contamination evidence", () => {
  const prior = hybridEpisode("hybrid-base", "2026-09-08T10:00:00.000Z", "2026-09-08T10:03:00.000Z");
  const later = { ...hybridEpisode("hybrid-invalid", "2026-09-09T11:00:00.000Z", "2026-09-09T11:03:00.000Z"), status: "invalid", invalidReason: "incomplete-treatment" };
  const contamination = classifyPracticeTreatmentContamination({ episode: prior, interveningTreatmentEpisodes: [later] });
  assert.equal(contamination.level, "material");
  assert.ok(contamination.reasons.includes("same-outcome-domain-incomplete-treatment"));
});

test("canonical commit sidecar covers both exported and legacy auto-completion paths", async () => {
  const engine = await readFile(new URL("../js/practiceLab/practiceSessionEngine.js", import.meta.url), "utf8");
  const legacy = await readFile(new URL("../js/practiceLab/practiceSessionEngineLegacy.js", import.meta.url), "utf8");
  assert.match(engine, /repository: sidecarRepository\(repository/);
  assert.match(engine, /const result = await repository\.commitCompletedPracticeSession\(payload\)/);
  assert.match(engine, /await treatment\.afterCanonicalCommit/);
  assert.match(legacy, /queueMicrotask\(\(\) => \{ void complete\(completionReason\); \}\)/);
});
