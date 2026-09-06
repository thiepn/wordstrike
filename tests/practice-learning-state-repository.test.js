import assert from "node:assert/strict";
import { test } from "node:test";
import { PRACTICE_DATABASE_VERSION, PRACTICE_RECORD_VERSIONS, PRACTICE_STORE_DEFINITIONS } from "../js/practiceLab/practiceConstants.js";
import { createDefaultSessionSummary, createDefaultSkillStat } from "../js/practiceLab/practiceDefaults.js";
import { createPracticeLearningStateId, createPracticeId, createSkillStatId } from "../js/practiceLab/practiceIds.js";
import { createDefaultPracticeLearningState } from "../js/practiceLab/practiceLearningState.js";
import { mergePracticeLearningObservation } from "../js/practiceLab/practiceLearningStateMerge.js";
import { validatePracticeLearningObservationDelta, validatePracticeLearningState } from "../js/practiceLab/practiceLearningValidation.js";
import { createPracticeSessionHarness } from "./practiceSessionFixtures.js";

function ids(harness, suffix) {
  const sessionId = createPracticeId("session", { uuid: () => `pl16-${suffix}-session-12345678` });
  const entityType = "bigram";
  const entityKey = "th";
  const statId = createSkillStatId(harness.profileId, harness.contextId, entityType, entityKey);
  return { sessionId, entityType, entityKey, statId };
}

function learningSummary({ acquisition = 1, transfer = 0 } = {}) {
  return {
    analysisVersion: 1,
    observationVersion: 1,
    acquisitionObservationCount: acquisition,
    transferObservationCount: transfer,
    completePhaseObservationCount: acquisition,
    partialPhaseObservationCount: 0,
    skippedCount: 0,
    learningStateUpdateCount: acquisition + transfer,
  };
}

function acquisitionDelta(harness, identity, { completedAtUtc = "2026-09-05T10:00:00.000Z", opportunityCount = 50, entry = 60, exit = 75 } = {}) {
  return {
    observationVersion: 1,
    kind: "acquisition",
    sessionId: identity.sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    statId: identity.statId,
    entityType: identity.entityType,
    entityKey: identity.entityKey,
    evidenceRole: "training",
    experimentId: "pl16-training",
    observation: {
      kind: "acquisition",
      sessionId: identity.sessionId,
      experimentId: "pl16-training",
      completedAtUtc,
      localDayKey: completedAtUtc.slice(0, 10),
      opportunityCount,
      doseUnits: opportunityCount / 50,
      cumulativeDoseBefore: null,
      cumulativeDoseAfter: null,
      wholeQuality: 70,
      entryQuality: entry,
      exitQuality: exit,
      practiceGain: exit - entry,
      qualityCoverage: 1,
      phaseCoverage: {
        status: "complete",
        entryOpportunityCount: 3,
        exitOpportunityCount: 3,
        entryQualityCoverage: 1,
        exitQualityCoverage: 1,
        reason: null,
      },
      metrics: { whole: { firstPassErrorRate: 0.02, relativeResidual: 0, disfluencyRate: 0.02 }, entry: null, exit: null },
    },
  };
}

function transferDelta(harness, identity, { sessionId, completedAtUtc = "2026-09-06T10:00:00.000Z", quality = 72 } = {}) {
  const resolvedSessionId = sessionId ?? createPracticeId("session", { uuid: () => "pl16-transfer-session-12345678" });
  return {
    observationVersion: 1,
    kind: "transfer",
    sessionId: resolvedSessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    statId: identity.statId,
    entityType: identity.entityType,
    entityKey: identity.entityKey,
    evidenceRole: "transfer",
    experimentId: "pl16-transfer",
    observation: {
      kind: "transfer",
      sessionId: resolvedSessionId,
      experimentId: "pl16-transfer",
      completedAtUtc,
      localDayKey: completedAtUtc.slice(0, 10),
      opportunityCount: 10,
      cumulativeDoseAtObservation: null,
      quality,
      qualityCoverage: 1,
      timeSincePreviousAcquisitionMs: null,
      differentLocalDayFromPreviousAcquisition: null,
      metrics: { firstPassErrorRate: 0.02, relativeResidual: 0, disfluencyRate: 0.02 },
    },
  };
}

function summaryFor(harness, sessionId, evidenceSummary, completedAtUtc = "2026-09-05T10:00:00.000Z") {
  return createDefaultSessionSummary({
    sessionId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    experimentId: "pl16-training",
    now: () => new Date(completedAtUtc),
    overrides: { learningEvidenceSummary: evidenceSummary },
  });
}

