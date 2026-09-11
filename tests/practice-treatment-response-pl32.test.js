import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  PRACTICE_DATABASE_VERSION,
  PRACTICE_RECORD_VERSIONS,
  PRACTICE_STORE_DEFINITIONS,
} from "../js/practiceLab/practiceConstants.js";
import { createSkillStatId } from "../js/practiceLab/practiceIds.js";
import {
  PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION,
  PRACTICE_TREATMENT_THRESHOLDS,
} from "../js/practiceLab/practiceTreatmentConstants.js";
import { buildPracticeTargetBaseline } from "../js/practiceLab/practiceTreatmentBaseline.js";
import { classifyPracticeTreatmentContamination } from "../js/practiceLab/practiceTreatmentContamination.js";
import {
  createPracticeTreatmentEpisode,
  finalizePracticeTreatmentEpisode,
  markPracticeTreatmentExposureStarted,
  updatePracticeTreatmentEpisode,
} from "../js/practiceLab/practiceTreatmentEpisode.js";
import {
  estimatePracticeAbilityResponse,
  estimatePracticeConsistencyResponse,
  estimatePracticeFrontierResponse,
  estimatePracticeTargetResponse,
} from "../js/practiceLab/practiceTreatmentEstimator.js";
import {
  createPracticeTreatmentOutcomeCandidate,
  evaluatePracticeTreatmentOutcomeCandidate,
  getPracticeTreatmentDelayBucket,
  selectPracticeTreatmentOutcomeEpisode,
} from "../js/practiceLab/practiceTreatmentOutcome.js";
import {
  createPracticeTreatmentResponseState,
  mergePracticeTreatmentResponseSample,
} from "../js/practiceLab/practiceTreatmentResponseState.js";
import {
  PRACTICE_TREATMENT_EXCLUDED_EXPERIMENT_IDS,
  resolvePracticeTreatmentIdentity,
} from "../js/practiceLab/practiceTreatmentRegistry.js";
import { markPracticeTreatmentInterference } from "../js/practiceLab/practiceTreatmentLinker.js";

const PROFILE = "practice-profile-pl32";
const CONTEXT = "practice-context-pl32";
const TARGET = "th";
const BASE = Object.freeze({
  quality: 70,
  qualityCoverage: 0.85,
  opportunityCount: 8,
  firstPassAccuracy: 0.90,
  normalizedResidualMedianMs: 80,
  disfluencyRate: 0.10,
});

function targetedIdentity({ experimentId = "combination-repair", experimentVersion = 1, policyVersion = 1 } = {}) {
  return resolvePracticeTreatmentIdentity({
    experiment: { id: experimentId, version: experimentVersion },
    configuration: { policyVersion },
    contentPlan: { targetEntities: [{ entityType: "bigram", entityKey: TARGET, directTarget: true }] },
  });
}

function trackingEpisode({
  sessionId,
  completedAt = "2026-09-07T10:30:00.000Z",
  localDayKey = "2026-09-07",
  baselineObservedAt = "2026-09-07T10:05:00.000Z",
  identity = targetedIdentity(),
} = {}) {
  let episode = createPracticeTreatmentEpisode({
    profileId: PROFILE,
    contextId: CONTEXT,
    treatmentSessionId: sessionId,
    identity,
    plannedAt: "2026-09-07T10:00:00.000Z",
    baseline: buildPracticeTargetBaseline({
      metrics: BASE,
      observedAt: baselineObservedAt,
      probeIdentity: { protocolFingerprint: identity.protocolFingerprint, familyIds: ["family-a"], probeHash: "probe-a" },
    }),
  });
  episode = markPracticeTreatmentExposureStarted(episode, "2026-09-07T10:06:00.000Z");
  episode = updatePracticeTreatmentEpisode(episode, {
    treatment: { ...episode.treatment, completedLocalDayKey: localDayKey },
  }, completedAt);
  return finalizePracticeTreatmentEpisode(episode, {
    completedAt,
    actualDurationMs: 180_000,
    treatmentExposureEligible: true,
  });
}

function targetRetestCandidate({
  sessionId = "later-session",
  observedAt = "2026-09-08T12:00:00.000Z",
  localDayKey = "2026-09-08",
  episode,
  quality = 77,
} = {}) {
  return createPracticeTreatmentOutcomeCandidate({
    profileId: PROFILE,
    contextId: CONTEXT,
    sessionId,
    observedAt,
    localDayKey,
    sourceKind: "target-baseline-retest",
    subjectKind: "target-stat",
    subjectId: episode.treatment.targetStatId,
    outcomeDomain: "entity-target",
    protocolFingerprint: episode.treatment.protocolFingerprint,
    metrics: { ...BASE, quality },
    validity: { eligible: true, probeIdentity: { familyIds: ["family-b"] } },
  });
}

test("PL32 database envelope is DB10 with dedicated stores and no session-summary bump", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 10);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 13);
  assert.equal(PRACTICE_RECORD_VERSIONS.treatmentEpisode, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.treatmentResponseState, 1);
  assert.ok(PRACTICE_STORE_DEFINITIONS.treatmentEpisodes);
  assert.ok(PRACTICE_STORE_DEFINITIONS.treatmentResponseStates);
  assert.ok(PRACTICE_STORE_DEFINITIONS.sessionSummaries.indexes.some((index) => index.name === "profileContextCompletedAt"));
});

test("trusted registry emits canonical treatment families and excludes measurement-only/private modes", () => {
  const targeted = targetedIdentity();
  assert.equal(targeted.treatmentClass, "targeted");
  assert.equal(targeted.protocolVariant, "one-dose");
  assert.equal(targeted.outcomeDomain, "entity-target");
  assert.equal(targeted.assignmentKind, "manual");
  assert.equal(targeted.targetEntityType, "bigram");

  const threeMinute = resolvePracticeTreatmentIdentity({
    experiment: { id: "real-text", version: 1 },
    configuration: { durationMs: 180_000, policyVersion: 1 },
    contentPlan: { targetEntities: [] },
  });
  const tenMinute = resolvePracticeTreatmentIdentity({
    experiment: { id: "real-text", version: 1 },
    configuration: { durationMs: 600_000, policyVersion: 1 },
    contentPlan: { targetEntities: [] },
  });
  assert.equal(threeMinute.protocolVariant, "duration-180000");
  assert.equal(tenMinute.protocolVariant, "duration-600000");
  assert.notEqual(threeMinute.treatmentFamilyKey, tenMinute.treatmentFamilyKey);

  const coach = resolvePracticeTreatmentIdentity({
    experiment: { id: "weak-keys", version: 1 },
    configuration: { policyVersion: 1 },
    contentPlan: { targetEntities: [{ entityType: "key", entityKey: "e", directTarget: true }] },
    coachBinding: { coachPlanId: "plan", blockId: "block" },
  });
  assert.equal(coach.assignmentKind, "coach");

  for (const id of PRACTICE_TREATMENT_EXCLUDED_EXPERIMENT_IDS) {
    assert.equal(resolvePracticeTreatmentIdentity({ experiment: { id, version: 1 }, configuration: {}, contentPlan: { targetEntities: [] } }), null, `${id} must not create PL32 treatment identity`);
  }
});

test("targeted episodes freeze baseline before exposure and create three independent delayed contracts", () => {
  const identity = targetedIdentity();
  const episode = trackingEpisode({ sessionId: "treatment-1", identity });
  assert.equal(episode.status, "tracking");
  assert.equal(episode.baseline.status, "available");
  assert.ok(Date.parse(episode.baseline.observedAt) < Date.parse(episode.treatment.exposureStartedAt));
  assert.deepEqual(episode.outcomeContracts.map((contract) => contract.outcomeKey), ["same-protocol-retest", "retention-review", "cold-transfer"]);
  assert.equal(JSON.stringify(episode).includes("passage text"), false);
});