test("PL16 learning-state contract remains intact inside the PL18 DB6/session11 envelope", () => {
  assert.equal(PRACTICE_DATABASE_VERSION, 6);
  assert.equal(PRACTICE_RECORD_VERSIONS.learningState, 1);
  assert.equal(PRACTICE_RECORD_VERSIONS.reviewItem, 3);
  assert.equal(PRACTICE_RECORD_VERSIONS.sessionSummary, 11);
  assert.equal(PRACTICE_RECORD_VERSIONS.evaluationState, 1);
  assert.equal(PRACTICE_STORE_DEFINITIONS.learningStates.keyPath, "learningStateId");
  assert.ok(PRACTICE_STORE_DEFINITIONS.learningStates.indexes.some((index) => index.name === "statId" && index.options?.unique));
  assert.ok(PRACTICE_STORE_DEFINITIONS.learningStates.indexes.some((index) => index.name === "profileContextEntity" && index.options?.unique));
});

test("PL16 acquisition observation is validated, merged immutably and stamps cumulative dose inside state merge", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl16-state-merge" });
  const identity = ids(harness, "state-merge");
  const delta = acquisitionDelta(harness, identity);
  const validation = validatePracticeLearningObservationDelta(delta);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  const state = createDefaultPracticeLearningState({
    profileId: harness.profileId,
    contextId: harness.contextId,
    entityType: identity.entityType,
    entityKey: identity.entityKey,
    statId: identity.statId,
    now: () => new Date("2026-09-05T09:00:00.000Z"),
  });
  const beforeDelta = structuredClone(delta);
  const merged = mergePracticeLearningObservation(state, delta);
  assert.deepEqual(delta, beforeDelta);
  assert.equal(state.acquisition.observationCount, 0);
  assert.equal(merged.acquisition.cumulativeTargetOpportunities, 50);
  assert.equal(merged.acquisition.cumulativeDoseUnits, 1);
  assert.equal(merged.acquisition.observations[0].cumulativeDoseBefore, 0);
  assert.equal(merged.acquisition.observations[0].cumulativeDoseAfter, 1);
  assert.equal(Object.isFrozen(merged), true);
  assert.equal(validatePracticeLearningState(merged).valid, true);
});

test("PL16 atomic repository commit creates acquisition state once and duplicate session cannot double-count dose", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl16-atomic" });
  const identity = ids(harness, "atomic");
  const stat = createDefaultSkillStat({
    statId: identity.statId,
    profileId: harness.profileId,
    contextId: harness.contextId,
    entityType: identity.entityType,
    entityKey: identity.entityKey,
    now: () => new Date("2026-09-05T09:00:00.000Z"),
  });
  await harness.repository.saveSkillStat(stat);
  const delta = acquisitionDelta(harness, identity);
  const summary = summaryFor(harness, identity.sessionId, learningSummary());
  const first = await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, learningObservationDeltas: [delta] });
  assert.equal(first.committed, true);
  assert.equal(first.learningUpdated, 1);
  const state = await harness.repository.getLearningState(harness.profileId, harness.contextId, identity.entityType, identity.entityKey);
  assert.equal(state.acquisition.observationCount, 1);
  assert.equal(state.acquisition.cumulativeDoseUnits, 1);

  const replay = await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, learningObservationDeltas: [delta] });
  assert.equal(replay.idempotent, true);
  const after = await harness.repository.getLearningState(harness.profileId, harness.contextId, identity.entityType, identity.entityKey);
  assert.equal(after.acquisition.observationCount, 1);
  assert.equal(after.acquisition.cumulativeDoseUnits, 1);
});

test("PL16 conflicting duplicate session and invalid learning batch cannot mutate learning state", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl16-conflict" });
  const identity = ids(harness, "conflict");
  await harness.repository.saveSkillStat(createDefaultSkillStat({ statId: identity.statId, profileId: harness.profileId, contextId: harness.contextId, entityType: identity.entityType, entityKey: identity.entityKey }));
  const delta = acquisitionDelta(harness, identity);
  const summary = summaryFor(harness, identity.sessionId, learningSummary());
  await harness.repository.commitCompletedPracticeSession({ sessionSummary: summary, learningObservationDeltas: [delta] });
  const before = await harness.repository.getLearningState(harness.profileId, harness.contextId, identity.entityType, identity.entityKey);
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({ sessionSummary: { ...summary, recommendationIds: ["changed"] }, learningObservationDeltas: [delta] }),
    /different completed Practice session|duplicate/i,
  );
  assert.deepEqual(await harness.repository.getLearningState(harness.profileId, harness.contextId, identity.entityType, identity.entityKey), before);

  const invalidSessionId = createPracticeId("session", { uuid: () => "pl16-invalid-session-12345678" });
  const invalid = { ...acquisitionDelta(harness, { ...identity, sessionId: invalidSessionId }), observation: { ...delta.observation, sessionId: invalidSessionId, doseUnits: 999 } };
  const invalidSummary = summaryFor(harness, invalidSessionId, learningSummary());
  await assert.rejects(
    () => harness.repository.commitCompletedPracticeSession({ sessionSummary: invalidSummary, learningObservationDeltas: [invalid] }),
    /learning observation batch failed validation/i,
  );
  assert.equal(await harness.repository.getSessionSummary(invalidSessionId), null);
});