test("exact target, ability, consistency and frontier response formulas are preserved", () => {
  const target = estimatePracticeTargetResponse(BASE, { ...BASE, quality: 76, firstPassAccuracy: 0.94, normalizedResidualMedianMs: 65, disfluencyRate: 0.07 });
  assert.equal(target.qualityDelta, 6);
  assert.ok(Math.abs(target.accuracyDeltaPp - 4) < 1e-10);
  assert.equal(target.residualDeltaMs, -15);
  assert.ok(Math.abs(target.disfluencyDeltaPp + 3) < 1e-10);

  const ability = estimatePracticeAbilityResponse(
    { muLog: Math.log(60), variance: 0.04 },
    { adjustedLogPerformance: Math.log(66), measurementSigmaLog: 0.10 },
  );
  assert.ok(Math.abs(ability.d - Math.log(1.1)) < 1e-12);
  assert.ok(Math.abs(ability.observedResponsePercent - 10) < 1e-10);
  assert.ok(Math.abs(ability.sigmaD - Math.sqrt(0.05)) < 1e-12);
  assert.ok(Math.abs(ability.z - Math.log(1.1) / Math.sqrt(0.05)) < 1e-12);

  const consistency = estimatePracticeConsistencyResponse(
    { paceVariationPercent: 8, paceDriftPercent: 5, medianAdjustedGrossWpm: 70, firstPassAccuracyMedian: 0.98, disfluencyMedian: 0.05, correctionCostMedian: 0.03 },
    { paceVariationPercent: 5, paceDriftPercent: 2, medianAdjustedGrossWpm: 64, firstPassAccuracyMedian: 0.98, disfluencyMedian: 0.05, correctionCostMedian: 0.03 },
  );
  assert.equal(consistency.variationResponsePp, 3);
  assert.equal(consistency.driftResponsePp, 3);
  assert.equal(consistency.tradeoff, true, ">5% pace loss must trigger the consistency tradeoff guard");

  const frontier = estimatePracticeFrontierResponse(
    { status: "bracketed", frontierWpm: 80 },
    { status: "bracketed", frontierWpm: 84 },
  );
  assert.ok(Math.abs(frontier.frontierResponsePercent - 5) < 1e-12);
  assert.equal(estimatePracticeFrontierResponse({ status: "lower-bound", lowerBoundWpm: 80 }, { status: "bracketed", frontierWpm: 84 }).responseKind, "interval-only");
});

test("delay buckets and delayed eligibility reject same-session, same-day and too-early outcomes", () => {
  assert.equal(getPracticeTreatmentDelayBucket(12 * 60 * 60 * 1000), "next-day");
  assert.equal(getPracticeTreatmentDelayBucket(4 * 24 * 60 * 60 * 1000), "short");
  assert.equal(getPracticeTreatmentDelayBucket(20 * 24 * 60 * 60 * 1000), "long");

  const episode = trackingEpisode({ sessionId: "treatment-delay" });
  const contract = episode.outcomeContracts[0];
  assert.equal(evaluatePracticeTreatmentOutcomeCandidate(episode, contract, targetRetestCandidate({ sessionId: "treatment-delay", episode })).reason, "same-session");
  assert.equal(evaluatePracticeTreatmentOutcomeCandidate(episode, contract, targetRetestCandidate({ sessionId: "same-day", observedAt: "2026-09-07T23:30:00.000Z", localDayKey: "2026-09-07", episode })).reason, "same-local-day");
  assert.equal(evaluatePracticeTreatmentOutcomeCandidate(episode, contract, targetRetestCandidate({ sessionId: "too-early", observedAt: "2026-09-07T20:00:00.000Z", localDayKey: "2026-09-08", episode })).reason, "too-early");
  assert.equal(evaluatePracticeTreatmentOutcomeCandidate(episode, contract, targetRetestCandidate({ episode })).eligible, true);
});

test("first compatible candidate is not replaced and a shared outcome belongs to the most recent eligible treatment", () => {
  const older = trackingEpisode({ sessionId: "older", completedAt: "2026-09-06T10:30:00.000Z", localDayKey: "2026-09-06", baselineObservedAt: "2026-09-06T10:05:00.000Z" });
  const newer = trackingEpisode({ sessionId: "newer" });
  const candidate = targetRetestCandidate({ episode: newer });
  const selection = selectPracticeTreatmentOutcomeEpisode([older, newer], candidate);
  assert.equal(selection.winner.episode.treatmentEpisodeId, newer.treatmentEpisodeId);
  assert.equal(selection.superseded[0].episode.treatmentEpisodeId, older.treatmentEpisodeId);
});

test("contamination distinguishes Custom Text uncertainty, unrelated background and same-domain material exposure", () => {
  const prior = trackingEpisode({ sessionId: "contamination-prior" });
  assert.equal(classifyPracticeTreatmentContamination({ episode: prior, interveningSessions: [{ experimentId: "custom-text", sessionId: "custom" }] }).level, "uncertain");
  assert.equal(classifyPracticeTreatmentContamination({ episode: prior, interveningTreatmentEpisodes: [{ status: "tracking", treatmentEpisodeId: "unrelated", treatment: { exposureStartedAt: "2026-09-08T11:00:00.000Z", targetStatId: createSkillStatId(PROFILE, CONTEXT, "bigram", "zz") } }] }).level, "background");
  assert.equal(classifyPracticeTreatmentContamination({ episode: prior, interveningTreatmentEpisodes: [{ status: "tracking", treatmentEpisodeId: "same", treatment: { exposureStartedAt: "2026-09-08T11:00:00.000Z", targetStatId: prior.treatment.targetStatId } }] }).level, "material");
});

test("later targeted exposure preserves an already-observed compatible Baseline retest but contaminates remaining target outcomes", async () => {
  const prior = trackingEpisode({ sessionId: "prior-target" });
  const identity = targetedIdentity();
  let later = createPracticeTreatmentEpisode({
    profileId: PROFILE,
    contextId: CONTEXT,
    treatmentSessionId: "later-target",
    identity,
    plannedAt: "2026-09-08T11:55:00.000Z",
    baseline: buildPracticeTargetBaseline({
      metrics: { ...BASE, quality: 74 },
      observedAt: "2026-09-08T12:00:00.000Z",
      probeIdentity: { protocolFingerprint: identity.protocolFingerprint, familyIds: ["family-b"], probeHash: "probe-b" },
    }),
  });
  later = markPracticeTreatmentExposureStarted(later, "2026-09-08T12:01:00.000Z");
  const saved = new Map([[prior.treatmentEpisodeId, prior], [later.treatmentEpisodeId, later]]);
  const repository = {
    async listTreatmentEpisodes() { return [...saved.values()]; },
    async saveTreatmentEpisode(value) { saved.set(value.treatmentEpisodeId, value); return value; },
  };
  await markPracticeTreatmentInterference({ repository, newEpisode: later, exposedAt: later.treatment.exposureStartedAt });
  const updated = saved.get(prior.treatmentEpisodeId);
  assert.equal(updated.outcomes.find((slot) => slot.outcomeKey === "same-protocol-retest").status, "pending");
  assert.equal(updated.outcomes.find((slot) => slot.outcomeKey === "retention-review").status, "contaminated");
  assert.equal(updated.outcomes.find((slot) => slot.outcomeKey === "cold-transfer").status, "contaminated");
});