test("PL16 transfer cannot create transfer-only state but adds a point at exact current acquisition dose for an existing state", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl16-transfer-state" });
  const identity = ids(harness, "transfer-state");
  await harness.repository.saveSkillStat(createDefaultSkillStat({ statId: identity.statId, profileId: harness.profileId, contextId: harness.contextId, entityType: identity.entityType, entityKey: identity.entityKey }));

  const transferOnly = transferDelta(harness, identity);
  const transferOnlySummary = summaryFor(harness, transferOnly.sessionId, learningSummary({ acquisition: 0, transfer: 1 }), transferOnly.observation.completedAtUtc);
  const skipped = await harness.repository.commitCompletedPracticeSession({ sessionSummary: transferOnlySummary, learningObservationDeltas: [transferOnly] });
  assert.equal(skipped.learningUpdated, 0);
  assert.equal(await harness.repository.getLearningState(harness.profileId, harness.contextId, identity.entityType, identity.entityKey), null);

  const acquisitionSessionId = createPracticeId("session", { uuid: () => "pl16-acquisition-before-transfer-12345678" });
  const acquisition = acquisitionDelta(harness, { ...identity, sessionId: acquisitionSessionId });
  await harness.repository.commitCompletedPracticeSession({
    sessionSummary: summaryFor(harness, acquisitionSessionId, learningSummary(), acquisition.observation.completedAtUtc),
    learningObservationDeltas: [acquisition],
  });
  const transfer = transferDelta(harness, identity, { sessionId: createPracticeId("session", { uuid: () => "pl16-transfer-after-training-12345678" }) });
  await harness.repository.commitCompletedPracticeSession({
    sessionSummary: summaryFor(harness, transfer.sessionId, learningSummary({ acquisition: 0, transfer: 1 }), transfer.observation.completedAtUtc),
    learningObservationDeltas: [transfer],
  });
  const state = await harness.repository.getLearningState(harness.profileId, harness.contextId, identity.entityType, identity.entityKey);
  assert.equal(state.acquisition.cumulativeDoseUnits, 1);
  assert.equal(state.transfer.observationCount, 1);
  assert.equal(state.transfer.observations[0].cumulativeDoseAtObservation, 1);
  assert.ok(state.transfer.observations[0].timeSincePreviousAcquisitionMs > 0);
  assert.equal(state.transfer.observations[0].differentLocalDayFromPreviousAcquisition, true);
});

test("PL16 out-of-order acquisition/transfer merges reject and ring trimming preserves all-time dose with recent-window scope", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl16-rings" });
  const identity = ids(harness, "rings");
  let state = createDefaultPracticeLearningState({ profileId: harness.profileId, contextId: harness.contextId, entityType: identity.entityType, entityKey: identity.entityKey, statId: identity.statId, now: () => new Date("2026-08-01T00:00:00.000Z") });
  for (let index = 0; index < 25; index += 1) {
    const sessionId = createPracticeId("session", { uuid: () => `pl16-ring-${String(index).padStart(2, "0")}-session-12345678` });
    const completedAtUtc = `2026-08-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`;
    state = mergePracticeLearningObservation(state, acquisitionDelta(harness, { ...identity, sessionId }, { completedAtUtc, opportunityCount: 50, entry: 50 + index, exit: 55 + index }));
  }
  assert.equal(state.acquisition.observationCount, 25);
  assert.equal(state.acquisition.observations.length, 24);
  assert.equal(state.acquisition.cumulativeDoseUnits, 25);
  assert.equal(state.acquisition.curve.scope, "recent-window");
  assert.ok(!state.acquisition.observations.some((observation) => observation.sessionId.includes("ring-00")));

  const oldId = createPracticeId("session", { uuid: () => "pl16-old-session-12345678" });
  assert.throws(() => mergePracticeLearningObservation(state, acquisitionDelta(harness, { ...identity, sessionId: oldId }, { completedAtUtc: "2026-08-01T09:00:00.000Z" })), /chronologically/i);
});

test("PL16 learning state identity is unique, context-scoped and contains no raw content fields", async () => {
  const harness = await createPracticeSessionHarness({ suffix: "pl16-privacy" });
  const identity = ids(harness, "privacy");
  const state = createDefaultPracticeLearningState({ profileId: harness.profileId, contextId: harness.contextId, entityType: identity.entityType, entityKey: identity.entityKey, statId: identity.statId });
  assert.equal(state.learningStateId, createPracticeLearningStateId(harness.profileId, harness.contextId, identity.entityType, identity.entityKey));
  const serialized = JSON.stringify(state);
  for (const forbidden of ["contentText", "customText", "rawEvents", "eventTrace", "targetPositions", "containingWords"]) assert.equal(serialized.includes(forbidden), false);
});