test("response states use a bounded robust ring, practical deadbands and evidence-depth rules", () => {
  let state = createPracticeTreatmentResponseState({
    profileId: PROFILE,
    contextId: CONTEXT,
    treatmentFamilyKey: "family",
    targetEntityType: "bigram",
    outcomeKey: "same-protocol-retest",
    delayBucket: "next-day",
    responseUnit: "quality-points",
    now: "2026-09-08T00:00:00.000Z",
  });
  for (const [index, responseValue] of [6, 7, 8].entries()) {
    state = mergePracticeTreatmentResponseSample(state, {
      treatmentEpisodeId: `episode-${index}`,
      candidateId: `candidate-${index}`,
      observedAt: `2026-09-${String(8 + index).padStart(2, "0")}T12:00:00.000Z`,
      localDayKey: `2026-09-${String(8 + index).padStart(2, "0")}`,
      assignmentKind: "manual",
      targetStatId: `target-${index % 2}`,
      measurementGrade: "independent",
      primaryEligible: true,
      aggregateEligible: true,
      responseValue,
      responseUnit: "quality-points",
      tradeoff: false,
    });
  }
  assert.equal(state.summary.count, 3);
  assert.equal(state.summary.median, 7);
  assert.equal(state.summary.mad, 1);
  assert.equal(state.summary.responsePattern, "positive-signal");
  assert.equal(state.summary.evidenceDepth, "low");
  assert.equal(state.summary.practicalThreshold, PRACTICE_TREATMENT_THRESHOLDS.targetQualityPoints);

  let hybrid = createPracticeTreatmentResponseState({
    profileId: PROFILE,
    contextId: CONTEXT,
    treatmentFamilyKey: "hybrid-family",
    outcomeKey: "consistency",
    delayBucket: "next-day",
    responseUnit: "percentage-points",
  });
  for (let index = 0; index < 12; index += 1) hybrid = mergePracticeTreatmentResponseSample(hybrid, {
    treatmentEpisodeId: `hybrid-${index}`,
    candidateId: `hc-${index}`,
    observedAt: `2026-09-${String(1 + (index % 10)).padStart(2, "0")}T12:00:00.000Z`,
    localDayKey: `2026-09-${String(1 + (index % 10)).padStart(2, "0")}`,
    assignmentKind: "manual",
    targetStatId: null,
    measurementGrade: "hybrid",
    primaryEligible: false,
    aggregateEligible: true,
    responseValue: 2,
    responseUnit: "percentage-points",
    tradeoff: false,
  });
  assert.equal(hybrid.summary.evidenceDepth, "medium", "hybrid-only evidence must not reach high depth");
});

test("PL32 model modules retain observational terminology and post-commit sidecar ordering", async () => {
  assert.equal(PRACTICE_TREATMENT_RESPONSE_MODEL_VERSION, 1);
  const engineSource = await readFile(new URL("../js/practiceLab/practiceSessionEngine.js", import.meta.url), "utf8");
  const coreCommitIndex = engineSource.indexOf("const result = await core.complete(reason)");
  const sidecarIndex = engineSource.indexOf("await treatment.afterCanonicalCommit");
  assert.ok(coreCommitIndex >= 0 && sidecarIndex > coreCommitIndex, "canonical completion must finish before PL32 sidecar tracking");
  assert.match(engineSource, /Treatment tracking failed after canonical Practice commit/);

  const sources = await Promise.all([
    "practiceTreatmentConstants.js",
    "practiceTreatmentRegistry.js",
    "practiceTreatmentEpisode.js",
    "practiceTreatmentOutcome.js",
    "practiceTreatmentEstimator.js",
    "practiceTreatmentResponseState.js",
  ].map((name) => readFile(new URL(`../js/practiceLab/${name}`, import.meta.url), "utf8")));
  const joined = sources.join("\n").toLowerCase();
  for (const forbidden of ["treatment caused", "proven effective", "non-responder", "responder classification"]) assert.equal(joined.includes(forbidden), false);
});
